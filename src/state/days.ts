/**
 * Mission days at the outpost. One day passes after each outpost challenge;
 * the base uses and makes things overnight, driven by challenge 6's power
 * split (which stays switched on) and challenge 1's power source. This is
 * where "a choice that saves power today costs oxygen tomorrow" happens.
 *
 * The meter rates are game units (0 to 100 meters), sized for a short run.
 * What is real: the background dose of a day on the Moon (0.5 mSv
 * [rad-brief]), solar panels making nothing in the lunar night
 * [moon-facts], a fuel cell carrying some power through it [rfc] and a
 * reactor running the same day and night [fsp]. Ids in brackets are
 * references in src/data/sources.json; the figures are in src/data/science.ts.
 */
import { getChallenge, type CrewLine } from '../data/challenges'
import { SURFACE_DOSE_POINTS_PER_DAY } from '../data/science'
import { changesBetween, MODERATE_DOSE_LINE, moderateDoseRecord, type Change } from './decisions'
import {
  applyDoseLevel,
  applyEffects,
  isDone,
  isResting,
  MODERATE_DOSE_NOTE,
  checkFailure,
  CREW_IDS,
  shiftHealth,
  snapshot,
  type BiteRecord,
  type Effects,
  type MissionState, CAST } from './mission'

/** Daily rates, in game units unless a reference is given. */
export const DAILY = {
  /** Days of food the crew eats each day. */
  foodEaten: 2,
  /** Days of food each greenhouse power unit grows each day. */
  foodPerGreenhouseUnit: 1,
  /** Life support units that keep it steady. */
  lifeSupportNeeded: 2,
  /** Life Support lost per missing unit each day. */
  lifeSupportPerMissingUnit: 8,
  /** Power used per switched-on unit each day. */
  powerPerUnit: 2,
  /**
   * Power made each day by each source, in sunlight and in the lunar night:
   * solar nothing at night [moon-facts], a fuel cell about half its day
   * output from stored gas [rfc] (game scale), a reactor the same [fsp].
   */
  powerMade: {
    solar: { day: 14, night: 0 },
    fuelCell: { day: 14, night: 7 },
    reactor: { day: 18, night: 18 },
    none: { day: 12, night: 0 },
  },
  /** Shielding the drill adds per unit each day, and the most it builds to. */
  shieldingPerDrillUnit: 4,
  shieldingCap: 80,
  /** Below these, the crew's health drops overnight. */
  lowLifeSupport: 30,
  lowFood: 2,
  /** A part fails on this night; a spare fixes it, or Life Support takes this hit. */
  failureNight: 1,
  failureLifeSupportHit: 10,
  /** Life Support each night from the ice (challenge 8): extracted, a small trial, or rationing. TODO: source (effect size). */
  iceWater: { extracted: 4, trial: 2, rationing: -3 },
} as const

export type PowerSource = keyof typeof DAILY.powerMade

/** Challenge 1's choice, from the remembered flags. */
export function powerSource(state: MissionState): PowerSource {
  if (state.remembered.choseReactor) return 'reactor'
  if (state.remembered.choseFuelCell) return 'fuelCell'
  if (state.remembered.choseSolarOnly) return 'solar'
  return 'none'
}

/** What one night did: the card the player reads in the morning. */
export interface NightReport {
  /** The day that is starting. */
  day: number
  /** True in the lunar night (challenge 12 fast-forward). */
  lunarNight: boolean
  /** Exact changes overnight (shown as "Power −4", "Kalpana Ride: Tired"). */
  changes: Change[]
  /** Why, one sentence each. */
  notes: string[]
  /** Crew lines naming an earlier choice that came back. */
  lines: CrewLine[]
}

/** The crew lines a night can bring (for the voices and the emotion check). */
export const BITE_LINES = {
  noSpares: { speakerId: 'commander', lineId: 'bite-no-spares', text: 'That would be an easy fix with a spare part.' },
  fewSupplies: {
    speakerId: 'science',
    lineId: 'bite-few-supplies',
    text: 'We’re down to our last meals. More supplies would have helped.',
  },
  pushedOn: { speakerId: 'safety', lineId: 'bite-pushed-on', text: 'Pushing on wore our botanist out. She has to rest now.' },
  skippedPlanting: { speakerId: 'science', lineId: 'bite-skipped-planting', text: 'We never planted. There’s no fresh food for the night.' },
  briefing: { speakerId: 'commander', lineId: 'c08-briefing', text: 'We need water. There’s ice in the crater to the east.' },
  ration: { speakerId: 'safety', lineId: 'bite-rationing', text: 'Rationing water is wearing us down. We should have brought ice back.' },
} as const satisfies Record<string, CrewLine>

function units(state: MissionState, id: string): number {
  return state.powerSplit?.[id] ?? 0
}

/**
 * One night: food eaten and grown, Life Support held or lost, power made
 * and used, the drill's Shielding, crew health, and the earlier choices
 * that come back. Returns the new state (with day + 1) and the report.
 */
export function nightTick(state: MissionState, lunarNight = false): { state: MissionState; report: NightReport } {
  const notes: string[] = []
  const lines: CrewLine[] = []
  const bites: BiteRecord[] = []
  const effects: Effects = {}
  const night = state.day
  const hasBite = (id: string) => state.bites.some((bite) => bite.id === id) || bites.some((bite) => bite.id === id)

  // Food: eaten every day, grown only in a powered greenhouse (and not in
  // hibernation). With the science officer (the botanist) resting, half as much.
  const greenhouse = state.remembered.greenhouseUnpowered ? 0 : units(state, 'c06-greenhouse')
  const botanistResting = isResting(state, 'science')
  const fullYield = lunarNight && state.history.some((r) => r.outcomeId === 'c12-a') ? 0 : greenhouse * DAILY.foodPerGreenhouseUnit
  const grown = botanistResting ? Math.floor(fullYield / 2) : fullYield
  effects.foodDays = grown - DAILY.foodEaten
  if (greenhouse === 0) {
    notes.push('The greenhouse had no power, so no new food grew.')
    if (!hasBite('greenhouse-dark')) bites.push({ id: 'greenhouse-dark', cause: 6, day: night, text: 'No new food grew' })
  } else if (grown > 0) {
    notes.push(`The greenhouse grew ${grown === 1 ? 'a day' : `${grown} days`} of food.`)
  }
  if (botanistResting && fullYield > 0) notes.push(`${CAST.science.short} was resting, so the greenhouse grew only half as much.`)

  // Even inside the base, the Moon adds about 0.5 mSv of radiation a day [rad-brief].
  effects.dose = SURFACE_DOSE_POINTS_PER_DAY

  // Life Support: steady with enough power, drifting down without it.
  const missing = Math.max(0, DAILY.lifeSupportNeeded - units(state, 'c06-life-support'))
  if (missing > 0) {
    effects.lifeSupport = -missing * DAILY.lifeSupportPerMissingUnit
    notes.push('Life support was short of power, so the air and water ran down.')
  }

  // Power: what the source makes, minus what's switched on.
  const source = powerSource(state)
  const made = DAILY.powerMade[source][lunarNight ? 'night' : 'day']
  const used = Object.values(state.powerSplit ?? {}).reduce((sum, n) => sum + n, 0) * DAILY.powerPerUnit
  if (state.powerSplit) effects.power = made - used
  if (lunarNight && source === 'solar') notes.push('In the dark, the solar panels made no power at all.')

  // After the tired crew (9), the commander's briefing: the ice crater is the next objective (it opens challenge 8).
  if (!lunarNight && isDone(state, 9) && !state.remembered.iceBriefed && getChallenge(8)?.ready) {
    effects.remember = { ...effects.remember, iceBriefed: true }
    notes.push('Briefing at command: drive the rover to the ice crater to the east.')
    lines.push(BITE_LINES.briefing)
  }

  // The ice from challenge 8 keeps giving water every night (or rationing drains Life Support).
  const ice = state.remembered.iceExtracted ? 'extracted' : state.remembered.iceTrial ? 'trial' : state.remembered.rationingWater ? 'rationing' : null
  if (ice) {
    effects.lifeSupport = (effects.lifeSupport ?? 0) + DAILY.iceWater[ice]
    notes.push(ice === 'rationing' ? 'The crew rationed water, so Life Support ran down faster.' : 'Melted ice from the crater topped up the water tanks.')
    if (ice === 'rationing' && !hasBite('rationing')) {
      lines.push(BITE_LINES.ration)
      bites.push({ id: 'rationing', cause: 8, day: night, text: `Life Support ${DAILY.iceWater.rationing} every night`, lineId: BITE_LINES.ration.lineId })
    }
  }

  // Pushed on while tired (challenge 9): the science officer is worn out sooner.
  if (!lunarNight && state.remembered.pushedOnTired && !hasBite('pushed-on')) {
    effects.health = { ...effects.health, science: (effects.health?.science ?? 0) - 1 }
    notes.push(`Pushing on left ${CAST.science.short} worn out.`)
    lines.push(BITE_LINES.pushedOn)
    bites.push({ id: 'pushed-on', cause: 9, day: night, text: `${CAST.science.name} wore out sooner`, lineId: BITE_LINES.pushedOn.lineId })
  }

  // The lunar night: what the greenhouse grew from challenge 7 is harvested (half with the botanist resting).
  if (lunarNight && state.harvestDays > 0) {
    const harvest = isResting(state, 'science') ? Math.floor(state.harvestDays / 2) : state.harvestDays
    effects.foodDays = (effects.foodDays ?? 0) + harvest
    effects.harvestDays = -state.harvestDays
    notes.push(`The greenhouse harvest came in: ${harvest === 1 ? 'a day' : `${harvest} days`} of fresh food.`)
  } else if (lunarNight && state.remembered.skippedPlanting && !hasBite('skipped-planting')) {
    notes.push('Nothing was planted, so there was no fresh food in the night.')
    lines.push(BITE_LINES.skippedPlanting)
    bites.push({ id: 'skipped-planting', cause: 7, day: night, text: 'No fresh food in the lunar night', lineId: BITE_LINES.skippedPlanting.lineId })
  }

  // The drill piles Moon soil on the roof, up to a cap.
  const drill = units(state, 'c06-drill')
  if (drill > 0 && state.meters.shielding < DAILY.shieldingCap) {
    effects.shielding = Math.min(DAILY.shieldingCap - state.meters.shielding, drill * DAILY.shieldingPerDrillUnit)
    notes.push('The drill piled more Moon soil on the roof.')
  }

  // On one night a part fails: a spare part fixes it, or Life Support takes the hit.
  if (night === DAILY.failureNight && !lunarNight) {
    if (state.spares > 0) {
      effects.spares = -1
      notes.push('A water pump broke overnight. You swapped it with a spare part.')
    } else {
      effects.lifeSupport = (effects.lifeSupport ?? 0) - DAILY.failureLifeSupportHit
      notes.push('A water pump broke overnight, and there was no spare part to fix it.')
      lines.push(BITE_LINES.noSpares)
      if (!hasBite('no-spares-pump')) {
        bites.push({ id: 'no-spares-pump', cause: 2, day: night, text: `Life Support −${DAILY.failureLifeSupportHit}`, lineId: BITE_LINES.noSpares.lineId })
      }
    }
  }

  let after = applyEffects(state, effects)
  const level = applyDoseLevel(state, after)
  after = level.state
  if (level.crossed) {
    notes.push(MODERATE_DOSE_NOTE)
    if (!isResting(after, 'safety')) lines.push(MODERATE_DOSE_LINE)
    bites.push(moderateDoseRecord(state.history.at(-1)?.challenge ?? 6, night))
  }

  // Crew health drops when the air or the food runs low.
  if (after.meters.lifeSupport < DAILY.lowLifeSupport || after.foodDays <= DAILY.lowFood) {
    const crewHealth = { ...after.crewHealth }
    for (const id of CREW_IDS) crewHealth[id] = shiftHealth(crewHealth[id], -1)
    after = { ...after, crewHealth }
    notes.push(after.foodDays <= DAILY.lowFood ? 'Food is running low, and the crew is getting weak.' : 'The air is getting stale, and the crew is getting tired.')
  }

  // Few supplies packed: the food runs out sooner, and the science officer says why.
  if (state.remembered.packedFewSupplies && after.foodDays <= 4 && !hasBite('few-supplies')) {
    lines.push(BITE_LINES.fewSupplies)
    bites.push({ id: 'few-supplies', cause: 2, day: night, text: `Food down to ${after.foodDays} days`, lineId: BITE_LINES.fewSupplies.lineId })
  }

  const changes = changesBetween(state, after)
  after = { ...after, day: state.day + 1, bites: [...after.bites, ...bites], timeline: [...state.timeline, { kind: 'night', lunar: lunarNight }] }
  after = checkFailure(after)
  after = { ...after, log: [...after.log, snapshot(after, lunarNight ? `Night ${after.day}` : `Day ${after.day}`)] }
  return { state: after, report: { day: after.day, lunarNight, changes, notes, lines } }
}

/**
 * How many nights the lunar night fast-forward plays. The real night lasts
 * about 14 Earth days [moon-facts]; the game squeezes it into 3 nights.
 */
export const LUNAR_NIGHTS = 3

/**
 * The lunar night (after challenge 12): several nights in a row, summed into
 * one card. Stops early if the mission fails partway.
 */
export function lunarNight(state: MissionState): { state: MissionState; report: NightReport } {
  let current = state
  const changesBefore = state
  const notes = new Set<string>()
  const lines: CrewLine[] = []
  for (let i = 0; i < LUNAR_NIGHTS && current.status !== 'ended'; i++) {
    const night = nightTick(current, true)
    current = night.state
    night.report.notes.forEach((note) => notes.add(note))
    lines.push(...night.report.lines.filter((line) => !lines.includes(line)))
  }
  return {
    state: current,
    report: {
      day: current.day,
      lunarNight: true,
      changes: changesBetween(changesBefore, current),
      notes: [...notes],
      lines,
    },
  }
}

/**
 * The tow after a flat battery: the walk back and the lost rover cost a
 * whole mission day (one night passes, with its background dose), and
 * lostRover is remembered for challenge 11.
 */
export function towNight(state: MissionState): { state: MissionState; report: NightReport } {
  const lost = { ...state, remembered: { ...state.remembered, lostRover: true } }
  const passed = nightTick(lost)
  const bite: BiteRecord = { id: 'rover-tow', cause: 8, day: state.day, text: 'The tow cost a whole day', lineId: TOW_LINE.lineId }
  return {
    state: {
      ...passed.state,
      bites: passed.state.bites.some((b) => b.id === bite.id) ? passed.state.bites : [...passed.state.bites, bite],
      // The timeline says "tow" (which replays as this whole step), not a plain night.
      timeline: [...state.timeline, { kind: 'tow' }],
    },
    report: {
      ...passed.report,
      notes: ['The rover’s battery ran flat. The crew towed you back, and it cost a whole day.', ...passed.report.notes],
      lines: [TOW_LINE, ...passed.report.lines],
    },
  }
}

export const TOW_LINE: CrewLine = { speakerId: 'commander', lineId: 'bite-rover-tow', text: 'We’ve lost the rover out there. From now on we walk.' }
