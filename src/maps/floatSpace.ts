/**
 * Collision for a floating body, in 3D. Walking only needs to know where the
 * feet may stand; a floating astronaut is a whole body, about 1.8 m long,
 * that can lie in any direction. So floating uses:
 *
 * - Free space: every room as a box (inside its walls, between floor and
 *   ceiling, kept clear of the handrails), the docking tunnel as a round
 *   tube, and every doorway or hatch as a short passage through its wall
 *   (round for round hatches).
 * - Solids: every prop and console as a box, from its bottom to its top,
 *   so racks, consoles, the table, seats, cargo bags and water tanks are
 *   all solid, and a capsule's slanted front panels.
 * - The body: a handful of spheres (head, chest, hips, knees, feet, hands)
 *   placed from the body's position, facing and lean, between the relaxed
 *   floating posture and the stretched-out glide.
 *
 * `bodyDepth` says how far the body is from fitting: 0 when every sphere
 * is in free space and clear of every solid. Moves that would make it
 * bigger are refused, so the body can't go into anything, and a body
 * that somehow starts inside something can still move out.
 */
import type { GameMap, Room } from './types'
import { WALL_THICKNESS } from './types'
import { consoleFootprint, levelOf, levelY, listDoors, propFootprint, roomFloor } from './collision'

export interface Box {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

/** A round tube along x or z (the docking tunnel). */
interface Tube {
  axis: 'x' | 'z'
  /** Along the axis. */
  a0: number
  a1: number
  /** Centre across the axis, and height of the centre line. */
  c: number
  y: number
  radius: number
}

/** A passage through a wall: a doorway, or a round hatch. */
export interface Passage {
  box: Box
  /** The wall it goes through: which way the wall runs, where it is, and the opening's middle along it and up it. */
  runs: 'x' | 'z'
  at: number
  along: number
  mid: number
  width: number
  /** For round hatches: the circle's centre (along the wall, height) and radius. */
  round?: { along: number; y: number; radius: number; runs: 'x' | 'z' }
}

export interface FloatSpace {
  rooms: Box[]
  tubes: Tube[]
  passages: Passage[]
  solids: Box[]
}

/** How far the body keeps off walls: the handrails stand 0.1 m off them. */
export const WALL_CLEARANCE = 0.1
/** Every body sphere keeps at least this far from anything, so it never lies on a floor or wall. */
export const BODY_GAP = 0.04
/** Props that are flat on a wall or tiny, and don't count as solid even floating. */
const FLAT_KINDS = new Set(['sign', 'wall-screen', 'handhold', 'picture', 'floor-marking'])

/** A capsule's front narrows: its slanted side and top panels, as steps of boxes. */
function capsuleSolids(map: GameMap, room: Room): Box[] {
  const { x1, z0, z1 } = room.rect
  const base = levelY(map, levelOf(room))
  const top = base + room.ceiling
  const wall = WALL_THICKNESS / 2
  const boxes: Box[] = []
  // Side panels: 0.42 m deep at the front, nothing 1.2 m back.
  for (const [from, to, depth] of [
    [x1 - 0.4, x1, 0.46],
    [x1 - 0.8, x1 - 0.4, 0.32],
    [x1 - 1.2, x1 - 0.8, 0.18],
  ] as const) {
    boxes.push({ x0: from, x1: to, y0: base, y1: top, z0: z0, z1: z0 + wall + depth })
    boxes.push({ x0: from, x1: to, y0: base, y1: top, z0: z1 - wall - depth, z1: z1 })
  }
  // Top panel: 0.6 m down at the front, nothing 0.9 m back.
  boxes.push({ x0: x1 - 0.3, x1, y0: top - 0.64, y1: top, z0, z1 })
  boxes.push({ x0: x1 - 0.6, x1: x1 - 0.3, y0: top - 0.44, y1: top, z0, z1 })
  boxes.push({ x0: x1 - 0.9, x1: x1 - 0.6, y0: top - 0.24, y1: top, z0, z1 })
  return boxes
}

/** The free space and solids for floating on one level. */
export function buildFloatSpace(map: GameMap, level: string): FloatSpace {
  const base = levelY(map, level)
  const rooms: Box[] = []
  const tubes: Tube[] = []
  const solids: Box[] = []
  const inset = WALL_THICKNESS / 2 + WALL_CLEARANCE
  for (const room of map.rooms) {
    if (levelOf(room) !== level) continue
    const { x0, x1, z0, z1 } = room.rect
    const floor = roomFloor(map, room)
    const top = base + room.ceiling
    if ((room.floor ?? 0) > 0) {
      // A raised-floor room is the round docking tunnel (see the station builder).
      const alongX = x1 - x0 >= z1 - z0
      tubes.push({
        axis: alongX ? 'x' : 'z',
        a0: alongX ? x0 : z0,
        a1: alongX ? x1 : z1,
        c: alongX ? (z0 + z1) / 2 : (x0 + x1) / 2,
        y: (floor + top) / 2,
        radius: Math.min(alongX ? z1 - z0 : x1 - x0, top - floor) / 2,
      })
      continue
    }
    rooms.push({ x0: x0 + inset, x1: x1 - inset, z0: z0 + inset, z1: z1 - inset, y0: floor, y1: top })
    if (room.shape === 'capsule') solids.push(...capsuleSolids(map, room))
  }

  const passages: Passage[] = []
  for (const door of listDoors(map, level)) {
    if (door.elevator) continue
    // Reaches far enough either side to overlap the rooms' free boxes.
    const reach = inset + 0.5
    const half = door.width / 2
    const y0 = base + door.sill
    const y1 = base + door.height
    const box: Box =
      door.runs === 'x'
        ? { x0: door.center.x - half, x1: door.center.x + half, z0: door.center.z - reach, z1: door.center.z + reach, y0, y1 }
        : { x0: door.center.x - reach, x1: door.center.x + reach, z0: door.center.z - half, z1: door.center.z + half, y0, y1 }
    const along = door.runs === 'x' ? door.center.x : door.center.z
    passages.push({
      box,
      runs: door.runs,
      at: door.runs === 'x' ? door.center.z : door.center.x,
      along,
      mid: (y0 + y1) / 2,
      width: door.width,
      round: door.round ? { along, y: (y0 + y1) / 2, radius: Math.min(door.width, y1 - y0) / 2, runs: door.runs } : undefined,
    })
  }

  for (const prop of map.props) {
    if (levelOf(prop) !== level || FLAT_KINDS.has(prop.kind)) continue
    const rect = propFootprint(prop)
    const y0 = base + (prop.elevation ?? 0)
    solids.push({ ...rect, y0, y1: y0 + prop.size.h })
  }
  for (const item of map.consoles) {
    if (levelOf(item) !== level) continue
    const rect = consoleFootprint(item)
    // The desk, and the screen housing standing up along its back.
    solids.push({ ...rect, y0: base, y1: base + 0.88 })
    const bx = item.position.x - item.facing.x * 0.2
    const bz = item.position.z - item.facing.z * 0.2
    const facesZ = Math.abs(item.facing.z) >= Math.abs(item.facing.x)
    const hx = facesZ ? 0.55 : 0.12
    const hz = facesZ ? 0.12 : 0.55
    solids.push({ x0: bx - hx, x1: bx + hx, z0: bz - hz, z1: bz + hz, y0: base, y1: base + 1.6 })
  }
  return { rooms, tubes, passages, solids }
}

/** How far outside a box a point is (0 inside). */
function outsideBox(b: Box, x: number, y: number, z: number, r: number): number {
  const dx = Math.max(b.x0 + r - x, 0, x - (b.x1 - r))
  const dy = Math.max(b.y0 + r - y, 0, y - (b.y1 - r))
  const dz = Math.max(b.z0 + r - z, 0, z - (b.z1 - r))
  return Math.hypot(dx, dy, dz)
}

function outsideTube(t: Tube, x: number, y: number, z: number, r: number): number {
  const a = t.axis === 'x' ? x : z
  const c = t.axis === 'x' ? z : x
  const along = Math.max(t.a0 - a, 0, a - t.a1)
  const across = Math.max(0, Math.hypot(c - t.c, y - t.y) - (t.radius - r))
  return Math.hypot(along, across)
}

function outsidePassage(p: Passage, x: number, y: number, z: number, r: number): number {
  if (!p.round) return outsideBox(p.box, x, y, z, r)
  const { along, y: cy, radius, runs } = p.round
  const a = runs === 'x' ? x : z
  const across = runs === 'x' ? z : x
  const lo = runs === 'x' ? p.box.z0 : p.box.x0
  const hi = runs === 'x' ? p.box.z1 : p.box.x1
  const out = Math.max(lo - across, 0, across - hi)
  const ring = Math.max(0, Math.hypot(a - along, y - cy) - (radius - r))
  return Math.hypot(out, ring)
}

/** How deep a point (with radius) is into a solid box: the shortest way out, or 0. */
function intoBox(b: Box, x: number, y: number, z: number, r: number): number {
  const d = Math.min(x - (b.x0 - r), b.x1 + r - x, y - (b.y0 - r), b.y1 + r - y, z - (b.z0 - r), b.z1 + r - z)
  return Math.max(0, d)
}

export interface PointDepth {
  /** How far the point is from free space plus how deep it is into solids. */
  depth: number
  /** True if a solid (not a wall, floor or ceiling) is the reason. */
  solid: boolean
}

/** How far a sphere is from fitting in the free space. 0 means it fits. */
export function pointDepth(space: FloatSpace, x: number, y: number, z: number, r: number): PointDepth {
  let outside = Infinity
  for (const b of space.rooms) {
    outside = Math.min(outside, outsideBox(b, x, y, z, r))
    if (outside === 0) break
  }
  if (outside > 0) for (const t of space.tubes) outside = Math.min(outside, outsideTube(t, x, y, z, r))
  if (outside > 0) for (const p of space.passages) outside = Math.min(outside, outsidePassage(p, x, y, z, r))
  let into = 0
  for (const s of space.solids) into += intoBox(s, x, y, z, r)
  return { depth: (Number.isFinite(outside) ? outside : 10) + into, solid: into > 0 }
}

// ---------- The body ----------

/** Floating body: where its middle is below the eyes, along the body. */
export const HEAD_TO_CENTER = 0.65

export interface BodyPose {
  /** The eyes. */
  x: number
  y: number
  z: number
  /** Which way the body faces (like the player's yaw). */
  yaw: number
  /** How far the body is tipped forward from upright, radians (negative: back). */
  lean: number
  /** 0 the relaxed posture, 1 the stretched-out glide. */
  glide: number
}

/**
 * The body's spheres, in its own frame: `s` along the body (up from the
 * middle, toward the head), `f` out of the front, `side` to its left, and
 * a radius. Relaxed (the neutral body posture) and gliding.
 */
const RELAXED: [number, number, number, number][] = [
  [0.72, 0, 0, 0.17], // head (helmet)
  [0.38, 0.02, 0, 0.21], // chest
  [0.02, 0, 0, 0.19], // hips
  [-0.28, 0.3, 0.1, 0.12], // knees
  [-0.28, 0.3, -0.1, 0.12],
  [-0.74, 0.34, 0.1, 0.12], // feet
  [-0.74, 0.34, -0.1, 0.12],
  [0.36, 0.42, 0.3, 0.08], // hands
  [0.36, 0.42, -0.3, 0.08],
]
const GLIDING: [number, number, number, number][] = [
  [0.72, 0.04, 0, 0.17],
  [0.38, 0, 0, 0.21],
  [0.02, 0, 0, 0.19],
  [-0.45, 0, 0.09, 0.12],
  [-0.45, 0, -0.09, 0.12],
  [-0.92, -0.04, 0.08, 0.11],
  [-0.92, -0.04, -0.08, 0.11],
  [1.08, 0.08, 0.18, 0.08], // the leading hand, past the head
  [-0.08, 0, -0.26, 0.08], // the other along the side
]

export interface BodySphere {
  x: number
  y: number
  z: number
  r: number
}

const spheres: BodySphere[] = RELAXED.map(() => ({ x: 0, y: 0, z: 0, r: 0 }))

/** The body's spheres in the world, for a pose. The array is reused. */
export function bodySpheres(pose: BodyPose): BodySphere[] {
  const fx = -Math.sin(pose.yaw)
  const fz = -Math.cos(pose.yaw)
  // Along the body (toward the head) and out of its front.
  const sl = Math.sin(pose.lean)
  const cl = Math.cos(pose.lean)
  const ax = fx * sl
  const ay = cl
  const az = fz * sl
  const nx = fx * cl
  const ny = -sl
  const nz = fz * cl
  // The body's left (when facing -z at yaw 0, left is -x).
  const lx = -Math.cos(pose.yaw)
  const lz = Math.sin(pose.yaw)
  const cx = pose.x - ax * HEAD_TO_CENTER
  const cy = pose.y - ay * HEAD_TO_CENTER
  const cz = pose.z - az * HEAD_TO_CENTER
  const g = Math.max(0, Math.min(1, pose.glide))
  for (let i = 0; i < RELAXED.length; i++) {
    const a = RELAXED[i]!
    const b = GLIDING[i]!
    const s = a[0] + (b[0] - a[0]) * g
    const f = a[1] + (b[1] - a[1]) * g
    const side = a[2] + (b[2] - a[2]) * g
    const out = spheres[i]!
    out.x = cx + ax * s + nx * f + lx * side
    out.y = cy + ay * s + ny * f
    out.z = cz + az * s + nz * f + lz * side
    out.r = a[3] + (b[3] - a[3]) * g + BODY_GAP
  }
  return spheres
}

/** How far the whole body is from fitting (0: it fits), and whether a solid prop is in the way. */
export function bodyDepth(space: FloatSpace, pose: BodyPose): PointDepth {
  let depth = 0
  let solid = false
  for (const s of bodySpheres(pose)) {
    const d = pointDepth(space, s.x, s.y, s.z, s.r)
    depth += d.depth
    solid ||= d.solid
  }
  return { depth, solid }
}
