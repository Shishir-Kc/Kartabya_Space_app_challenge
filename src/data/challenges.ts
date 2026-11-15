/**
 * The twelve challenges, as data only. No UI lives here: the decision panel
 * (src/hud/ChallengePanel.tsx) draws whatever this file says, so a new
 * challenge is data entry, not code. docs/CHALLENGE_TEMPLATE.md explains
 * every field.
 *
 * HOW THE NUMBERS WORK. The meters run from 0 to 100 in game units, so an
 * effect is a size (+5 "a little", +10 "some", +20 "a lot"), not a NASA
 * figure. What is real is the trade-off each one stands for: every outcome
 * has entries in ./sources.json naming the NASA references behind it, and
 * the real figures (dose limits, the lunar night, food per day...) and how
 * they become game numbers are in ./science.ts. Radiation dose is the one
 * stat in real units: 1 dose point = 3.125 mSv, so the "high" level is
 * NASA's 250 mSv limit for one solar particle event.
 *
 * Challenges 1, 2, 6, 10 and 12 (the playable ones) are sourced. The others
 * have references too, but their effect sizes are still a first guess:
 * TODO: source the sizes in 3, 4, 5, 7, 8, 9 and 11 when they become ready.
 *
 * Players never see the numbers before they commit: the panel turns them
 * into arrows (src/state/decisions.ts). After committing they see the exact
 * change their choice made.
 */
import type { Emotion } from './emotions'
import type { MapId } from '../maps/types'
import type { ChoiceFlag, Effects, Phase, SpeakerId, StatId } from '../state/mission'
import type { HazardKind } from '../state/hazards'
import { REAL } from './science'

/**
 * One spoken line. `lineId` names the voice file Shishir records for it;
 * the panel fires `onLine(lineId)` (src/state/lines.ts) when it shows.
 */
export interface CrewLine {
  speakerId: SpeakerId
  lineId: string
  text: string
  /** How it's said; when absent, the line's entry in LINE_EMOTION (src/data/emotions.ts). */
  emotion?: Emotion
  /** Said face to face, even by Houston: no radio sound, no signal delay. */
  inPerson?: boolean
}

/** A test on the mission. All parts must hold; an empty one always holds. */
export interface Condition {
  /** These remembered choices must be set. */
  flags?: readonly ChoiceFlag[]
  /** These remembered choices must NOT be set. */
  withoutFlags?: readonly ChoiceFlag[]
  /** Minimum values, e.g. `{ spares: 1 }`. */
  min?: Partial<Record<StatId, number>>
  /** Maximum values. */
  max?: Partial<Record<StatId, number>>
}

/** What an option needs before it can be picked. */
export interface Requirement extends Condition {
  /** Shown on the locked card, short: "No spare parts packed". */
  reason: string
  /** A crew line that explains the lock, if there is one. */
  line?: CrewLine
}

/**
 * An option the crew talks the player out of. Its card looks like the
 * others, with its arrows, but picking it brings up the crew `line` saying
 * why not, and it can never be committed. The landing site uses it: the
 * outpost already stands on the slope between, so that's where they land.
 */
export interface RuledOut {
  /** Shown on the card once it's picked, short. */
  reason: string
  line: CrewLine
}

/**
 * An earlier choice coming back ("consequences that bite"). When `when`
 * holds at commit time, its effects are added, the dose is multiplied by
 * `doseFactor`, and the result screen shows `note` and the crew `line`
 * that names the cause. Previews include it too.
 */
export interface Bite {
  /** Unique; each bite is recorded once per run for the debrief. */
  id: string
  /** The challenge whose earlier choice causes it. */
  cause: number
  when: Condition
  /** Extra effects (game units; say which reference shapes them). */
  effects?: Effects
  /** Multiplies the option's dose (say which reference it comes from). */
  doseFactor?: number
  /** One sentence for the result screen: what happened because of the earlier choice. */
  note: string
  line?: CrewLine
}

/** One of the three options of a decision. */
export interface ChallengeOption {
  /** Outcome id ("c03-a"), also the key in sources.json. */
  id: string
  /** Two to four words. */
  label: string
  /** One short line (at most 8 words): what it costs and gives, no numbers. */
  description: string
  /** Optional longer explanation, behind the card's "?". */
  detail?: string
  /** Effects in game units, backed by `sourceIds` (see the header). */
  effects: Effects
  /** After committing: what happened and the real-world reason, in kid language. */
  result: string
  requires?: Requirement
  /** The crew won't do this one, and says why when it's picked (see RuledOut). */
  ruledOut?: RuledOut
  /** Entries in sources.json backing the result. */
  sourceIds: readonly string[]
  /** The speaker who argued for this option (the ending quotes whoever was followed most). */
  advisedBy?: SpeakerId
  /** Earlier choices that change this option (see Bite). */
  bites?: readonly Bite[]
}

/** One bucket of a split: the player hands out a fixed number of units. */
export interface SplitBucket {
  /** Outcome id, also the key in sources.json. */
  id: string
  label: string
  /** One short line (at most 8 words): what a unit here does. */
  description: string
  /** Optional longer explanation, behind the item's "?". */
  detail?: string
  /** How many units one press of + or − moves (usually 1). */
  unitSize: number
  /** Effect of each unit placed here, in game units, backed by `sourceIds`. */
  effectsPerUnit: Effects
  min: number
  max: number
  /** Left empty: remember this, and add this sentence to the result. */
  ifEmpty?: { remember: ChoiceFlag; result: string }
  /** Given at most `atMost` units: remember this (for later bites). */
  ifFew?: { atMost: number; remember: ChoiceFlag }
  sourceIds: readonly string[]
}

interface ChallengeBase {
  /** 1 to 12, in play order. */
  id: number
  /** The map and the console (or challenge marker) that opens it. */
  map: MapId
  consoleId: string
  phase: Phase
  title: string
  /** One short sentence for ages 7 to 12. */
  situation: string
  /** Optional more about the situation, behind the header's "?". */
  detail?: string
  /** At least two lines, the first two giving opposite advice. */
  lines: readonly [CrewLine, CrewLine, ...CrewLine[]]
  /** How this challenge comes back later in the run (for the team, not shown). */
  comesBack: string
  /** Seconds to decide. Left out when there is no timer. */
  timerSeconds?: number
  /** With a timer: the option id that happens when time runs out. */
  timeoutOption?: string
  /**
   * True once its text has been reviewed and it should be playable. The
   * others still open the "coming soon" panel.
   */
  ready: boolean
  /**
   * 'console' (default): E at its console opens it. 'event': it opens by
   * itself when the game says so (the solar storm); its console only says
   * to wait.
   */
  trigger?: 'console' | 'event'
  /** A solar storm: its dose is scaled by the run's DONKI event and the Shielding. */
  storm?: boolean
  /** Which of the run's two real flares this storm is: the one in transit (4) or at the outpost (10, the default). */
  stormKey?: 'transit' | 'outpost'
  /**
   * A hazard (luck, not a planned task): it comes at random, 0 to 3 times a
   * run (src/state/hazards.ts), opening this panel by itself. `repeatLines`
   * are the crew's words its 2nd and 3rd time.
   */
  hazard?: { kind: HazardKind; repeatLines?: readonly (readonly [CrewLine, CrewLine])[] }
  /** Opens only once this holds (the broken panel, after the meteoroid). Until then its reminder is said. */
  opensWhen?: Condition
  /** After Continue, the player is brought home to the airlock with the rover parked (the drive home to the ice). */
  endsAtAirlock?: boolean
  /** A storm without warning from Earth (antenna unpowered) gives only this many seconds. */
  timerWithoutWarning?: number
  /** Opens only once every other ready challenge of its phase is done (the lunar night). */
  last?: boolean
  /** Said when the player tries to move on with this challenge still to do ("Finish packing the cargo first."). */
  reminder?: CrewLine
  /** Lines shown before the two main ones when their condition holds (Houston's warning). */
  extraLines?: readonly { when: Condition; line: CrewLine }[]
  /** Small notes on the panel when their condition holds ("No warning from Earth"). */
  notes?: readonly { when: Condition; text: string }[]
  /** Earlier choices that change every option (see Bite). */
  bites?: readonly Bite[]
  /** One teaching sentence added to every result. */
  teaching?: string
}

/** Pick one of three options. */
export interface ChoiceChallenge extends ChallengeBase {
  kind: 'choice'
  options: readonly [ChallengeOption, ChallengeOption, ChallengeOption]
}

/** Split a fixed number of units across buckets. It never covers everything. */
export interface SplitChallenge extends ChallengeBase {
  kind: 'split'
  /** Units to hand out. */
  units: number
  /** Take the total from the mission instead (cargo blocks left after challenge 1). */
  unitsFrom?: 'cargoBlocks'
  /** "mass blocks", "power units". */
  unitLabel: string
  buckets: readonly SplitBucket[]
  /** After committing: what happened and why, in kid language. */
  result: string
  /** The split stays switched on and drives every night's tick (challenge 6). */
  keepsRunning?: boolean
}

export type Challenge = ChoiceChallenge | SplitChallenge

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 1,
    kind: 'choice',
    map: 'launch-center',
    consoleId: 'c01-console',
    phase: 'pre-launch',
    title: 'Choose the power source',
    situation: 'Pick how the outpost will make electricity.',
    detail: 'The outpost needs power day and night. Heavier gear leaves less room for cargo.',
    lines: [
      { speakerId: 'trainer', lineId: 'c01-line-1', text: 'Solar panels are light. That leaves more room for cargo!' },
      {
        speakerId: 'comms',
        lineId: 'c01-line-2',
        text: 'Houston here. Moon nights last two weeks. Solar panels go dark.',
      },
    ],
    comesBack: 'Sets the mass left for cargo in 2 and how hard the lunar night is in 12.',
    ready: true,
    reminder: { speakerId: 'trainer', lineId: 'c01-reminder', text: 'Not so fast! Choose your power source in the briefing room first.' },
    options: [
      {
        id: 'c01-a',
        label: 'Solar and batteries',
        description: 'Light, but only works in sunlight.',
        detail: 'Light and simple. Solar panels only make power while the Sun is up; batteries carry the rest.',
        effects: { power: -10, remember: { choseSolarOnly: true } },
        advisedBy: 'trainer',
        result:
          'You packed light. Solar panels weigh little, but the lunar night is long, so batteries have to carry the base through the dark.',
        sourceIds: ['c01-a'],
      },
      {
        id: 'c01-b',
        label: 'Solar and a fuel cell',
        description: 'A bit heavier. Works in the dark.',
        detail: 'A fuel cell turns hydrogen and oxygen into electricity and water, so it keeps going at night.',
        effects: { power: 0, cargoBlocks: -1, remember: { choseFuelCell: true } },
        advisedBy: 'trainer',
        result:
          'Fuel cells turn hydrogen and oxygen into electricity and water, so the base keeps power at night. They take a little cargo room.',
        sourceIds: ['c01-b'],
      },
      {
        id: 'c01-c',
        label: 'Small fission reactor',
        description: 'Steady power always. Very heavy.',
        effects: { power: 20, cargoBlocks: -3, remember: { choseReactor: true } },
        advisedBy: 'trainer',
        result:
          'A small reactor makes power day and night, and NASA is studying one for the Moon. It is heavy, so there is less room for cargo.',
        sourceIds: ['c01-c'],
      },
    ],
  },
  {
    id: 2,
    kind: 'split',
    map: 'launch-center',
    consoleId: 'c02-console',
    phase: 'pre-launch',
    title: 'Pack the cargo',
    situation: 'Load the pallet. You can’t take everything.',
    detail: 'The rocket can only lift so much. Split your mass blocks between four kinds of cargo.',
    lines: [
      { speakerId: 'comms', lineId: 'c02-line-1', text: 'Houston here. Pack spares. Things always break, and we can’t send parts quickly.' },
      {
        speakerId: 'trainer',
        lineId: 'c02-line-2',
        text: 'Every block of spares is a block less shielding.',
      },
    ],
    comesBack: 'Shielding sets storm dose; spares unlock repairs in 3 and 11; supplies set Life Support and food.',
    ready: true,
    reminder: { speakerId: 'comms', lineId: 'c02-reminder', text: 'Hold on, astronaut. Pack the cargo in the hangar first.' },
    units: 10,
    unitsFrom: 'cargoBlocks',
    unitLabel: 'mass blocks',
    result:
      'Your cargo is loaded. On real missions every kilogram counts, because more mass needs more fuel to lift off.',
    buckets: [
      {
        id: 'c02-supplies',
        label: 'Supplies',
        description: 'Air, water and food.',
        unitSize: 1,
        // Each crew member needs about 1.8 kg of food a day, all launched [food-hrr]: a block is days of food.
        effectsPerUnit: { lifeSupport: 5, foodDays: 1 },
        min: 0,
        max: 6,
        ifFew: { atMost: 2, remember: 'packedFewSupplies' },
        sourceIds: ['c02-supplies'],
      },
      {
        id: 'c02-shielding',
        label: 'Shielding',
        description: 'Walls against space radiation.',
        unitSize: 1,
        // Shielding cuts solar-storm dose by about half [rad-brief]; see shieldingFactor in src/state/decisions.ts.
        effectsPerUnit: { shielding: 10 },
        min: 0,
        max: 6,
        ifEmpty: { remember: 'packedNoShielding', result: 'You packed no extra shielding, so solar storms will hit harder.' },
        sourceIds: ['c02-shielding'],
      },
      {
        id: 'c02-power-gear',
        label: 'Power gear',
        description: 'Batteries and cables.',
        unitSize: 1,
        // Stored energy carries the base through the dark [rfc].
        effectsPerUnit: { power: 5 },
        min: 0,
        max: 6,
        sourceIds: ['c02-power-gear'],
      },
      {
        id: 'c02-spares',
        label: 'Spare parts',
        description: 'Lets you repair things later.',
        unitSize: 1,
        // Crews fix broken equipment by swapping in spares carried on board [iss-logistics].
        effectsPerUnit: { spares: 1 },
        min: 0,
        max: 4,
        ifEmpty: { remember: 'packedNoSpares', result: 'You left the spare parts behind, so broken equipment can’t be swapped later.' },
        sourceIds: ['c02-spares'],
      },
    ],
  },
  {
    id: 3,
    kind: 'choice',
    map: 'spacecraft',
    consoleId: 'console-scrubber',
    phase: 'transit',
    title: 'Scrubber fault',
    situation: 'The air cleaner is failing, and the cabin is getting stuffy.',
    detail: 'The scrubber takes the carbon dioxide we breathe out of the air. Too much of it gives people headaches.',
    lines: [
      { speakerId: 'safety', lineId: 'c03-line-1', text: 'Swap in a spare part and fix it properly.' },
      { speakerId: 'commander', lineId: 'c03-line-2', text: 'Switch to the backup. It’s quick, but it uses power.' },
    ],
    comesBack: 'Spares and power left; crew health.',
    ready: true,
    reminder: { speakerId: 'commander', lineId: 'c03-reminder', text: 'The air scrubber needs fixing before we land.' },
    options: [
      {
        id: 'c03-a',
        label: 'Repair it',
        description: 'Uses a spare. Fixed for good.',
        effects: { lifeSupport: 10, spares: -1 }, // TODO: source (effect size)
        result: 'You fixed the scrubber. Space station crews replace worn scrubber parts too, because clean air comes first.',
        requires: {
          min: { spares: 1 },
          reason: 'No spare parts packed',
          line: { speakerId: 'safety', lineId: 'c03-a-locked', text: 'We’d fix this in minutes if we’d packed spares.' },
        },
        advisedBy: 'safety',
        sourceIds: ['c03-a'],
      },
      {
        id: 'c03-b',
        label: 'Switch to the backup',
        description: 'Fast, but uses extra power.',
        effects: { power: -10 }, // TODO: source (effect size)
        result: 'The backup cleaned the air, but it drew power. Spacecraft carry backups because air can’t wait.',
        advisedBy: 'commander',
        sourceIds: ['c03-b'],
      },
      {
        id: 'c03-c',
        label: 'Reduce crew activity',
        description: 'Breathe less. The air stays stuffy.',
        detail: 'Resting means breathing out less carbon dioxide, but the air stays stale and the crew gets tired.',
        effects: { lifeSupport: -10, crewHealth: -1 }, // TODO: source (effect size)
        result: 'Resting means breathing out less carbon dioxide, but stuffy air gives the crew headaches and makes them tired.',
        sourceIds: ['c03-c'],
      },
    ],
  },
  {
    id: 4,
    kind: 'choice',
    map: 'spacecraft',
    consoleId: 'console-storm',
    phase: 'transit',
    title: 'Storm in transit',
    situation: 'A radiation storm is coming, and a repair is half done.',
    detail: 'A flare on the Sun can send out fast particles. Far from Earth, only the spacecraft’s walls stop them.',
    lines: [
      { speakerId: 'commander', lineId: 'c04-line-1', text: 'Everyone into the shelter. The repair can wait.' },
      { speakerId: 'science', lineId: 'c04-line-2', text: 'If we stop now, we’ll have to start the repair again.' },
    ],
    comesBack: 'Dose depends on the shielding packed in 2; a dose taken here makes the outpost storm (10) riskier.',
    ready: true,
    trigger: 'event',
    storm: true,
    stormKey: 'transit',
    hazard: {
      kind: 'transitStorm',
      repeatLines: [
        [
          { speakerId: 'commander', lineId: 'c04-line-1b', text: 'Another flare. Same drill: into the shelter.' },
          { speakerId: 'science', lineId: 'c04-line-2b', text: 'Again? We’ll never finish this repair at this rate.' },
        ],
        [
          { speakerId: 'commander', lineId: 'c04-line-1c', text: 'A third storm. Nobody takes chances this time.' },
          { speakerId: 'science', lineId: 'c04-line-2c', text: 'We’re so close. Can two of us keep going?' },
        ],
      ],
    },
    timerSeconds: 15,
    timeoutOption: 'c04-a',
    reminder: { speakerId: 'comms', lineId: 'c04-reminder', text: 'Houston here. No storms on our screens right now.' },
    extraLines: [
      {
        when: {},
        line: { speakerId: 'comms', lineId: 'c04-houston', text: 'Houston here. A flare just went off. Get to the shelter soon.' },
      },
    ],
    teaching: 'Spacecraft have a storm shelter where the most material stands between the crew and space.',
    bites: [
      {
        id: 'no-shielding-transit',
        cause: 2,
        when: { flags: ['packedNoShielding'] },
        doseFactor: 1.5, // TODO: source
        note: 'You packed no shielding, so more radiation got through.',
        line: { speakerId: 'safety', lineId: 'bite-no-shielding-transit', text: 'Without the shielding we left behind, this cabin is thin.' },
      },
    ],
    options: [
      {
        id: 'c04-a',
        label: 'Shelter everyone',
        description: 'Safest. The repair waits.',
        effects: { power: -10, dose: 5 }, // TODO: source (effect size)
        result: 'Everyone hid behind the thickest walls. In real solar storms, astronauts shelter where the most material stands between them and space.',
        advisedBy: 'commander',
        sourceIds: ['c04-a'],
      },
      {
        id: 'c04-b',
        label: 'Shelter part of the crew',
        description: 'Two finish the repair. Middle dose.',
        effects: { power: -5, dose: 15 }, // TODO: source (effect size)
        result: 'The repair got done, but the people outside the shelter took more radiation.',
        advisedBy: 'science',
        sourceIds: ['c04-b'],
      },
      {
        id: 'c04-c',
        label: 'Keep working',
        description: 'Repair finished. Everyone takes radiation.',
        effects: { lifeSupport: 5, dose: 30, remember: { workedThroughTransitStorm: true } }, // TODO: source (effect size)
        result: 'The job is done, but the whole crew soaked up radiation. Radiation adds up over a mission, so the doctor will remember this.',
        advisedBy: 'science',
        sourceIds: ['c04-c'],
      },
    ],
  },
  {
    id: 5,
    kind: 'choice',
    map: 'spacecraft',
    consoleId: 'console-landing',
    phase: 'transit',
    title: 'Pick the landing site',
    situation: 'Choose where we land.',
    detail: 'Near the Moon’s south pole, high ridges get long sunlight, and deep craters hide ice in their shadows.',
    lines: [
      { speakerId: 'science', lineId: 'c05-line-1', text: 'Stay close to the ice. We can turn it into water!' },
      { speakerId: 'commander', lineId: 'c05-line-2', text: 'We need sunlight too. Our panels run on it.' },
    ],
    // The outpost map is one real place (LOLA heights): low, gently sloping ground about 300 m from the ice crater.
    comesBack:
      'Only the slope between can be committed, because the outpost already stands there; the ridge and the crater bring a crew line saying why not. Its effects are all it changes: daily power and the drive to the ice are the same for every run.',
    ready: true,
    reminder: { speakerId: 'commander', lineId: 'c05-reminder', text: 'We can’t land until we pick a landing site.' },
    options: [
      {
        id: 'c05-a',
        label: 'Sunny ridge',
        description: 'Lots of sun. Far from the ice.',
        detail: 'More power every day from the solar panels, but a long drive to the ice crater.',
        effects: { power: 10 }, // TODO: source (effect size)
        result: 'Some ridges near the Moon’s south pole get sunlight for long stretches, so your panels stay busy. The ice is far away.',
        ruledOut: {
          reason: 'Too far from the ice. The outpost is on the slope.',
          line: { speakerId: 'science', lineId: 'c05-a-ruled-out', text: 'The ridge is too far from the ice. Our outpost is waiting on the slope between. Let’s land there.' },
        },
        advisedBy: 'commander',
        sourceIds: ['c05-a'],
      },
      {
        id: 'c05-b',
        label: 'Crater rim',
        description: 'Near the ice. Often in shadow.',
        detail: 'A short drive to the ice, but the panels make less power every day.',
        effects: { power: -5, lifeSupport: 10 }, // TODO: source (effect size)
        result: 'Ice hides in craters that never see the Sun. You’re close to water, but your panels get less light.',
        ruledOut: {
          reason: 'Too dark for the panels. The outpost is on the slope.',
          line: { speakerId: 'commander', lineId: 'c05-b-ruled-out', text: 'The crater rim is in shadow too often for our panels. Our outpost is on the slope between. We land there.' },
        },
        advisedBy: 'science',
        sourceIds: ['c05-b'],
      },
      {
        id: 'c05-c',
        label: 'The slope between',
        description: 'Some sun. A shorter drive.',
        effects: { power: 5, lifeSupport: 5, remember: { landedSlope: true } }, // TODO: source (effect size)
        result: 'You landed beside your outpost, on the slope between the ridge and the crater. A middle spot gives a bit of both: some sun, and the ice isn’t far.',
        sourceIds: ['c05-c'],
      },
    ],
  },
  {
    id: 6,
    kind: 'split',
    map: 'outpost',
    consoleId: 'console-power',
    phase: 'outpost',
    title: 'Wake the base',
    situation: 'Plug in the power. There isn’t enough for everything.',
    detail: 'Whatever you choose stays switched on every day until the end of the mission.',
    lines: [
      { speakerId: 'commander', lineId: 'c06-line-1', text: 'Life support first. Always.' },
      { speakerId: 'science', lineId: 'c06-line-2', text: 'Without the greenhouse, we’ll run out of food.' },
    ],
    comesBack: 'Runs every night: food, Life Support, Power and Shielding; the antenna decides the storm warning in 10.',
    ready: true,
    reminder: { speakerId: 'commander', lineId: 'c06-reminder', text: 'Wake the base in the power bay first.' },
    units: 6,
    unitLabel: 'power units',
    keepsRunning: true,
    result:
      'The base is awake, and your choice stays switched on every day. A new outpost never has enough power at first, so the crew has to choose what comes first.',
    buckets: [
      {
        id: 'c06-life-support',
        label: 'Life support',
        description: 'Air and water. Needs two to hold.',
        detail: 'Two units keep Life Support steady each day; fewer and it runs down.',
        unitSize: 1,
        effectsPerUnit: { lifeSupport: 5 },
        min: 0,
        max: 4,
        sourceIds: ['c06-life-support'],
      },
      {
        id: 'c06-greenhouse',
        label: 'Greenhouse',
        description: 'Plant lights. Grows food daily.',
        unitSize: 1,
        effectsPerUnit: {},
        min: 0,
        max: 3,
        ifEmpty: { remember: 'greenhouseUnpowered', result: 'The greenhouse is dark, so no new food will grow.' },
        sourceIds: ['c06-greenhouse'],
      },
      {
        id: 'c06-drill',
        label: 'Drill',
        description: 'Piles Moon soil on the roof.',
        detail: 'Moon soil on the roof blocks radiation, so Shielding grows every day.',
        unitSize: 1,
        // Regolith 3 to 7 m thick is good radiation shielding [safe-haven]; the daily rate is in src/state/days.ts.
        effectsPerUnit: { shielding: 5 },
        min: 0,
        max: 3,
        sourceIds: ['c06-drill'],
      },
      {
        id: 'c06-antenna',
        label: 'Antenna',
        description: 'Radio to Earth. Storm warnings.',
        detail: 'With the antenna powered, Houston can talk to you and warn you before a solar storm.',
        unitSize: 1,
        // NASA and NOAA watch the Sun and warn crews to shelter [artemis-sun], over relays at the south pole [lunanet].
        effectsPerUnit: {},
        min: 0,
        max: 2,
        ifEmpty: { remember: 'antennaUnpowered', result: 'With no power for the antenna, Earth can’t reach you.' },
        sourceIds: ['c06-antenna'],
      },
    ],
  },
  {
    id: 7,
    kind: 'choice',
    map: 'outpost',
    consoleId: 'console-greenhouse',
    phase: 'outpost',
    title: 'Greenhouse',
    situation: 'Plants need water now, and give food later.',
    detail: 'What you plant now is harvested during the long lunar night. Planting nothing means no fresh food then.',
    lines: [
      { speakerId: 'science', lineId: 'c07-line-1', text: 'Plant everything! We’ll be glad of fresh food later.' },
      { speakerId: 'safety', lineId: 'c07-line-2', text: 'Water is life support. Save it until we know we have enough.' },
    ],
    comesBack: 'The harvest arrives in the lunar night (12) only if planted here; with the botanist resting it grows half as much.',
    ready: true,
    reminder: { speakerId: 'science', lineId: 'c07-reminder', text: 'We haven’t planted the greenhouse yet.' },
    options: [
      {
        id: 'c07-a',
        label: 'Plant everything',
        description: 'Lots of water now. Big harvest later.',
        effects: { lifeSupport: -20, harvestDays: 6 }, // TODO: source (effect size)
        result: 'The greenhouse is full. Plants turn water and light into food, and they help clean the air too.',
        advisedBy: 'science',
        sourceIds: ['c07-a'],
      },
      {
        id: 'c07-b',
        label: 'Plant half',
        description: 'Some water now. Some food later.',
        effects: { lifeSupport: -10, harvestDays: 3 }, // TODO: source (effect size)
        result: 'Half the trays are growing. You kept some water in the tanks, just in case.',
        sourceIds: ['c07-b'],
      },
      {
        id: 'c07-c',
        label: 'Save the water',
        description: 'Water stays. Nothing new grows.',
        effects: { remember: { skippedPlanting: true } },
        result: 'You saved the water, but nothing new is growing, and food from Earth is a long way away.',
        advisedBy: 'safety',
        sourceIds: ['c07-c'],
      },
    ],
  },
  {
    id: 8,
    kind: 'choice',
    map: 'outpost',
    consoleId: 'sample-ice',
    phase: 'outpost',
    title: 'Rover drive and water ice',
    situation: 'You’ve driven to the ice. What do you do with it?',
    detail: 'Ice in the crater’s shadow can be melted into water and split into oxygen, but digging takes time outside.',
    lines: [
      { speakerId: 'science', lineId: 'c08-line-1', text: 'Dig out as much as we can. Ice means water and air!' },
      { speakerId: 'safety', lineId: 'c08-line-2', text: 'Every minute out here adds radiation. Take a little and go.' },
    ],
    comesBack: 'Extracting refills Life Support every remaining night; rationing drains it faster; a flat battery on the way loses the rover for 11.',
    ready: true,
    opensWhen: { flags: ['iceBriefed'] },
    endsAtAirlock: true,
    reminder: { speakerId: 'commander', lineId: 'c08-reminder', text: 'Not yet. Wait for my briefing at command.' },
    options: [
      {
        id: 'c08-a',
        label: 'Extract the ice now',
        description: 'Big power cost. Water every night.',
        detail: 'The drill uses a lot of power now, but the ice gives the base extra water every night until the end.',
        effects: { power: -20, lifeSupport: 10, dose: 10, remember: { iceExtracted: true } }, // TODO: source (effect size)
        result: 'Ice can be melted into water and split into oxygen. Digging took a long time outside, so the crew took more radiation.',
        advisedBy: 'science',
        sourceIds: ['c08-a'],
      },
      {
        id: 'c08-b',
        label: 'Run a small trial',
        description: 'Smaller cost. A little water nightly.',
        effects: { power: -10, lifeSupport: 5, dose: 5, remember: { iceTrial: true } }, // TODO: source (effect size)
        result: 'You brought back a little ice and learned how to dig it. A good test before the real thing.',
        sourceIds: ['c08-b'],
      },
      {
        id: 'c08-c',
        label: 'Delay and ration',
        description: 'No cost now. Air drains faster.',
        detail: 'You go home with nothing, and the crew uses less water, so Life Support runs down a little faster each night.',
        effects: { remember: { rationingWater: true } },
        result: 'You headed home safely, but the base has to use less water, and Life Support runs down faster.',
        advisedBy: 'safety',
        sourceIds: ['c08-c'],
      },
    ],
  },
  {
    id: 9,
    kind: 'choice',
    map: 'outpost',
    consoleId: 'console-quarters',
    phase: 'outpost',
    title: 'Tired crew',
    situation: 'Everyone is worn out, and there’s still work to do.',
    detail: 'NASA counts ten-hour work days on more than three days a week as overload. Tired crews make mistakes.',
    lines: [
      { speakerId: 'safety', lineId: 'c09-line-1', text: 'Everyone needs a full day of rest. Tired people make mistakes.' },
      { speakerId: 'commander', lineId: 'c09-line-2', text: 'We still have to finish the roof before the next storm.' },
    ],
    comesBack: 'Health recovers, or a crew member goes red sooner.',
    ready: true,
    reminder: { speakerId: 'safety', lineId: 'c09-reminder', text: 'The crew needs a decision about rest first.' },
    options: [
      {
        id: 'c09-a',
        label: 'A full day of rest',
        description: 'Everyone recovers. Base on standby.',
        effects: { crewHealth: 1, power: -10 }, // TODO: source (effect size)
        result: 'Rest helped everyone recover. Space station crews get planned rest days, because tired crews make mistakes.',
        advisedBy: 'safety',
        sourceIds: ['c09-a'],
      },
      {
        id: 'c09-b',
        label: 'Half a day of light duty',
        description: 'A little rest, a little work.',
        effects: { power: -5 }, // TODO: source (effect size)
        result: 'Easy jobs only. Nobody got much better, but nobody got worse.',
        sourceIds: ['c09-b'],
      },
      {
        id: 'c09-c',
        label: 'Push on',
        description: 'Roof gets thicker. Crew gets more tired.',
        effects: { crewHealth: -1, shielding: 10, remember: { pushedOnTired: true } }, // TODO: source (effect size)
        result: 'The roof is thicker now, but the crew is worn out.',
        advisedBy: 'commander',
        sourceIds: ['c09-c'],
      },
    ],
  },
  {
    id: 10,
    kind: 'choice',
    map: 'outpost',
    consoleId: 'console-shelter',
    phase: 'outpost',
    title: 'Solar storm',
    situation: 'A radiation storm from the Sun is about to hit. Decide fast!',
    detail: 'A solar storm throws out tiny, fast particles that can hurt people: radiation.',
    lines: [
      { speakerId: 'safety', lineId: 'c10-line-1', text: 'Everyone to the shelter, now!' },
      { speakerId: 'commander', lineId: 'c10-line-2', text: 'The roof is almost finished. A few more minutes and we’re done!' },
    ],
    comesBack: 'Dose depends on the Shielding packed in 2 and built by the drill in 6.',
    ready: true,
    trigger: 'event',
    storm: true,
    hazard: {
      kind: 'outpostStorm',
      repeatLines: [
        [
          { speakerId: 'safety', lineId: 'c10-line-1b', text: 'Another storm! Everyone to the shelter.' },
          { speakerId: 'commander', lineId: 'c10-line-2b', text: 'We lost a whole day last time. Can we keep working?' },
        ],
        [
          { speakerId: 'safety', lineId: 'c10-line-1c', text: 'Third storm. Our dose keeps adding up. Shelter now.' },
          { speakerId: 'commander', lineId: 'c10-line-2c', text: 'The Sun won’t stop. We still have a base to run.' },
        ],
      ],
    },
    timerSeconds: 15,
    timerWithoutWarning: 8,
    timeoutOption: 'c10-a',
    extraLines: [
      {
        when: { withoutFlags: ['antennaUnpowered'] },
        line: {
          speakerId: 'comms',
          lineId: 'c10-houston',
          text: 'Houston here. We’re seeing a big flare on the Sun. Particles could reach you soon.',
        },
      },
    ],
    notes: [{ when: { flags: ['antennaUnpowered'] }, text: 'No warning from Earth: the antenna had no power.' }],
    teaching: 'Water, food and Moon soil around a shelter soak up radiation, which is why the shelter walls are lined with them.',
    bites: [
      {
        id: 'transit-dose-storm',
        cause: 4,
        when: { flags: ['workedThroughTransitStorm'] },
        note: 'The crew already took a dose working through the storm in transit, so this one counts for more.',
        line: { speakerId: 'safety', lineId: 'bite-transit-dose', text: 'We took a dose on the way here. We can’t take much more.' },
      },
      {
        id: 'no-shielding-storm',
        cause: 2,
        when: { flags: ['packedNoShielding'] },
        // Shielding cuts solar-storm dose by about half [rad-brief], so without it the dose doubles.
        doseFactor: 1 / (1 - REAL.shieldingCut),
        note: 'You packed no shielding, so more radiation got through.',
        line: { speakerId: 'safety', lineId: 'bite-no-shielding', text: 'We left the shielding on Earth. This is going to hurt.' },
      },
      {
        id: 'no-antenna-storm',
        cause: 6,
        when: { flags: ['antennaUnpowered'] },
        note: 'The antenna had no power, so the warning came late.',
        line: { speakerId: 'safety', lineId: 'bite-no-antenna', text: 'Houston couldn’t reach us.' },
      },
    ],
    options: [
      {
        id: 'c10-a',
        label: 'Shelter everyone',
        description: 'No work today. The lowest dose.',
        effects: { power: -10, dose: 5 },
        result: 'Everyone waited out the storm behind the thickest walls, which is what real crews do.',
        advisedBy: 'safety',
        sourceIds: ['c10-a'],
      },
      {
        id: 'c10-b',
        label: 'Shelter part of the crew',
        description: 'Some work, some hide. Middle dose.',
        effects: { power: -5, dose: 15 },
        result: 'The work went on, but the people outside the shelter took more radiation.',
        advisedBy: 'commander',
        sourceIds: ['c10-b'],
      },
      {
        id: 'c10-c',
        label: 'Keep working',
        description: 'The roof gets finished. The highest dose.',
        effects: { dose: 30, shielding: 10, health: { science: -1 }, remember: { workedThroughStorm: true } },
        result: 'The roof is finished, but the whole crew took a big dose of radiation.',
        advisedBy: 'commander',
        bites: [
          {
            id: 'worked-in-storm',
            cause: 10,
            when: {},
            note: 'Working outside the shelter made the science officer sick.',
            line: { speakerId: 'science', lineId: 'bite-worked-in-storm', text: 'My head hurts. I should have sheltered.' },
          },
        ],
        sourceIds: ['c10-c'],
      },
    ],
  },
  {
    id: 11,
    kind: 'choice',
    map: 'outpost',
    consoleId: 'damaged-panel',
    phase: 'outpost',
    title: 'Broken solar panel',
    situation: 'A meteoroid just hit a solar panel. Power is dropping!',
    detail: 'Tiny rocks from space hit the Moon all the time, because there is no air to burn them up.',
    lines: [
      { speakerId: 'commander', lineId: 'c11-line-1', text: 'Let’s walk out and swap the part. We need full power for the night.' },
      { speakerId: 'safety', lineId: 'c11-line-2', text: 'A moonwalk uses air and adds radiation. Patch it from here.' },
    ],
    comesBack: 'Costs oxygen and dose, or leaves less power for the night.',
    ready: true,
    trigger: 'event',
    hazard: {
      kind: 'meteoroid',
      repeatLines: [
        [
          { speakerId: 'commander', lineId: 'c11-line-1b', text: 'Another hit! Let’s swap the part before power drops more.' },
          { speakerId: 'safety', lineId: 'c11-line-2b', text: 'Every walk out adds radiation. A patch will do.' },
        ],
        [
          { speakerId: 'commander', lineId: 'c11-line-1c', text: 'A third panel down. We need full power for the night.' },
          { speakerId: 'safety', lineId: 'c11-line-2c', text: 'We’ve been out so much already. Patch it from here.' },
        ],
      ],
    },
    reminder: { speakerId: 'commander', lineId: 'c11-reminder', text: 'The solar panels are working fine for now.' },
    options: [
      {
        id: 'c11-a',
        label: 'Moonwalk to replace it',
        description: 'Full power. Costs air, a spare, radiation.',
        effects: { power: 0, lifeSupport: -10, dose: 10, spares: -1 }, // TODO: source (effect size)
        result: 'You swapped the broken part outside. Moonwalks are how real crews fix outside equipment, but they cost air and time.',
        requires: {
          min: { spares: 1 },
          reason: 'No spare parts left',
          line: { speakerId: 'commander', lineId: 'c11-a-locked', text: 'That would be an easy fix with a spare part.' },
        },
        advisedBy: 'commander',
        bites: [
          {
            id: 'no-rover-walk',
            cause: 8,
            when: { flags: ['lostRover'] },
            effects: { dose: 5, lifeSupport: -5 }, // TODO: source
            note: 'Without the rover, the walk out took longer, so it cost more air and radiation.',
            line: { speakerId: 'safety', lineId: 'bite-no-rover-walk', text: 'Without the rover, it’s a long walk out there.' },
          },
        ],
        sourceIds: ['c11-a'],
      },
      {
        id: 'c11-b',
        label: 'Patch it',
        description: 'Half power back. A short trip out.',
        effects: { power: -10, dose: 5 }, // TODO: source (effect size)
        result: 'The patch works, but the panel only makes about half its power now.',
        advisedBy: 'safety',
        bites: [
          {
            id: 'no-rover-patch',
            cause: 8,
            when: { flags: ['lostRover'] },
            effects: { dose: 3 }, // TODO: source
            note: 'Without the rover, even the short trip out took longer.',
            line: { speakerId: 'safety', lineId: 'bite-no-rover-patch', text: 'On foot, even a short trip adds up.' },
          },
        ],
        sourceIds: ['c11-b'],
      },
      {
        id: 'c11-c',
        label: 'Run on less power',
        description: 'Nobody goes out. Power stays low.',
        effects: { power: -20 }, // TODO: source (effect size)
        result: 'Everyone stayed safe inside, but the base has much less power for the night.',
        sourceIds: ['c11-c'],
      },
    ],
  },
  {
    id: 12,
    kind: 'choice',
    map: 'outpost',
    consoleId: 'console-command',
    phase: 'outpost',
    title: 'Lunar night falls',
    situation: 'Night is coming. How will the base get through?',
    detail: 'The Sun is setting, and the night will last about two weeks. It gets colder than −170 °C.',
    lines: [
      { speakerId: 'commander', lineId: 'c12-line-1', text: 'Turn almost everything off and sleep through it.' },
      { speakerId: 'safety', lineId: 'c12-line-2', text: 'Keep everything running. The crew has to stay warm and well.' },
    ],
    comesBack: 'Decides the ending. Solar-only bases are badly stressed; a reactor barely notices.',
    ready: true,
    last: true,
    reminder: { speakerId: 'commander', lineId: 'c12-reminder', text: 'Not yet. We have work to do before nightfall.' },
    extraLines: [
      {
        when: { withoutFlags: ['antennaUnpowered'] },
        line: { speakerId: 'comms', lineId: 'c12-houston', text: 'Houston here. It’s going to be a long, cold night. Save what you can.' },
      },
    ],
    bites: [
      {
        id: 'solar-night',
        cause: 1,
        when: { flags: ['choseSolarOnly'] },
        // Solar panels make nothing in the two-week lunar night [moon-facts]: the most power lost (game scale).
        effects: { power: -20 },
        note: 'Solar panels make no power in the dark, so the batteries had to carry the whole night.',
        line: {
          speakerId: 'commander',
          lineId: 'bite-solar-night',
          text: 'Solar panels make nothing in the dark. A reactor would have kept us going.',
        },
      },
      {
        id: 'fuel-cell-night',
        cause: 1,
        when: { flags: ['choseFuelCell'] },
        // A fuel cell runs on stored hydrogen and oxygen through the night [rfc]: half the solar loss (game scale).
        effects: { power: -10 },
        note: 'The fuel cell kept some power flowing in the dark, but its fuel ran low.',
      },
      {
        id: 'reactor-night',
        cause: 1,
        when: { flags: ['choseReactor'] },
        // A fission reactor gives continuous power, day and night [fsp]: a small gain while others lose (game scale).
        effects: { power: 10 },
        note: 'The reactor kept running through the dark, as if nothing had changed.',
      },
    ],
    options: [
      {
        id: 'c12-a',
        label: 'Hibernate',
        description: 'Saves power. The greenhouse goes dark.',
        effects: { power: -10, foodDays: -2 },
        result: 'The base slept through the cold and dark. Saving power kept it going, but the plants stopped growing.',
        advisedBy: 'commander',
        sourceIds: ['c12-a'],
      },
      {
        id: 'c12-b',
        label: 'Run normally',
        description: 'All on. Lots of power and air.',
        effects: { power: -20, lifeSupport: -10 },
        result: 'Everything kept running, but the batteries and tanks drained fast in the long night.',
        advisedBy: 'safety',
        sourceIds: ['c12-b'],
      },
      {
        id: 'c12-c',
        label: 'Reduce crew activity',
        description: 'Less work and power. Crew gets tired.',
        effects: { power: -10, crewHealth: -1 },
        result: 'Less work saved power, but long cold days indoors wore the crew down.',
        sourceIds: ['c12-c'],
      },
    ],
  },
]

export function getChallenge(id: number): Challenge | undefined {
  return CHALLENGES.find((challenge) => challenge.id === id)
}

/**
 * A gate on a challenge (the landing waits for challenge 5): cleared once
 * it is done on this run, or straight away while it isn't ready to play,
 * so later phases slot in by setting `ready: true`.
 */
export function challengeCleared(id: number, done: readonly number[]): boolean {
  return done.includes(id) || !getChallenge(id)?.ready
}

/** Every outcome id in the game, in play order. Each needs a source entry. */
export function allOutcomeIds(): string[] {
  return CHALLENGES.flatMap((challenge) =>
    challenge.kind === 'choice'
      ? challenge.options.map((option) => option.id)
      : challenge.buckets.map((bucket) => bucket.id),
  )
}
