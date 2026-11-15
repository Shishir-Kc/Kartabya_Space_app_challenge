/**
 * The spacecraft's flight: how far through the launch and the trip to the
 * Moon we are, plus the cabin effects a sequence drives (shake, lights).
 *
 * Like the player's position, this is a plain mutable object, not store
 * state: the space view and the camera read it every frame, and a launch
 * changes it every frame.
 */

export const flight = {
  /** 0 on the pad, 1 in space: the sky turns from dusk to black and Earth's curve appears. */
  ascent: 1,
  /** 0 just after launch, 1 arriving at the Moon: Earth shrinks behind us, the Moon grows ahead. */
  transit: 0.1,
  /** Camera shake, in metres. */
  shake: 0,
  /** Cabin light level, 1 = normal. The countdown dims the cabin a little. */
  cabinLight: 1,
  /** Seconds since the engines cut off, or -1 before that: the pen and checklist start drifting then. */
  sinceCutoff: -1,
  /** The escape tower's shroud over the cockpit windows: 1 covering them, 0 gone (it flies off at jettison). */
  shroud: 0,
  /** Pushed back into the seat by a burn: how far the eyes move back, metres. */
  push: 0,
  /** Coming down to land: the view outside is the landing site, not Earth and the Moon. */
  descent: false,
}

/** Transit progress right after the launch. */
export const TRANSIT_START = 0.1

/**
 * Transit progress after each spacecraft challenge. Until the real
 * challenges exist (Phase 4), using a challenge's console advances it.
 */
export const TRANSIT_AFTER: Readonly<Record<number, number>> = {
  3: 0.4,
  4: 0.7,
  5: 1,
}

/** Moves transit forward (never back) after a challenge. */
export function advanceTransit(challengeId: number): void {
  const next = TRANSIT_AFTER[challengeId]
  if (next !== undefined) flight.transit = Math.max(flight.transit, next)
}

/** Back on the pad, before the launch. Dev builds take `?transit=0.5` to start part way to the Moon. */
export function resetFlight(onPad: boolean): void {
  flight.ascent = onPad ? 0 : 1
  flight.transit = devTransit() ?? TRANSIT_START
  flight.shake = 0
  flight.cabinLight = 1
  flight.sinceCutoff = onPad ? -1 : 10
  flight.shroud = onPad ? 1 : 0
  flight.push = 0
  flight.descent = false
}

function devTransit(): number | undefined {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return undefined
  const value = Number(new URLSearchParams(window.location.search).get('transit'))
  return Number.isFinite(value) && value > 0 ? Math.min(1, value) : undefined
}
