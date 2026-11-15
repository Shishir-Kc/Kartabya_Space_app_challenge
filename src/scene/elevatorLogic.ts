/**
 * Elevators at runtime: one small state machine per car. It lives outside
 * React, like the player, and is advanced every frame by the player
 * controller (only while playing, so pausing freezes a ride mid-shaft).
 *
 * A car only moves when someone chooses where it goes: the player picks a
 * floor on the car's panel (`chooseFloor`), or presses a call button at a
 * landing to bring an empty car there (`requestStop`). Standing in the car
 * sends it nowhere: the doors stay open until a floor is chosen.
 *
 * A ride: the doors close (never on the player: standing in the doorway
 * opens them again, and the ride waits until the doorway is clear), the car
 * moves with a gentle ease in and out, and if the player is inside it they
 * move with it and cannot walk. On arrival the player's level switches to
 * the stop's level and the doors open.
 */
import { carDoorway, carWalkable, contains, levelY, PLAYER_RADIUS } from '../maps/collision'
import type { Elevator, GameMap, Rect } from '../maps/types'
import { player } from '../state/player'

/** Seconds for the doors to open or close. */
export const DOOR_SECONDS = 1.1
/** With nobody inside, open doors close after this long. */
const AUTO_CLOSE_SECONDS = 6

type Phase = 'opening' | 'open' | 'closing' | 'closed' | 'moving'

export interface ElevatorState {
  def: Elevator
  /** The stop the car is at (or leaving from while moving). */
  stop: number
  /** Where it is going, or null. */
  target: number | null
  /** The target was chosen on the car's panel by the player inside (not a call from a landing). */
  chosen: boolean
  phase: Phase
  /** 0 = closed, 1 = open. */
  door: number
  /** Car floor height right now. */
  y: number
  /** Seconds in the current phase. */
  timer: number
  /** Ride progress 0..1 and its end heights. */
  progress: number
  fromY: number
  toY: number
  /** The player is riding this car. */
  riding: boolean
  /** Camera shake strength, set on start and stop and fading out. */
  shake: number
}

const states = new Map<string, ElevatorState>()
let map: GameMap | null = null

/**
 * What a car just did, for its sounds (src/audio/sfx.ts): the doors start
 * to open or close, it sets off (and how long the ride takes), it arrives;
 * 'reset' when a map loads and every car starts over.
 */
export type ElevatorEvent =
  | { kind: 'doors-open' | 'doors-close' | 'arrive'; state: ElevatorState }
  | { kind: 'depart'; state: ElevatorState; seconds: number }
  | { kind: 'reset' }

const eventListeners = new Set<(event: ElevatorEvent) => void>()

/** Subscribes to what the cars do. Returns the unsubscribe function. */
export function onElevatorEvent(listener: (event: ElevatorEvent) => void): () => void {
  eventListeners.add(listener)
  return () => {
    eventListeners.delete(listener)
  }
}

function emit(event: ElevatorEvent): void {
  for (const listener of eventListeners) listener(event)
}

/** Every phase change goes through here, so the sounds hear about it. */
function setPhase(state: ElevatorState, phase: Phase): void {
  const from = state.phase
  if (from === phase) return
  state.phase = phase
  if (from === 'moving') emit({ kind: 'arrive', state })
  if (phase === 'opening') emit({ kind: 'doors-open', state })
  else if (phase === 'closing') emit({ kind: 'doors-close', state })
  else if (phase === 'moving') emit({ kind: 'depart', state, seconds: rideSeconds(state) })
}

/** Seconds the ride to the car's target takes. */
function rideSeconds(state: ElevatorState): number {
  const legs = Math.max(1, Math.abs((state.target ?? state.stop) - state.stop))
  return state.def.rideSeconds * legs
}

/** Puts every car at its start stop with the doors closed. Called when a map loads. */
export function resetElevators(next: GameMap): void {
  map = next
  states.clear()
  for (const def of next.elevators ?? []) {
    const stop = def.stops[def.start]
    states.set(def.id, {
      def,
      stop: def.start,
      target: null,
      chosen: false,
      phase: 'closed',
      door: 0,
      y: levelY(next, stop?.level),
      timer: 0,
      progress: 0,
      fromY: 0,
      toY: 0,
      riding: false,
      shake: 0,
    })
  }
  emit({ kind: 'reset' })
}

export function elevatorStates(): IterableIterator<ElevatorState> {
  return states.values()
}

export function elevatorState(id: string): ElevatorState | undefined {
  return states.get(id)
}

function stopLevel(state: ElevatorState, index = state.stop): string {
  return state.def.stops[index]?.level ?? 'ground'
}

/** True if the player is standing in this car (car stopped at the player's level, or riding). */
export function playerInCar(state: ElevatorState): boolean {
  if (state.riding) return true
  if (state.phase === 'moving') return false
  return player.level === stopLevel(state) && contains(state.def.car, player.x, player.z)
}

/** The car the player is in, if any. */
export function carWithPlayer(): ElevatorState | null {
  for (const state of states.values()) if (playerInCar(state)) return state
  return null
}

/** True if the player stands in the car's open doorway at its current stop (between the car and the landing). */
export function inDoorway(state: ElevatorState): boolean {
  const stop = state.def.stops[state.stop]
  if (!stop || player.level !== stop.level) return false
  return contains(carDoorway(state.def, stop.door, 0), player.x, player.z)
}

/** The next stop after the current one, wrapping round. */
export function nextStop(state: ElevatorState): number {
  return (state.stop + 1) % state.def.stops.length
}

/**
 * Someone pressed the call button at a landing: the car comes to `stop`
 * (or opens its doors if it is already there). A call never sends the
 * player anywhere: while they are in the car, a call only opens the doors
 * at the car's own stop.
 */
export function requestStop(id: string, stop: number): void {
  const state = states.get(id)
  if (!state) return
  if (state.phase === 'moving') return
  if (stop !== state.stop && (playerInCar(state) || inDoorway(state))) return
  if (stop === state.stop) {
    if (state.phase === 'closed' || state.phase === 'closing') {
      setPhase(state, 'opening')
      state.timer = 0
    }
    return
  }
  state.target = stop
  state.chosen = false
  if (state.phase === 'open' || state.phase === 'opening') {
    setPhase(state, 'closing')
    state.timer = 0
  }
}

/**
 * The player inside picked a floor on the car's panel. The doors close and
 * the car goes there (once the doorway is clear). Picking the floor the
 * car is at, or picking during a ride, does nothing.
 */
export function chooseFloor(id: string, stop: number): boolean {
  const state = states.get(id)
  if (!state || state.phase === 'moving') return false
  if (stop === state.stop || stop < 0 || stop >= state.def.stops.length) return false
  if (!playerInCar(state)) return false
  state.target = stop
  state.chosen = true
  if (state.phase === 'open' || state.phase === 'opening') {
    setPhase(state, 'closing')
    state.timer = 0
  }
  return true
}

/** The panel's Door open button: opens the doors at the car's stop, unless it is on its way. */
export function openCarDoors(id: string): void {
  const state = states.get(id)
  if (!state || state.phase === 'moving') return
  // Holding the doors before a chosen ride starts puts the ride off until they close again.
  if (state.phase === 'closing' || state.phase === 'closed') {
    if (state.target !== null) {
      state.target = null
      state.chosen = false
    }
    setPhase(state, 'opening')
    state.timer = 0
  }
}

/** The panel's Door close button: shuts the doors (they still won't shut on the player). */
export function closeCarDoors(id: string): void {
  const state = states.get(id)
  if (!state || state.phase === 'moving') return
  if (state.phase === 'open' || state.phase === 'opening') {
    setPhase(state, 'closing')
    state.timer = 0
  }
}

function ease(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** The car's keys, read only while the player stands in a car: 1 to 9 pick a floor, O opens the doors, C closes them. */
const FLOOR_KEY = /^(?:Digit|Numpad)([1-9])$/

/**
 * A key pressed while playing. Returns true if it was the elevator's (the
 * player is in a car and it is one of its keys); outside a car, or during a
 * ride for the door keys, it does nothing and returns false.
 */
export function elevatorKey(code: string): boolean {
  const car = carWithPlayer()
  if (!car) return false
  const floor = FLOOR_KEY.exec(code)
  if (floor) {
    chooseFloor(car.def.id, Number(floor[1]) - 1)
    return true
  }
  if (code === 'KeyO') {
    openCarDoors(car.def.id)
    return true
  }
  if (code === 'KeyC') {
    closeCarDoors(car.def.id)
    return true
  }
  return false
}

/** Advances every car by `dt` seconds. */
export function updateElevators(dt: number): void {
  if (!map) return
  for (const state of states.values()) {
    state.timer += dt
    state.shake = Math.max(0, state.shake - dt * 2.5)
    const inside = playerInCar(state)
    // A floor was chosen, then the player walked out before the doors shut: the car stays where it is.
    if (state.chosen && state.phase !== 'moving' && !inside && !inDoorway(state)) {
      state.target = null
      state.chosen = false
    }

    switch (state.phase) {
      case 'opening':
        state.door = Math.min(1, state.door + dt / DOOR_SECONDS)
        if (state.door >= 1) {
          setPhase(state, 'open')
          state.timer = 0
        }
        break
      case 'open':
        // No auto-depart: with the player inside and nothing chosen, the doors just stay open.
        if (state.target !== null && state.target !== state.stop && !inDoorway(state)) {
          setPhase(state, 'closing')
          state.timer = 0
        } else if (!inside && !inDoorway(state) && state.timer > AUTO_CLOSE_SECONDS) {
          setPhase(state, 'closing')
          state.timer = 0
        }
        break
      case 'closing':
        // Never shut on the player: back open if they step into the doorway.
        if (inDoorway(state)) {
          setPhase(state, 'opening')
          state.timer = 0
          break
        }
        state.door = Math.max(0, state.door - dt / DOOR_SECONDS)
        if (state.door <= 0) {
          setPhase(state, 'closed')
          state.timer = 0
        }
        break
      case 'closed':
        if (state.target !== null && state.target !== state.stop) {
          state.riding = inside
          if (state.riding) player.route = null
          state.fromY = state.y
          state.toY = levelY(map, stopLevel(state, state.target))
          state.progress = 0
          setPhase(state, 'moving')
          state.timer = 0
          state.shake = 1
        } else if (state.target === state.stop) {
          state.target = null
          state.chosen = false
          setPhase(state, 'opening')
          state.timer = 0
        }
        break
      case 'moving': {
        const distance = Math.abs(state.toY - state.fromY)
        const seconds = rideSeconds(state)
        state.progress = Math.min(1, state.progress + dt / Math.max(0.1, seconds))
        state.y = state.fromY + (state.toY - state.fromY) * ease(state.progress)
        if (state.progress >= 1 || distance === 0) {
          state.stop = state.target ?? state.stop
          state.target = null
          state.chosen = false
          state.y = state.toY
          setPhase(state, 'opening')
          state.timer = 0
          state.shake = 1
          if (state.riding) {
            player.level = stopLevel(state)
            state.riding = false
          }
        }
        break
      }
    }
  }
}

/**
 * Extra places to stand on a level right now: each car stopped there, and
 * its doorway while the doors are (nearly) open.
 */
export function elevatorWalkable(level: string, radius = PLAYER_RADIUS): Rect[] {
  const rects: Rect[] = []
  for (const state of states.values()) {
    if (state.phase === 'moving' || stopLevel(state) !== level) continue
    rects.push(carWalkable(state.def, radius))
    const stop = state.def.stops[state.stop]
    if (stop && state.door > 0.85) rects.push(carDoorway(state.def, stop.door, radius))
  }
  return rects
}
