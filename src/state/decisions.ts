/**
 * The rules of a decision, as pure functions: what an option or a split
 * does, whether an option is locked, what the preview arrows show, and
 * what committing changes. Nothing here knows about React or the store,
 * so tools/checks/decisions.mts can test every rule on its own.
 */
import type {
  Bite,
  Challenge,
  ChallengeOption,
  ChoiceChallenge,
  Condition,
  CrewLine,
  Requirement,
  SplitChallenge,
} from '../data/challenges'
import { CHALLENGES } from '../data/challenges'
import { getStormEvent, stormSeverity } from '../data/donki'
import { doseToMsv, formatMsv, REAL } from '../data/science'
import {
  addEffects,
  advanceChallenge,
  applyDoseLevel,
  applyEffects,
  CAST,
  CREW,
  CREW_IDS,
  doseLevel,
  isResting,
  MODERATE_DOSE_NOTE,
  MODERATE_DOSE_REFUSES,
  restingCrew,
  isDone,
  recordDecision,
  snapshot,
  statChange,
  STAT_IDS,
  STATS,
  type BiteRecord,
  type Effects,
  type Health,
  type MissionState,
  type StatId,
} from './mission'

// ---------- Reading the mission ----------

/** A stat's current value in the mission (crew health: health steps above all-red). */
export function statValue(state: MissionState, stat: StatId): number {
  switch (stat) {
    case 'power':
    case 'lifeSupport':
    case 'shielding':
      return state.meters[stat]
    case 'crewHealth':
      return CREW_IDS.reduce((sum, id) => sum + ['red', 'yellow', 'green'].indexOf(state.crewHealth[id]), 0)
    default:
      return state[stat]
  }
}

/** True when the mission meets the condition (an empty condition always holds). */
export function meetsCondition(condition: Condition, state: MissionState): boolean {
  if (condition.flags?.some((flag) => !state.remembered[flag])) return false
  if (condition.withoutFlags?.some((flag) => state.remembered[flag])) return false
  for (const stat of STAT_IDS) {
    const min = condition.min?.[stat]
    if (min !== undefined && statValue(state, stat) < min) return false
    const max = condition.max?.[stat]
    if (max !== undefined && statValue(state, stat) > max) return false
  }
  return true
}

/** True when the mission meets the requirement. */
export function meetsRequirement(requirement: Requirement, state: MissionState): boolean {
  return meetsCondition(requirement, state)
}

/** Said on an option refused because the crew's dose is already moderate. */
const DOSE_LOCK: Requirement = {
  reason: 'Your crew’s radiation dose is too high for this',
  line: { speakerId: 'safety', lineId: 'dose-lock', text: 'No. Our dose is already at the moderate level. We can’t take that much more.' },
}

/**
 * The requirement an option fails right now, or null when it can be picked.
 * At the moderate dose level, options that add a lot of dose are refused.
 * A ruled-out option (the wrong landing sites) is always refused.
 */
export function lockOf(option: ChallengeOption, state: MissionState): Requirement | null {
  if (option.ruledOut) return option.ruledOut
  if (option.requires && !meetsRequirement(option.requires, state)) return option.requires
  if (doseLevel(state.dose) !== 'low' && (option.effects.dose ?? 0) >= MODERATE_DOSE_REFUSES) return DOSE_LOCK
  return null
}

// ---------- Gates ----------

/**
 * The challenge that must be done before this one can open, or null. A
 * `last` challenge (the lunar night) waits for every other ready challenge
 * of its phase.
 */
export function blockedBy(challenge: Challenge, state: MissionState): Challenge | null {
  // Not open yet (the broken panel before the meteoroid): it blocks itself.
  if (challenge.opensWhen && !meetsCondition(challenge.opensWhen, state)) return challenge
  if (!challenge.last) return null
  return (
    CHALLENGES.find(
      (other) => other.ready && !other.hazard && other.phase === challenge.phase && other.id !== challenge.id && !isDone(state, other.id),
    ) ?? null
  )
}

/** The real archived flare the storm happening now is (each storm draws its own, src/state/hazards.ts). */
export function stormEventOf(challenge: Challenge, state: MissionState) {
  void challenge
  return getStormEvent(state.activeFlareId ?? '')
}

/** Ready challenges on a map not done yet (boarding the rocket waits for them). */
export function unfinishedOn(map: string, state: MissionState): Challenge[] {
  return CHALLENGES.filter((challenge) => challenge.ready && !challenge.hazard && challenge.map === map && !isDone(state, challenge.id))
}

// ---------- Earlier choices coming back ----------

/** True when this speaker can't talk now: a crew member resting in red health. */
function silenced(line: CrewLine, state: MissionState): boolean {
  const id = line.speakerId
  return (id === 'commander' || id === 'safety' || id === 'science') && isResting(state, id)
}

/**
 * The lines shown on the panel: extra ones whose condition holds (Houston's
 * warning) first, then the main two. A crew member resting in red health
 * says nothing, so the player loses their side of the argument.
 */
export function panelLines(challenge: Challenge, state: MissionState): CrewLine[] {
  const extra = (challenge.extraLines ?? []).filter((item) => meetsCondition(item.when, state)).map((item) => item.line)
  // A hazard that comes again gets fresh words (its 2nd and 3rd time have their own lines).
  const times = challenge.hazard ? state.hazards[challenge.hazard.kind] : 0
  const main = times >= 2 ? (challenge.hazard?.repeatLines?.[times - 2] ?? challenge.lines) : challenge.lines
  return [...extra, ...main].filter((line) => !silenced(line, state))
}

/** What the player loses while each crew member rests, in full. */
const RESTING_LOSS: Record<string, string> = {
  commander: 'No advice from the commander.',
  safety: 'Without the medic, you can’t see the radiation and health risks (?).',
  science: 'The greenhouse grows only half as much food.',
}

/** One note per crew member resting now: who, and what the player loses. */
export function restingNotes(state: MissionState): string[] {
  return restingCrew(state).map((id) => `${CAST[id].name} is resting (red health). ${RESTING_LOSS[id]}`)
}

/** The panel notes whose condition holds, then who is resting. */
export function panelNotes(challenge: Challenge, state: MissionState): string[] {
  const notes = (challenge.notes ?? []).filter((item) => meetsCondition(item.when, state)).map((item) => item.text)
  return [...notes, ...restingNotes(state)]
}

/** The bites that apply to this option now (the challenge's own, then the option's). */
export function activeBites(challenge: Challenge, option: ChallengeOption | null, state: MissionState): Bite[] {
  return [...(challenge.bites ?? []), ...(option?.bites ?? [])].filter((bite) => meetsCondition(bite.when, state))
}

/**
 * How much of a storm's radiation gets through. Shielding cuts solar-storm
 * dose by about half [rad-brief], so a full Shielding meter lets half
 * through and an empty one all of it, in a straight line between.
 */
export function shieldingFactor(shielding: number): number {
  const fill = Math.max(0, Math.min(100, shielding)) / 100
  return 1 - REAL.shieldingCut * fill
}

/** One sentence on how the Shielding changed the storm's dose. */
export function shieldingNote(shielding: number): string {
  if (shielding >= 60) return 'Your thick Shielding blocked much of the radiation.'
  if (shielding >= 35) return 'Your Shielding blocked some of the radiation.'
  return 'Your Shielding was thin, so more radiation got through.'
}

export interface Effective {
  effects: Effects
  bites: Bite[]
}

/**
 * What an option really does now: its own effects, plus its bites, with a
 * storm's dose scaled by the run's real DONKI event and the Shielding. The
 * preview arrows and the commit both use this.
 */
export function effectiveEffects(challenge: Challenge, option: ChallengeOption, state: MissionState): Effective {
  const bites = activeBites(challenge, option, state)
  let effects: Effects = { ...option.effects }
  let factor = 1
  for (const bite of bites) {
    if (bite.effects) effects = addEffects(effects, bite.effects)
    if (bite.doseFactor) factor *= bite.doseFactor
  }
  if (challenge.storm) {
    factor *= stormSeverity(stormEventOf(challenge, state)).factor * shieldingFactor(state.meters.shielding)
  }
  if (effects.dose && factor !== 1) effects = { ...effects, dose: Math.round(effects.dose * factor) }
  return { effects, bites }
}

// ---------- Splits ----------

/** Units the player must place: the challenge's own count, or the cargo blocks left after challenge 1. */
export function splitTotal(challenge: SplitChallenge, state: MissionState): number {
  const total = challenge.unitsFrom === 'cargoBlocks' ? state.cargoBlocks : challenge.units
  const least = challenge.buckets.reduce((sum, bucket) => sum + bucket.min, 0)
  const most = challenge.buckets.reduce((sum, bucket) => sum + bucket.max, 0)
  return Math.max(least, Math.min(most, total))
}

/** Where a split starts: every bucket at its minimum. */
export function startAllocation(challenge: SplitChallenge): number[] {
  return challenge.buckets.map((bucket) => bucket.min)
}

export function placed(allocation: readonly number[]): number {
  return allocation.reduce((sum, units) => sum + units, 0)
}

/** Moves one bucket by `steps` presses, within its limits and the total. Returns a new allocation. */
export function changeBucket(
  challenge: SplitChallenge,
  allocation: readonly number[],
  index: number,
  steps: number,
  total: number,
): number[] {
  const bucket = challenge.buckets[index]
  const next = [...allocation]
  if (!bucket) return next
  const current = next[index] ?? 0
  const room = total - placed(allocation) + current
  next[index] = Math.max(bucket.min, Math.min(bucket.max, room, current + steps * bucket.unitSize))
  return next
}

/** True when every unit is placed and every bucket is within its limits. */
export function splitComplete(challenge: SplitChallenge, allocation: readonly number[], total: number): boolean {
  return (
    placed(allocation) === total &&
    challenge.buckets.every((bucket, i) => (allocation[i] ?? 0) >= bucket.min && (allocation[i] ?? 0) <= bucket.max)
  )
}

/** What a split allocation does, including the flags for empty buckets. */
export function splitEffects(challenge: SplitChallenge, allocation: readonly number[]): Effects {
  let effects: Effects = {}
  challenge.buckets.forEach((bucket, i) => {
    const units = allocation[i] ?? 0
    effects = addEffects(effects, bucket.effectsPerUnit, units)
    if (units === 0 && bucket.ifEmpty) {
      effects = { ...effects, remember: { ...effects.remember, [bucket.ifEmpty.remember]: true } }
    }
    if (bucket.ifFew && units <= bucket.ifFew.atMost) {
      effects = { ...effects, remember: { ...effects.remember, [bucket.ifFew.remember]: true } }
    }
  })
  return effects
}

// ---------- Preview arrows ----------

export type ArrowTone = 'good' | 'warn' | 'bad'

export interface Arrow {
  /** Hidden: the medic is resting, so the player can't see this risk ("?"). */
  hidden?: boolean
  stat: StatId
  label: string
  direction: 'up' | 'down'
  /** 1 small, 2 medium, 3 large. */
  size: 1 | 2 | 3
  tone: ArrowTone
}

/**
 * One arrow per stat the effects change: up or down, one to three for size,
 * green when it helps, orange when it hurts a little, red when it hurts a
 * lot. No numbers: the player sees those only after committing.
 */
export function previewArrows(effects: Effects): Arrow[] {
  const arrows: Arrow[] = []
  for (const stat of STAT_IDS) {
    const change = statChange(effects, stat)
    if (change === 0) continue
    const info = STATS[stat]
    const amount = Math.abs(change)
    const size = amount <= info.steps[0] ? 1 : amount <= info.steps[1] ? 2 : 3
    const good = change > 0 === info.higherIsBetter
    arrows.push({
      stat,
      label: info.label,
      direction: change > 0 ? 'up' : 'down',
      size,
      tone: good ? 'good' : size === 3 ? 'bad' : 'warn',
    })
  }
  return arrows
}

/** Stats only the safety and medical officer can judge; hidden while they rest. */
const MEDIC_STATS: readonly StatId[] = ['dose', 'crewHealth']

/**
 * The arrows the player sees now: with the safety officer resting in red
 * health, the dose and crew-health arrows become "?".
 */
export function visibleArrows(effects: Effects, state: MissionState): Arrow[] {
  const arrows = previewArrows(effects)
  if (!isResting(state, 'safety')) return arrows
  return arrows.map((arrow) => (MEDIC_STATS.includes(arrow.stat) ? { ...arrow, hidden: true } : arrow))
}

/** Where each meter would end up (clamped), for the HUD's ghost bars. */
export function ghostMeters(state: MissionState, effects: Effects): MissionState['meters'] {
  return applyEffects(state, effects).meters
}

// ---------- The "no free choice" rule ----------

/** True when `a` is at least as good as `b` on every stat. */
function atLeastAsGood(a: Effects, b: Effects): boolean {
  return STAT_IDS.every((stat) => {
    const diff = statChange(a, stat) - statChange(b, stat)
    return STATS[stat].higherIsBetter ? diff >= 0 : diff <= 0
  })
}

/**
 * The brief's main design rule: every choice costs something. Returns the
 * options that are at least as good as every other option on every stat
 * (there must be none).
 */
export function freeChoices(challenge: ChoiceChallenge): string[] {
  return challenge.options
    .filter((option) => challenge.options.every((other) => other === option || atLeastAsGood(option.effects, other.effects)))
    .map((option) => option.id)
}

// ---------- Committing ----------

/** What the player decided: one option, or a split. */
export type Decision =
  | { kind: 'option'; optionId: string; timedOut?: boolean }
  | { kind: 'split'; allocation: readonly number[] }

/** One line of the result screen: "Power −18", or a crew member's new health. */
export interface Change {
  stat: StatId | `health:${string}`
  label: string
  /** The exact change (after clamping), or for health the new word. */
  amount: number | string
  tone: ArrowTone
}

export interface Outcome {
  challenge: number
  outcomeId: string
  timedOut: boolean
  /** What happened and why. */
  result: string[]
  /** Crew lines naming an earlier choice that came back (shown on the result screen). */
  lines: CrewLine[]
  sourceIds: string[]
  changes: Change[]
  before: MissionState
  after: MissionState
}

const HEALTH_WORDS: Record<Health, string> = { green: 'Good', yellow: 'Tired', red: 'Must rest' }

/** The exact changes between two mission states, for the result screen. */
export function changesBetween(before: MissionState, after: MissionState): Change[] {
  const changes: Change[] = []
  for (const stat of STAT_IDS) {
    if (stat === 'crewHealth') continue
    const amount = statValue(after, stat) - statValue(before, stat)
    if (amount === 0) continue
    const good = amount > 0 === STATS[stat].higherIsBetter
    changes.push({ stat, label: STATS[stat].label, amount, tone: good ? 'good' : 'warn' })
  }
  for (const id of CREW_IDS) {
    const from = before.crewHealth[id]
    const to = after.crewHealth[id]
    if (from === to) continue
    const better = ['red', 'yellow', 'green'].indexOf(to) > ['red', 'yellow', 'green'].indexOf(from)
    changes.push({
      stat: `health:${id}`,
      label: CREW[id].name,
      amount: HEALTH_WORDS[to],
      tone: better ? 'good' : to === 'red' ? 'bad' : 'warn',
    })
  }
  return changes
}

const UNITS: Partial<Record<string, string>> = { foodDays: ' days' }

/** "Power −10", "Food +3 days", "Radiation dose +16 mSv", "Kalpana Ride: Tired". */
export function formatChange(change: Change): string {
  if (typeof change.amount === 'string') return `${change.label}: ${change.amount}`
  const sign = change.amount > 0 ? '+' : '−'
  if (change.stat === 'dose') return `${change.label} ${sign}${formatMsv(doseToMsv(Math.abs(change.amount)))}`
  return `${change.label} ${sign}${Math.abs(change.amount)}${UNITS[change.stat] ?? ''}`
}

/** Why a decision can't be committed, or null when it can. */
export function refusal(challenge: Challenge, state: MissionState, decision: Decision): string | null {
  if (state.status === 'ended') return 'The mission is over'
  // Hazards can happen again (up to 3 of each); planned tasks are done once.
  if (!challenge.hazard && isDone(state, challenge.id)) return 'Already done on this run'
  const before = blockedBy(challenge, state)
  if (before) return `Finish ${before.title} first`
  if (challenge.kind === 'choice') {
    if (decision.kind !== 'option') return 'This challenge needs one option'
    const option = challenge.options.find((candidate) => candidate.id === decision.optionId)
    if (!option) return 'No such option'
    const lock = lockOf(option, state)
    // The timer's own option always happens, even if it would be locked.
    if (lock && !decision.timedOut) return lock.reason
    return null
  }
  if (decision.kind !== 'split') return 'This challenge needs a split'
  if (!splitComplete(challenge, decision.allocation, splitTotal(challenge, state))) return 'Place every block first'
  return null
}

/**
 * Commits a decision: applies its effects exactly once, records it for the
 * debrief and moves the mission on. Returns null when it can't be committed
 * (done already, locked, or an unfinished split).
 */
export function commit(challenge: Challenge, state: MissionState, decision: Decision): Outcome | null {
  if (refusal(challenge, state, decision) !== null) return null

  let effects: Effects
  let outcomeId: string
  let result: string[]
  let sourceIds: string[]
  let allocation: Record<string, number> | undefined
  let bites: Bite[] = []
  const timedOut = decision.kind === 'option' && decision.timedOut === true

  if (challenge.kind === 'choice' && decision.kind === 'option') {
    const option = challenge.options.find((candidate) => candidate.id === decision.optionId)!
    const effective = effectiveEffects(challenge, option, state)
    effects = effective.effects
    bites = effective.bites
    outcomeId = option.id
    result = [option.result]
    if (timedOut) result.unshift('You ran out of time, so the commander decided.')
    sourceIds = [...option.sourceIds]
  } else if (challenge.kind === 'split' && decision.kind === 'split') {
    effects = splitEffects(challenge, decision.allocation)
    outcomeId = `c${String(challenge.id).padStart(2, '0')}-split`
    result = [challenge.result]
    allocation = {}
    sourceIds = []
    challenge.buckets.forEach((bucket, i) => {
      const units = decision.allocation[i] ?? 0
      allocation![bucket.id] = units
      if (units > 0) sourceIds.push(...bucket.sourceIds)
      if (units === 0 && bucket.ifEmpty) result.push(bucket.ifEmpty.result)
    })
  } else {
    return null
  }

  for (const bite of bites) result.push(bite.note)
  if (challenge.storm) result.push(shieldingNote(state.meters.shielding))
  if (challenge.teaching) result.push(challenge.teaching)

  let after = applyEffects(state, effects)
  const level = applyDoseLevel(state, after)
  after = level.state
  const doseLines: CrewLine[] = []
  if (level.crossed) {
    result.push(MODERATE_DOSE_NOTE)
    if (!isResting(after, 'safety')) doseLines.push(MODERATE_DOSE_LINE)
  }
  const changes = changesBetween(state, after)
  after = recordDecision(after, {
    challenge: challenge.id,
    outcomeId,
    allocation,
    timedOut: timedOut || undefined,
    summary: changes.map(formatChange),
    day: state.day,
    hazard: challenge.hazard?.kind,
    flareId: challenge.storm ? (state.activeFlareId ?? undefined) : undefined,
    doseAdded: Math.max(0, after.dose - state.dose),
  })
  after = { ...after, timeline: [...after.timeline, { kind: 'decision', challenge: challenge.id, decision }] }
  if (challenge.kind === 'split' && challenge.keepsRunning && allocation) after = { ...after, powerSplit: allocation }
  after = { ...after, bites: [...after.bites, ...bites.filter((bite) => !after.bites.some((r) => r.id === bite.id)).map((bite) => biteRecord(bite, state, effects))] }
  if (level.crossed) after = { ...after, bites: [...after.bites, moderateDoseRecord(challenge.id, state.day)] }
  after = advanceChallenge(after)
  after = { ...after, log: [...after.log, snapshot(after, challenge.title, { challenge: challenge.id, hazard: challenge.hazard?.kind })] }
  return {
    challenge: challenge.id,
    outcomeId,
    timedOut,
    result,
    lines: [...bites.flatMap((bite) => (bite.line ? [bite.line] : [])), ...doseLines],
    sourceIds,
    changes,
    before: state,
    after,
  }
}

/** The medic's line when the dose reaches the moderate level. */
export const MODERATE_DOSE_LINE: CrewLine = {
  speakerId: 'safety',
  lineId: 'dose-moderate',
  text: 'Radiation dose means how much radiation our bodies have soaked up. Ours is getting high. No more risks.',
}

/** The debrief record for reaching the moderate dose level (once per run). */
export function moderateDoseRecord(cause: number, day: number): BiteRecord {
  return { id: 'dose-moderate', cause, day, text: 'Dose reached the moderate level: everyone felt unwell', lineId: MODERATE_DOSE_LINE.lineId }
}

/** What a bite did, in a few words for the debrief ("Storm dose +12", "Power −20"). */
function biteRecord(bite: Bite, state: MissionState, effects: Effects): BiteRecord {
  let text = bite.note
  if (bite.doseFactor && effects.dose) {
    const extra = effects.dose - effects.dose / bite.doseFactor
    text = `Storm dose +${formatMsv(doseToMsv(extra))}`
  } else if (bite.effects) {
    const parts = STAT_IDS.flatMap((stat) => {
      const change = statChange(bite.effects!, stat)
      return change ? [formatChange({ stat, label: STATS[stat].label, amount: change, tone: 'warn' })] : []
    })
    if (parts.length) text = parts.join(', ')
  }
  return { id: bite.id, cause: bite.cause, day: state.day, text, lineId: bite.line?.lineId }
}
