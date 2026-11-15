/**
 * What the Mission Handbook says, worked out honestly from the run:
 *
 * - the main cause of the ending (always matching the ending type) and one
 *   tip that targets that cause;
 * - "better choices": each decision replayed with every alternative, with
 *   the same seed and the same hazards (src/state/replay.ts); a change is
 *   suggested only when the replay really ends better, and good calls are
 *   praised;
 * - skill versus luck: hazards faced against a mission of that length, the
 *   dose from choices against the dose from storms, a replay without the
 *   hazards and a replay with one more storm and meteoroid, and a verdict;
 * - plain-language captions for the big rises and drops on the charts;
 * - the real-life facts behind every challenge and hazard met.
 */
import { CHALLENGES, getChallenge, type Challenge } from '../data/challenges'
import { describeStorm, DONKI, getStormEvent, stormSeverity } from '../data/donki'
import { ENDINGS } from '../data/endings'
import { doseToMsv, formatMsv, REAL, REAL_HOURS_PER_GAME_MINUTE } from '../data/science'
import { getReference, referencesFor, type Reference } from '../data/sources'
import { linkedStudies, type LinkedStudy, type OsdrTopic } from '../data/osdr'
import type { Decision } from './decisions'
import { expectedHazards, HAZARD_KINDS, HAZARD_LABEL, type HazardKind } from './hazards'
import { CAST, CREW_IDS, doseLevel, DOSE_THRESHOLDS, METER_CRITICAL, type MissionState, type Step } from './mission'
import { endingRank, outcomeScore, replay } from './replay'

// ---------- The main cause and the tip ----------

export type Cause = 'radiation' | 'worn-out' | 'food' | 'air' | 'power' | 'shielding' | 'success'

export interface CauseText {
  cause: Cause
  /** One sentence for ages 7 to 12. */
  text: string
}

/** Why the mission ended the way it did. It always matches the ending type. */
export function mainCause(mission: MissionState): CauseText {
  switch (mission.ending) {
    case 'early-return-health':
      if (doseLevel(mission.dose) === 'high') {
        return { cause: 'radiation', text: `Your crew got ${formatMsv(doseToMsv(mission.dose))} of radiation. NASA’s limit is ${REAL.solarEventLimitMsv} mSv. So they had to come home.` }
      }
      return { cause: 'worn-out', text: `A crew member got too ill to keep working. So ${CAST.safety.short}, the safety officer, sent everyone home.` }
    case 'early-return-supplies':
      if (mission.foodDays <= 0) return { cause: 'food', text: 'The food ran out. So the crew had to come home.' }
      if (mission.meters.lifeSupport <= METER_CRITICAL) return { cause: 'air', text: `Life Support fell to ${Math.round(mission.meters.lifeSupport)}. There was not enough air and water to stay.` }
      if (mission.meters.power <= METER_CRITICAL) return { cause: 'power', text: `Power fell to ${Math.round(mission.meters.power)}. That was too low to run the base.` }
      return { cause: 'shielding', text: `Shielding fell to ${Math.round(mission.meters.shielding)}. The walls were too thin to stay safe.` }
    default:
      return {
        cause: 'success',
        text: mission.ending === 'outpost-thrives' ? 'Every meter stayed healthy. Your whole crew stayed well.' : 'Nothing broke for good. Your crew flew home on time.',
      }
  }
}

const has = (mission: MissionState, bite: string) => mission.bites.some((b) => b.id === bite)
const chose = (mission: MissionState, outcomeId: string) => mission.history.some((r) => r.outcomeId === outcomeId)

/** One "next time" tip that targets the real cause of the ending. */
export function nextTip(mission: MissionState): string {
  const { cause } = mainCause(mission)
  switch (cause) {
    case 'radiation':
      if (mission.remembered.packedNoShielding) return 'Pack shielding next time. Without it, every storm hits harder.'
      if (chose(mission, 'c10-c') || chose(mission, 'c04-c')) return 'When a storm comes, shelter everyone. Radiation adds up, storm after storm.'
      if (mission.remembered.antennaUnpowered) return 'Give the antenna power. Then Houston can warn you sooner.'
      return 'Shelter everyone in storms. Power the drill to thicken the roof.'
    case 'worn-out':
      if (mission.remembered.pushedOnTired) return 'When the crew is tired, give them a full day of rest.'
      if (has(mission, 'dose-moderate')) return 'Shelter sooner in storms. Too much radiation made everyone unwell.'
      if (mission.meters.lifeSupport < 30) return 'Give Life Support two power units. Stale air tires the crew.'
      return 'Watch the crew’s faces. Rest them before anyone turns red.'
    case 'food':
      if (mission.remembered.greenhouseUnpowered) return 'Give the greenhouse power. It grows food every day.'
      if (mission.remembered.skippedPlanting) return 'Plant the greenhouse. The harvest feeds the crew in the long night.'
      if (mission.remembered.packedFewSupplies) return 'Pack more supplies. The food ran out.'
      return 'Plant more and pack more supplies. Then the food lasts.'
    case 'air':
      if ((mission.powerSplit?.['c06-life-support'] ?? 0) < 2) return 'Give Life Support two power units. With less, it runs down daily.'
      if (mission.remembered.rationingWater) return 'Bring back the ice. Rationing water drained Life Support every night.'
      return 'Dig the ice at the crater. Its water tops up Life Support.'
    case 'power':
      if (mission.remembered.choseSolarOnly) return 'Try a fuel cell or a reactor. Solar panels stop in the dark.'
      if (mission.hazards.meteoroid > 0 && mission.spares === 0) return 'Pack more spare parts. Each meteoroid hit needs its own fix.'
      return 'Switch on less, or pick power that works at night.'
    case 'shielding':
      return 'Pack shielding and power the drill. Moon soil on the roof blocks radiation.'
    default:
      if (mission.ending === 'mission-complete') {
        if (CREW_IDS.some((id) => mission.crewHealth[id] !== 'green')) return 'To make the outpost thrive, keep the whole crew well. Rest them, and shelter in storms.'
        const low = (['power', 'lifeSupport', 'shielding'] as const).find((m) => mission.meters[m] < 60)
        if (low) return `To make the outpost thrive, keep ${low === 'lifeSupport' ? 'Life Support' : low === 'power' ? 'Power' : 'Shielding'} higher. It ended below 60.`
      }
      return 'Next time, try a new power source.'
  }
}

// ---------- Better choices (honest replays) ----------

export interface ChoiceReview {
  /** Timeline index of the decision. */
  index: number
  challenge: Challenge
  chosen: string
  /** Set when a replay with another choice really ends better. */
  better?: { label: string; text: string }
  /** Set when every alternative would have ended worse. */
  praise?: string
  /** The replays behind `better`: the run as played, and with the better choice. */
  actualState?: MissionState
  betterState?: MissionState
}

const LABEL: Record<string, string> = { power: 'Power', lifeSupport: 'Life Support', shielding: 'Shielding' }

function decisionLabel(challenge: Challenge, decision: Decision): string {
  if (challenge.kind === 'choice' && decision.kind === 'option') {
    return challenge.options.find((o) => o.id === decision.optionId)?.label ?? decision.optionId
  }
  if (challenge.kind === 'split' && decision.kind === 'split') {
    return challenge.buckets.map((b, i) => `${b.label} ${decision.allocation[i] ?? 0}`).join(' · ')
  }
  return ''
}

/** The other decisions worth trying: the other options, or a split with one unit moved between buckets. */
function alternatives(challenge: Challenge, decision: Decision): Decision[] {
  if (challenge.kind === 'choice' && decision.kind === 'option') {
    return challenge.options.filter((o) => o.id !== decision.optionId).map((o) => ({ kind: 'option' as const, optionId: o.id }))
  }
  if (challenge.kind === 'split' && decision.kind === 'split') {
    const out: Decision[] = []
    challenge.buckets.forEach((from, i) => {
      challenge.buckets.forEach((to, j) => {
        const a = [...decision.allocation]
        if (i === j || (a[i] ?? 0) - from.unitSize < from.min || (a[j] ?? 0) + to.unitSize > to.max) return
        a[i] = (a[i] ?? 0) - from.unitSize
        a[j] = (a[j] ?? 0) + to.unitSize
        out.push({ kind: 'split', allocation: a })
      })
    })
    return out
  }
  return []
}

/** What the better replay changes, in one sentence. */
function improvementText(actual: MissionState, better: MissionState): string {
  if (endingRank(better) > endingRank(actual)) {
    return `the mission would have ended “${ENDINGS[better.ending!].title}” instead of “${ENDINGS[actual.ending!].title}”`
  }
  const gains = (['power', 'lifeSupport', 'shielding'] as const)
    .map((m) => ({ m, d: better.meters[m] - actual.meters[m] }))
    .sort((a, b) => b.d - a.d)
  const doseSaved = doseToMsv(actual.dose - better.dose)
  if (doseSaved > 15 && doseSaved > (gains[0]?.d ?? 0)) return `the crew would have taken ${formatMsv(doseSaved)} less radiation`
  if (better.foodDays - actual.foodDays >= 3 && better.foodDays - actual.foodDays > (gains[0]?.d ?? 0) / 5) return `you would have had ${better.foodDays - actual.foodDays} more days of food`
  const top = gains[0]!
  return `you would have ended with ${Math.round(top.d)} more ${LABEL[top.m]}`
}

/** Why: the earlier choices that came back because of this one (its bites), in a few words. */
function becauseText(mission: MissionState, challenge: Challenge): string {
  const later = mission.bites.filter((b) => b.cause === challenge.id)
  if (later.length === 0) return ''
  return ` Because of this choice: ${later.map((b) => b.text.charAt(0).toLowerCase() + b.text.slice(1)).join('; ')}.`
}

/** How much better a replay must score (same ending) to be worth suggesting. */
const MARGIN = 15

/**
 * Each decision, replayed with every alternative (same seed, same hazards).
 * A better choice is named only when its replay really ends better; a choice
 * whose alternatives all end worse is praised.
 */
export function betterChoices(mission: MissionState): ChoiceReview[] {
  const steps = mission.timeline
  const actual = replay(mission.seed, steps) ?? mission
  const actualScore = outcomeScore(actual)
  const reviews: ChoiceReview[] = []
  steps.forEach((step, index) => {
    if (step.kind !== 'decision') return
    const challenge = getChallenge(step.challenge)
    if (!challenge) return
    let best: { decision: Decision; state: MissionState; score: number } | null = null
    let allWorse = true
    let tried = 0
    for (const decision of alternatives(challenge, step.decision)) {
      const state = replay(mission.seed, steps, { swap: { index, decision } })
      if (!state || state.status !== 'ended') continue
      tried++
      const score = outcomeScore(state)
      if (score > actualScore - MARGIN) allWorse = false
      if (!best || score > best.score) best = { decision, state, score }
    }
    const review: ChoiceReview = { index, challenge, chosen: decisionLabel(challenge, step.decision) }
    if (best && (endingRank(best.state) > endingRank(actual) || (endingRank(best.state) === endingRank(actual) && best.score > actualScore + MARGIN))) {
      const label = decisionLabel(challenge, best.decision)
      // Honest about the price too: a better ending bought with more radiation says so.
      const extraDose = doseToMsv(best.state.dose - actual.dose)
      const price = extraDose >= 15 ? ` But the crew would have taken ${formatMsv(extraDose)} more radiation.` : ''
      review.actualState = actual
      review.betterState = best.state
      review.better = {
        label,
        text: `If you had chosen “${label}” instead of “${review.chosen}”, ${improvementText(actual, best.state)}.${price}${becauseText(mission, challenge)}`,
      }
    } else if (tried > 0 && allWorse) {
      review.praise = `Great call: every other choice here would have ended worse.`
    }
    reviews.push(review)
  })
  return reviews
}

// ---------- Skill versus luck ----------

export type Verdict = 'paid-off' | 'unlucky' | 'lucky' | 'choices'

export const VERDICT_TEXT: Record<Verdict, string> = {
  'paid-off': 'Great choices, and they paid off.',
  unlucky: 'You did your part right, but space was against you.',
  lucky: 'Luck carried this mission; your choices weren’t tested.',
  choices: 'The choices made the difference.',
}

export interface LuckReport {
  faced: Record<HazardKind, number>
  expected: Record<HazardKind, number>
  /** "You faced 3 solar storms; a mission this long usually sees about 1." */
  comparison: string
  /** Dose in mSv: from the player's choices, from the hazards (storms), and the Moon's own background. */
  dose: { choices: number; hazards: number; background: number }
  /** The same run with no hazards: its ending. */
  withoutHazards: MissionState | null
  /** The same run with one more storm and meteoroid before the night: its ending. */
  withMoreHazards: MissionState | null
  verdict: Verdict
}

/** A biggest real flare with energetic particles, for the stress test. */
function worstFlare(): string {
  const sorted = [...DONKI.events].sort((a, b) => stormSeverity(b).factor - stormSeverity(a).factor)
  return sorted[0]!.id
}

/** Minutes a mission of this length spent on each map (played time if known, else from its days). */
function minutesPlayed(mission: MissionState): { transit: number; outpost: number } {
  if (mission.played && mission.played.spacecraft + mission.played.outpost > 60) {
    return { transit: mission.played.spacecraft / 60, outpost: mission.played.outpost / 60 }
  }
  return { transit: 3, outpost: Math.max(2, (mission.day - 1) * 1.6) }
}

export function luckReport(mission: MissionState): LuckReport {
  const minutes = minutesPlayed(mission)
  const expected = expectedHazards(minutes.transit, minutes.outpost, mission.day)
  const faced = mission.hazards
  const storms = faced.transitStorm + faced.outpostStorm
  const expectedStorms = expected.transitStorm + expected.outpostStorm
  const about = (n: number, word: string) => {
    if (n < 0.5) return `no ${word}s`
    const k = Math.max(1, Math.round(n))
    return `about ${k} ${word}${k === 1 ? '' : 's'}`
  }
  const comparison =
    `You faced ${storms} solar storm${storms === 1 ? '' : 's'} and ${faced.meteoroid} meteoroid hit${faced.meteoroid === 1 ? '' : 's'}; ` +
    `a mission this long usually sees ${about(expectedStorms, 'storm')} and ${about(expected.meteoroid, 'meteoroid hit')}.`

  const hazardDose = mission.history.filter((r) => r.hazard).reduce((sum, r) => sum + (r.doseAdded ?? 0), 0)
  const choiceDose = mission.history.filter((r) => !r.hazard).reduce((sum, r) => sum + (r.doseAdded ?? 0), 0)
  const background = Math.max(0, mission.dose - hazardDose - choiceDose)

  const withoutHazards = replay(mission.seed, mission.timeline, { noHazards: true })
  // The stress test: the hazards a long mission often sees (two big storms, two meteoroid hits),
  // answered the way this player answered storms (part shelter if they never met one).
  const lastStorm = [...mission.history].reverse().find((r) => r.challenge === 10)?.outcomeId ?? 'c10-b'
  const flares = [...DONKI.events].sort((a, b) => stormSeverity(b).factor - stormSeverity(a).factor).map((e) => e.id).filter((id) => !mission.usedFlares.includes(id))
  const extra: Step[] = [0, 1].flatMap((i) => [
    { kind: 'hazard', hazard: 'outpostStorm', flareId: flares[i] ?? worstFlare() } as Step,
    { kind: 'decision', challenge: 10, decision: { kind: 'option', optionId: lastStorm } } as Step,
    { kind: 'hazard', hazard: 'meteoroid' } as Step,
    { kind: 'decision', challenge: 11, decision: { kind: 'option', optionId: 'c11-a' } } as Step,
  ])
  const withMoreHazards = replay(mission.seed, mission.timeline, { extraBeforeNight: extra })

  const good = endingRank(mission) >= 2
  const facedTotal = storms + faced.meteoroid
  const expectedTotal = expectedStorms + expected.meteoroid
  let verdict: Verdict
  if (!good) {
    // Space was against you only if the planned choices held up without the hazards,
    // the storms were answered safely, and there were more hazards than usual.
    const plannedOk = endingRank(withoutHazards) >= 2 || healthy(withoutHazards)
    verdict = plannedOk && stormsAnsweredSafely(mission) && facedTotal > expectedTotal ? 'unlucky' : 'choices'
  } else {
    verdict = facedTotal < expectedTotal && endingRank(withMoreHazards) < 2 ? 'lucky' : 'paid-off'
  }

  return {
    faced,
    expected,
    comparison,
    dose: { choices: doseToMsv(choiceDose), hazards: doseToMsv(hazardDose), background: doseToMsv(background) },
    withoutHazards,
    withMoreHazards,
    verdict,
  }
}

/**
 * A replay cut short (the real run ended early, so later tasks were never
 * played) counts as fine if, at that point, nothing was failing.
 */
function healthy(state: MissionState | null): boolean {
  if (!state) return false
  if (state.status === 'ended') return endingRank(state) >= 2
  const meters = Object.values(state.meters).every((v) => v > METER_CRITICAL)
  return meters && state.foodDays > 2 && doseLevel(state.dose) === 'low' && CREW_IDS.every((id) => state.crewHealth[id] !== 'red')
}

/** Every storm was answered by sheltering everyone (or the commander did it when time ran out). */
function stormsAnsweredSafely(mission: MissionState): boolean {
  return mission.history.filter((r) => r.challenge === 4 || r.challenge === 10).every((r) => r.outcomeId.endsWith('-a'))
}

/** The choices that made the biggest difference, good and bad (from the replays). */
export function biggestChoices(reviews: readonly ChoiceReview[]): { good: ChoiceReview[]; bad: ChoiceReview[] } {
  return { good: reviews.filter((r) => r.praise).slice(0, 3), bad: reviews.filter((r) => r.better).slice(0, 3) }
}

// ---------- Captions for the charts ----------

export type Metric = 'power' | 'lifeSupport' | 'shielding' | 'foodDays' | 'dose'

/** One plain-language sentence for each big rise or drop of a metric. */
export function captions(mission: MissionState, metric: Metric): string[] {
  const big = metric === 'foodDays' ? 3 : metric === 'dose' ? 5 : 12
  const out: string[] = []
  for (let i = 1; i < mission.log.length; i++) {
    const before = mission.log[i - 1]!
    const now = mission.log[i]!
    const change = now[metric] - before[metric]
    if (Math.abs(change) < big) continue
    const challenge = now.challenge ? getChallenge(now.challenge) : undefined
    const what = now.hazard
      ? now.hazard === 'meteoroid'
        ? 'a meteoroid hit a solar panel'
        : 'a solar storm hit'
      : challenge
        ? `you chose “${decisionLabel(challenge, mission.timeline.filter((s) => s.kind === 'decision')[decisionIndex(mission, i)]?.decision ?? { kind: 'option', optionId: '' })}” (${challenge.title})`
        : 'overnight'
    const amount = metric === 'dose' ? formatMsv(doseToMsv(Math.abs(change))) : metric === 'foodDays' ? `${Math.abs(change)} days` : `${Math.abs(Math.round(change))}`
    const name = metric === 'foodDays' ? 'food' : metric === 'dose' ? 'the radiation dose' : LABEL[metric]
    const verb = change > 0 ? (metric === 'dose' ? 'rose' : 'went up') : 'dropped'
    out.push(`Day ${now.day}: ${what}, so ${name} ${verb} ${amount}.`)
  }
  return out.slice(0, 4)
}

/** Which decision (in timeline order) made log entry `logIndex`. */
function decisionIndex(mission: MissionState, logIndex: number): number {
  let count = -1
  for (let i = 1; i <= logIndex; i++) if (mission.log[i]?.challenge) count++
  return count
}

// ---------- Real life ----------

export interface RealLifeEntry {
  title: string
  text: string
  link?: { label: string; url: string }
}

/** Every challenge and hazard the player met, linked to the real thing, with sources. */
export function realLife(mission: MissionState): { entries: RealLifeEntry[]; studies: LinkedStudy[] } {
  const entries: RealLifeEntry[] = []
  const seen = new Set<string>()
  const add = (title: string, ref: Reference | undefined, text?: string) => {
    if (!ref || seen.has(ref.id)) return
    seen.add(ref.id)
    entries.push({ title, text: text ?? ref.fact, link: { label: `${ref.publisher}: ${ref.title}`, url: ref.url } })
  }
  for (const flareId of mission.usedFlares) {
    const event = getStormEvent(flareId)
    entries.push({ title: 'Your storm was real', text: describeStorm(event), link: event.link ? { label: 'NASA DONKI record', url: event.link } : undefined })
  }
  add(
    'Radiation storms are real',
    getReference('donki'),
    `Big radiation storms from the Sun happened ${REAL.sepEvents2024} times in 2024 (NASA DONKI counts them as solar energetic particle events). This game speeds time up, so one minute of play stands for ${REAL_HOURS_PER_GAME_MINUTE} hours of 2024’s Sun.`,
  )
  add('The radiation limit', getReference('rad-brief'), `NASA keeps each astronaut under ${REAL.solarEventLimitMsv} mSv for one solar storm and ${REAL.careerLimitMsv} mSv for a whole career. Your crew took ${formatMsv(doseToMsv(mission.dose))}.`)
  add('Talking to Earth', getReference('comm-delay'), `A message from Houston takes about ${REAL.voiceDelaySeconds} seconds to reach the Moon on Artemis missions.`)
  const met = new Set(mission.history.map((r) => r.challenge))
  for (const challenge of CHALLENGES) {
    if (!met.has(challenge.id)) continue
    const ids = mission.history.filter((r) => r.challenge === challenge.id).map((r) => r.outcomeId)
    const sourceIds = challenge.kind === 'choice' ? challenge.options.filter((o) => ids.includes(o.id)).flatMap((o) => o.sourceIds) : challenge.buckets.flatMap((b) => b.sourceIds)
    for (const ref of referencesFor(sourceIds).slice(0, 1)) add(challenge.title, ref)
  }
  const topics: OsdrTopic[] = ['dose']
  if (CREW_IDS.some((id) => mission.crewHealth[id] !== 'green')) topics.push('health')
  if (!mission.remembered.greenhouseUnpowered) topics.push('greenhouse')
  return { entries, studies: linkedStudies(topics) }
}

// ---------- The cover ----------

export function coverLine(mission: MissionState): string {
  return mainCause(mission).text
}

export { HAZARD_KINDS, HAZARD_LABEL, DOSE_THRESHOLDS }
