# Lunar Outpost: Junior Astronaut Mission Trainer

A browser game for the NASA Space Apps Challenge 2026 ("Build a Junior Astronaut Mission Trainer"). Kids aged 7–12 play the mission engineer of a lunar outpost and make twelve decisions about power, life support, radiation shielding, food and communication. Every choice costs something, and earlier choices come back later in the run. It is a static site: no backend, no login, no download.

## Run it

Needs Node 20.19+ or 22.12+.

```bash
npm install
npm run dev       # dev server with a frame-rate counter
npm run build     # type-check, then build to dist/
npm run preview   # serve the built game locally (works offline for the demo)
```

## The menu

The game opens on its title, then a **lobby**: your astronaut on a lit podium, with the launch complex at dusk and the floodlit Saturn V behind (the same exterior kit as the launch center, drawn on its own layer in the same 3D scene). Drag the astronaut, or press the left and right arrow keys, to turn them. Until the astronaut and the Saturn V have loaded (about 4.5 MB of models), and for at least 4 seconds, a loading screen covers the title: deep space with stars and a sunset glow, "Preparing for launch" coming in word by word, a go/no-go poll like a launch's (ASTRONAUT: SUITING UP, SATURN V: FUELLING, each turning to a green GO once it has loaded), and a **quick fact** about the Moon, the Sun, NASA or life in space, a new one every 7 seconds. Then it fades and rises away in ten columns from the left, like the stairs of React Bits Pro's Preloader (`src/hud/menu/LobbyLoading.tsx`, plain CSS). The 31 facts are in `src/data/quickFacts.ts`, each one sentence with the NASA page it comes from: some checked on NASA's pages for this, the rest reusing the game's checked references and the space pioneers the crew are named after. If a new body type is still downloading when you pick it, a small note shows by the podium. Four tabs across the top:

- **PLAY**: **Play** starts a mission in the launch center. Once a mission is under way (after **Quit to menu**), **Continue** goes back to it and **New mission** starts over. Progress is kept only while the page is open; saving it is Shishir's server work, and nothing here saves it.
- **ASTRONAUT**: the customisation screen (see "Your astronaut" below).
- **SETTINGS**: graphics, the view the game starts in, the key list, mouse speed, flip up and down, easy float, three sound volumes, text size and less movement. Everything applies at once and is remembered in this browser.
- **MISSION DATA**: for judges and teachers, "where these numbers come from": the real Sun right now (live from NASA DONKI), the archived solar storms the game draws from, every NASA reference behind the choices with what it says, five real studies from NASA's Open Science Data Repository, and the free assets, each named and credited. It reads `src/data/sources.json`, `osdr-archive.json`, `donki-archive.json` and `credits.ts`; `tools/checks/menu.mts` checks the credits against `ASSETS.md`. The datasets are explained in `docs/DATASETS.md`.

**Esc** while playing opens the **pause menu** in the same style: Resume, Astronaut (a look at yours; changes are made in the lobby), Settings and Quit to menu.

**Sound:** the crew's voices and the sound effects play at the three volumes in SETTINGS, each from 0 to 1, stored in `src/state/settings.ts`: read them with `audioLevels()` (voices and effects already multiplied by the master volume), follow changes with `onAudioLevels(listener)`, or read `audio.master`, `audio.voices` and `audio.effects` from localStorage under `lunar-outpost:settings`. Timed events in the launch and landing call `cue(id)` in `src/state/cinematic.ts`, which the sound effects listen to. The astronaut is saved in one place, `saveAstronautProfile` in `src/state/astronaut.ts`, where server saving can hook in.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Walk (Shift to run) |
| Space | Jump |
| Q | Sneak: crouch and move slowly (press Q again to stand) |
| Mouse | Look around (click the view to capture the mouse) |
| ← → | Turn |
| E | Use the console or marker you are looking at |
| G | Open or close your guidebook (words to know, where your tasks are, controls) |
| M | Free the mouse to click the map |
| V | Cycle first person → second person (the camera in front, looking back at you) → third person (remembered next time) |
| Enter | Skip a story scene, a cinematic or an ending scene; commit or continue in a panel |
| Esc | Pause, or close a panel |

On the spacecraft the same keys float instead of walk:

| Key | Action |
| --- | --- |
| W A S D | Float where you look, including up and down (Shift to float faster) |
| Space / Q | Float straight up / down |
| E, V, M, Esc | As above |
| Enter | Skip the launch |

**Easy float** (the default, set in Settings) slowly turns you back upright so the ceiling stays up. **Free float** lets you roll and look almost straight up and down.

Younger players can skip the keyboard: pause (Esc), click **Resume without mouse look**, then click a room on the map to walk there.

## Your astronaut

The first time you play, the PLAY tab offers **Make your astronaut**, which opens the **ASTRONAUT** tab: the controls on the right, the astronaut large on the podium on the left, changing as you pick.

- **Name**: 1–16 letters; spaces, hyphens and apostrophes are fine. A short word filter and a Suggest button.
- **Body**: female or male, nothing else. (Astronauts saved when "Spacesuit" was a body load as Male, keeping every other choice; the spacesuit is an outfit now.)
- **Skin tone**: a continuous slider from very light to very dark, with six quick picks above it. The ends are shown as colours, never named. In the skin shader the pack's light skin texture is divided by its average colour, which leaves only the detail (pores, lips, the shading round the eyes), and that is multiplied by the tone's base colour, all in linear light; so every point keeps the face's detail, and lips and shading darken with the skin. The base colour runs through seven hand-picked stops (`SKIN_STOPS` in `src/state/astronaut.ts`) rather than one colour made darker, so the middle tones stay skin-coloured and never go grey or orange.
- **Hair**: short, long or none, on either body (the pack's two styles; the other body's style is borrowed from its model the first time it is picked), and eight natural hair colours. The eyebrows follow the hair.
- **Eye colour**: six natural colours; only the iris is recoloured.
- **Try on a suit**: the coverall, the launch suit or the Moon suit (an Artemis-style suit, below), on either body, to see your astronaut as they will look later. It is only a look; the mission changes suits itself.
- **Mission patch**: Moon, rocket, stars or Earth, four original designs, worn on the left shoulder.
- **Randomise** and **Reset**.

The name appears on the suit's chest tag and in the HUD, and crew lines can use it through a `{name}` placeholder (`fillName` in `src/state/astronaut.ts`); crew speak to the player in the second person, so no pronouns are needed. Every change is saved at once in this browser only; nothing leaves the device. Astronauts saved by earlier versions still load.

Press **V** for third person to see the astronaut. Outfits are a material swap on the same body (`src/character/outfits.ts`): the blue flight coverall now, the orange launch suit and white surface suit later.

## Going outside

The sliding glass doors marked **MAIN EXIT** in the corridor's north wall open onto the grounds inside the perimeter fence: no loading, the outside is part of the same map. The player walks on the terrain, along floodlit paths and past lamp posts. The two other buildings are locked ("This building isn't part of your mission"). The launch pad has its own security fence: you can see the rocket up close, but you board it only through the tower elevator inside. The first time you reach a fence, your astronaut says so; after that it just blocks. The minimap zooms out to the grounds while you are outside, and click-to-walk works there too.

## Challenges and the decision panel

Every challenge is data in `src/data/challenges.ts`; `docs/CHALLENGE_TEMPLATE.md` explains every field, so teammates can write challenges in parallel. All twelve challenges are playable.

**The decision screen** is big and visual: a header picture, one sentence of situation (more behind a "?", or press **?**), the two crew lines as speech bubbles from either side, three option cards each with its own picture and the meters it changes as big icons with arrows (or, for a split, the real items: crates on the pallet, power cells in their slots), and the meters with ghost bars. The pictures are flat illustrations drawn in code (`src/hud/art/`), so there is no art licence to track. The result screen shows the chosen option's picture, big change tiles and an "In real life" fact with its source.

**The full run:** challenges 1 and 2 in the launch center; on the spacecraft, the scrubber fault (3), then about 25 seconds later a **storm in transit** (4, an event with its own real archived DONKI flare, always a different one from the outpost's) and the landing site (5), where only the slope between can be committed because the outpost already stands there (picking the sunny ridge or the crater rim brings a crew line saying why not); the landing waits for all three. At the outpost: wake the base (6), the greenhouse (7, planted food is harvested in the lunar night) and the tired crew (9) in either order, the outpost storm (10, about 20 seconds after 9), then the commander's briefing on the night card ("We need water. There's ice in the crater to the east."), which opens the **ice (8)**: drive the rover to the crater (it is pinged with its distance on the map and in the banner) and choose there. Extracting costs a lot of power and dose now and tops up Life Support every remaining night; a small trial costs and gives less; rationing costs nothing now but drains Life Support faster each night. The result applies when you commit, and the drive home is done for you: you arrive at the airlock with the rover parked. A direct trip to the ice and back uses about 80% of the battery. A flat battery means a tow: a whole mission day lost and the rover gone, so the walk to the broken panel costs more. The night after the ice, a small meteoroid cracks the solar panel nearest the airlock, which opens the broken panel (11); and last the lunar night (12).

**Random hazards.** Solar storms and meteoroid hits are natural events, so they come at random rather than at set moments: solar storms in transit (the challenge 4 panel), solar storms at the outpost (10) and meteoroid hits on a solar panel (11), **0 to 3 of each per run**, more likely the longer the mission takes. The planned mission is nine tasks (1, 2, 3, 5, 6, 7, 8, 9, 12); the banner shows "Task N of 9", the step to take right now, and a tally ("Storms 1 · Meteoroids 0"). The step follows the crew's directions as they say them ("Listen to your trainer", "Follow the trainer to the briefing room", "Meet Houston at the communications building", "Take the crew elevator down", "Go to the greenhouse"), with a short hint when it helps ("Out of the main exit", "Walk up to the console and press E"); it is worked out every frame from the run, so a skipped scene or a task done out of order can't leave it behind (`src/scene/objective.ts`). The storm rate is real: it is based on the radiation storms that endanger astronauts, solar energetic particle (SEP) events, of which DONKI recorded 119 in 2024 (against 1036 M- and X-class flares, most of which never send one out). The game speeds time up so one minute of play stands for nine hours of 2024's Sun, about 0.12 storms a minute (`src/data/science.ts`); storms draw real flares that had a linked SEP first. At the outpost the chance grows with every mission day. The meteoroid rate is game-scale (NASA's Meteoroid Environment Office gives no usable rate for hits on a solar panel). Fairness: nothing in the first 30 seconds on a map, nothing during a cinematic, panel, teaching card, airlock cycle, elevator ride or fade, and at least 60 seconds between two of a kind. Every storm draws a **different real flare** from the archive (18 events, 2022–2025). Repeats compound: dose adds up storm after storm, and each meteoroid hit needs its own spare part. Hazards don't cost a mission day; a sheltered outpost storm still fades you into the shelter. Each run has a seed (`?seed=1234` in dev builds), and `?hazards=none` or `?hazards=max` turns them off or to the most the rules allow. A typical 20-minute run expects about 0.3 storms in transit, 1.8 at the outpost and 1.1 meteoroids.

**The Mission Handbook** replaces the debrief: a two-page book with bookmark tabs, written for a 7-year-old (every sentence 15 words or fewer, no vague words, every change with its number and its reason). ← → turn the pages, 1–5 jump to a bookmark, Esc returns to the cover; the first time it opens, a four-step guide shows how (the "?" on the cover brings it back).
- **The cover:** the ending, the astronaut and mission days, why it ended this way, the verdict and the contents.
- **Meters over time:** how to read the charts, then one page per meter: what it means, the chart (safe, warning and danger zones, numbered choices, suns and rocks for luck), where it ended, and the 2–4 biggest reasons it moved, each dated with its number.
- **Mission log:** by day (Launch day, On the way to the Moon, Day 1…, The last day): every choice, every storm (marked Luck), every night ("While you slept"), and each consequence linked back to the choice that caused it (click a link to jump there).
- **Better choices:** each decision replayed with every alternative, with the same seed and the same hazards (`src/state/replay.ts`); a better choice is named only when its replay really ends better, with the numbers why, then the great calls.
- **Real life:** for each part of your mission, what happened in the game, what happens in real life and the source; the real flares you met; OSDR studies; the Sun right now.
- **Summary:** the ending, the main reason, the verdict (skill or luck), four stat tiles, three key points, where the radiation came from, and one tip for next time.

Pages are filled by measuring their content (`src/hud/paginate.ts`); the parts are in `src/hud/HandbookParts.tsx`, the words in `src/data/handbookWords.ts`, the story in `src/state/handbookStory.ts`. The rules are in `src/state/handbook.ts`; checks: `npx tsx tools/checks/handbook.mts`.

**Communication delay.** On the spacecraft and the Moon, Houston's voice takes the real one-way delay to arrive: about 5.6 seconds, NASA's estimate for voice on Artemis (NASA/TM–20250003885, which also gives 1.3 s for Apollo telemetry and 3 to 14 s for lunar missions). Houston's lines show "Receiving…" with a "Signal delay 5.6 s" tag until the words arrive, the storm warning (and so the alarm) comes that much later, and a one-time glossary line explains why. `onLine` events carry `delaySeconds` so the voice plays late too. In the launch center, on Earth, there is no delay. New bites: a dose taken in transit counts in the outpost storm, pushing on while tired, planting nothing, and (Phase 9) walking to the panel without the rover.

Press E at a challenge console: the decision panel opens (the mouse is freed; everything also works by keys). It shows the situation, two crew lines giving opposite advice (mission control's with a radio look), and either **three option cards** or, for a split, **buckets of blocks** with − and +. Each card previews its meters as arrows only: up or down, one to three for a little, some or a lot, green when it helps, orange or red when it hurts. Hovering or picking a card draws **ghost bars** on the HUD meters. A locked option is greyed with its reason and the crew line that explains it. **1**, **2**, **3** pick, **Enter** commits, **Esc** backs out (not on a timed challenge, which shows a countdown ring and lets the commander decide when it runs out). In a split, the arrows or number keys pick a bucket and **+** and **−** change it; Commit waits until every block is placed.

After committing, the meters animate and the result screen gives the exact changes ("Power −18"), what happened and why, and "The real science": what one or two NASA references say about it, with links (`src/data/sources.json`). A science word (radiation, dose, shielding, the lunar night, a fuel cell...) is explained in one sentence the first time it appears on a run (`src/data/glossary.ts`). **Continue** (Enter) captures the mouse again, turns the console green and moves the banner on. Each challenge is done once per run. Challenge 1 decides how many cargo blocks challenge 2 has (10 until it is done; the fuel cell takes one, the reactor three), and packing no spares, no shielding or few supplies is remembered for later.

## The run: days, endings and the handbook

A complete run: tasks **1** and **2** in the launch center (in either order; the rocket can't be boarded until both are done, and the trainer says what's left), the launch, **3** and **5** on the spacecraft (the landing waits for both), then the outpost: **6**, **7** and **9**, the briefing and the ice (**8**), and the lunar night (**12**), then the ending, the Mission Handbook and Try again. Storms and meteoroids come at random along the way (see "Random hazards" above).

**Mission days.** The HUD shows "Day N" at the outpost. One day passes after each outpost challenge, shown on a "Night falls…" card that lists what changed and why. Each night the base eats food and grows it in a powered greenhouse, holds Life Support with enough power or loses it, makes power from challenge 1's source and uses it for what challenge 6 switched on, and the drill piles Moon soil on the roof (Shielding, up to a cap). Crew health drops when the air or food runs low. On the first night a water pump breaks: a spare part fixes it, or Life Support takes a hit. Even inside, the Moon adds its real background dose of 0.5 mSv a day. The rules are in `src/state/days.ts`; the meter rates are game units, and what each stands for is in `src/data/science.ts`.

**Challenge 6, Wake the base.** Six power units across life support, greenhouse, drill and antenna. The split stays on until the end of the run. With the antenna powered, Houston can talk to the crew and warns early before the storm; without it there is no warning.

**A solar storm.** Each storm is a real flare from NASA's DONKI archive (`src/data/donki-archive.json`, 18 C, M and X flares from 2022 to 2025, with every flare and SEP event counted per year; rebuilt by `node tools/fetch-donki.mjs`), a different one every time. When a storm comes, Houston warns over the radio first (when Earth can reach the crew: always in transit, and at the outpost only with the antenna powered; 15 seconds to decide), or the alarm goes straight off (no antenna, 8 seconds). The screen pulses red and the panel opens by itself with the countdown ring and the real event ("Solar flare, class M5.7, recorded 20 June 2024. Source: NASA DONKI (archived data)"). The dose depends on the flare's class (and whether energetic particles followed it), the Shielding packed and built so far, and whether shielding was packed at all. Shielding cuts the dose by up to half, as NASA's radiation standard says, and packing none doubles it. Sheltering at the outpost fades the player into the storm shelter. After a storm, the result shows the real Sun over the last 30 days (live from NASA DONKI through api.nasa.gov, labelled live with the time fetched, cached three hours, skipped when offline; `src/data/spaceWeather.ts`).

**Challenge 12, Lunar night.** Opens only once 6 and the storm are done. A solar-only base is hit hard, a fuel cell less, a reactor barely at all. Committing it plays the long night as one summary card, then the ending.

**Consequences that bite.** Earlier choices come back with a crew line that names the cause: solar only at nightfall, no shielding in the storm, few supplies when food runs low, no spares when the pump breaks, no antenna power before the storm, a dark greenhouse overnight, and working through the storm. If Life Support or food reaches zero, or the dose reaches the high level, the mission ends at once with an early return. Nobody dies.

**Endings.** Four endings (outpost thrives, mission complete, early return for supplies, early return for crew health), each closing with a line from the crew member whose advice was followed most, then the Mission Handbook (above). **Try again** starts a fresh run with the same astronaut; **Skip cutscenes on replay** (Settings, on by default) jumps the launch and landing to their ends on replays.

The panel and night card fire `onLine` with each line's `lineId` for the voices, and `onCue` ('storm-alarm', 'ending-good', 'ending-early') for sound effects (`src/state/lines.ts`). Headless checks for whole runs, every bite, the storm clock, the gates and Try again: `npx tsx tools/checks/run.mts`.

Effects are game units (0 to 100 meters), except the radiation dose: 1 dose point is 3.125 mSv, so the "high" level is NASA's 250 mSv limit for one solar particle event. Every outcome is backed by references in `src/data/sources.json`, and the real figures and how they become game numbers are in `src/data/science.ts`. Challenges 3, 4, 5, 7, 8, 9 and 11 still have first-guess sizes (`TODO: source`). The rules are pure functions in `src/state/decisions.ts`, the panel's keys and flow in `src/scene/challenges.ts`, and the drawing in `src/hud/ChallengePanel.tsx`. The panel fires `onLine` (`src/state/lines.ts`) with each line's `lineId` for the voice audio. Headless checks, including the "no free choice" rule: `npx tsx tools/checks/decisions.mts`.

**The cast** (Shishir's final table) lives in `CAST` in `src/state/mission.ts`: the commander, the safety and medical officer and the science officer fly with the player and have health faces; the communications officer stays on Earth (a "Mission control" radio chip); the trainer is in the launch center only. The player has no voice, so player lines are text only. **The crew's names honour real space pioneers**, each joining two of them so nobody is a real person: commander **Yuri Armstrong** (Yuri Gagarin, Neil Armstrong), safety and medical officer **Alexei Young** (Alexei Leonov, John Young), science officer **Kalpana Ride**, "Kal" (Kalpana Chawla, Sally Ride), Houston **Gus Glenn** (Gus Grissom, John Glenn) and trainer **Ronald Bluford** (Ronald McNair, Guion Bluford). One sourced sentence on each pioneer is on the handbook's Real life page and in the guidebook (`src/data/namedInHonour.ts`). The names live only in `CAST`, and no voice line says one, so changing a name needs no new recordings.

**The crew in the maps.** The crew are in the world, looking like their portraits (same CC0 bodies as the player, their own coverall colours, glasses, beard, bun and stripes; `src/scene/CrewView.tsx`). The trainer waits in the briefing room, then by the crew elevator after challenge 2; Kal (the science officer) waits in the cargo hangar from challenge 1 on and talks to the player there in person; on the spacecraft the commander sits in his seat beside the player's the whole way (a seated pose built from bone rotations, like floating), and the other two sit strapped into the seats behind for the launch and the landing, then float at their posts; at the outpost the commander stands in Command, the safety officer (the medic) in the crew quarters by the bunks and the science officer in the greenhouse. After "Shelter everyone" in a storm they all wait in the shelter until the next day; a crew member resting in red health lies in a crew quarters bunk. They move only while the player can't see them, idle out of step, turn their heads to the player when they speak, and are solid (they never block a console, door or elevator; `tools/checks/data.mts` flood-fills every map with them in place). The rules are pure, in `src/state/crewPlaces.ts`; `CREW_FIGURES` in `src/maps/collision.ts` turns them off. Every playable challenge has two voices arguing opposite sides. A crew member in red health must rest (with the figures on, they lie in a crew quarters bunk) and the player loses their help (the commander's advice drops out of the panel, the medic's risk arrows for dose and health turn into "?", the botanist's greenhouse grows half as much), and the panel says so. Dose has three levels: low (recorded only), moderate at 125 mSv (everyone one step less well, once, and options that add a lot of dose are refused) and high at 250 mSv (the mission ends early). Headless checks for the data and the crew: `npx tsx tools/checks/data.mts`.

## The guidebook (G)

Press **G** any time while playing (not during a scene) for a small book in the handbook's style; the game pauses under it, and G or Esc closes it. The trainer's card in the corridor tells new players about it.

- **Words to know:** every space word in the game, A to Z (with a letter strip to jump), each with a meaning in 12 words or fewer, a picture, where you meet it, and "Seen" once you have (`src/data/guideWords.ts`).
- **Where are my tasks?:** every task with its map and room, who asks you, and its status: Done, Go here now, or Locked with what unlocks it, worked out from the game's own gates (`src/state/guide.ts`; `tools/checks/run.mts` opens each task to prove the table right). Click a row, or press its number, to see the place on the big map. Below it, the hazards and what to do.
- **Controls:** every key (`src/data/controls.ts`, shared with Settings).

## Story scenes

Four short scenes, skippable with **Skip** or **Enter** (`src/scene/beats.ts`). A captured mouse stays captured through a scene (the view is held anyway), so the cursor never pops up and needs a click afterwards: **Enter** skips, and the Skip button shows only while the mouse is free. A question (Houston's cargo question) frees it for its answer buttons, and answering, by click or by **1**/**2**, captures it again. The launch center's opening, walk, briefing, Houston at the door and goodbye play on every run; the others once per saved profile:

1. **The night before launch** (about 14 s, every run, right after the trainer's "Welcome, mission engineer!" card has been shown and said; it closes by itself when he finishes, or with Got it): the trainer in the doorway, then Kal, your best friend, in the crew quarters, with the commander and the safety officer waiting in the corridor outside (Shishir's Phase 1 script).
2. **Arrival** (8 s, off the lander): the commander, in his Moon suit, welcomes you and points you to the airlock.
3. **The first storm at the outpost** (3 s): red alarm light, a shaking view, the crew in the shelter; then the storm panel opens and its timer starts.
4. **Before the lunar night** (12 s): the commander's story at the command window, then challenge 12.

**Shishir's Phase 1 script** (the launch center, `src/data/phase1Lines.ts`) adds more, all voiced:

- **The walk** (`src/scene/walkTogether.ts`): after the opening, the trainer leads the way to the briefing room (waiting if you fall behind) and Kal, the commander and the safety officer walk along behind you, in your footsteps; they're never solid. On the way the trainer introduces himself and the commander teases him, in person; "Guilty. Here we are." when you reach the briefing room.
- **The briefing** (about 52 s, in short parts): it starts by itself after "Here we are" (or at the challenge 1 console, if you get there first), the trainer briefing the crew, the view closing in on the screen and turning to each speaker; then the power source panel opens, the crew waiting in the room until you choose. Skip or Enter ends the whole briefing. There is no console card: in the cargo hangar Kal speaks alone, and the console's own "Press E" prompt shows how to use it.
- **After challenge 1:** the trainer's "Good", then he sends you to the communications officer and Kal teases you. A toast points out of the main exit to the **communications building** (the building north of it, "Comms" on the map).
- **Houston at the door** (scene 4): he waits outside the communications building, between challenges 1 and 2. Walk up and he says hello and asks whether you've checked your cargo; answer with a button (**1** "Not yet, sir." or **2** "Yes, sir! But I can check it once more."), and he answers that and sends you to the hangar. Face to face, he has no radio sound. He meets you on every run.
- **In the cargo hangar:** Kal is waiting; in the cargo panel she says "It's full!" when the pallet is full and a block won't fit. **After packing:** Kal, then Houston on the radio.
- **The goodbye** (12 s): with the cargo packed, walk up to the trainer at the crew elevator. He says it on every run.

Scene lines start when the line before has finished, timed by the recordings' lengths, and a scene longer than 15 s carries on in the next beat. The trainer's two teaching cards in the launch center are voiced too, and the boarding reminders use the script's words ("Not so fast!…", and Houston's "Hold on, astronaut…"). Every line of the Phase 1 script is in the game; packing is still the cargo panel rather than the script's pallet mini game.

**Voices.** Each spoken line plays `public/audio/voice/<lineId>.mp3` if it has one (`src/audio/voices.ts`), one line at a time; Houston sounds like a radio and, away from Earth, arrives by the real signal delay; the speaking portrait's mouth follows the voice; Enter stops a line; the voices volume is in SETTINGS. All 156 lines in the game are recorded, the same list as the voice script (`docs/SCRIPT.md`): the launch center, the spacecraft and outpost story, every decision panel, alert, night card, scene and ending, made with ElevenLabs (Eleven v4) in Shishir's chosen voices. Where a line says the player's name, the recording says "astronaut" instead. `bun tools/voices.mts --list` shows them; with `ELEVENLABS_API_KEY` in `.env.local` (never `VITE_`), `bun tools/voices.mts` makes any that are missing or whose words changed, and `--measure` records files made by hand on elevenlabs.io. `tools/checks/data.mts` fails if a recording's words no longer match the game's.

**Sound effects.** Made in code with Web Audio (`src/audio/sfx.ts`), so there are no files to download or license. The launch: a beep on each number of the countdown from T-10 (higher for the last three); the five F-1s starting at about T-6, a rumble felt through the cabin, then at liftoff, cut outside, the full roar with its crackle and the clang of the hold-down arms; at each staging a pyro bang and the puff of small rockets, then the thinner J-2s; the escape tower's motor whooshing off; the trans-lunar burn; spacecraft separation with its thrusters. The landing: the descent engine's hiss all the way down, thrusters at the pitch-over, the thud and creak of touchdown, the engine stopping. The ending scenes use the same sounds. The storm timers tick every second, with a double blip in the last five and a low two-note tone if time runs out. The elevators: the door motor opening and closing, a clunk as the car starts and stops, its hum on the ride and a chime on arrival, quieter the farther you are (silent past about 25 m). The engines and the hum go quiet whenever the game is frozen (paused, a panel open, the menu, a hidden tab), duck under the crew's voices, and stop if a cinematic is skipped; a limiter keeps it all from clipping. The cinematic sounds hang on the scripts' event ids (`CINEMATIC_SFX`), and the elevators announce what they do (`onElevatorEvent` in `src/scene/elevatorLogic.ts`). `tools/checks/cinematic.mts` checks every sound is on an event the scripts fire and every engine stops; `tools/checks/elevators.mts` checks a ride's sounds come in order.

No hazard comes during a scene, and a teaching card waits until it ends. **Endings** play a 13-second scene each (the next crew landing with Earth on the horizon, an on-schedule liftoff, or an early liftoff as the outpost powers down) before the ending card. Settings → "Story scenes and guides" resets them. Lines and cues for the voices and sound: `BEAT_LINES` and the `beat-*` cues (`src/state/lines.ts`).

## The route to the rocket

All in one map, no loading:

1. **Crew elevator** in the launch tower access room: press E on the call button to bring the car and open its doors, then walk in and pick a floor (below). It rides 8 m down in 4.5 s.
2. **Crew tunnel**: 25.6 m east under the grounds (about 8 s on foot), with a blast door halfway, then a turn into the Pad 1 landing.
3. **Tower elevator** inside the 116 m service tower: glass on the rocket side. It rides 113 m up to the access arm in 15 s, past the floodlit Saturn V.
4. **Crew access arm**: 105 m above the ground, a 6.6 m enclosed walkway with windows, into a white clean room at the command module's hatch (just above the service module, below the escape tower's cover).
5. **Hatch**: press E to board the spacecraft. The launch plays (see below).

**The map.** The minimap (bottom right) shows rooms, consoles (green once done), and outdoors the places with their distance. **Shift+M** opens the big map across the bottom half of the screen, with a legend; with the mouse free (M), the wheel zooms and dragging pans, and clicking still walks there. While driving, the map follows the rover: an orange rover icon with a nose arrow and a heading line, a dashed line home to the outpost, and the battery range ring. "Map turns with you" (Settings) turns the map so the rover points up; a compass shows north either way. `npx tsx tools/checks/map.mts` drives the real rover in eight directions and checks it always moves the way its map arrow points.

**Teaching cards** close with **Enter** ("Got it"), which they take before anything else; while one is up, the "Press E" prompt hides so they never overlap.

**The elevator panel.** A car never leaves on its own. While you stand in one, its panel shows on screen: a floor indicator, a round light per stop with its number key (crew elevator: 1 GROUND, 2 TUNNEL; tower elevator: 1 TUNNEL, 2 ACCESS ARM), the current floor lit with "You are here", and the door keys. It is a display only: the mouse stays captured, so you can look round before, during and after the ride, and clicking never frees it. Press **1** or **2** to choose a floor (the doors close in about a second and the car goes), **O** to open the doors and **C** to close them; these keys do nothing outside a car. The doors never close on the player: standing in the doorway opens them again, and the ride waits until it is clear. On arrival the doors open and the panel shows the new floor; walking out hides it and leaves the car where it is. Esc pauses, as everywhere. Call buttons bring the car and open its doors, but never send anyone anywhere. Headless checks: `npx tsx tools/checks/elevators.mts`; mouse look inside the cars is checked in a dev build through `window.__lunar.view()`.

While riding you can't walk; pausing freezes the car where it is. In third person the camera switches to a fixed corner of the car during the ride.

## The spacecraft

A fictional crew vehicle on its way to the Moon: a cone-shaped cockpit capsule docked, through a short round tunnel, to a habitation module.

| Module | Inside size | What's there |
| --- | --- | --- |
| Cockpit | 3.3 m long, 3.0 m wide, 2.6 m tall, narrowing at the front | Four seats, a curved dashboard, two forward windows, the console for challenge 5 (pick the landing site) |
| Docking tunnel | 1.8 m long, 1.2 m round | A 1.0 m round hatch at each end, with hazard-striped rims; handrails |
| Galley | 4.8 m long, 2.4 × 2.6 m | Food warmer and drink station, fold-down table, laptop, four sleeping bags in wall pockets, a round porthole |
| Life support | 2.8 m long | Racks of fans, filters, tanks and avionics, a CO₂ scrubber readout, the console for challenge 3 (scrubber fault) |
| Storm shelter | 1.8 × 1.8 m alcove | Walls lined with water and soft stowage bags, which absorb radiation; the console for challenge 4 (storm in transit) |

**The launch** (about 70 seconds, **Skip** or Enter skips it at any moment): strapped into the front left seat, the cockpit screen counts down from T-10 all the way to zero while the cabin lights dim, and the consoles say **Preparing for launch**; at T-6 the five F-1 engines start, a low rumble through the seat, and they say **Launching** (back in the cockpit after the climb, they show their tasks again). The windows are covered by the escape tower's shroud (the boost protective cover), as on Apollo. At T-0 it cuts outside for one continuous cinematic, with letterbox bars and the HUD hidden, and a small label naming each event as it happens. The rocket is the Saturn V, at its real size (110.8 m), and the events follow its Moon flights in order: liftoff from the ground by the floodlit pad (steam from the water deluge rolling out of the flame trench, "LIFTOFF", the hold-down arms letting go and the rocket rising slowly, clearing the tower after about 9 s, the camera tilting up after it); the climb from the shore, the rocket rolling and pitching over the ocean, its plume high up still in sunlight; then high up, with the sky deep blue fading to black and Earth's curve below: **first stage separation** (the F-1s stop, retro-rockets puff and the empty first stage falls back tumbling; the second stage's five J-2s light, and the interstage ring round them drops away a few seconds later), **escape tower jettison** (its motor pulls the shroud off the capsule), **second stage separation** (it drops back with its interstage and the third stage's one J-2 lights, its plume spreading very wide in the vacuum), a fade, "Later, in Earth orbit", **trans-lunar injection** on the third stage over a large Earth, and **spacecraft separation** (the command and service module drifts ahead and the adapter's four panels open like petals, showing the lunar module inside the empty stage). The mission clock shows times close to Apollo 11's. Then back in the cockpit, already weightless: the pen and checklist drifting, Earth through the open windows, a card about microgravity, and **Unbuckle** (E) to float up out of the seat. The crew access arm is swung away in every outside shot. Times are squeezed.

**Suits:** every outfit is clearly clothing: gloves, closed boots (the feet are always inside them, so bare feet never show, even with toes pointed), a collar, narrow suit-coloured harness webbing, pockets and pads, seams and a zip, and fabric that fills out over the body. The launch suit is safety orange; the surface suit is a bulky white pressure suit with bearing rings at the joints, a large helmet with a gold visor and lights, a life-support backpack and rounded moon boots with thick treaded soles and tall padded cuffs.

**Floating poses:** astronauts can't swim through air, so the body does what real crews do. Still, it settles into the relaxed "neutral body posture" (arms floating up in front, hips and knees bent); moving, it pushes off and glides, lined up with the direction of travel; near a handrail it pulls itself along hand over hand; and it catches itself with both hands when it drifts into a wall.

**Floating:** 1.5 m/s (2.5 with Shift); speed builds quickly and dies away over about a second, so you drift to a stop. Collision is for the whole body in 3D: its head, chest, hips, knees, feet and hands stay a few centimetres clear of walls, floors, ceilings and every rack, console, seat, table, bag and tank. Where lining up with the travel would push the body into something it stays more upright (or tips further) instead, and heading into a hatch it eases toward the hatch's middle, so it slips through. The suit changes to the orange launch suit.

**Earth and the Moon** are real NASA maps (see `ASSETS.md`) seen through the cockpit windows and the galley porthole. Transit progress sets their size: Earth shrinks behind you and the Moon grows ahead. It starts at 0.1, reaches about 0.4 after challenge 3, 0.7 after challenge 4 and 1.0 at the end. A challenge that isn't playable yet still counts as done when its console is used, so the trip keeps moving. Sizes are squeezed for the game so they change visibly between challenges.

**Landing:** after the challenge 5 console, **Prepare for landing** appears in the cockpit (about 35 seconds, skippable). Strapped in again, the readout shows altitude, descent rate, fuel and the phase, and a small label names each phase: powered descent from about 15 km; braking, tipped over, the surface sliding past below the windows; and the pitch-over at about 2 km, swinging upright to show the landing site ahead. At about 500 m it cuts outside: a chase view behind the lander (the Apollo lunar module, real size), then from the ground by the pad as it slows to a near-hover, edges sideways and comes straight down, its long shadow sliding in to meet it, the dust spraying out flat and dropping straight back with no cloud (there's no air). "TOUCHDOWN", and you're at the foot of the ladder, beside the same lander. The landscape all the way down is one place: the walkable site and the kilometres round it come from the same real LOLA elevations, the same craters and the same baked low-Sun light. On Apollo the crew moved from the command module into the lunar module to land; here they land in the cabin they flew in, seen from outside as the lunar module, to keep the game simple.

## The lunar outpost

The spacecraft lands near the Moon's south pole. You step off at the foot of the ladder, about 60 m from the outpost, in the white surface suit and helmet. You walk at one-sixth of Earth's gravity, so Space jumps high and slow; marker lights lead to the airlock.

**The outpost** stands open on the surface: each room is a habitat module (the corridor a long central module with the rest butting onto it), in a white quilted thermal blanket with gold foil panels and grey regolith dust up its lower parts, with radiators on the roofs, outside lamps, handrails, cable runs to the solar field and antenna, and a vent mast with a beacon, all on a levelled pad. Windows are cut straight through the modules' walls. The airlock has a porch with a short ramp, a framed door and a lit sign. Only the storm shelter is covered in regolith bags (loose lunar soil shields the crew from radiation), with a sign saying so: it's the safe place in a solar storm.

| Room | What's there |
| --- | --- |
| Airlock | Suit hooks, a pressure gauge, the inner and outer doors, a window onto the rover parking |
| Power bay | Battery racks, power distribution, the console for challenge 6 (wake the base) |
| Greenhouse | Hydroponic shelves under pink-purple grow lights, water, misting, the console for challenge 7 |
| Command | The console for challenge 12 (lunar night), the comms rack, a window toward Earth low on the horizon |
| Storm shelter | In the middle, lined with water and supplies, the console for challenge 10 (solar storm) |
| Crew quarters | Four bunks with curtains, lockers, a table, the console for challenge 9 (tired crew) |

**The airlock:** only one door is ever open. Press E at the panel inside (or at the button by a shut door) to cycle: one door closes, the gauge climbs to 101 kPa (or falls to 0), then the other door opens. Halfway through you change suits, the coverall indoors and the surface suit outside. **Power:** the outpost's lights follow the Power meter, dimmer when it's low and red when it's critical.

**The surface** is about 800 m across, edged by a ring of boulders 370 m out. Its large-scale shape is **real NASA LOLA laser altimeter data** from near the south pole (`src/maps/lolaPatch.ts`, fetched by `tools/fetch-lola.mjs`); craters, rocks and boulders are added on top.

| Place | Distance from the outpost | What's there |
| --- | --- | --- |
| Landing pad | about 65 m west | The lunar module (the CC BY-NC Sketchfab model "Apollo Lunar Module" by jgut028, at real size: footpads 9 m apart, 7 m tall), a ring of marker lights, the path of lights to the airlock from the foot of its ladder |
| Solar field | about 50 m south-east | Six tall upright panels facing the low Sun; one is damaged (challenge 11) |
| Comms antenna | about 30 m north-east | A dish on a mast pointed at Earth on the horizon |
| Regolith site | about 115 m west | A small excavator and heaps of dug regolith |
| Ice crater | about 290 m east | A 90 m crater whose floor never sees the Sun; sample the ice there (challenge 8) |

**The rover** is parked just south of the airlock: an open two-seater with treaded wheels under fenders, an umbrella antenna and a TV camera at the front (the CC BY Sketchfab model "Lunar Rover" by Versal, rebuilt for the game; see "Rebuilding the models"). Its front wheels steer and all four roll as it drives. Press E beside the driver's seat to get in, and E again (when stopped) to get out. W accelerates, S brakes then reverses, A and D steer, Shift gives a short boost, Space is the handbrake, and V switches between the driver's seat and a chase camera. There is no physics engine: the body follows the ground under its four wheels, rocks over bumps, and can leave the ground over a crest and float down at lunar gravity. Boulders, the outpost's modules and slopes steeper than about 26 degrees stop it. Its headlights come on by themselves in deep shadow.

The dashboard shows speed and the battery with a **home line**: the charge needed to drive straight back to the outpost (plus a margin). A direct trip to the ice crater and back uses about 80%. Cross the home line and the safety officer appears once as a hologram; keep going and you tell yourself you shouldn't. If the battery runs flat, the crew tow you back to the airlock, it costs a day, and the rover is lost for the rest of the run. Real Apollo crews had a similar walk-back limit.

The surface and lighting: see `src/scene/kit/lunar.ts`. The Sun is 3 degrees up, so the terrain's light and long shadows are baked once at load; only the player (and later the rover) cast real-time shadows.

## Graphics

Pick **Low**, **Medium** or **High** in Settings, in the lobby or the pause menu (remembered next time). Medium is the default.

| Tier | What it does |
| --- | --- |
| Low | Pixel ratio 1, FXAA, no shadows, no environment map, no glass blur behind HUD panels. The fallback. |
| Medium | Pixel ratio up to 1.5, MSAA, ACES tone mapping, environment map, static shadows from one key light. |
| High | Pixel ratio up to 2, plus ambient occlusion and bloom on emissive surfaces only. |

If the frame rate stays under 40 for 3 seconds while playing, the game drops one tier and says so. Shadows are rendered for the first 20 frames of a map and then frozen, because nothing that casts a shadow moves.

**Dev builds only:** add `?at=x,z,yaw,pitch,level,eyeHeight` to the URL (metres and degrees; level defaults to `ground`; eye height is for floating) to start at a spot on the first map, for screenshots. `?map=spacecraft` starts on the spacecraft (with the launch), `&skipLaunch` starts there floating, `&transit=0.95` sets how far to the Moon, and `&seqAt=17` starts the launch (or the landing) 17 seconds in. In the console, `__lunar.sequence('landing')` starts the landing, `__lunar.skip()` skips, and `__lunar.cinematic()` says where it is. `?map=outpost` starts at the landing pad, and `?power=10` starts with low power (red lights). For example `?at=13.1,0.6,-90,14` looks out of the launch tower window and `?at=28,-3.3,-90,0,tunnel` stands at the tunnel midpoint. Add `&fixedGraphics` to stop the automatic tier drop while taking screenshots on a slow machine, and `&orbit=turn,tilt,distance,height` (degrees, degrees, metres, metres above the feet) in third person to look at the body from any side, even from below the floor: `?map=outpost&at=-30,5,90,0&orbit=150,-15,1.4,0.2` looks at the moon boots from in front and below.

## Where things are

| Path | What it holds |
| --- | --- |
| `ROADMAP.md` | Phases 0 to 12, from setup to judge-ready. |
| `src/state/mission.ts` | Mission state and rules (meters, food, crew health, dose, remembered choices). No rendering. |
| `src/state/store.ts` | The single zustand store: mission, current map, which screen is up (title, menu, game), play mode, HUD state. |
| `src/state/settings.ts` | Mouse look, sound volumes and accessibility settings, with the audio hooks. |
| `src/state/lobby.ts` | The lobby's moving parts: how far the astronaut is turned, where they stand on screen, the suit shown. |
| `src/scene/lobby/LobbyStage.tsx` | The lobby in 3D: podium, astronaut, lights, the launch complex and the Saturn V behind, the drifting camera. |
| `src/scene/saturnV.ts`, `src/scene/saturnLayout.ts`, `src/scene/SaturnVView.tsx` | The Saturn V: loading it once, building it whole (pad, lobby) or in its stages (launch cinematic), the floodlight glow, and where its parts are in metres. |
| `src/data/credits.ts` | The NASA data and free assets used, named and credited: the MISSION DATA tab's list. |
| `src/state/player.ts` | Player position and view, kept outside the store. |
| `src/state/graphics.ts` | Graphics tiers: low, medium (default), high. |
| `src/data/challenges.ts` | The twelve challenges as data (see `docs/CHALLENGE_TEMPLATE.md`). Effects are game units; dose is in 3.125 mSv points. |
| `src/data/sources.json` | 21 real NASA and CSA references (each opened and read) and, for every outcome, which back it and why. `reviewer` waits for a person on the team. |
| `src/data/science.ts` | The real figures (dose limits, the lunar night, food per day...) and how they become game numbers. |
| `src/data/spaceWeather.ts` | The live 30-day space weather summary from DONKI (api.nasa.gov). |
| `src/data/osdr-archive.json`, `osdr.ts` | Five archived OSDR studies (`node tools/fetch-osdr.mjs`) and how each links to the game. |
| `src/data/glossary.ts` | Science words explained the first time they appear. |
| `src/maps/types.ts` | The map data format: rooms, walls with doors and windows, consoles, markers, props, spawn, exterior. |
| `src/maps/launchCenter.ts` | Map 1, the launch center. |
| `src/maps/spacecraft.ts` | Map 2, the spacecraft. |
| `src/maps/outpost.ts` | Map 3, the lunar outpost and the surface around it. |
| `src/scene/airlock.ts` | The airlock cycle: doors, pressure, suit change. |
| `src/scene/rover.ts` | Rover driving, terrain following, battery and home line. |
| `src/scene/RoverView.tsx` | The rover drawn: the model, its steering and rolling wheels, headlights, dust and wheel tracks. |
| `tools/build-rover.py`, `tools/build-rover.mjs` | Build the rover model (`public/models/rover.glb`) from the CC BY Sketchfab model, headless in Blender. |
| `src/scene/cards.ts` | Teaching cards: shown once each, from map data. |
| `src/scene/kit/lunar.ts` | Lunar terrain heights (real LOLA data, near and wide, plus craters), the terrain mesh and cable runs. |
| `src/scene/kit/lunarLight.ts` | The low Sun's light and long shadows, baked into light-map textures (the site at 1.25 m, the landscape round it coarser). |
| `src/scene/kit/lunarPrebake.ts` | Works the outpost's terrain and light out in a background worker during the trip, ready for the landing. |
| `src/scene/kit/outpostModules.ts` | The outpost's modules outside: shells, windows, porch, roof kit, the storm shelter's bags. |
| `tools/checks/` | Headless checks: `npx tsx tools/checks/outpost.mts` (and `spacecraft.mts`, `launch.mts`, `cinematic.mts`, `menu.mts`, `elevators.mts`, `suit.mts`, `decisions.mts`, `run.mts`, `data.mts`). |
| `src/state/flight.ts` | Launch progress, transit progress to the Moon, cabin shake and lights. |
| `src/scene/floating.ts` | Floating in microgravity: inertia, whole-body collision, lining up with hatches, Easy float. |
| `src/maps/floatSpace.ts` | 3D free space, solid props and the body's spheres, for floating collision. |
| `src/scene/sequences.ts` | Drives the launch and landing: shots, events, cockpit effects, the readout. |
| `src/scene/cinematic/` | The cinematic system: scripts (shots, camera keys, timed events with captions and sound hooks), the launch pad and landing site stages (built while the cockpit part plays, disposed after), particles and flames. |
| `src/scene/Space.tsx` | Stars, Sun, Earth and Moon seen from the spacecraft. |
| `public/textures/` | NASA Earth and Moon maps. |
| `src/maps/registry.ts` | Every map the game can load. New maps are added here. |
| `src/maps/collision.ts` | Where the player may stand, built from the map data. No physics engine. |
| `src/maps/navigation.ts` | Click-to-walk routes through door centres. |
| `src/scene/materials/` | Every surface type: procedural textures from height fields, canvas textures (decal atlas, screens), the material library. |
| `src/scene/kit/` | Map data to merged geometry: interior and wall dressing, props, consoles, the outside world, and the spacecraft's padded modules (`station.ts`, `spacecraftProps.ts`). |
| `src/scene/` | The 3D view, sky, lights, post-processing, player controls, pointer lock and play modes. |
| `src/scene/palette.ts` | Lighting, sky and fog colours. |
| `src/styles/` | Design tokens, global styles and the shared liquid-glass panel. |
| `src/hud/` | Meters, crew, challenge banner, minimap, prompts, panels, toast, dev counter. |
| `src/hud/menu/` | The title and lobby menu (PLAY, ASTRONAUT, SETTINGS, MISSION DATA), the pause menu and their styles. |
| `src/character/` | The astronaut: model loading, outfits, animation, skin tone, hair and eye colour, name tag and patches. |
| `src/state/astronaut.ts` | The player's astronaut: name checks, word filter, suggestions, the look's choices and skin tone colours, storage, `fillName`. |
| `public/models/` | The two astronaut bodies, the NASA Moon suit fitted to each, the rover, the Saturn V and the lunar module (built, compressed GLB). |
| `tools/build-astronauts.mjs` | Builds the female and male astronaut models from the CC0 source packs. |
| `tools/build-nasa-suit.mjs` | Builds the Moon suit (`public/models/suit-artemis-<body>.glb`, or the earlier `suit-mark3-<body>.glb`) from a static suit model: fitted and weighted to each body's skeleton so it plays the body's clips, no Blender needed. |
| `tools/build-saturn-v.mjs` | Builds the Saturn V model (`public/models/saturn-v.glb`) from the CC BY-ND Sketchfab model: compression only. |
| `tools/build-lunar-module.mjs` | Builds the lander (`public/models/lunar-module.glb`) from the CC BY-NC Sketchfab model: real size, one mesh, one material. |
| `src/scene/lunarModule.ts`, `src/scene/lunarModuleLayout.ts`, `src/scene/LunarModuleView.tsx` | The lunar module: loading it once, where its parts are in metres, and drawing it where a map's `lander` prop stands. |
| `ASSETS.md` | Source and licence of every model, image and sound. |

## Rebuilding the models

The models come from two free CC0 packs by Quaternius: Universal Base Characters and Universal Animation Library (the free Standard versions). Download and unzip both, then:

```bash
node tools/build-astronauts.mjs "path/to/Universal Base Characters[Standard]" "path/to/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb"
```

It writes `public/models/astronaut-male.glb` and `astronaut-female.glb` and prints triangle counts and sizes.

The Moon suit (`public/models/suit-artemis-male.glb` and `suit-artemis-female.glb`) is ["astronaut"](https://sketchfab.com/3d-models/astronaut-7736b318582f447c9b8194e9c23d1347) by omarkamel140 on Sketchfab (CC BY 4.0), an Artemis-style suit. The model is a static mesh in an A-pose with no skeleton; one tool rigs it to each body, in Node, without Blender, so it walks, jogs and idles with the body's own clips:

```bash
node tools/build-nasa-suit.mjs "path/to/astronaut.glb" artemis
```

The earlier Moon suit, NASA's **Mark III Spacesuit** from [NASA's 3D Resources](https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Mark%20III%20Spacesuit), is still in `public/models/suit-mark3-<body>.glb` and builds with `node tools/build-nasa-suit.mjs "path/to/Mark III Spacesuit.glb" mark3`; set `MOON_SUIT_FILE` in `src/character/astronaut.ts` to switch back. For the Mark III the tool leaves out the NASA logo decal and keeps only the visor's front half.

The tool makes the visor gold, keeps helmet lamps glowing, simplifies the suit to about 30,000 triangles, poses each body's skeleton into the suit (upper arms, forearms, thighs and shins aimed down its sleeves and legs), copies each suit vertex's bone weights from the nearest points of the posed body and smooths them in space (so the suit's overlapping layers move together), fixes the helmet, visor and lamps to the upper chest, the gloves to the hands and the boots to the feet, then undoes the pose with dual quaternions so the suit rests in the T-pose the clips use. It prints the triangle count, file size and where the name tag and patch go.

For the Artemis suit it also fixes the backpack (its own meshes in the file) to the upper chest, and sorts each suit point into arm or body by the nearer bone line before copying weights, so the arms, which hang close to the body in its A-pose, never pull on the torso or backpack. Each arm is fitted from its glove (the wrist is where the glove's rubber colour starts, the elbow sits at the body's own elbow-to-wrist proportion, the hand is aimed into the glove), and the glove's fingers follow the finger bones a third of the way (`fingerFollow`), so a fist half-closes the stiff glove instead of crumpling it into the cuff.

In the game both bodies wear it outside on the Moon (and in the menu's suit preview), in place of the whole body, so nothing underneath can poke through; it plays every clip and the floating poses on the astronaut's own skeleton. While it is on, the hips and upper chest are eased most of the way back to upright every frame, with the arms, head and legs turned back so they keep the clip's pose (`SUIT_POSTURE` in `src/character/astronaut.ts`), and the arms are held 10 degrees out from the body (`SUIT_ARMS_OUT`) so the bulky gloves clear the thigh pockets: a suit's hard upper torso doesn't slouch, and the clips' relaxed slouch would tip the rigid helmet and backpack forward. `tools/checks/suit.mts` checks the backpack moves with the chest alone and the gloves follow the fingers only part way. If the suit file can't load, the built-in surface suit is worn instead.

The rover (`public/models/rover.glb`) is the CC BY 4.0 Sketchfab model [Lunar Rover](https://sketchfab.com/3d-models/lunar-rover-82cab6e9ada74d12a98bd6a342e83048) by Versal. Download its GLB, then build it in a headless Blender (the source is about 900,000 triangles; an open Blender ran out of memory on it). Flatpak Blender needs full paths:

```bash
flatpak run org.blender.Blender --background --factory-startup --python "$PWD/tools/build-rover.py" -- ~/Downloads/lunar_rover.glb ~/rover-work/rover-built.glb
node tools/build-rover.mjs ~/rover-work/rover-built.glb
```

The Blender step removes the screws, thins and colours the parts, scales it to the game's 0.42 m wheels and groups it into a body and four wheels (`wheel_*` steers, `spin_*` rolls, each with its fender), with the wheel layout and the driver's seat in a .json beside it; the last step stores that layout in the model and compresses it. If the layout changes, copy it into `rover.wheels` and `rover.seat` in `src/maps/outpost.ts`: `tools/checks/outpost.mts` checks they agree.

The Saturn V (`public/models/saturn-v.glb`) is the Sketchfab model [Saturn V - NASA](https://sketchfab.com/3d-models/saturn-v-nasa-7a2c9709ff8144c8b3b18ec84b5e112e) by Stanley Creative. Its licence is CC BY-ND 4.0: it may be shared with credit but not changed, so the build makes only technical changes for the web (pruning unused data, sharing the identical engine meshes, meshopt compression) and the game never edits its shapes, colours or markings. Download its GLB, then:

```bash
node tools/build-saturn-v.mjs ~/Downloads/saturn_v_-_nasa.glb
```

The model is real size in metres with its nozzle exits at y = 0, so the game uses it unscaled; the pad, the service tower, the access arm (105 m up, `ARM_FLOOR` in `src/scene/kit/exterior.ts` and the map's `arm` level) and the lobby camera are sized round it. Where its parts are (stage joints, engines, the capsule) is in `src/scene/saturnLayout.ts`, and `src/scene/saturnV.ts` splits it into stages by the model's own node names; `tools/checks/launch.mts` checks the access arm still meets the capsule.

The lunar module (`public/models/lunar-module.glb`) is the Sketchfab model [Apollo Lunar Module](https://sketchfab.com/3d-models/apollo-lunar-module-e7458d5b149b482d9829ff90ea6bc233) by jgut028, CC BY-NC 4.0 (free to change and share with credit, but not for commercial use). Download its GLB, then:

```bash
node tools/build-lunar-module.mjs ~/Downloads/apollo_lunar_module.glb
```

It scales the model to real size (×1.4: footpads 9 m apart, 7 m tall), stands it on y = 0 with the ladder facing +z, drops a stray copy of part of the antenna mesh left 11 m off to one side, and merges its 12 flat colours into vertex colours on one mesh and one material. Its measurements are in `src/scene/lunarModuleLayout.ts`; `tools/checks/outpost.mts` checks the outpost's `lander` prop, the spawn at the foot of the ladder and the pad's ring of lights agree with them.

## Adding a map

Write one data file in the shape of `src/maps/types.ts` (see `launchCenter.ts`), then add it to `src/maps/registry.ts`. The geometry, collision, minimap and click-to-walk all come from the data, and the shared kit dresses it: wall panels, deck plating, ceiling lights, cable trays, door frames, status lights, hazard stripes and wall equipment appear automatically. Rooms can ask for handrails, walkway lines and a door sign; props are built by kind (`bunk`, `crate`, `elevator` and so on, see `src/scene/kit/props.ts`).

For walking outside, add `outdoor`: zones (walkable ground at terrain height, with a click-to-walk target), fences (block movement, with a first-time message), outbuildings (solid, with a locked door), floodlit paths and lamp posts. A door whose other side is a zone leads outside; mark it `sliding: true` for glass doors that open on approach. The same shape will serve the outpost and the lunar surface in Phase 3.

For more than one floor, add `levels` (each with an id, label, floor height and `underground` flag) and set `level` on rooms, walls, props, consoles and markers (the default is `ground`). Collision, interaction and click-to-walk all work per level, and only `elevators` join levels: each lists its car's floor area, stops (level, door side, call button), panel, ride time and any glass sides. Its landing doors are wall openings with `elevator` set to its id, placed `CAR_WALL_GAP` beyond the car's edge. Walls can have a `concrete` finish; rooms can set their number of real `lights`. An exit marker whose `target` is in the registry loads that map; until then it shows its `unavailableMessage` and puts the player back at `returnTo`.

For a spacecraft, set `gravity: 'micro'` (players float; Phase 3's outpost will use `'moon'`, walking with low-gravity jumps), `style: 'station'` (padded modules, round hatches, cool LED light), `outfit` and `exterior: { scene: 'space' }`. A hatch is a door opening with a `sill` (the bottom of the hole) and `round: true`; floating players are eased toward its middle. Every prop and console is solid in 3D when floating (except flat ones: signs, wall screens, handholds), from its `elevation` up its height. A room can have a raised `floor` (the tunnel) and `shape: 'capsule'`. `seat`, `countdown` and `arrival: 'launch'` set up the launch; a `sequence` marker with `requires: 5` appears only after challenge 5's console.

## Data sources

Every number that stands for something real comes from a source, listed in `docs/DATASETS.md` and in the game on MISSION DATA:

- **NASA DONKI** (CCMC): the real solar flares and SEP events behind every storm (archived, `src/data/donki-archive.json`), and the Sun over the last 30 days (live, through api.nasa.gov).
- **NASA OSDR**: five real studies on astronaut health, radiation and space plants (`src/data/osdr-archive.json`).
- **NASA LOLA** (PGDA product 90): the real shape of the ground near the lunar south pole.
- **NASA SVS**: the Blue Marble Earth and the LROC colour Moon.
- **21 NASA and CSA references** (NASA-STD-3001 technical briefs, Human Research Program evidence reports, NTRS papers), each opened and read, behind every choice (`src/data/sources.json`), including the 250 and 600 mSv radiation limits and the 5.6-second Artemis voice delay.

Game numbers that have no real source yet are marked `TODO: source` in the code.

## Credits

Every outside file is in `ASSETS.md` with its source, author, licence and what was changed, and on MISSION DATA in the game (`src/data/credits.ts`, checked against `ASSETS.md` by `tools/checks/menu.mts`):

- Astronaut bodies, hair and animations: Quaternius, Universal Base Characters and Universal Animation Library, CC0 1.0.
- The Moon suit: "astronaut" by omarkamel140 on Sketchfab, CC BY 4.0 (rigged, simplified and recoloured).
- The lunar rover: "Lunar Rover" by Versal on Sketchfab, CC BY 4.0 (simplified, coloured, made to drive).
- The Saturn V: "Saturn V - NASA" by Stanley Creative on Sketchfab, CC BY-ND 4.0 (unchanged).
- The lunar module: "Apollo Lunar Module" by jgut028 on Sketchfab, CC BY-NC 4.0 (scaled, cleaned up; non-commercial use).
- Earth and Moon maps, ground elevation, space weather and study data: NASA (see Data sources).
- Fonts: Inter, JetBrains Mono and Barlow Semi Condensed, SIL Open Font License 1.1.
- The crew's voices in the launch center: made with ElevenLabs (elevenlabs.io), Voice Library voices, used non-commercially.
- Code: three.js, React, React Three Fiber, drei and zustand (MIT).
- Everything else (pictures, icons, crew portraits, buildings, terrain detail) is made in code for this game.

The crew, the outpost and the mission patch are fictional; no agency logos are used.

## Team

- **Rishab** ([MrRishabThapa](https://github.com/MrRishabThapa)): TODO: Rishab to fill in his role.
- **Shishir KC**: the cast and the script, voices and sound, the rocket, rover and lander models (see `ASSETS.md`), and the server side. TODO: Shishir to confirm.

Built with Claude (Claude Code and Claude on the web) as a coding and research assistant; every source it cites was opened and read.

## Rules for this repo

### One commit per file, always

- Every file you create or change gets **its own commit**. Never stage two files in one commit.
- This includes scaffolding and lockfiles: `package.json` and `package-lock.json` are two commits.
- If one change touches three files, that is three commits, in an order where each commit still builds where possible.
- Message format: `<type>: <what changed> (<file>)`, for example `feat: add mission state store (src/state/mission.ts)`.
- Types: `feat`, `fix`, `chore`, `docs`, `data`, `style`.
- No force-pushes to `main`.

### Never invent NASA data

Do not make up solar events, sources or numbers. A value without a real source stays a placeholder marked `TODO: source`. A reference goes into `src/data/sources.json` only after someone has opened it, and its `fact` repeats only what it says. Archived data must be labelled as archived, never shown as live; live data must say it is live and when it was fetched.

**API key.** Copy `.env.example` to `.env.local` (never committed) and put a free key from api.nasa.gov in it. `VITE_NASA_API_KEY` is used by the page for the live space weather and ends up in the built page, so only use a free api.nasa.gov key; without it the page uses NASA's shared `DEMO_KEY`. `NASA_API_KEY` is for `node --env-file=.env.local tools/fetch-donki.mjs`.

### Keep it light

The dev laptop has Iris Xe graphics and 8 GB of RAM. Aim for 60 fps and never below 45 at medium, with draw calls under about 80. Merge static geometry by material; separate meshes only for things that change. No physics engine and no UI kit.

### No logos or real brands

The facility and crew are fictional. No agency insignia, logos or real brand names anywhere in the game. The one real thing is the rocket, the Saturn V model: it has no agency insignia, but it keeps its historical "USA" and "UNITED STATES" lettering and US flags, because its licence (CC BY-ND) doesn't allow painting them out.
