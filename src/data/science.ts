/**
 * The real numbers behind the game, in one place, each with the reference
 * it comes from (an id in ./sources.json). The game's meters run in their
 * own units (0 to 100), so most effects are game-scale; this file is where
 * a real figure turns into a game number, and it says how.
 *
 * Rule: a number here is either copied from its reference or worked out
 * from numbers that are, and the working is written next to it.
 */

/** Copied from the references, unchanged. */
export const REAL = {
  /** NASA-STD-3001: an astronaut's career effective dose limit. [rad-brief] */
  careerLimitMsv: 600,
  /** NASA-STD-3001: the short-term limit for one solar particle event. [rad-brief] */
  solarEventLimitMsv: 250,
  /** Background dose on the lunar surface, about 0.5 mSv a day. [rad-brief] */
  surfaceDoseMsvPerDay: 0.5,
  /** Aluminium and polyethylene shielding cut solar-storm dose by about half. [rad-brief] */
  shieldingCut: 0.5,
  /** A storm shelter adds about 10 cm of water equivalent. [rad-brief] */
  shelterWaterCm: 10,
  /** About two weeks of sunlight, then about two weeks of darkness. [moon-facts] */
  lunarNightEarthDays: 14,
  /** Surface temperature in full Sun and in the dark, °C. [moon-facts] */
  dayTempC: 127,
  nightTempC: -173,
  /** NASA's studied lunar fission reactor, kilowatts electric. [fsp] */
  reactorKw: 40,
  /** Food plus packaging per person per day on the space station, kg. [food-hrr] */
  foodKgPerPersonDay: 1.8,
  /** Space station astronauts who reported headaches, in a study of 49. [co2-brief] */
  co2Headaches: { reported: 19, studied: 49 },
  /** The Apollo rover's battery range and the walkback limit crews kept to, km. [rover-brief] */
  roverBatteryKm: 92,
  roverWalkbackKm: 7.6,
  /** Regolith thickness that makes good radiation shielding, m. [safe-haven] */
  regolithShieldM: [3, 7],
  /** Share of the soil the LCROSS impact hit that was water ("nearly five percent"). [isru] */
  lcrossWaterShare: 0.05,
  /** Each flare class letter is about ten times stronger than the one before. [flares] */
  flareClassStep: 10,
  /** NASA's critical overload: 10-hour work days on more than 3 days a week. [sleep] */
  overloadHoursPerDay: 10,
  /** Expected one-way delay for voice from Earth on Artemis (nominal Orion), seconds. [comm-delay] */
  voiceDelaySeconds: 5.6,
  /** One-way telemetry delay during Apollo, seconds. [comm-delay] */
  apolloDelaySeconds: 1.3,
  /** M- and X-class solar flares DONKI recorded in 2024 (982 M, 54 X). Many never send out a radiation storm. [donki] */
  flaresMX2024: 1036,
  /** Solar energetic particle (SEP) events, the radiation storms that endanger astronauts, DONKI recorded in 2024, and that year's days. [donki] */
  sepEvents2024: 119,
  daysIn2024: 366,
} as const

/**
 * How often radiation storms come in the game. Real basis: the solar
 * energetic particle (SEP) events of 2024, the storms that put astronauts
 * at risk [donki] (most flares never send one out). Game choice: time is
 * sped up, so one minute of play stands for nine hours of 2024's Sun. That
 * gives about 0.12 storms per minute of play: often enough to matter, rare
 * enough that a quick, lucky mission may see none.
 */
export const REAL_HOURS_PER_GAME_MINUTE = 9
export const STORMS_PER_GAME_MINUTE = (REAL.sepEvents2024 / REAL.daysIn2024 / 24) * REAL_HOURS_PER_GAME_MINUTE

/**
 * How long Houston's voice takes to reach the crew, in seconds: none on
 * Earth (the launch center), the Artemis one-way voice delay anywhere past
 * it. The game uses the real figure unchanged.
 */
export function radioDelaySeconds(mapId: string): number {
  return mapId === 'launch-center' ? 0 : REAL.voiceDelaySeconds
}

/**
 * Radiation dose. The game counts dose in points; the point is sized so the
 * mission's "high" level (80 points, src/state/mission.ts) is the real
 * 250 mSv limit for one solar particle event. So 1 point = 250 / 80 =
 * 3.125 mSv.
 */
export const DOSE_POINTS_HIGH = 80
export const MSV_PER_DOSE_POINT = REAL.solarEventLimitMsv / DOSE_POINTS_HIGH

/** Millisieverts for a number of dose points. */
export function doseToMsv(points: number): number {
  return points * MSV_PER_DOSE_POINT
}

/** "16 mSv", or "0.5 mSv" for small amounts. */
export function formatMsv(msv: number): string {
  const value = Math.abs(msv) < 10 ? Math.round(msv * 10) / 10 : Math.round(msv)
  return `${value} mSv`
}

/** The background dose of one day on the surface, in points (0.5 mSv / 3.125 = 0.16). */
export const SURFACE_DOSE_POINTS_PER_DAY = REAL.surfaceDoseMsvPerDay / MSV_PER_DOSE_POINT
