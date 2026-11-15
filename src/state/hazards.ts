/**
 * Space hazards: solar storms in transit, solar storms at the outpost and
 * meteoroid hits. They are natural events, so they come at random: 0 to 3
 * of each per run, more likely the longer the mission takes. This file has
 * the rules as pure functions (rates, fairness, the seeded random numbers,
 * which real flare a storm is); src/scene/run.ts runs the clock.
 */
import { DONKI } from '../data/donki'
import { STORMS_PER_GAME_MINUTE } from '../data/science'
import type { MissionState } from './mission'

export type HazardKind = 'transitStorm' | 'outpostStorm' | 'meteoroid'

export const HAZARD_KINDS: readonly HazardKind[] = ['transitStorm', 'outpostStorm', 'meteoroid']

/** Which challenge's panel each hazard opens. */
export const HAZARD_CHALLENGE: Record<HazardKind, number> = { transitStorm: 4, outpostStorm: 10, meteoroid: 11 }

/** Where each hazard can happen. */
export const HAZARD_MAP: Record<HazardKind, string> = { transitStorm: 'spacecraft', outpostStorm: 'outpost', meteoroid: 'outpost' }

export const HAZARD_LABEL: Record<HazardKind, string> = {
  transitStorm: 'Solar storm in transit',
  outpostStorm: 'Solar storm at the outpost',
  meteoroid: 'Meteoroid hit',
}

/** Fairness: at most 3 of each, none in the first 30 s on a map, 60 s between two of the same kind. */
export const HAZARD_RULES = { max: 3, graceSeconds: 30, spacingSeconds: 60 } as const

/**
 * Meteoroid hits per minute of play. TODO: source. NASA's Meteoroid
 * Environment Office gives no usable rate of hits on a solar panel (direct
 * strikes are rated low risk; ejecta is modelled separately), so this is a
 * game-scale number.
 */
export const METEOROIDS_PER_GAME_MINUTE = 0.07

/** At the outpost, every mission day makes hazards this much more likely (the longer you stay, the more can happen). */
export const PER_DAY_GROWTH = 0.12

/** Expected hazards of a kind per minute of play now. */
export function ratePerMinute(kind: HazardKind, state: Pick<MissionState, 'day'>): number {
  const growth = 1 + PER_DAY_GROWTH * Math.max(0, state.day - 1)
  if (kind === 'transitStorm') return STORMS_PER_GAME_MINUTE
  if (kind === 'outpostStorm') return STORMS_PER_GAME_MINUTE * growth
  return METEOROIDS_PER_GAME_MINUTE * growth
}

/** The chance a hazard starts within `seconds` of play (a Poisson process). */
export function chanceWithin(kind: HazardKind, state: Pick<MissionState, 'day'>, seconds: number): number {
  return 1 - Math.exp((-ratePerMinute(kind, state) * seconds) / 60)
}

/**
 * How many hazards a mission of this length usually sees (capped at 3 of
 * each): minutes played on the spacecraft and at the outpost, and the
 * mission days spent there.
 */
export function expectedHazards(transitMinutes: number, outpostMinutes: number, days: number): Record<HazardKind, number> {
  const playable = (minutes: number) => Math.max(0, minutes - HAZARD_RULES.graceSeconds / 60)
  const midDay = { day: 1 + Math.max(0, days - 1) / 2 }
  const cap = (n: number) => Math.min(HAZARD_RULES.max, n)
  return {
    transitStorm: cap(ratePerMinute('transitStorm', midDay) * playable(transitMinutes)),
    outpostStorm: cap(ratePerMinute('outpostStorm', midDay) * playable(outpostMinutes)),
    meteoroid: cap(ratePerMinute('meteoroid', midDay) * playable(outpostMinutes)),
  }
}

// ---------- Seeded random numbers ----------

/** A small, fast seeded generator (mulberry32): the same seed gives the same run of numbers. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A new seed for a run. Dev builds take `?seed=1234`. */
export function newSeed(): number {
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    const value = Number(new URLSearchParams(window.location?.search ?? '').get('seed'))
    if (Number.isInteger(value) && value > 0) return value
  }
  return Math.floor(Math.random() * 2 ** 31) + 1
}

export type HazardMode = 'random' | 'none' | 'max'

/** Dev builds take `?hazards=none` (never) or `?hazards=max` (as soon as the fairness rules allow, up to 3 each). */
export function devHazardMode(): HazardMode {
  if (typeof window === 'undefined' || !import.meta.env?.DEV) return 'random'
  const value = new URLSearchParams(window.location?.search ?? '').get('hazards')
  return value === 'none' || value === 'max' ? value : 'random'
}

// ---------- Which real flare ----------

/**
 * A real archived flare this run hasn't used yet (each storm is a different
 * one), preferring flares that sent out a radiation storm (a linked SEP event).
 */
export function drawFlare(state: Pick<MissionState, 'usedFlares'>, random: () => number): string {
  const unused = DONKI.events.filter((event) => !state.usedFlares.includes(event.id))
  const withSep = unused.filter((event) => event.sep)
  const pool = withSep.length ? withSep : unused.length ? unused : DONKI.events
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!.id
}

/**
 * A hazard begins: it is counted, a storm gets its own real flare, and the
 * step is written to the run's timeline (so the handbook can replay it).
 */
export function startHazard(state: MissionState, kind: HazardKind, random: () => number): MissionState {
  return applyHazard(state, kind, kind !== 'meteoroid' ? drawFlare(state, random) : undefined)
}

/** A hazard begins with a known flare (a replay uses the run's own). */
export function applyHazard(state: MissionState, kind: HazardKind, flareId: string | undefined): MissionState {
  return {
    ...state,
    hazards: { ...state.hazards, [kind]: state.hazards[kind] + 1 },
    usedFlares: flareId ? [...state.usedFlares, flareId] : state.usedFlares,
    activeFlareId: flareId ?? state.activeFlareId,
    timeline: [...state.timeline, { kind: 'hazard', hazard: kind, flareId }],
  }
}

/** Storms counted together, for the banner's tally. */
export function stormCount(state: Pick<MissionState, 'hazards'>): number {
  return state.hazards.transitStorm + state.hazards.outpostStorm
}
