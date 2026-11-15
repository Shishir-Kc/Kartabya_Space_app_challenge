/**
 * Rocks and boulders on the lunar surface, scattered with a fixed seed so
 * collision, drawing and the baked shadows all agree on where they are.
 * Small rocks are only drawn; rocks of 1.3 m and up block the way. A ring
 * of big boulders marks the edge of the area the player can explore.
 *
 * Pure data: no three.js, so collision can use it.
 */
import { buildingCuts, contains, fenceSegments, inset, moduleRects, propFootprint } from './collision'
import type { GameMap, Rect } from './types'

export interface Rock {
  x: number
  z: number
  /** Width in metres. */
  size: number
  /** Which of the rock shapes. */
  shape: number
  yaw: number
  /** Part of the boundary ring. */
  edge: boolean
}

/** Rocks this big or bigger stop the player on foot. */
export const BLOCKING_ROCK = 1.3
/** The rover drives over anything smaller than this; bigger boulders would wreck it. */
export const ROVER_BLOCKING_ROCK = 2

function hash(a: number, b: number, seed: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function distanceToSegment(x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))
}

const cache = new WeakMap<GameMap, Rock[]>()

export function scatterRocks(map: GameMap): Rock[] {
  const cached = cache.get(map)
  if (cached) return cached
  const exterior = map.exterior
  const outdoor = map.outdoor
  if (exterior?.scene !== 'lunar-south-pole' || !outdoor) return []

  // Keep clear: the outpost's modules and porch, cleared areas, paths, props and named places.
  const keepOut: Rect[] = [
    ...moduleRects(map).map((m) => inset(m.rect, -3)),
    ...buildingCuts(map).map((c) => inset(c.rect, -1.5)),
    ...map.props.filter((p) => p.ground).map((p) => inset(propFootprint(p), -4)),
  ]
  const circles = [
    ...exterior.flat.map((f) => ({ x: f.x, z: f.z, r: f.radius + 3 })),
    ...(outdoor.areas ?? []).filter((a) => !exterior.craters?.some((c) => c.id === a.id)).map((a) => ({ x: a.x, z: a.z, r: a.radius + 2 })),
  ]
  const paths = outdoor.paths.flatMap((path) => fenceSegments(path.points, false).map(([a, b]) => ({ a, b, r: path.width / 2 + 2.5 })))
  const clear = (x: number, z: number, size: number) =>
    !keepOut.some((r) => contains(r, x, z)) &&
    !circles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + size) &&
    !paths.some((p) => distanceToSegment(x, z, p.a, p.b) < p.r + size)

  const rocks: Rock[] = []
  const half = exterior.size / 2 - 6
  const boundary = outdoor.boundary
  const inside = (x: number, z: number) => !boundary || Math.hypot(x - boundary.x, z - boundary.z) < boundary.radius - 4
  // Many small rocks, fewer medium ones, a few boulders.
  const bands: [number, number, number][] = [
    [1400, 0.25, 0.9],
    [180, 0.9, 1.8],
    [55, 1.8, 3.6],
  ]
  let seed = 0
  for (const [count, small, large] of bands) {
    let placed = 0
    for (let attempt = 0; attempt < count * 4 && placed < count; attempt++) {
      seed++
      const x = (hash(seed, 1, 5101) * 2 - 1) * half
      const z = (hash(seed, 2, 5101) * 2 - 1) * half
      const size = small + (large - small) * Math.pow(hash(seed, 3, 5101), 2)
      if (!inside(x, z) || !clear(x, z, size)) continue
      rocks.push({ x, z, size, shape: Math.floor(hash(seed, 4, 5101) * 3), yaw: hash(seed, 5, 5101) * Math.PI * 2, edge: false })
      placed++
    }
  }
  // The boundary: a ring of big boulders, close enough together that nobody squeezes through.
  if (boundary) {
    const step = 3.4
    const n = Math.ceil((2 * Math.PI * boundary.radius) / step)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const r = boundary.radius + 1.5 + hash(i, 7, 5107) * 2.5
      rocks.push({
        x: boundary.x + Math.cos(a) * r,
        z: boundary.z + Math.sin(a) * r,
        size: 3.2 + hash(i, 8, 5107) * 2.6,
        shape: i % 3,
        yaw: hash(i, 9, 5107) * Math.PI * 2,
        edge: true,
      })
    }
  }
  cache.set(map, rocks)
  return rocks
}

const heightCache = new WeakMap<GameMap, (x: number, z: number) => number>()

/**
 * How far rocks stick up above the ground at a point (0 away from rocks),
 * for the rover's wheels to ride over. Matches the drawn rock shape: a
 * flattened lump about 0.31 x size tall, sunk 0.12 x size into the ground.
 */
export function rockHeight(map: GameMap): (x: number, z: number) => number {
  const cached = heightCache.get(map)
  if (cached) return cached
  const CELL = 8
  const buckets = new Map<string, Rock[]>()
  for (const rock of scatterRocks(map)) {
    const r = rock.size / 2
    for (let bx = Math.floor((rock.x - r) / CELL); bx <= Math.floor((rock.x + r) / CELL); bx++) {
      for (let bz = Math.floor((rock.z - r) / CELL); bz <= Math.floor((rock.z + r) / CELL); bz++) {
        const key = `${bx},${bz}`
        const list = buckets.get(key)
        if (list) list.push(rock)
        else buckets.set(key, [rock])
      }
    }
  }
  const height = (x: number, z: number) => {
    let best = 0
    for (const rock of buckets.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
      const d = Math.hypot(x - rock.x, z - rock.z) / (rock.size * 0.5)
      if (d >= 1) continue
      best = Math.max(best, rock.size * (0.31 * Math.sqrt(1 - d * d) - 0.12))
    }
    return best
  }
  heightCache.set(map, height)
  return height
}

/** The footprint a rock blocks, for collision (a little smaller than it looks). */
export function rockFootprint(rock: Rock): Rect {
  const half = rock.size * 0.4
  return { x0: rock.x - half, x1: rock.x + half, z0: rock.z - half, z1: rock.z + half }
}
