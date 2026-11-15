/**
 * Mission state: everything the game remembers during one run.
 *
 * This file is pure data and pure functions. It knows nothing about React,
 * three.js or the store, so the rules can be read and tested on their own.
 * One state object lives from pre-launch to the ending and is never reset
 * between challenges; that is what lets an early choice come back later.
 */

import type { Decision } from './decisions'
import { newSeed, type HazardKind } from './hazards'
import { DOSE_POINTS_HIGH } from '../data/science'

// ---------- Meters ----------

/** The three meters shown on screen, each 0 to 100. */
export type MeterId = 'power' | 'lifeSupport' | 'shielding'

export const METER_IDS: readonly MeterId[] = ['power', 'lifeSupport', 'shielding']

export const METER_LABELS: Record<MeterId, string> = {
  power: 'Power',
  lifeSupport: 'Life Support',
  shielding: 'Shielding',
}

export const METER_MIN = 0
export const METER_MAX = 100

/** Below this a meter counts as critical. TODO: source (placeholder threshold). */
export const METER_CRITICAL = 15

// ---------- Cast ----------

/**
 * Everyone who speaks in the game (Shishir's final cast, 14 Nov). All five
 * are voiced; the player (the mission engineer) is not, so player lines are
 * text only.
 */
export type SpeakerId = 'commander' | 'safety' | 'science' | 'comms' | 'trainer'

export const SPEAKER_IDS: readonly SpeakerId[] = ['commander', 'safety', 'science', 'comms', 'trainer']

/** The three crew who fly to the Moon with the player. Only they have a health face. */
export type CrewId = 'commander' | 'safety' | 'science'

export const CREW_IDS: readonly CrewId[] = ['commander', 'safety', 'science']

export function isCrew(id: SpeakerId): id is CrewId {
  return (CREW_IDS as readonly string[]).includes(id)
}

export interface CastMember {
  id: SpeakerId
  /**
   * Each name joins two real space pioneers' names, so nobody is a real
   * person (who they honour: src/data/namedInHonour.ts). The team can still
   * change them here; no voice line says a crew name, so a change needs no
   * new recordings.
   */
  name: string
  /** What the others call them, in text ("Kal was resting"). */
  short: string
  initials: string
  role: string
  /** Fits on one line in the HUD and the decision panel. */
  shortRole: string
  /** Where they are during the mission. */
  where: string
  /** Talks only over the radio (mission control on Earth). */
  radio: boolean
  /** What this character argues for when the player has to choose. */
  arguesFor: string
  /** What the player loses while this crew member is resting in red health, short for the HUD. */
  lostWhileResting?: string
}

/** The one place the names live. */
export const CAST: Record<SpeakerId, CastMember> = {
  commander: {
    id: 'commander',
    name: 'Yuri Armstrong',
    short: 'Yuri',
    initials: 'YA',
    role: 'Veteran commander',
    shortRole: 'Commander',
    where: 'Moon outpost, and with the player in transit',
    radio: false,
    arguesFor: 'Safety margin',
    lostWhileResting: 'Resting: no advice',
  },
  safety: {
    id: 'safety',
    name: 'Alexei Young',
    short: 'Alexei',
    initials: 'AY',
    role: 'Safety and medical officer',
    shortRole: 'Safety & medic',
    where: 'Moon outpost',
    radio: false,
    arguesFor: 'The lowest-risk option',
    lostWhileResting: 'Resting: risks hidden',
  },
  science: {
    id: 'science',
    name: 'Kalpana Ride',
    short: 'Kal',
    initials: 'KR',
    role: 'Science officer and botanist, your best friend',
    shortRole: 'Science & plants',
    where: 'Moon outpost',
    radio: false,
    arguesFor: 'The mission goal',
    lostWhileResting: 'Resting: less food',
  },
  comms: {
    id: 'comms',
    name: 'Gus Glenn',
    short: 'Gus',
    initials: 'GG',
    role: 'Communications officer, "Houston"',
    shortRole: 'Mission control',
    where: 'Earth, mission control (radio only)',
    radio: true,
    arguesFor: 'Asking Earth first',
  },
  trainer: {
    id: 'trainer',
    name: 'Ronald Bluford',
    short: 'Ronald',
    initials: 'RB',
    role: 'Trainer',
    shortRole: 'Trainer',
    where: 'Launch center only',
    radio: false,
    arguesFor: 'Learning the trade-offs before launch',
  },
}

/** The crew with a health face, by id. */
export const CREW: Record<CrewId, CastMember> = {
  commander: CAST.commander,
  safety: CAST.safety,
  science: CAST.science,
}

/** The player's role. The player has no voice: their lines are text only. */
export const PLAYER_ROLE = 'Mission engineer'

/** Crew health is a face colour. A crew member in red must rest. */
export type Health = 'green' | 'yellow' | 'red'

const HEALTH_ORDER: readonly Health[] = ['red', 'yellow', 'green']

/** Moves health by whole steps: +1 is one colour better, -1 one colour worse. */
export function shiftHealth(health: Health, steps: number): Health {
  const index = HEALTH_ORDER.indexOf(health) + Math.trunc(steps)
  const clamped = Math.max(0, Math.min(HEALTH_ORDER.length - 1, index))
  return HEALTH_ORDER[clamped] ?? health
}

// ---------- Radiation dose ----------

/**
 * One running total for the whole crew, in dose points (1 point = 3.125 mSv,
 * src/data/science.ts). It only ever goes up.
 */
export type DoseLevel = 'low' | 'moderate' | 'high'

/**
 * The three dose levels, as on Artemis II, where a lower radiation threshold
 * means closer watching and a higher one means shelter [artemis-sun]:
 * - high, 80 points = 250 mSv, NASA's limit for one solar particle event
 *   [rad-brief]: the mission ends early;
 * - moderate, half of that (125 mSv), a game choice for the lower threshold:
 *   the crew feels unwell once, and the riskiest options are refused.
 */
export const DOSE_THRESHOLDS = {
  moderate: DOSE_POINTS_HIGH / 2,
  high: DOSE_POINTS_HIGH,
} as const

export function doseLevel(dose: number): DoseLevel {
  if (dose >= DOSE_THRESHOLDS.high) return 'high'
  if (dose >= DOSE_THRESHOLDS.moderate) return 'moderate'
  return 'low'
}

/** Options adding at least this many dose points are refused at the moderate level. */
export const MODERATE_DOSE_REFUSES = 20

/** What reaching the moderate level says, once per run. */
export const MODERATE_DOSE_NOTE = 'Your crew’s radiation dose reached the moderate level, so everyone feels unwell.'

/**
 * Reaching the moderate dose level for the first time makes every crew
 * member one step less well. Returns the state unchanged otherwise.
 */
export function applyDoseLevel(before: MissionState, after: MissionState): { state: MissionState; crossed: boolean } {
  if (doseLevel(before.dose) !== 'low' || doseLevel(after.dose) === 'low') return { state: after, crossed: false }
  const crewHealth = { ...after.crewHealth }
  for (const id of CREW_IDS) crewHealth[id] = shiftHealth(crewHealth[id], -1)
  return { state: { ...after, crewHealth }, crossed: true }
}

// ---------- Remembered choices ----------

/**
 * Yes/no facts the game remembers so a crew member can point back to them
 * later ("we left the spare parts behind").
 */
export type ChoiceFlag =
  | 'packedNoSpares'
  | 'packedNoShielding'
  | 'choseSolarOnly'
  | 'workedThroughTransitStorm'
  | 'skippedPlanting'
  | 'lostRover'
  | 'choseReactor'
  | 'choseFuelCell'
  | 'packedFewSupplies'
  | 'antennaUnpowered'
  | 'greenhouseUnpowered'
  | 'workedThroughStorm'
  | 'landedSlope'
  | 'pushedOnTired'
  | 'panelCracked'
  | 'iceBriefed'
  | 'iceExtracted'
  | 'iceTrial'
  | 'rationingWater'

export const CHOICE_FLAGS: readonly ChoiceFlag[] = [
  'packedNoSpares',
  'packedNoShielding',
  'choseSolarOnly',
  'workedThroughTransitStorm',
  'skippedPlanting',
  'lostRover',
  'choseReactor',
  'choseFuelCell',
  'packedFewSupplies',
  'antennaUnpowered',
  'greenhouseUnpowered',
  'workedThroughStorm',
  'landedSlope',
  'pushedOnTired',
  'panelCracked',
  'iceBriefed',
  'iceExtracted',
  'iceTrial',
  'rationingWater',
]

export type RememberedChoices = Partial<Record<ChoiceFlag, boolean>>

// ---------- Effects ----------

/**
 * What one outcome does to the mission. Every field is optional and is a
 * change, not a new value. Dose changes below zero are ignored.
 */
export interface Effects {
  power?: number
  lifeSupport?: number
  shielding?: number
  /** Change to the "days of food" counter. */
  foodDays?: number
  /** Added radiation dose in game units. */
  dose?: number
  /** Change to the spare parts count (repairs in 3 and 11 use one). */
  spares?: number
  /**
   * Change to the mass blocks left for cargo (challenge 2). A heavier power
   * source in challenge 1 leaves fewer.
   */
  cargoBlocks?: number
  /** Food planted in the greenhouse (challenge 7), harvested in the lunar night. */
  harvestDays?: number
  /** Health steps applied to every crew member (+1 better, -1 worse). */
  crewHealth?: number
  /** Health steps applied to single crew members, on top of crewHealth. */
  health?: Partial<Record<CrewId, number>>
  /** Choices to remember from now on. */
  remember?: RememberedChoices
}

// ---------- Stats (what a decision can change) ----------

/** Every number a decision can move: the three meters plus the counters. */
export type StatId = MeterId | 'foodDays' | 'dose' | 'crewHealth' | 'spares' | 'cargoBlocks' | 'harvestDays'

export const STAT_IDS: readonly StatId[] = [
  'power',
  'lifeSupport',
  'shielding',
  'foodDays',
  'dose',
  'crewHealth',
  'spares',
  'cargoBlocks',
  'harvestDays',
]

export interface StatInfo {
  label: string
  /** Up is good for every stat but dose. */
  higherIsBetter: boolean
  /** Sizes for the preview arrows: up to [0] is small, up to [1] medium, more is large. */
  steps: readonly [number, number]
}

export const STATS: Record<StatId, StatInfo> = {
  power: { label: 'Power', higherIsBetter: true, steps: [5, 15] },
  lifeSupport: { label: 'Life Support', higherIsBetter: true, steps: [5, 15] },
  shielding: { label: 'Shielding', higherIsBetter: true, steps: [5, 15] },
  foodDays: { label: 'Food', higherIsBetter: true, steps: [1, 3] },
  dose: { label: 'Radiation dose', higherIsBetter: false, steps: [5, 15] },
  crewHealth: { label: 'Crew health', higherIsBetter: true, steps: [1, 3] },
  spares: { label: 'Spare parts', higherIsBetter: true, steps: [1, 3] },
  cargoBlocks: { label: 'Cargo blocks', higherIsBetter: true, steps: [1, 2] },
  harvestDays: { label: 'Harvest later', higherIsBetter: true, steps: [2, 4] },
}

/**
 * How much one set of effects moves a stat, before clamping. Crew health
 * counts health steps over the whole crew.
 */
export function statChange(effects: Effects, stat: StatId): number {
  if (stat === 'crewHealth') {
    const each = (effects.crewHealth ?? 0) * CREW_IDS.length
    const single = CREW_IDS.reduce((sum, id) => sum + (effects.health?.[id] ?? 0), 0)
    return each + single
  }
  return effects[stat] ?? 0
}

/** Adds `times` copies of `extra` to `base` (for a split: per-unit effects times the units). */
export function addEffects(base: Effects, extra: Effects, times = 1): Effects {
  const out: Effects = { ...base }
  for (const key of ['power', 'lifeSupport', 'shielding', 'foodDays', 'dose', 'crewHealth', 'spares', 'cargoBlocks', 'harvestDays'] as const) {
    const value = (base[key] ?? 0) + (extra[key] ?? 0) * times
    if (value !== 0) out[key] = value
    else delete out[key]
  }
  if (extra.health) {
    const health = { ...base.health }
    for (const id of CREW_IDS) {
      const value = (health[id] ?? 0) + (extra.health[id] ?? 0) * times
      if (value !== 0) health[id] = value
    }
    out.health = health
  }
  if (extra.remember && times > 0) out.remember = { ...base.remember, ...extra.remember }
  return out
}

// ---------- Mission state ----------

export type Phase = 'pre-launch' | 'transit' | 'outpost'

export type MissionStatus = 'running' | 'ended'

/** The four endings. None of them is a death screen. */
export type Ending =
  | 'outpost-thrives'
  | 'mission-complete'
  | 'early-return-supplies'
  | 'early-return-health'

export const TOTAL_CHALLENGES = 12

/** One line of the debrief: what the player picked in a challenge. */
export interface DecisionRecord {
  challenge: number
  outcomeId: string
  /** A split's units per bucket id. */
  allocation?: Record<string, number>
  /** The timer ran out and the commander chose. */
  timedOut?: boolean
  /** The exact changes it made, as the result screen showed them ("Power −10"). */
  summary?: string[]
  /** The mission day it was made on. */
  day?: number
  /** A hazard (luck), and for a storm its real flare. */
  hazard?: HazardKind
  flareId?: string
  /** Dose points it added (for the handbook's choices-versus-storms split). */
  doseAdded?: number
}

/**
 * An earlier choice coming back: what it caused, when, and the crew line
 * that named the cause. The debrief links it to the challenge that set it up.
 */
export interface BiteRecord {
  /** Which bite (e.g. "no-shielding-storm"); each fires once per run. */
  id: string
  /** The challenge whose choice caused it. */
  cause: number
  day: number
  /** What it did, in a few words ("Storm dose +12"). */
  text: string
  lineId?: string
}

/** The meters at one moment, for the handbook's charts. */
export interface Snapshot {
  label: string
  /** What made this moment: a decision (its challenge) or a hazard; a night has neither. */
  challenge?: number
  hazard?: HazardKind
  day: number
  power: number
  lifeSupport: number
  shielding: number
  foodDays: number
  dose: number
}

/** One step of a run, in order: what the handbook replays. */
export type Step =
  | { kind: 'decision'; challenge: number; decision: Decision }
  | { kind: 'hazard'; hazard: HazardKind; flareId?: string }
  | { kind: 'night'; lunar: boolean }
  | { kind: 'tow' }

export interface MissionState {
  status: MissionStatus
  /** 1 to 12. */
  currentChallenge: number
  meters: Record<MeterId, number>
  foodDays: number
  crewHealth: Record<CrewId, Health>
  dose: number
  /** Spare parts on board (packed in challenge 2). */
  spares: number
  /** Mass blocks the cargo split in challenge 2 has to hand out. */
  cargoBlocks: number
  /** Days of food growing in the greenhouse, harvested in the lunar night (challenge 7). */
  harvestDays: number
  /** The run's random seed: the same seed gives the same hazards. */
  seed: number
  /** Hazards met so far, by kind (0 to 3 each). */
  hazards: Record<HazardKind, number>
  /** Real DONKI flares this run's storms have been (no repeats). */
  usedFlares: string[]
  /** The flare the storm happening now is. */
  activeFlareId: string | null
  /** Every step in order (decisions, hazards, nights), so the handbook can replay the run. */
  timeline: Step[]
  /** Seconds played on the spacecraft and at the outpost, set at the ending (for the handbook's luck report). */
  played?: { spacecraft: number; outpost: number }
  remembered: RememberedChoices
  /** Every choice in order, for the debrief chain. */
  history: DecisionRecord[]
  ending: Ending | null
  /** Mission day at the outpost: one passes after each outpost challenge. */
  day: number
  /** Challenge 6's power split (units per bucket id); it runs every night until the end. */
  powerSplit: Record<string, number> | null
  /** Earlier choices that came back, in order. */
  bites: BiteRecord[]
  /** The meters after each decision and each night. */
  log: Snapshot[]
}

/** The meters now, as a snapshot for the debrief chart. */
export function snapshot(state: MissionState, label: string, marker: { challenge?: number; hazard?: HazardKind } = {}): Snapshot {
  return {
    label,
    ...marker,
    day: state.day,
    power: state.meters.power,
    lifeSupport: state.meters.lifeSupport,
    shielding: state.meters.shielding,
    foodDays: state.foodDays,
    dose: state.dose,
  }
}

/**
 * TODO: source. Starting values are placeholders for the build, not NASA
 * figures. The power source (challenge 1) and cargo (challenge 2) will set
 * the real starting point.
 */
export function createInitialMission(seed: number = newSeed()): MissionState {
  const state: MissionState = {
    status: 'running',
    currentChallenge: 1,
    meters: { power: 70, lifeSupport: 70, shielding: 30 },
    foodDays: 10,
    crewHealth: {
      commander: 'green',
      safety: 'green',
      science: 'green',
    },
    dose: 0,
    spares: 0,
    // TODO: source. Placeholder: ten blocks, as the brief's cargo challenge.
    cargoBlocks: 10,
    harvestDays: 0,
    seed,
    hazards: { transitStorm: 0, outpostStorm: 0, meteoroid: 0 },
    usedFlares: [],
    activeFlareId: null,
    timeline: [],
    remembered: {},
    history: [],
    ending: null,
    day: 1,
    powerSplit: null,
    bites: [],
    log: [],
  }
  state.log = [snapshot(state, 'Start')]
  return state
}

// ---------- Rules ----------

function clampMeter(value: number): number {
  return Math.max(METER_MIN, Math.min(METER_MAX, value))
}

/** Returns a new state with the effects applied. Never mutates the input. */
export function applyEffects(state: MissionState, effects: Effects): MissionState {
  const meters = { ...state.meters }
  for (const id of METER_IDS) {
    meters[id] = clampMeter(meters[id] + (effects[id] ?? 0))
  }

  const crewHealth = { ...state.crewHealth }
  for (const id of CREW_IDS) {
    const steps = (effects.crewHealth ?? 0) + (effects.health?.[id] ?? 0)
    if (steps !== 0) crewHealth[id] = shiftHealth(crewHealth[id], steps)
  }

  return {
    ...state,
    meters,
    crewHealth,
    foodDays: Math.max(0, state.foodDays + (effects.foodDays ?? 0)),
    dose: state.dose + Math.max(0, effects.dose ?? 0),
    spares: Math.max(0, state.spares + (effects.spares ?? 0)),
    cargoBlocks: Math.max(0, state.cargoBlocks + (effects.cargoBlocks ?? 0)),
    harvestDays: Math.max(0, state.harvestDays + (effects.harvestDays ?? 0)),
    remembered: { ...state.remembered, ...effects.remember },
  }
}

/** Records a decision for the debrief. */
export function recordDecision(state: MissionState, record: DecisionRecord): MissionState {
  return { ...state, history: [...state.history, record] }
}

/** True once a challenge has been decided on this run. Each one can be done once. */
export function isDone(state: MissionState, challenge: number): boolean {
  return state.history.some((record) => record.challenge === challenge)
}

/** A crew member in red health must rest, and the player loses their help. */
export function isResting(state: MissionState, crew: CrewId): boolean {
  return state.crewHealth[crew] === 'red'
}

/** The crew resting now, in order. */
export function restingCrew(state: MissionState): CrewId[] {
  return CREW_IDS.filter((id) => isResting(state, id))
}

/**
 * Picks the ending from the state at the end of the run.
 * TODO: source. The cut-offs are placeholders until the thresholds are sized.
 */
export function resolveEnding(state: MissionState): Ending {
  const healths = CREW_IDS.map((id) => state.crewHealth[id])
  if (doseLevel(state.dose) === 'high' || healths.includes('red')) {
    return 'early-return-health'
  }

  const meterValues = METER_IDS.map((id) => state.meters[id])
  if (meterValues.some((value) => value <= METER_CRITICAL) || state.foodDays <= 0) {
    return 'early-return-supplies'
  }

  const allGreen = healths.every((health) => health === 'green')
  const metersHealthy = meterValues.every((value) => value >= 60)
  if (allGreen && metersHealthy && doseLevel(state.dose) === 'low') {
    return 'outpost-thrives'
  }
  return 'mission-complete'
}

/**
 * Mid-run failure: Life Support or food at zero, or the dose at the high
 * level, ends the mission at once (no death screen: the crew goes home).
 */
export function checkFailure(state: MissionState): MissionState {
  if (state.status === 'ended') return state
  if (doseLevel(state.dose) === 'high') return { ...state, status: 'ended', ending: 'early-return-health' }
  if (state.meters.lifeSupport <= 0 || state.foodDays <= 0) {
    return { ...state, status: 'ended', ending: 'early-return-supplies' }
  }
  return state
}

/** Ends the run now and picks the ending from the final state. */
export function endMission(state: MissionState): MissionState {
  if (state.status === 'ended') return state
  return { ...state, status: 'ended', ending: resolveEnding(state) }
}

/**
 * After a decision: the current challenge becomes the lowest one not done
 * yet (the player may take them in any order on a map). A high dose ends
 * the mission early; the ending itself comes after the lunar night.
 */
export function advanceChallenge(state: MissionState): MissionState {
  if (state.status === 'ended') return state

  const failed = checkFailure(state)
  if (failed.status === 'ended') return failed
  let next = 1
  while (next <= TOTAL_CHALLENGES && isDone(state, next)) next++
  // All twelve done: the run ends after the lunar night that follows the last one
  // (src/scene/run.ts), so the night's harvest and costs still count.
  if (next > TOTAL_CHALLENGES) return { ...state, currentChallenge: TOTAL_CHALLENGES }
  return { ...state, currentChallenge: next }
}
