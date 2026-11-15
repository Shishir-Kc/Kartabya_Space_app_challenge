/**
 * Floating in microgravity. W A S D move where the player looks, including
 * up and down; Space and Q float straight up and down. Speed builds up quickly
 * and dies away over about a second, so the player drifts to a stop rather
 * than halting dead.
 *
 * Collision is for the whole body, in 3D (see ../maps/floatSpace.ts): its
 * head, chest, hips, knees, feet and hands all stay out of walls, floors,
 * ceilings and every rack, console, bag and seat. The body lines up with
 * the direction of travel as it speeds up; where that would push it into
 * something it stays more upright (or tips further) instead, whichever is
 * the smaller change that fits, so it lines up with a hatch on its own.
 * Heading into a hatch, the body also eases toward the hatch's middle.
 *
 * Easy float (the default) slowly rolls the player's head back upright, so
 * the ceiling stays up. Without it, strafing sets the player slowly rolling,
 * and nothing stops it but strafing the other way.
 */
import { floatRange, type Blocker } from '../maps/collision'
import { bodyDepth, buildFloatSpace, HEAD_TO_CENTER, type BodyPose, type FloatSpace } from '../maps/floatSpace'
import type { GameMap } from '../maps/types'
import { player } from '../state/player'

export { HEAD_TO_CENTER } from '../maps/floatSpace'

export const FLOAT_SPEED = 1.5
export const FLOAT_FAST_SPEED = 2.5
/** How quickly speed builds toward what the keys ask for, per second. */
const ACCELERATION = 4
/** How quickly drifting dies away with no keys held, per second (about a second to nearly stop). */
const DRAG = 2.4
/** Easy float: how fast a roll rights itself, per second. */
const RIGHTING = 1.2
/** Free float: how much strafing starts a roll, radians per second per second. */
const ROLL_PUSH = 0.5
const ROLL_DRAG = 0.15

export interface FloatInput {
  /** -1 back, 0, 1 forward (along the view, including up and down). */
  forward: number
  /** -1 left, 0, 1 right (flat). */
  strafe: number
  /** -1 down (Q), 0, 1 up (Space). */
  lift: number
  fast: boolean
}

export const NO_INPUT: FloatInput = { forward: 0, strafe: 0, lift: 0, fast: false }

/** How the floating body lies: which way it faces, its lean and how stretched out it is. */
export const floatBody = { yaw: 0, lean: 0, glide: 0 }

/** Lean limits: lying on the back (feet first), or head first almost straight down. */
const LEAN_MIN = -1.65
const LEAN_MAX = Math.PI - 0.2

const spaces = new WeakMap<GameMap, Map<string, FloatSpace>>()

/** The 3D free space and solids for floating on a map level (built once). */
export function floatSpaceFor(map: GameMap, level: string): FloatSpace {
  let byLevel = spaces.get(map)
  if (!byLevel) spaces.set(map, (byLevel = new Map()))
  let space = byLevel.get(level)
  if (!space) byLevel.set(level, (space = buildFloatSpace(map, level)))
  return space
}

/** Where the last float step left the player, to notice teleports. */
const last = { x: Infinity, y: 0, z: 0 }

const pose: BodyPose = { x: 0, y: 0, z: 0, yaw: 0, lean: 0, glide: 0 }

function depthAt(space: FloatSpace, x: number, y: number, z: number, yaw: number, lean: number, glide: number) {
  pose.x = x
  pose.y = y
  pose.z = z
  pose.yaw = yaw
  pose.lean = lean
  pose.glide = glide
  return bodyDepth(space, pose)
}

/** Leans to try, nearest to `from` first, within `reach` radians. */
function leansNear(from: number, reach: number): number[] {
  // Ties go the way the body wants to turn (toward lining up with the travel).
  const first = aim >= from ? 1 : -1
  const out = [from]
  for (let d = 0.1; d <= reach + 1e-9; d += 0.1) {
    for (const sign of [first, -first]) {
      const lean = from + sign * d
      if (lean >= LEAN_MIN && lean <= LEAN_MAX) out.push(lean)
    }
  }
  return out
}

/** The lean the body is turning toward (lined up with the travel). */
let aim = 0

/** The body as it is now, at the player's position. */
export function currentDepth(space: FloatSpace) {
  return depthAt(space, player.x, player.y, player.z, floatBody.yaw, floatBody.lean, floatBody.glide)
}

/**
 * Tries to put the body's eyes at (x, y, z). Keeps the body's lean if it
 * fits there, else the nearest lean that does. Returns false (and changes
 * nothing) if no lean fits without going deeper into something.
 */
function tryMove(space: FloatSpace, x: number, y: number, z: number, limit: number): { ok: boolean; solid: boolean } {
  let solid = false
  for (const lean of leansNear(floatBody.lean, 1.8)) {
    const d = depthAt(space, x, y, z, floatBody.yaw, lean, floatBody.glide)
    if (d.depth <= limit) {
      floatBody.lean = lean
      player.x = x
      player.y = y
      player.z = z
      return { ok: true, solid: false }
    }
    solid ||= d.solid
  }
  return { ok: false, solid }
}

/** How far in front of a narrow opening the body starts easing toward its middle. */
const FUNNEL_REACH = 2

/**
 * Heading for a hatch or narrow doorway, the body eases toward the line
 * through its middle (sideways and up or down), more strongly the closer
 * it comes, so it lines up and slips through instead of
 * snagging on the rim. Only while moving toward the opening.
 */
function funnel(space: FloatSpace, dt: number): void {
  for (const p of space.passages) {
    const across = p.runs === 'x' ? player.z - p.at : player.x - p.at
    const along = (p.runs === 'x' ? player.x : player.z) - p.along
    if (Math.abs(across) > FUNNEL_REACH || Math.abs(along) > p.width / 2 + 0.8) continue
    const toward = -(p.runs === 'x' ? player.vz : player.vx) * Math.sign(across || 1)
    if (toward < 0.05) continue
    // Where the eyes fit through: the middle of a round hatch, or a box inside a doorway.
    const half = p.round ? 0 : Math.max(0, p.width / 2 - 0.45)
    const lo = p.round ? p.mid : p.box.y0 + 0.55
    const hi = p.round ? p.mid : Math.max(lo, p.box.y1 - 0.35)
    const offAlong = along - Math.max(-half, Math.min(half, along))
    const offY = player.y - Math.max(lo, Math.min(hi, player.y))
    if (offAlong === 0 && offY === 0) continue
    const k = Math.min(1, (1 - Math.abs(across) / FUNNEL_REACH) * 6 * dt)
    const limit = () => currentDepth(space).depth
    if (offAlong !== 0) {
      if (p.runs === 'x') tryMove(space, player.x - offAlong * k, player.y, player.z, limit())
      else tryMove(space, player.x, player.y, player.z - offAlong * k, limit())
    }
    if (offY !== 0) tryMove(space, player.x, player.y - offY * k, player.z, limit())
  }
}

/**
 * Turns and leans the body toward what it wants (facing where the player
 * looks, lined up with the travel), as far as it fits.
 */
function orientBody(space: FloatSpace, dt: number): void {
  const speed = Math.hypot(player.vx, player.vy, player.vz)
  const glide = Math.max(0, Math.min(1, (speed - 0.15) / 1.2))
  const wantGlide = floatBody.glide + (glide - floatBody.glide) * Math.min(1, dt * 4)
  // Lean toward the direction of travel, in the plane of the body's facing.
  const forward = -Math.sin(player.yaw) * player.vx - Math.cos(player.yaw) * player.vz
  const travel = speed > 0.05 ? Math.atan2(forward, player.vy) : 0
  const target = Math.max(-0.7, Math.min(Math.PI - 0.35, travel)) * wantGlide
  aim = target
  const wantLean = floatBody.lean + (target - floatBody.lean) * Math.min(1, 3 * dt)
  const limit = currentDepth(space).depth
  const tries: [number, number, number][] = [
    ...leansNear(wantLean, 0.4).map((lean): [number, number, number] => [player.yaw, lean, wantGlide]),
    ...leansNear(wantLean, 0.4).map((lean): [number, number, number] => [floatBody.yaw, lean, wantGlide]),
    [floatBody.yaw, floatBody.lean, wantGlide],
  ]
  for (const [yaw, lean, g] of tries) {
    if (depthAt(space, player.x, player.y, player.z, yaw, lean, g).depth <= limit) {
      floatBody.yaw = yaw
      floatBody.lean = lean
      floatBody.glide = g
      return
    }
  }
  // Turning about the eyes doesn't fit: turn about the middle of the body instead (the eyes move a little).
  const fx = -Math.sin(floatBody.yaw)
  const fz = -Math.cos(floatBody.yaw)
  const now = floatBody.lean
  const cx = player.x - fx * Math.sin(now) * HEAD_TO_CENTER
  const cy = player.y - Math.cos(now) * HEAD_TO_CENTER
  const cz = player.z - fz * Math.sin(now) * HEAD_TO_CENTER
  for (const lean of leansNear(wantLean, 0.4)) {
    const x = cx + fx * Math.sin(lean) * HEAD_TO_CENTER
    const y = cy + Math.cos(lean) * HEAD_TO_CENTER
    const z = cz + fz * Math.sin(lean) * HEAD_TO_CENTER
    if (depthAt(space, x, y, z, floatBody.yaw, lean, wantGlide).depth <= limit) {
      player.x = x
      player.y = y
      player.z = z
      floatBody.lean = lean
      floatBody.glide = wantGlide
      return
    }
  }
}

/** Starts the body upright and relaxed, facing where the player looks (on arrival or a teleport). */
export function resetFloatBody(): void {
  floatBody.yaw = player.yaw
  floatBody.lean = 0
  floatBody.glide = 0
}

/**
 * One step of floating. Moves the player, keeps the whole body inside the
 * hull and out of everything solid, and returns how fast they are moving
 * and what stopped them, if anything.
 */
export function stepFloat(
  map: GameMap,
  input: FloatInput,
  dt: number,
  easy: boolean,
): { speed: number; blocked: Blocker | null } {
  const space = floatSpaceFor(map, player.level)
  // Moved a long way since last time (arrived, or teleported): start upright and relaxed.
  if (Math.hypot(player.x - last.x, player.y - last.y, player.z - last.z) > 1) resetFloatBody()
  const sinYaw = Math.sin(player.yaw)
  const cosYaw = Math.cos(player.yaw)
  const cosPitch = Math.cos(player.pitch)
  const sinPitch = Math.sin(player.pitch)

  // The direction the keys ask for: forward along the view, right flat, lift straight up.
  let tx = -sinYaw * cosPitch * input.forward + cosYaw * input.strafe
  let ty = sinPitch * input.forward + input.lift
  let tz = -cosYaw * cosPitch * input.forward - sinYaw * input.strafe
  const length = Math.hypot(tx, ty, tz)
  const pushing = length > 1e-3
  if (pushing) {
    const speed = input.fast ? FLOAT_FAST_SPEED : FLOAT_SPEED
    tx = (tx / length) * speed
    ty = (ty / length) * speed
    tz = (tz / length) * speed
    const k = Math.min(1, ACCELERATION * dt)
    player.vx += (tx - player.vx) * k
    player.vy += (ty - player.vy) * k
    player.vz += (tz - player.vz) * k
  } else {
    const k = Math.exp(-DRAG * dt)
    player.vx *= k
    player.vy *= k
    player.vz *= k
  }

  orientBody(space, dt)
  funnel(space, dt)

  // Each axis on its own, so the body slides along whatever it touches.
  let blocked: Blocker | null = null
  const block = (solid: boolean) => {
    blocked = solid ? { kind: 'prop' } : { kind: 'wall' }
  }
  const dx = player.vx * dt
  if (dx !== 0) {
    const r = tryMove(space, player.x + dx, player.y, player.z, currentDepth(space).depth)
    if (!r.ok) {
      player.vx = 0
      block(r.solid)
    }
  }
  const dz = player.vz * dt
  if (dz !== 0) {
    const r = tryMove(space, player.x, player.y, player.z + dz, currentDepth(space).depth)
    if (!r.ok) {
      player.vz = 0
      block(r.solid)
    }
  }
  // Up and down.
  const dy = player.vy * dt
  if (dy !== 0 && !tryMove(space, player.x, player.y + dy, player.z, currentDepth(space).depth).ok) player.vy = 0

  // Roll.
  if (easy) {
    player.rollVelocity = 0
    player.roll *= Math.exp(-RIGHTING * dt)
  } else {
    player.rollVelocity += input.strafe * ROLL_PUSH * dt
    player.rollVelocity *= Math.exp(-ROLL_DRAG * dt)
    player.roll += player.rollVelocity * dt
    if (player.roll > Math.PI) player.roll -= Math.PI * 2
    if (player.roll < -Math.PI) player.roll += Math.PI * 2
  }

  last.x = player.x
  last.y = player.y
  last.z = player.z
  return { speed: Math.hypot(player.vx, player.vy, player.vz), blocked }
}

/**
 * After the player was moved some other way (click-to-float), puts the
 * body there if it fits, turning and leaning it as needed. Returns false,
 * and moves nothing, if it doesn't fit.
 */
export function placeBodyAt(map: GameMap, x: number, y: number, z: number, dt: number): boolean {
  const space = floatSpaceFor(map, player.level)
  const ok = tryMove(space, x, y, z, currentDepth(space).depth).ok
  orientBody(space, dt)
  return ok
}

/** A comfortable floating height for the eyes: the relaxed body then clears the floor. */
export const SETTLE_HEIGHT = 1.65

/** The eye height a floating player eases toward (for click-to-float). */
export function settleTarget(map: GameMap, target = SETTLE_HEIGHT): number {
  const range = floatRange(map, player.x, player.z, player.level)
  if (!range) return player.y
  return Math.max(range.lo, Math.min(range.hi, target))
}
