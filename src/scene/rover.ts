/**
 * The lunar rover's driving, without a physics engine.
 *
 * - Steering is a simple bicycle model: the faster you go, the quicker a
 *   given steer turns you.
 * - The body follows the ground under its four wheels: their average height
 *   sets how high it sits, the front-to-back and side-to-side differences
 *   set its pitch and roll (smoothed like springs, so it rocks over bumps).
 * - Low gravity: the body keeps its vertical speed, so over a crest at speed
 *   it leaves the ground and floats back down at 1.62 m/s^2.
 * - Boulders, the buried outpost, props, the boundary and slopes steeper
 *   than `maxGrade` stop it with a bump.
 * - The battery drains per metre, more climbing and with the headlights on.
 *   The home line is the charge needed to drive straight home plus a margin.
 *
 * Apollo crews followed a similar rule, the walk-back limit: never drive
 * further than you could walk home if the rover broke down. (For the crew's
 * lines in Phase 7.)
 */
import { buildCollision, isWalkable, type CollisionModel } from '../maps/collision'
import { GROUND_LEVEL } from '../maps/types'
import { ROVER_BLOCKING_ROCK, rockHeight } from '../maps/lunarScatter'
import type { GameMap, Rover } from '../maps/types'
import { groundHeight } from './kit/exterior'
import { lightAt } from './kit/lunarLight'

/** Lunar gravity, m/s^2. */
export const MOON_GRAVITY = 1.62
/** The rover's collision radius: how close its centre gets to anything solid. */
export const ROVER_RADIUS = 1.35
const ACCELERATION = 1.8
const BRAKING = 4
const COAST_DRAG = 0.5
/** Steering lock, radians. */
const MAX_STEER = 0.55
/** Headlights come on below this much baked sunlight, and go off above the second. */
const DARK = 0.1
const BRIGHT = 0.16

export interface RoverState {
  def: Rover
  x: number
  z: number
  /** Heading, like the player's yaw: 0 faces north (-z). */
  yaw: number
  /** Height of the body's base, vertical speed, and the smoothed tilt. */
  y: number
  vy: number
  pitch: number
  roll: number
  airborne: boolean
  /** Forward speed, m/s (negative in reverse). */
  speed: number
  steer: number
  /** Percent, 0 to 100. */
  battery: number
  boostLeft: number
  boostWait: number
  boosting: boolean
  headlights: boolean
  driving: boolean
  /** The battery ran flat: towed home, can't be driven again this run. */
  lost: boolean
  /** The safety officer has warned about the home line (once). */
  warned: boolean
  /** The player has said they shouldn't go further (once per time past the line). */
  saidTooFar: boolean
  /** Wheel rotation, radians, for drawing. */
  wheelSpin: number
  /** Metres driven, for wheel tracks. */
  odometer: number
  /** Battery minus the home line last step: the warning comes when this crosses zero. */
  margin: number
}

export interface RoverInput {
  /** -1 brake or reverse, 0, 1 accelerate. */
  throttle: number
  /** -1 right, 0, 1 left. */
  steer: number
  boost: boolean
  /** Space: the handbrake. */
  brake?: boolean
}

export type RoverEvent = 'bump' | 'home-line' | 'too-far' | 'flat' | 'landed'

let state: RoverState | null = null
let model: CollisionModel | null = null
let ground: ((x: number, z: number) => number) | null = null
let rocks: ((x: number, z: number) => number) | null = null
/** Ground under a wheel: the terrain plus any rock it is riding over. */
const under = (x: number, z: number) => ground!(x, z) + (rocks ? rocks(x, z) : 0)
let mapRef: GameMap | null = null

export function roverState(): RoverState | null {
  return state
}

/** Parks the map's rover, full battery. */
export function resetRover(map: GameMap): void {
  mapRef = map
  const def = map.rover
  if (!def) {
    state = null
    model = null
    ground = null
    return
  }
  model = buildCollision(map, ROVER_RADIUS, GROUND_LEVEL, ROVER_BLOCKING_ROCK)
  ground = groundHeight(map)
  rocks = rockHeight(map)
  const y = ground(def.spawn.x, def.spawn.z)
  state = {
    def,
    x: def.spawn.x,
    z: def.spawn.z,
    yaw: def.spawn.yaw,
    y,
    vy: 0,
    pitch: 0,
    roll: 0,
    airborne: false,
    speed: 0,
    steer: 0,
    battery: 100,
    boostLeft: def.boost.seconds,
    boostWait: 0,
    boosting: false,
    headlights: false,
    driving: false,
    lost: false,
    warned: false,
    saidTooFar: false,
    wheelSpin: 0,
    odometer: 0,
    margin: 100,
  }
  settle(state, 1)
}

/**
 * The drive home from the ice, done for the player: the rover is parked
 * where it started, with the charge a direct drive home would have used
 * taken off, and the player is out of it.
 */
export function parkRoverAtHome(): void {
  const s = state
  if (!s || s.lost) return
  s.battery = Math.max(1, s.battery - homeLine(s) / (1 + s.def.battery.homeMargin))
  Object.assign(s, { x: s.def.spawn.x, z: s.def.spawn.z, yaw: s.def.spawn.yaw, speed: 0, steer: 0, driving: false, airborne: false })
  settle(s, 1)
}

/** The way a rover with this heading drives forward, in world (x, z): yaw 0 is north (−z). */
export function roverForward(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) }
}

/** The charge (percent) needed to drive straight home from here, with the margin. */
export function homeLine(s: RoverState): number {
  const distance = Math.hypot(s.x - s.def.home.x, s.z - s.def.home.z)
  return distance * s.def.battery.perMetre * (1 + s.def.battery.homeMargin) + 2
}

/** Heights of the ground under the four wheels: front left, front right, rear left, rear right. */
function wheelHeights(s: RoverState): [number, number, number, number] {
  const g = under
  const fx = -Math.sin(s.yaw)
  const fz = -Math.cos(s.yaw)
  const rx = Math.cos(s.yaw)
  const rz = -Math.sin(s.yaw)
  const b = s.def.wheels.base / 2
  const t = s.def.wheels.track / 2
  return [
    g(s.x + fx * b - rx * t, s.z + fz * b - rz * t),
    g(s.x + fx * b + rx * t, s.z + fz * b + rz * t),
    g(s.x - fx * b - rx * t, s.z - fz * b - rz * t),
    g(s.x - fx * b + rx * t, s.z - fz * b + rz * t),
  ]
}

/** The tallest rock under any of the four wheels if the rover were at (x, z). */
function rockUnderWheels(s: RoverState, x: number, z: number): number {
  if (!rocks) return 0
  const fx = -Math.sin(s.yaw)
  const fz = -Math.cos(s.yaw)
  const rx = Math.cos(s.yaw)
  const rz = -Math.sin(s.yaw)
  const b = s.def.wheels.base / 2
  const t = s.def.wheels.track / 2
  let best = 0
  for (const along of [-b, b]) {
    for (const across of [-t, t]) best = Math.max(best, rocks(x + fx * along + rx * across, z + fz * along + rz * across))
  }
  return best
}

/** Eases pitch and roll toward the ground under the wheels. */
function settle(s: RoverState, k: number): void {
  const [fl, fr, rl, rr] = wheelHeights(s)
  const pitch = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, s.def.wheels.base)
  const roll = Math.atan2((fr + rr) / 2 - (fl + rl) / 2, s.def.wheels.track)
  s.pitch += (pitch - s.pitch) * k
  s.roll += (roll - s.roll) * k
}

/** Can the rover's centre be here? */
function free(x: number, z: number): boolean {
  return model ? isWalkable(model, x, z) : true
}

/**
 * One step of driving. Returns what happened that the game should react
 * to: a bump, crossing the home line, going too far past it, a flat battery.
 */
export function updateRover(dt: number, input: RoverInput): RoverEvent[] {
  const s = state
  const events: RoverEvent[] = []
  if (!s || !ground || !mapRef) return events
  const def = s.def

  // ---- Throttle, brakes, boost ----
  if (input.boost && s.boostLeft > 0 && s.speed > 0.5 && s.battery > 0) {
    s.boosting = true
    s.boostLeft = Math.max(0, s.boostLeft - dt)
    if (s.boostLeft === 0) s.boostWait = def.boost.recharge
  } else {
    s.boosting = false
    if (s.boostWait > 0) s.boostWait = Math.max(0, s.boostWait - dt)
    else s.boostLeft = Math.min(def.boost.seconds, s.boostLeft + dt * 0.5)
  }
  const top = def.topSpeed * (s.boosting ? def.boost.factor : 1)
  const dead = s.battery <= 0 || !s.driving
  if (!s.airborne) {
    if (dead || input.brake) {
      s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), BRAKING * (input.brake ? 1.5 : 1) * dt)
    } else if (input.throttle > 0) {
      s.speed = s.speed < 0 ? Math.min(0, s.speed + BRAKING * dt) : Math.min(top, s.speed + ACCELERATION * (s.boosting ? 1.6 : 1) * dt)
    } else if (input.throttle < 0) {
      s.speed = s.speed > 0 ? Math.max(0, s.speed - BRAKING * dt) : Math.max(-def.reverseSpeed, s.speed - ACCELERATION * 0.6 * dt)
    } else {
      s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), COAST_DRAG * dt)
    }
    if (s.speed > top) s.speed = Math.max(top, s.speed - BRAKING * dt)
  }

  // ---- Steering (bicycle model) ----
  s.steer += ((dead ? 0 : input.steer) * MAX_STEER - s.steer) * Math.min(1, 6 * dt)
  if (!s.airborne) s.yaw += (s.speed / def.wheels.base) * Math.tan(s.steer) * dt

  // ---- Move, unless something solid or too steep is in the way ----
  const { x: fx, z: fz } = roverForward(s.yaw)
  const step = s.speed * dt
  const nx = s.x + fx * step
  const nz = s.z + fz * step
  const here = ground(s.x, s.z)
  // Look a little ahead for walls too steep to climb.
  const probe = Math.sign(step) * 1.2
  const ahead = ground(s.x + fx * probe, s.z + fz * probe)
  const tooSteep = !s.airborne && (ahead - here) / 1.2 > def.maxGrade
  if (step !== 0 && (!free(nx, nz) || tooSteep)) {
    if (Math.abs(s.speed) > 0.8) events.push('bump')
    s.speed = -s.speed * 0.2
  } else if (step !== 0) {
    const moved = Math.abs(step)
    const climb = Math.max(0, ground(nx, nz) - here)
    // Bumping over rocks takes a little speed and a little more charge.
    const rocky = rockUnderWheels(s, nx, nz)
    if (rocky > 0.03) s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), 0.9 * dt)
    s.x = nx
    s.z = nz
    s.odometer += moved
    s.wheelSpin += step / def.wheels.radius
    // ---- Battery ----
    const drain =
      (moved + climb * def.battery.perMetreClimbed) * def.battery.perMetre * (s.headlights ? def.battery.headlights : 1) * (rocky > 0.03 ? 1.3 : 1)
    const before = s.battery
    s.battery = Math.max(0, s.battery - drain)
    const line = homeLine(s)
    const margin = s.battery - line
    if (s.margin > 0 && margin <= 0 && !s.warned) {
      s.warned = true
      events.push('home-line')
    }
    s.margin = margin
    if (s.battery < line - 3 && !s.saidTooFar) {
      s.saidTooFar = true
      events.push('too-far')
    }
    if (s.battery > line + 3) s.saidTooFar = false
    if (before > 0 && s.battery === 0) events.push('flat')
  }

  // ---- Height: follow the ground, or fly in low gravity ----
  const [fl, fr, rl, rr] = wheelHeights(s)
  const groundY = (fl + fr + rl + rr) / 4
  const wasAirborne = s.airborne
  s.vy -= MOON_GRAVITY * dt
  s.y += s.vy * dt
  if (s.y <= groundY) {
    // On the ground: follow it, keeping its upward speed so a crest can throw us.
    const follow = (groundY - (s.y - s.vy * dt)) / dt
    s.y = groundY
    s.vy = Math.max(s.vy, Math.min(follow, Math.abs(s.speed) * 1.2))
    s.airborne = false
    if (wasAirborne) events.push('landed')
  } else {
    s.airborne = s.y > groundY + 0.06
  }
  settle(s, Math.min(1, (s.airborne ? 1.5 : 10) * dt))

  // ---- Headlights: on by themselves in deep shadow ----
  const light = lightAt(mapRef, s.x, s.z)
  if (!s.headlights && light < DARK) s.headlights = true
  else if (s.headlights && light > BRIGHT) s.headlights = false

  return events
}

export function enterRover(): void {
  if (state && !state.lost) state.driving = true
}

/** Gets out, if stopped. Returns false while still moving. */
export function exitRover(): boolean {
  if (!state || Math.abs(state.speed) > 0.3 || state.airborne) return false
  state.driving = false
  return true
}

/** The flat battery: the rover is left where it stopped and can't be driven again. */
export function loseRover(): void {
  if (!state) return
  state.driving = false
  state.lost = true
  state.speed = 0
}
