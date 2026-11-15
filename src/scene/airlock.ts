/**
 * The airlock: a small chamber between the outpost and the surface, with an
 * inner and an outer door. Only one door is ever open, so the outpost's air
 * never escapes.
 *
 * Going out: the inner door closes, the air is pumped out of the chamber
 * (the gauge falls to 0 kPa), then the outer door opens. Coming in: the
 * reverse. A player inside the chamber changes suit halfway through the
 * cycle (a quick fade): the blue coverall indoors, the white surface suit
 * and helmet outside.
 */
import { doorwayRect, listDoors, placeAt, type Door } from '../maps/collision'
import type { InteractTarget } from '../maps/targets'
import type { Airlock, GameMap, Rect } from '../maps/types'
import { player } from '../state/player'
import { useGame } from '../state/store'
import { fireEvent } from './cards'

export type AirlockPhase = 'inside' | 'outside' | 'to-outside' | 'to-inside'

/** Doors open or close fully in about this long. */
const DOOR_SECONDS = 0.9

export interface AirlockState {
  def: Airlock
  phase: AirlockPhase
  /** Chamber pressure, kPa. */
  pressure: number
  /** How far each door is open, 0 to 1. */
  inner: number
  outer: number
  innerDoor: Door
  outerDoor: Door
  /** Wearing the surface suit (with helmet), or the indoor coverall. */
  suited: boolean
}

let state: AirlockState | null = null
let mapRef: GameMap | null = null

/** Sets up a map's airlock. The player arrives outside, so the outer door starts open. */
export function resetAirlock(map: GameMap, outside: boolean): void {
  mapRef = map
  const def = map.airlock
  const doors = listDoors(map)
  const innerDoor = doors.find((door) => door.airlock === 'inner')
  const outerDoor = doors.find((door) => door.airlock === 'outer')
  if (!def || !innerDoor || !outerDoor) {
    state = null
    return
  }
  state = {
    def,
    phase: outside ? 'outside' : 'inside',
    pressure: outside ? 0 : def.pressure,
    inner: outside ? 0 : 1,
    outer: outside ? 1 : 0,
    innerDoor,
    outerDoor,
    suited: outside,
  }
}

export function airlockState(): AirlockState | null {
  return state
}

/** Is the player standing in the airlock chamber? */
function inChamber(): boolean {
  if (!state || !mapRef) return false
  return placeAt(mapRef, player.x, player.z, player.level)?.id === state.def.chamber
}

/** Starts a cycle toward the outside or the inside, if the airlock isn't already there or cycling. */
export function requestCycle(toOutside: boolean): void {
  if (!state) return
  if (toOutside && state.phase === 'inside') state.phase = 'to-outside'
  else if (!toOutside && state.phase === 'outside') state.phase = 'to-inside'
  else return
  fireEvent('airlock')
}

/** Changes suit with a quick fade, if the player is in the chamber. */
function swapSuit(suited: boolean): void {
  if (!state || state.suited === suited || !inChamber()) return
  state.suited = suited
  useGame.getState().flashFade()
}

/** Moves the doors and the pressure along. Runs only while playing. */
export function updateAirlock(dt: number): void {
  if (!state) return
  const s = state
  const door = dt / DOOR_SECONDS
  const pump = (s.def.pressure * dt) / s.def.cycleSeconds
  switch (s.phase) {
    case 'to-outside':
      if (s.inner > 0) {
        s.inner = Math.max(0, s.inner - door)
      } else if (s.pressure > 0) {
        s.pressure = Math.max(0, s.pressure - pump)
        if (s.pressure < s.def.pressure / 2) swapSuit(true)
      } else {
        s.outer = Math.min(1, s.outer + door)
        if (s.outer >= 1) s.phase = 'outside'
      }
      break
    case 'to-inside':
      if (s.outer > 0) {
        s.outer = Math.max(0, s.outer - door)
      } else if (s.pressure < s.def.pressure) {
        s.pressure = Math.min(s.def.pressure, s.pressure + pump)
        if (s.pressure > s.def.pressure / 2) swapSuit(false)
      } else {
        s.inner = Math.min(1, s.inner + door)
        if (s.inner >= 1) s.phase = 'inside'
      }
      break
    default:
      break
  }
  // Walking out through the trench or in through the corridor sets the suit too,
  // in case the player slipped through while a door was still open.
  if (mapRef) {
    const place = placeAt(mapRef, player.x, player.z, player.level)
    if (place?.kind === 'zone' && !s.suited) s.suited = true
  }
}

/** Walkable doorways while the doors are (almost) fully open. */
export function airlockWalkable(level: string): Rect[] {
  if (!state) return []
  const rects: Rect[] = []
  if (state.inner > 0.85 && state.innerDoor.level === level) {
    const rect = doorwayRect(state.innerDoor)
    if (rect) rects.push(rect)
  }
  if (state.outer > 0.85 && state.outerDoor.level === level) {
    const rect = doorwayRect(state.outerDoor)
    if (rect) rects.push(rect)
  }
  return rects
}

/** A point just off a door, on the side away from the chamber. */
function besideDoor(map: GameMap, door: Door, chamber: string): { x: number; z: number; place: string | undefined } {
  for (const side of [-1, 1]) {
    const point =
      door.runs === 'x' ? { x: door.center.x + 0.6, z: door.center.z + side * 0.9 } : { x: door.center.x + side * 0.9, z: door.center.z + 0.6 }
    const place = placeAt(map, point.x, point.z, door.level)
    if (place && place.id !== chamber) return { ...point, place: place.id }
  }
  return { x: door.center.x, z: door.center.z, place: undefined }
}

/** What the player can press: the panel in the chamber, and a button beside each door from the far side. */
export function airlockTargets(map: GameMap): InteractTarget[] {
  if (!state) return []
  const s = state
  const targets: InteractTarget[] = []
  if (s.phase === 'inside' || s.phase === 'outside') {
    targets.push({
      id: 'airlock:panel',
      kind: 'airlock',
      prompt: s.phase === 'inside' ? 'Cycle the airlock to go outside' : 'Cycle the airlock to come inside',
      point: s.def.panel,
      roomId: s.def.chamber,
      level: s.innerDoor.level,
    })
  }
  if (s.phase === 'inside') {
    const outside = besideDoor(map, s.outerDoor, s.def.chamber)
    targets.push({ id: 'airlock:outer', kind: 'airlock', prompt: 'Open the airlock', point: outside, roomId: outside.place, level: s.outerDoor.level })
  }
  if (s.phase === 'outside') {
    const corridor = besideDoor(map, s.innerDoor, s.def.chamber)
    targets.push({ id: 'airlock:inner', kind: 'airlock', prompt: 'Open the airlock', point: corridor, roomId: corridor.place, level: s.innerDoor.level })
  }
  return targets
}

/** Uses an airlock target (the E key). */
export function useAirlock(id: string): void {
  if (!state) return
  if (id === 'airlock:panel') requestCycle(state.phase === 'inside')
  else if (id === 'airlock:outer') requestCycle(true)
  else if (id === 'airlock:inner') requestCycle(false)
}
