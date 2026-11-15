/**
 * The Mission Handbook as a story a 7-year-old can follow, worked out from
 * the run (pure, no React, so the checks can read every word).
 *
 * The run's timeline is replayed step by step (the same seed, hazards and
 * nights, see src/state/replay.ts), so every card knows the exact numbers
 * before and after, and every night knows why it changed what it did.
 * Cards are grouped by day: launch day, the trip, each day at the outpost,
 * and the last day. Each card says what happened, why, and what it changed;
 * a consequence links back to the choice that caused it, and that choice
 * links forward to it.
 */
import { CHALLENGES, getChallenge, type Challenge } from '../data/challenges'
import { getStormEvent } from '../data/donki'
import { ENDINGS } from '../data/endings'
import { NAMED_IN_HONOUR } from '../data/namedInHonour'
import { BITE_STORY, FACTS, METER_MEANING, METER_NAME, SPLIT_WHY, WHY, WORDS } from '../data/handbookWords'
import { linkedStudies, type OsdrTopic } from '../data/osdr'
import { doseToMsv, formatMsv, REAL } from '../data/science'
import { getReference, referencesFor } from '../data/sources'
import { nightTick, towNight } from './days'
import { commit, type Decision } from './decisions'
import { betterChoices, luckReport, mainCause, nextTip, VERDICT_TEXT, type Metric } from './handbook'
import { applyHazard } from './hazards'
import { CAST, CREW_IDS, createInitialMission, type CrewId, type Health, type MissionState } from './mission'

export type CardTag = 'choice' | 'luck' | 'night' | 'consequence' | 'milestone' | 'ending'

export const TAG_LABEL: Record<CardTag, string> = {
  choice: 'Your choice',
  luck: 'Luck',
  night: 'Night',
  consequence: 'Consequence',
  milestone: 'Big moment',
  ending: 'The ending',
}

/** One row of "What it changed": a stat, from and to. */
export interface ChangeRow {
  stat: Metric | 'spares' | 'harvestDays' | 'crew'
  text: string
  /** Up is good (green) or bad (red), or neutral. */
  tone: 'good' | 'bad' | 'neutral'
}

export interface CardLink {
  text: string
  /** The card id to jump to. */
  to: string
  direction: 'back' | 'forward'
}

export interface StoryCard {
  id: string
  tag: CardTag
  title: string
  /** A picture id for src/hud/art/Picture.tsx. */
  picture?: string
  happened: string[]
  why: string[]
  changed: ChangeRow[]
  links: CardLink[]
  /** A science word explained the first time the handbook uses it. */
  word?: { word: string; meaning: string }
  /** The challenge behind it (choices and luck). */
  challenge?: number
  /** For choices: the label of what was chosen. */
  choice?: string
}

export interface StoryDay {
  id: string
  title: string
  place: string
  cards: StoryCard[]
  /** Nothing much happened: shown as one short card. */
  quiet: boolean
}

// ---------- Small helpers ----------

const HEALTH_WORD: Record<Health, string> = { green: 'well', yellow: 'tired', red: 'too ill to work' }
const name = (id: CrewId) => CAST[id].name.split(' ')[0]!

function choiceLabel(challenge: Challenge, decision: Decision): string {
  if (challenge.kind === 'choice' && decision.kind === 'option') return challenge.options.find((o) => o.id === decision.optionId)?.label ?? decision.optionId
  if (challenge.kind === 'split' && decision.kind === 'split') return challenge.buckets.map((b, i) => `${b.label} ${decision.allocation[i] ?? 0}`).join(', ')
  return ''
}

const optionId = (decision: Decision) => (decision.kind === 'option' ? decision.optionId : '')

/** The exact changes between two states, as rows, most important first. */
export function changeRows(before: MissionState, after: MissionState): ChangeRow[] {
  const rows: ChangeRow[] = []
  for (const m of ['power', 'lifeSupport', 'shielding'] as const) {
    const a = Math.round(before.meters[m])
    const b = Math.round(after.meters[m])
    if (a !== b) rows.push({ stat: m, text: `${METER_NAME[m]}: ${a} → ${b}`, tone: b > a ? 'good' : 'bad' })
  }
  if (before.foodDays !== after.foodDays) rows.push({ stat: 'foodDays', text: `Food: ${before.foodDays} → ${after.foodDays} days`, tone: after.foodDays > before.foodDays ? 'good' : 'bad' })
  const dose = doseToMsv(after.dose - before.dose)
  if (dose >= 0.05) rows.push({ stat: 'dose', text: `Radiation: +${formatMsv(dose)}`, tone: dose >= 5 ? 'bad' : 'neutral' })
  if (before.spares !== after.spares) rows.push({ stat: 'spares', text: `Spare parts: ${before.spares} → ${after.spares}`, tone: after.spares > before.spares ? 'good' : 'neutral' })
  if (before.harvestDays !== after.harvestDays && after.harvestDays > before.harvestDays) {
    rows.push({ stat: 'harvestDays', text: `Food growing: ${after.harvestDays} days`, tone: 'good' })
  }
  for (const id of CREW_IDS) {
    if (before.crewHealth[id] !== after.crewHealth[id]) {
      const better = ['red', 'yellow', 'green'].indexOf(after.crewHealth[id]) > ['red', 'yellow', 'green'].indexOf(before.crewHealth[id])
      rows.push({ stat: 'crew', text: `${name(id)}: ${HEALTH_WORD[before.crewHealth[id]]} → ${HEALTH_WORD[after.crewHealth[id]]}`, tone: better ? 'good' : 'bad' })
    }
  }
  return rows
}

/** The changes as short sentences ("Power went down from 70 to 50."), at most `max`. */
function changeSentences(before: MissionState, after: MissionState, max: number): string[] {
  const out: string[] = []
  for (const m of ['power', 'lifeSupport', 'shielding'] as const) {
    const a = Math.round(before.meters[m])
    const b = Math.round(after.meters[m])
    if (a !== b) out.push(`${METER_NAME[m]} went ${b > a ? 'up' : 'down'} from ${a} to ${b}.`)
  }
  if (after.foodDays < before.foodDays) out.push(`Food went down from ${before.foodDays} to ${after.foodDays} days.`)
  if (after.foodDays > before.foodDays) out.push(`Food went up from ${before.foodDays} to ${after.foodDays} days.`)
  for (const id of CREW_IDS) if (before.crewHealth[id] !== after.crewHealth[id]) out.push(`${name(id)} is now ${HEALTH_WORD[after.crewHealth[id]]}.`)
  const dose = doseToMsv(after.dose - before.dose)
  if (dose >= 5) out.push(`Your crew got ${formatMsv(dose)} more radiation.`)
  return out.slice(0, max)
}

// ---------- The story ----------

interface GroupKey {
  id: string
  title: string
  place: string
}

function groupFor(challenge: Challenge | undefined, state: MissionState): GroupKey {
  if (challenge?.phase === 'pre-launch') return { id: 'launch', title: 'Launch day', place: 'Earth' }
  if (challenge?.phase === 'transit') return { id: 'trip', title: 'On the way to the Moon', place: 'In space' }
  if (challenge?.last) return { id: 'last', title: 'The last day', place: 'The outpost' }
  return { id: `day-${state.day}`, title: `Day ${state.day}`, place: 'The outpost' }
}

/** Which night reasons explain which change. */
const TOPICS: readonly { said: RegExp; why: RegExp }[] = [
  { said: /^Power/, why: /power|panel|solar|reactor|fuel cell/i },
  { said: /^Life Support/, why: /life support|air|water|ice|pump/i },
  { said: /^Shielding/, why: /drill|roof|soil|shield/i },
  { said: /^Food/, why: /food|greenhouse|harvest|plant|ate/i },
  { said: /is now/, why: /tired|worn|weak|ill|stale|rest/i },
  { said: /radiation/, why: /radiation|mSv/i },
]

/** The run as days of cards, in the order it happened. */
export function missionStory(mission: MissionState, player: string): StoryDay[] {
  const days: StoryDay[] = []
  const dayOf = (key: GroupKey): StoryDay => {
    let day = days.find((d) => d.id === key.id)
    if (!day) {
      day = { id: key.id, title: key.title, place: key.place, cards: [], quiet: false }
      days.push(day)
    }
    return day
  }
  let n = 0
  const id = () => `card-${n++}`
  /** The card of the latest decision on each challenge, for consequence links. */
  const madeBy = new Map<number, { card: StoryCard; day: StoryDay }>()

  const addConsequences = (before: MissionState, after: MissionState, day: StoryDay) => {
    for (const bite of after.bites.slice(before.bites.length)) {
      const cause = madeBy.get(bite.cause)
      const card: StoryCard = {
        id: id(),
        tag: 'consequence',
        title: 'An earlier choice came back',
        picture: cause?.card.picture,
        happened: [BITE_STORY[bite.id] ?? `${bite.text}.`],
        why: cause ? [`On ${cause.day.title === 'Launch day' ? 'launch day' : cause.day.title === 'On the way to the Moon' ? 'the trip' : cause.day.title}, you chose “${cause.card.choice}”.`] : [],
        changed: [],
        links: cause ? [{ text: `Caused by your choice on ${cause.day.title}`, to: cause.card.id, direction: 'back' }] : [],
      }
      if (cause) cause.card.links.push({ text: `This caused something on ${day.title}`, to: card.id, direction: 'forward' })
      day.cards.push(card)
    }
  }

  let state = createInitialMission(mission.seed)
  const steps = mission.timeline
  let firstNight = true
  for (let i = 0; i < steps.length && state.status !== 'ended'; i++) {
    const step = steps[i]!
    if (step.kind === 'decision') {
      const challenge = getChallenge(step.challenge)
      if (!challenge) continue
      const outcome = commit(challenge, state, step.decision)
      if (!outcome) continue
      const day = dayOf(groupFor(challenge, state))
      const label = choiceLabel(challenge, step.decision)
      const record = outcome.after.history.at(-1)
      const card: StoryCard = {
        id: id(),
        tag: 'choice',
        title: challenge.title,
        picture: challenge.kind === 'choice' ? optionId(step.decision) : `c${String(challenge.id).padStart(2, '0')}`,
        happened: [record?.timedOut ? `Time ran out, so ${CAST.commander.short} chose “${label}”.` : `${player} chose “${label}”.`],
        why: [challenge.kind === 'split' ? (SPLIT_WHY[challenge.id] ?? '') : (WHY[optionId(step.decision)] ?? '')].filter(Boolean),
        changed: changeRows(state, outcome.after),
        links: [],
        challenge: challenge.id,
        choice: label,
      }
      day.cards.push(card)
      madeBy.set(challenge.id, { card, day })
      addConsequences(state, outcome.after, day)
      state = outcome.after
      // The big moments that follow a task: the launch after the cargo, the landing after the site.
      if (challenge.id === 2) {
        day.cards.push({ id: id(), tag: 'milestone', title: 'Liftoff!', picture: 'c01', happened: ['The rocket launched from Earth.'], why: ['It carried your crew and cargo to the Moon.'], changed: [], links: [] })
      }
      if (challenge.id === 5) {
        day.cards.push({
          id: id(),
          tag: 'milestone',
          title: 'Landing on the Moon',
          picture: optionId(step.decision),
          happened: ['You landed on the slope between, beside your outpost.'],
          why: ['It gets sunlight for the panels, and the ice crater is a short drive away.'],
          changed: [],
          links: [],
        })
      }
    } else if (step.kind === 'hazard') {
      // Luck: the hazard and the player's answer to it, as one card.
      const before = state
      const day = dayOf(groupFor(step.hazard === 'transitStorm' ? getChallenge(4) : undefined, state))
      state = applyHazard(state, step.hazard, step.flareId)
      const next = steps[i + 1]
      let answer: { label: string; option: string; timedOut: boolean } | null = null
      if (next?.kind === 'decision' && getChallenge(next.challenge)?.hazard) {
        const challenge = getChallenge(next.challenge)!
        const outcome = commit(challenge, state, next.decision)
        if (outcome) {
          const record = outcome.after.history.at(-1)
          answer = { label: choiceLabel(challenge, next.decision), option: optionId(next.decision), timedOut: !!record?.timedOut }
          state = outcome.after
        }
        i++
      }
      const flare = step.flareId ? getStormEvent(step.flareId) : null
      const storm = step.hazard !== 'meteoroid'
      const card: StoryCard = {
        id: id(),
        tag: 'luck',
        title: storm ? 'A solar storm hit' : 'A meteoroid hit a solar panel',
        picture: storm ? (step.hazard === 'transitStorm' ? 'c04' : 'c10') : 'c11',
        happened: [
          storm ? (flare ? `The Sun threw out a real class ${flare.classType} flare.` : 'The Sun threw out a storm of radiation.') : 'A tiny space rock broke a solar panel.',
          ...(answer ? [answer.timedOut ? `Time ran out, so ${CAST.commander.short} chose “${answer.label}”.` : `${player} chose “${answer.label}”.`] : []),
        ],
        why: [answer ? (WHY[answer.option] ?? '') : 'Nobody can stop the Sun or a space rock.'].filter(Boolean),
        changed: changeRows(before, state),
        links: [],
        challenge: storm ? (step.hazard === 'transitStorm' ? 4 : 10) : 11,
        choice: answer?.label,
      }
      day.cards.push(card)
      if (answer) madeBy.set(card.challenge!, { card, day })
      addConsequences(before, state, day)
    } else if (step.kind === 'night' || step.kind === 'tow') {
      const before = state
      const lunar = step.kind === 'night' && step.lunar
      const notes: string[] = []
      if (step.kind === 'tow') {
        const passed = towNight(state)
        notes.push(...passed.report.notes)
        state = passed.state
      } else {
        // The lunar night is several nights in a row: one card for all of them.
        const pass = () => {
          const passed = nightTick(state, lunar)
          for (const note of passed.report.notes) if (!notes.includes(note)) notes.push(note)
          state = passed.state
        }
        pass()
        while (lunar && (state as MissionState).status !== 'ended') {
          const next = steps[i + 1]
          if (next?.kind !== 'night' || !next.lunar) break
          i++
          pass()
        }
      }
      const day = dayOf(lunar ? { id: 'last', title: 'The last day', place: 'The outpost' } : { id: `day-${before.day}`, title: `Day ${before.day}`, place: 'The outpost' })
      const eaten = before.foodDays - state.foodDays
      const why = firstNight ? [`The Moon adds about ${REAL.surfaceDoseMsvPerDay} mSv of radiation a day, even indoors.`, ...notes] : [...notes]
      if (eaten > 0) why.push('Your crew ate food every day, so food went down.')
      else if (eaten === 0 && notes.some((note) => /grew/.test(note))) why.push(`Your crew ate what grew, so food stayed at ${state.foodDays} days.`)
      const powerMoved = Math.round(state.meters.power) - Math.round(before.meters.power)
      if (powerMoved > 0 && !notes.some((note) => /power/i.test(note))) why.push('Your power source made more power than the base used.')
      if (powerMoved < 0 && !notes.some((note) => /power/i.test(note))) why.push('The base used more power than it made.')
      firstNight = false
      // The chips list every change; the sentence names the biggest one, and its reason comes first.
      const said = changeSentences(before, state, 1)
      const topic = TOPICS.find((t) => t.said.test(said[0] ?? ''))
      if (topic) why.sort((x, y) => Number(topic.why.test(y)) - Number(topic.why.test(x)))
      day.cards.push({
        id: id(),
        tag: 'night',
        title: lunar ? 'The long lunar night' : step.kind === 'tow' ? 'The tow home' : 'While you slept',
        picture: lunar ? 'c12-a' : 'c09-a',
        happened: said.length ? said : ['The night passed quietly.', 'Nothing changed much.'],
        why: why.slice(0, 2),
        changed: changeRows(before, state),
        links: [],
      })
      addConsequences(before, state, day)
    }
  }

  // The ending, on the last day there was.
  if (mission.status === 'ended' && mission.ending) {
    const lastDay = days.find((d) => d.id === 'last') ?? days.at(-1)
    if (lastDay) {
      if (lastDay.id !== 'last' && lastDay.id.startsWith('day-')) lastDay.title = `${lastDay.title}: the last day`
      const ending = ENDINGS[mission.ending]
      lastDay.cards.push({
        id: id(),
        tag: 'ending',
        title: ending.title,
        picture: ending.good ? 'c12-b' : 'c10',
        happened: mainReason(mission),
        why: [],
        changed: [],
        links: [],
      })
    }
  }

  for (const day of days) day.quiet = day.cards.length === 1 && day.cards[0]!.tag === 'night' && day.cards[0]!.changed.every((row) => row.stat === 'dose' || row.stat === 'foodDays')

  // Each science word is explained once, on the first card that uses it.
  const explained = new Set<string>()
  for (const day of days) {
    for (const card of day.cards) {
      const text = [card.title, ...card.happened, ...card.why].join(' ')
      const word = WORDS.find((w) => !explained.has(w.word) && w.match.test(text))
      if (word) {
        explained.add(word.word)
        card.word = { word: word.word, meaning: word.meaning }
      }
    }
  }
  return days
}

// ---------- Why it ended (short) ----------

/** The main reason, in two or three short sentences. */
export function mainReason(mission: MissionState): string[] {
  return mainCause(mission).text.split(/(?<=\.)\s+/)
}

// ---------- Meters over time ----------

export interface MeterReason {
  when: string
  what: string
  change: string
  tone: ChangeRow['tone']
}

export interface MeterPage {
  metric: Metric
  title: string
  meaning: string
  end: string
  endLabel: string
  reasons: MeterReason[]
  /** Said instead when it never moved. */
  steady?: string
}

const METER_ORDER: Metric[] = ['power', 'lifeSupport', 'shielding', 'foodDays', 'dose']

function rowValue(row: ChangeRow): number {
  const m = row.text.match(/(-?\d+(?:\.\d+)?)\s*→\s*(-?\d+(?:\.\d+)?)/)
  if (m) return Math.abs(Number(m[2]) - Number(m[1]))
  const plus = row.text.match(/\+(\d+(?:\.\d+)?)/)
  return plus ? Number(plus[1]) : 0
}

/** One page per meter: what it means, where it ended, and the 2 to 4 biggest reasons it moved. */
export function meterPages(mission: MissionState, story: readonly StoryDay[]): MeterPage[] {
  return METER_ORDER.map((metric) => {
    const found: (MeterReason & { size: number; order: number })[] = []
    let order = 0
    for (const day of story) {
      for (const card of day.cards) {
        order++
        const row = card.changed.find((r) => r.stat === metric)
        if (!row) continue
        found.push({ when: day.title, what: card.title, change: row.text.replace(/^[^:]+:\s*/, ''), tone: row.tone, size: rowValue(row), order })
      }
    }
    const reasons = found
      .sort((a, b) => b.size - a.size)
      .slice(0, 4)
      .sort((a, b) => a.order - b.order)
      .map(({ when, what, change, tone }) => ({ when, what, change, tone }))
    const end =
      metric === 'dose' ? formatMsv(doseToMsv(mission.dose)) : metric === 'foodDays' ? `${mission.foodDays} days` : `${Math.round(mission.meters[metric])} of 100`
    const endLabel = metric === 'dose' ? 'Radiation your crew got' : metric === 'foodDays' ? 'Food left at the end' : `${METER_NAME[metric]} at the end`
    const steady = reasons.length === 0 ? `${METER_NAME[metric]} stayed at ${end} the whole mission.` : undefined
    return { metric, title: METER_NAME[metric], meaning: METER_MEANING[metric], end, endLabel, reasons, steady }
  })
}

// ---------- Better choices ----------

export interface BetterCard {
  title: string
  picture?: string
  when: string
  chose: string
  better: string
  whyBetter: string[]
  dependsOn?: { text: string; to: string }
  /** The card in the log, to jump to. */
  card?: string
}

export interface GreatCall {
  title: string
  chose: string
  text: string
}

/** Each choice a replay shows could have gone better, and the great calls. */
export function betterPages(mission: MissionState, story: readonly StoryDay[]): { better: BetterCard[]; great: GreatCall[] } {
  const reviews = betterChoices(mission)
  const better: BetterCard[] = []
  const great: GreatCall[] = []
  const cards = story.flatMap((day) => day.cards.map((card) => ({ card, day })))
  for (const review of reviews) {
    const found = cards.filter(({ card }) => card.challenge === review.challenge.id && card.choice !== undefined)
    // The nth card for this challenge (a storm can come more than once).
    const nth = reviews.filter((r) => r.challenge.id === review.challenge.id && r.index < review.index).length
    const at = found[nth]
    const when = at?.day.title ?? ''
    if (review.better && review.betterState) {
      const actual = review.actualState ?? mission
      const next = review.betterState
      const whyBetter: string[] = []
      if (next.ending !== actual.ending && next.ending) whyBetter.push(`The mission would end “${ENDINGS[next.ending].title}”.`)
      const saved = doseToMsv(actual.dose - next.dose)
      if (saved >= 5) whyBetter.push(`Your crew would get ${formatMsv(saved)} less radiation.`)
      for (const m of ['power', 'lifeSupport', 'shielding'] as const) {
        const a = Math.round(actual.meters[m])
        const b = Math.round(next.meters[m])
        if (b - a >= 5 && whyBetter.length < 3) whyBetter.push(`${METER_NAME[m]} would end at ${b}, not ${a}.`)
      }
      if (next.foodDays - actual.foodDays >= 2 && whyBetter.length < 3) whyBetter.push(`You would have ${next.foodDays - actual.foodDays} more days of food.`)
      if (whyBetter.length === 0) whyBetter.push('Your meters would end higher.')
      const extra = doseToMsv(next.dose - actual.dose)
      if (extra >= 15) whyBetter.push(`But your crew would get ${formatMsv(extra)} more radiation.`)
      // What it depended on: a consequence from an earlier choice that showed up right after it.
      let dependsOn: BetterCard['dependsOn']
      if (at) {
        const list = at.day.cards
        const after = list.slice(list.indexOf(at.card) + 1)
        const bite = after.find((c) => c.tag === 'consequence' && c.links[0])
        if (bite?.links[0]) dependsOn = { text: `This also depended on ${bite.links[0].text.replace('Caused by your choice on ', '')}.`, to: bite.links[0].to }
      }
      better.push({
        title: review.challenge.title,
        picture: at?.card.picture,
        when,
        chose: review.chosen,
        better: review.better.label,
        whyBetter,
        dependsOn,
        card: at?.card.id,
      })
    } else if (review.praise) {
      great.push({ title: review.challenge.title, chose: review.chosen, text: 'Every other choice here would have ended worse.' })
    }
  }
  return { better, great }
}

// ---------- Real life ----------

export interface RealCard {
  title: string
  picture?: string
  inGame: string[]
  inRealLife: string[]
  source?: { label: string; url: string }
}

const STUDY_TOPIC: Record<OsdrTopic, string> = {
  dose: 'How radiation changes the body',
  health: 'How space changes astronauts’ bodies',
  greenhouse: 'Growing food in space',
}

export function realPages(mission: MissionState, story: readonly StoryDay[]): { cards: RealCard[]; studies: { label: string; url: string; topic: string }[] } {
  const cards: RealCard[] = []
  const seen = new Set<string>()
  const add = (refId: string, card: Omit<RealCard, 'inRealLife' | 'source'>) => {
    const ref = getReference(refId)
    if (!ref || seen.has(refId)) return
    seen.add(refId)
    cards.push({ ...card, inRealLife: FACTS[refId] ?? [], source: { label: `${ref.publisher}: ${ref.title}`, url: ref.url } })
  }
  const stormCards = story.flatMap((day) => day.cards.filter((c) => c.tag === 'luck' && c.title.includes('storm')).map((card) => ({ card, day })))
  mission.usedFlares.forEach((flareId, i) => {
    const event = getStormEvent(flareId)
    const date = new Date(event.peakTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    cards.push({
      title: 'Your storm was real',
      picture: 'c10',
      inGame: [`A solar storm hit on ${stormCards[i]?.day.title ?? 'your mission'}.`],
      inRealLife: [`It was a real class ${event.classType} flare.`, `It happened on ${date}.`, ...(event.sep ? ['Fast radiation particles followed it.'] : [])],
      source: event.link ? { label: 'NASA DONKI record of this flare', url: event.link } : undefined,
    })
  })
  const storms = mission.hazards.transitStorm + mission.hazards.outpostStorm
  add('donki', { title: 'Storms from the Sun are real', picture: 'c04', inGame: [`${storms} solar storm${storms === 1 ? '' : 's'} hit your mission.`, `In 2024 there were ${REAL.sepEvents2024} big radiation storms.`] })
  add('rad-brief', { title: 'The radiation limit', picture: 'c10-a', inGame: [`Your crew got ${formatMsv(doseToMsv(mission.dose))} of radiation.`] })
  add('comm-delay', { title: 'Talking to Earth', picture: 'c06-antenna', inGame: ['Houston’s messages reached you a few seconds late.'] })
  const met = new Set(mission.history.map((r) => r.challenge))
  for (const challenge of CHALLENGES) {
    if (!met.has(challenge.id)) continue
    const ids = mission.history.filter((r) => r.challenge === challenge.id).map((r) => r.outcomeId)
    const sourceIds = challenge.kind === 'choice' ? challenge.options.filter((o) => ids.includes(o.id)).flatMap((o) => o.sourceIds) : challenge.buckets.flatMap((b) => b.sourceIds)
    const ref = referencesFor(sourceIds).find((r) => !seen.has(r.id) && FACTS[r.id])
    const card = story.flatMap((d) => d.cards).find((c) => c.challenge === challenge.id && c.choice)
    if (ref) add(ref.id, { title: challenge.title, picture: card?.picture, inGame: card?.choice ? [`You chose “${card.choice}”.`] : ['You met this on your mission.'] })
  }
  const topics: OsdrTopic[] = ['dose']
  if (CREW_IDS.some((id) => mission.crewHealth[id] !== 'green')) topics.push('health')
  if (!mission.remembered.greenhouseUnpowered) topics.push('greenhouse')
  const studies = linkedStudies(topics).map((s) => ({ label: s.accession, url: s.url, topic: STUDY_TOPIC[s.topic] }))
  return { cards, studies }
}

// ---------- Summary ----------

export interface StatTile {
  value: string
  label: string
  icon: 'dose' | 'foodDays' | 'power' | 'crewHealth' | 'harvestDays' | 'shielding'
}

export interface Summary {
  title: string
  good: boolean
  reason: string[]
  verdict: string
  verdictKind: 'good' | 'bad' | 'luck'
  points: string[]
  tip: string
  tiles: StatTile[]
  dose: { choices: number; hazards: number; background: number }
  luck: string[]
}

export function summary(mission: MissionState, story: readonly StoryDay[]): Summary {
  const ending = ENDINGS[mission.ending!]
  const luck = luckReport(mission)
  const { better, great } = betterPages(mission, story)
  const storms = mission.hazards.transitStorm + mission.hazards.outpostStorm
  const expectedStorms = Math.round(luck.expected.transitStorm + luck.expected.outpostStorm)
  const points: string[] = []
  for (const g of great.slice(0, 2)) points.push(`Great call: “${g.chose}” (${g.title}).`)
  for (const b of better.slice(0, 2)) points.push(`${b.when}: “${b.better}” would have been better.`)
  if (storms !== expectedStorms) points.push(`Luck: you met ${storms} storm${storms === 1 ? '' : 's'}. Most missions meet about ${expectedStorms}.`)
  // Always three: then the radiation and the food, in numbers.
  const msv = doseToMsv(mission.dose)
  points.push(msv < REAL.solarEventLimitMsv ? `Your crew got ${formatMsv(msv)}, under NASA’s ${REAL.solarEventLimitMsv} mSv limit.` : `Your crew got ${formatMsv(msv)}, over NASA’s ${REAL.solarEventLimitMsv} mSv limit.`)
  points.push(mission.foodDays > 0 ? `You ended with ${mission.foodDays} days of food left.` : 'The food ran out before the end.')
  return {
    title: ending.title,
    good: ending.good,
    reason: mainReason(mission),
    verdict: VERDICT_TEXT[luck.verdict],
    verdictKind: luck.verdict === 'unlucky' || luck.verdict === 'lucky' ? 'luck' : ending.good ? 'good' : 'bad',
    points: points.slice(0, 3),
    tip: nextTip(mission),
    tiles: [
      { value: formatMsv(doseToMsv(mission.dose)), label: 'Radiation your crew got', icon: 'dose' },
      { value: `${mission.day}`, label: 'Days on the Moon', icon: 'harvestDays' },
      { value: `${storms + mission.hazards.meteoroid}`, label: 'Storms and space rocks', icon: 'shielding' },
      { value: `${mission.foodDays}`, label: 'Days of food left', icon: 'foodDays' },
    ],
    dose: luck.dose,
    luck: [`You met ${storms} storm${storms === 1 ? '' : 's'} and ${mission.hazards.meteoroid} space rock${mission.hazards.meteoroid === 1 ? '' : 's'}.`, `A mission this long usually meets about ${expectedStorms + Math.round(luck.expected.meteoroid)}.`],
  }
}

/** Every sentence the handbook will show for this run (for the readability check). */
export function allText(mission: MissionState, player: string): string[] {
  const story = missionStory(mission, player)
  const out: string[] = []
  for (const day of story) {
    out.push(day.title, day.place)
    for (const c of day.cards) out.push(c.title, ...c.happened, ...c.why, ...c.links.map((l) => l.text), ...(c.word ? [c.word.meaning] : []))
  }
  for (const page of meterPages(mission, story)) out.push(page.meaning, page.endLabel, ...(page.steady ? [page.steady] : []), ...page.reasons.map((r) => `${r.when}: ${r.what}`))
  const b = betterPages(mission, story)
  for (const card of b.better) out.push(...card.whyBetter, ...(card.dependsOn ? [card.dependsOn.text] : []))
  for (const g of b.great) out.push(g.text)
  const real = realPages(mission, story)
  for (const card of real.cards) out.push(card.title, ...card.inGame, ...card.inRealLife)
  for (const pair of Object.values(NAMED_IN_HONOUR)) for (const p of pair) out.push(p.fact)
  const s = summary(mission, story)
  out.push(...s.reason, s.verdict, ...s.points, s.tip, ...s.luck, ...s.tiles.map((t) => t.label))
  return out
}
