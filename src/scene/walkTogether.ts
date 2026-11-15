/**
 * Scene 2 of Shishir's Phase 1 script, the walk: after the opening in crew
 * quarters the trainer leads the way to the briefing room ("Follow me to the
 * briefing room"), and the crew walk along with the player: Kal from her
 * bunk, the commander and the safety officer from the corridor outside the
 * door, where they waited during the opening. They talk in person on the way.
 *
 * - The trainer walks a fixed route (the corridor, then the briefing room
 *   door, to his spot by the screen) at a walking pace while the player keeps
 *   up, waits when the player falls behind, and hurries when the player is
 *   ahead of him.
 * - The others follow in the player's footsteps (the path the player walked,
 *   so never through a wall), each a little further back. Kal joins at once;
 *   the commander and the safety officer as the player passes them.
 * - Nobody walking is solid, so they never box the player in.
 *
 * The step is pure (`stepWalk`), so tools/checks can drive it; the 3D scene
 * advances it once a frame through `walkPlaces`.
 */
import type { SpeakerId } from '../state/mission'

export interface Point {
  x: number
  z: number
}

/** Someone on the walk, where they are now. */
export interface Walker {
  speakerId: SpeakerId
  x: number
  z: number
  /** As the player's yaw: 0 faces −z, −π/2 faces +x. */
  yaw: number
  /** Metres per second, for the walking animation (0 standing). */
  speed: number
}

interface Follower extends Walker {
  /** How far behind the player, along the path, they keep. */
  gap: number
  /** Where on the player's path they joined (metres along it), or null before joining. */
  joinedAt: number | null
}

export interface WalkState {
  /** The player's path since the walk began: points, and the distance along it. */
  trail: (Point & { s: number })[]
  leader: Walker & { along: number }
  followers: Follower[]
}

/** The trainer's way from the crew quarters doorway to his spot in the briefing room (launch center metres). */
export const TRAINER_ROUTE: readonly Point[] = [
  { x: -12.6, z: 0.3 },
  { x: -11.2, z: 0.15 },
  { x: -4.5, z: 0.15 },
  { x: -4.5, z: -2.7 },
  { x: -2.6, z: -5.2 },
  { x: -2.2, z: -6.6 },
]

/** Where the walk starts: the opening's spots (src/scene/beats.ts stages them there). */
export const WALK_START: Readonly<Record<'trainer' | 'science' | 'commander' | 'safety', Walker>> = {
  trainer: { speakerId: 'trainer', x: -12.6, z: 0.3, yaw: Math.PI / 2, speed: 0 },
  science: { speakerId: 'science', x: -15.6, z: 1.6, yaw: 0, speed: 0 },
  commander: { speakerId: 'commander', x: -10.8, z: -0.75, yaw: Math.PI / 2, speed: 0 },
  safety: { speakerId: 'safety', x: -10.8, z: 0.75, yaw: Math.PI / 2, speed: 0 },
}

/** Walking pace, a hurry, how close the player must be for the trainer to walk on, and when someone joins. */
const PACE = 1.3
const HURRY = 2.4
const KEEP_UP = 3.5
const JOIN = 2.4
/** Footsteps closer together than this are one. */
const STEP = 0.15
/** At most this many footsteps are kept (the walk is about 25 m). */
const MAX_TRAIL = 800

const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz)

/** The walk's start: everyone at the opening's spots; Kal follows closest, then the commander, then the safety officer. */
export function startWalkState(player: Point): WalkState {
  const t = WALK_START.trainer
  return {
    trail: [{ x: player.x, z: player.z, s: 0 }],
    leader: { ...t, along: 0 },
    followers: [
      { ...WALK_START.science, gap: 1.1, joinedAt: 0 },
      { ...WALK_START.commander, gap: 2.0, joinedAt: null },
      { ...WALK_START.safety, gap: 2.9, joinedAt: null },
    ],
  }
}

const routeLength = (route: readonly Point[]) => route.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - route[i]!.x, p.z - route[i]!.z), 0)

/** The point `s` metres along a polyline, and the direction there. */
function along(points: readonly Point[], s: number): Point & { dx: number; dz: number } {
  let left = Math.max(0, s)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (left <= length || i === points.length - 1) {
      const k = length > 0 ? Math.min(1, left / length) : 1
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: b.x - a.x, dz: b.z - a.z }
    }
    left -= length
  }
  const only = points[0]!
  return { x: only.x, z: only.z, dx: 0, dz: -1 }
}

/** The point on the player's path `s` metres from where it began. */
function onTrail(trail: WalkState['trail'], s: number): Point {
  if (s <= trail[0]!.s) return trail[0]!
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]!
    const b = trail[i]!
    if (s <= b.s) {
      const k = (s - a.s) / Math.max(1e-6, b.s - a.s)
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }
    }
  }
  return trail[trail.length - 1]!
}

/** Turns `yaw` toward `want`, at most `rate` radians. */
function turn(yaw: number, want: number, rate: number): number {
  const delta = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw))
  return yaw + Math.max(-rate, Math.min(rate, delta))
}

/** One step of the walk: the player's footsteps, the trainer along his route, everyone else behind the player. */
export function stepWalk(state: WalkState, player: Point, dt: number): WalkState {
  const trail = state.trail.slice(-MAX_TRAIL)
  const last = trail[trail.length - 1]!
  const moved = Math.hypot(player.x - last.x, player.z - last.z)
  if (moved >= STEP) trail.push({ x: player.x, z: player.z, s: last.s + moved })
  const playerS = trail[trail.length - 1]!.s

  // The trainer leads: on while the player keeps up, faster when the player is ahead of him, else he waits and looks back.
  const total = routeLength(TRAINER_ROUTE)
  const end = TRAINER_ROUTE[TRAINER_ROUTE.length - 1]!
  const l = state.leader
  const near = Math.hypot(player.x - l.x, player.z - l.z) < KEEP_UP
  const ahead = Math.hypot(player.x - end.x, player.z - end.z) < Math.hypot(l.x - end.x, l.z - end.z)
  const pace = l.along >= total ? 0 : ahead ? HURRY : near ? PACE : 0
  const s = Math.min(total, l.along + pace * dt)
  const at = along(TRAINER_ROUTE, s)
  const leaderYaw = pace > 0 ? yawToward(at.dx, at.dz) : yawToward(player.x - at.x, player.z - at.z)
  const leader = { ...l, along: s, x: at.x, z: at.z, speed: pace, yaw: turn(l.yaw, leaderYaw, 6 * dt) }

  // Everyone else walks in the player's footsteps, each keeping their gap; before joining they wait and watch.
  const followers = state.followers.map((f) => {
    let joinedAt = f.joinedAt
    if (joinedAt === null && Math.hypot(player.x - f.x, player.z - f.z) < JOIN) joinedAt = playerS
    if (joinedAt === null) return { ...f, speed: 0, yaw: turn(f.yaw, yawToward(player.x - f.x, player.z - f.z), 4 * dt) }
    const behind = playerS - f.gap
    let target: Point
    if (behind >= joinedAt) target = onTrail(trail, behind)
    else {
      // The player hasn't walked far enough yet: come toward them, but no closer than the gap.
      const ox = f.x - player.x
      const oz = f.z - player.z
      const away = Math.hypot(ox, oz)
      target = away <= f.gap ? { x: f.x, z: f.z } : { x: player.x + (ox / away) * f.gap, z: player.z + (oz / away) * f.gap }
    }
    const dx = target.x - f.x
    const dz = target.z - f.z
    const distance = Math.hypot(dx, dz)
    // Faster the further behind they are, up to a hurry; still when close.
    const speed = distance < 0.08 ? 0 : Math.min(HURRY, Math.max(PACE * 0.6, distance * 2.2))
    const stepLength = Math.min(distance, speed * dt)
    const x = f.x + (distance > 0 ? (dx / distance) * stepLength : 0)
    const z = f.z + (distance > 0 ? (dz / distance) * stepLength : 0)
    const want = speed > 0 ? yawToward(dx, dz) : yawToward(player.x - x, player.z - z)
    return { ...f, joinedAt, x, z, speed, yaw: turn(f.yaw, want, 6 * dt) }
  })
  return { trail, leader, followers }
}

// ---------- The walk in the running game ----------

let walk: WalkState | null = null
let stamp = Number.NaN

/** Starts the walk (after the opening), from where the player stands. */
export function startWalk(player: Point): void {
  walk = startWalkState(player)
  stamp = Number.NaN
}

/** Ends the walk (the briefing starts, or a new run). */
export function stopWalk(): void {
  walk = null
}

export function walking(): boolean {
  return walk !== null
}

/**
 * Everyone on the walk, advanced once per frame (`now` tells frames apart:
 * every crew figure asks, the first one each frame moves them).
 */
export function walkPlaces(now: number, dt: number, player: Point): readonly Walker[] {
  if (!walk) return []
  if (now !== stamp) {
    stamp = now
    walk = stepWalk(walk, player, Math.min(dt, 0.1))
  }
  return [walk.leader, ...walk.followers]
}
