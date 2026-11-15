# Writing a challenge

Every challenge lives in one place: `src/data/challenges.ts`. The decision panel draws whatever that file says, so writing a challenge is data entry, not code. All twelve are written and playable (`ready: true`). To finish another one, edit its entry, set `ready: true` and run the checks.

```
npx tsx tools/checks/decisions.mts
```

The checks fail if anything points at something that doesn't exist, or if a choice breaks the **no free choice** rule (below).

## Two rules first

1. **No invented NASA numbers.** Effects are game units that show direction and rough size: 5 is "a little", 10 "some", 20 "a lot". Dose is real: 1 point = 3.125 mSv (`src/data/science.ts`). Every outcome needs an entry in `src/data/sources.json` whose `refs` name real references (each opened and read; its `fact` repeats only what it says) and whose `why` says what it teaches. When a real figure shapes an effect, put it in `science.ts` and say where it comes from in a comment with its reference id, like `[rad-brief]`. Until then, mark the effect `TODO: source`.
2. **No free choice.** In every three-option challenge, each option must cost something. No option may be at least as good as both others on every meter. The check enforces this.

## The fields

### Every challenge

| Field | What it is |
| --- | --- |
| `id` | 1 to 12, in play order. |
| `kind` | `'choice'` (pick one of three) or `'split'` (hand out units between buckets). |
| `map` | Where its console is: `'launch-center'`, `'spacecraft'` or `'outpost'`. |
| `consoleId` | The console's (or challenge marker's) `id` in that map file, e.g. `'c02-console'`. |
| `phase` | `'pre-launch'`, `'transit'` or `'outpost'`. |
| `title` | Short, shown on the console and the banner. |
| `situation` | **One** short sentence for ages 7 to 12 (longer text goes in `detail`). |
| `lines` | At least two crew lines. **The first two give opposite advice.** |
| `comesBack` | For the team: how this choice matters later. Not shown. |
| `timerSeconds` | Optional. Seconds to decide; a countdown ring shows and Esc can't back out. |
| `timeoutOption` | With a timer: the option `id` that happens when time runs out ("You ran out of time, so the commander decided."). |
| `ready` | `true` when the text is reviewed and it should be playable. Until then its console shows "Coming soon". Gates (boarding the rocket, the landing, the lunar night) only wait for ready challenges. |
| `reminder` | Optional crew line said when the player tries to move on with this challenge still to do ("Finish packing the cargo first."). |
| `trigger` | `'event'` for a challenge that opens by itself (the solar storm); its console only says to wait. Default `'console'`. |
| `last` | Opens only once every other ready challenge of its phase is done (the lunar night). |
| `opensWhen` | A condition (below) that must hold before it opens, e.g. `{ flags: ['iceBriefed'] }` for the ice after the commander's briefing. Until then its `reminder` is said. |
| `hazard` | `{ kind, repeatLines }` for a hazard (luck, not a planned task): it comes at random, 0 to 3 times a run (`src/state/hazards.ts`), opening its panel by itself. `repeatLines` are the crew's words its 2nd and 3rd time. Storms (4, 10) and meteoroids (11) are hazards. |
| `endsAtAirlock` | After Continue the player is brought home to the airlock with the rover parked (challenge 8: the drive home is done for them). |
| `stormKey` | With `storm`: `'transit'` for the storm in transit. Every storm, wherever it is, draws its own real DONKI flare, never repeated in a run. |
| `storm` | The solar storm: its dose is scaled by the run's real DONKI event and the Shielding. |
| `timerWithoutWarning` | With `storm`: the shorter timer when the antenna had no power (no warning from Houston). |
| `extraLines` | Lines shown before the main two when their condition holds (`{ when, line }`), e.g. Houston's warning only if the antenna is powered. |
| `notes` | Small notes on the panel when their condition holds (`{ when, text }`). |
| `bites` | Earlier choices coming back on every option (see **Bites** below). |
| `teaching` | One teaching sentence added to every result. |

### A crew line

| Field | What it is |
| --- | --- |
| `speakerId` | `'commander'`, `'safety'`, `'science'`, `'comms'` (mission control on Earth; shown with a radio look) or `'trainer'` (launch center only). The player has no voice. |
| `lineId` | A unique id, e.g. `'c07-line-1'`. Shishir names the voice file after it; the panel fires `onLine(lineId)` when the line shows. |
| `text` | What they say. Short, spoken out loud. |

The names live in one place: `CAST` in `src/state/mission.ts`. They are placeholders and are spoken, so tell Shishir if one changes.

### An option (`kind: 'choice'`, exactly three)

| Field | What it is |
| --- | --- |
| `id` | Outcome id, `c<NN>-a/b/c`. Also its key in `sources.json`. |
| `label` | Two to four words. |
| `description` | One short line (**at most 8 words**): what it costs and gives, **no numbers**. Players see pictures and arrows before they commit. |
| `detail` | Optional longer text, shown behind the card's "?". Challenges and split items can have one too. |
| `effects` | Placeholder changes (see below). |
| `result` | After committing: what happened and the real-world reason, in kid language. |
| `requires` | Optional lock (see below). |
| `ruledOut` | Optional: the crew won't do this one (see below). |
| `sourceIds` | Entries in `sources.json` that back the result. |
| `advisedBy` | The speaker who argued for it. The ending quotes whoever the player followed most. |
| `bites` | Earlier choices that change just this option. |

### Bites: earlier choices coming back

A bite is how a choice from earlier in the run comes back. When its condition holds at commit time, it changes the option and names the cause with a crew line, so kids connect cause and effect.

| Field | What it is |
| --- | --- |
| `id` | Unique. Each bite is recorded once per run; the debrief shows it under its cause ("→ Storm dose +12 on Day 2"). |
| `cause` | The challenge whose choice causes it. |
| `when` | A condition (below). An empty `{}` always holds. |
| `effects` | Extra effects in game units; name the reference that shapes them. |
| `doseFactor` | Multiplies the option's dose; name the reference it comes from. |
| `note` | One sentence for the result screen. |
| `line` | The crew line naming the cause ("We left the shielding on Earth. This is going to hurt."). |

Bites that happen overnight (no spares, few supplies, a dark greenhouse) are in `src/state/days.ts`.

### Conditions

Used by `when`, `requires`, `extraLines` and `notes`: `flags` (all set), `withoutFlags` (none set), `min` and `max` (values, e.g. `{ spares: 1 }`).

### Effects

Every field is optional and is a **change**, not a new value.

| Field | Meaning |
| --- | --- |
| `power`, `lifeSupport`, `shielding` | The three meters, 0 to 100. |
| `foodDays` | Days of food. |
| `dose` | Radiation dose (it only goes up; up is bad). |
| `crewHealth` | Health steps for all three crew: +1 one colour better, −1 one colour worse. |
| `health` | Health steps for one crew member: `{ science: -1 }`. |
| `spares` | Spare parts (repairs use one). |
| `cargoBlocks` | Mass blocks left for the cargo split (a heavy power source takes some). |
| `harvestDays` | Food planted now and harvested in the lunar night (challenge 7). |
| `remember` | Choices to remember for later: `{ skippedPlanting: true }`. The flags are listed as `ChoiceFlag` in `src/state/mission.ts`. |

### A lock (`requires`)

| Field | What it is |
| --- | --- |
| `flags` | These remembered choices must be set. |
| `withoutFlags` | These must not be set. |
| `min` | Minimum values, e.g. `{ spares: 1 }`. |
| `reason` | Short, shown on the greyed card: "No spare parts packed". |
| `line` | Optional crew line explaining it ("We'd fix this in minutes if we'd packed spares."). |

### Ruled out (`ruledOut`)

An option the crew talks the player out of. Its card looks like the others, with its arrows, until it's picked; then it greys out, shows the reason and the crew line plays, and Commit stays off. It can never be committed. The landing site (5) uses it: the outpost already stands on the slope between, so the sunny ridge and the crater rim are ruled out. At least one option must stay allowed.

| Field | What it is |
| --- | --- |
| `reason` | Short, shown on the card once picked: "Too far from the ice. The outpost is on the slope." |
| `line` | The crew line saying why not and what to pick instead (needs a recording, like every line). |

### A split (`kind: 'split'`)

| Field | What it is |
| --- | --- |
| `units` | Units to hand out. Every unit must be placed before Commit works. |
| `unitsFrom` | Optional: `'cargoBlocks'` takes the total from the mission instead (challenge 2). |
| `unitLabel` | "mass blocks", "power units". |
| `result` | What happened and why. |
| `buckets` | Each: `id`, `label`, `description` (one line), `unitSize` (units per press of + or −, usually 1), `effectsPerUnit`, `min`, `max`, `sourceIds`, optional `ifEmpty: { remember, result }` for a bucket left at zero, and optional `ifFew: { atMost, remember }` for a bucket given only a little. |
| `keepsRunning` | The split stays switched on and drives every night (challenge 6). |

## One example

```ts
{
  id: 7,
  kind: 'choice',
  map: 'outpost',
  consoleId: 'console-greenhouse',
  phase: 'outpost',
  title: 'Greenhouse',
  situation: 'Plants need water now, and give food later.',
  lines: [
    { speakerId: 'science', lineId: 'c07-line-1', text: 'Plant everything! We’ll be glad of fresh food later.' },
    { speakerId: 'safety', lineId: 'c07-line-2', text: 'Water is life support. Save it until we know we have enough.' },
  ],
  comesBack: 'Food arrives by 12 only if planted here.',
  ready: true,
  options: [
    {
      id: 'c07-a',
      label: 'Plant everything',
      description: 'Uses a lot of water now. Lots of food later.',
      effects: { lifeSupport: -20, foodDays: 6 }, // TODO: source
      result: 'The greenhouse is full. Plants turn water and light into food, and they help clean the air too.',
      sourceIds: ['c07-a'],
    },
    // ...two more options, each costing something different
  ],
},
```

## What the player sees

- **Before committing:** the situation, the two crew lines, three cards with a row of arrows each (up or down; one to three arrows for a little, some, a lot; green helps, orange hurts, red hurts a lot). Hovering or picking a card shows **ghost bars** on the HUD meters. No numbers.
- **After committing:** the exact changes ("Power −18"), the `result` sentence(s), "The real science" (the facts and links of the outcome's references from `sources.json`), and Continue. Science words in the panel are explained the first time (`src/data/glossary.ts`): add a term there when a new one appears.
- **Keys:** 1, 2, 3 pick; Enter commits; Esc backs out (not when timed). In a split: arrows or number keys pick a bucket, + and − change it.

## Pictures

Every challenge has a header picture (`c01`…`c12`) and every option and split item has its own (by its outcome id) in `src/hud/art/Picture.tsx`: flat illustrations drawn in code from a few shared pieces (the Sun, a solar panel, a crate, an astronaut, the shelter dome…). A new option needs a new entry there, or it shows an empty sky.
