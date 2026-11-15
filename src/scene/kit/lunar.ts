/**
 * The lunar surface near the south pole: terrain from a height function
 * (gentle rolling ground and craters of many sizes with raised rims), the
 * outpost's modules standing on it (./outpostModules.ts), and lighting baked
 * once at load.
 *
 * The ground's height is one function everywhere: real LOLA elevations
 * (a 960 m window at 20 m, inside a 12.8 km square at 160 m), plus rolling
 * roughness and craters of many sizes, all with the same crater shape. The
 * walkable 800 m site is a fine mesh of it; the landing cinematic draws the
 * wider landscape round it from the same function, so they are one place.
 *
 * The Sun never moves here and barely clears the horizon, so the terrain's
 * lighting and its very long shadows are worked out once and stored in
 * light-map textures (./lunarLight.ts); the terrain needs no real-time
 * light. Only the player, the rover and props nearby get real-time
 * shadows. The modules, the lander, panels and big rocks throw their long
 * shadows into the bake.
 */
import { BufferAttribute, CylinderGeometry, PlaneGeometry, Vector3 } from 'three'
import { moduleRects } from '../../maps/collision'
import { LOLA_PATCH } from '../../maps/lolaPatch'
import { LOLA_WIDE } from '../../maps/lolaWide'
import type { GameMap, LunarExterior } from '../../maps/types'
import { hash2, smoothstep, worldFbm } from '../materials/noise'
import { tint } from '../materials/surfaces'
import type { Parts, Tint } from './parts'
import { buildOutpostModules } from './outpostModules'
import type { MapExtras } from './specs'

/** Terrain grid spacing in metres. */
export const LUNAR_CELL = 2.5

/** A crater: centre, radius of the bowl (to the rim crest) and depth below the surrounding ground. */
export interface Crater {
  x: number
  z: number
  radius: number
  depth: number
  /** A smooth, gentle bowl with a low rim (the ice crater), so a rover can drive in and out. */
  gentle?: boolean
}

export interface LunarTerrain {
  exterior: LunarExterior
  /** Ground height at any point, bilinear between grid points (what the player walks on). */
  height: (x: number, z: number) => number
  /** Grid of heights, `count` x `count`, starting at `origin` in both x and z. */
  grid: Float32Array
  count: number
  origin: number
  craters: Crater[]
  /** Unit vector toward the Sun. */
  sun: Vector3
  /** The ground's height function itself, at full detail, valid anywhere (the grid samples it). */
  surface: (x: number, z: number) => number
}

/** A compass bearing (0 north = -z, 90 east = +x) and elevation, both in degrees, as a unit vector. */
export function bearingVector(bearing: number, elevation: number): Vector3 {
  const b = (bearing * Math.PI) / 180
  const e = (elevation * Math.PI) / 180
  return new Vector3(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e)).normalize()
}

/** Craters of many sizes, scattered with a fixed seed: a few big ones, many small ones (like the real Moon). */
function scatterCraters(size: number, avoid: { x: number; z: number; radius: number }[]): Crater[] {
  const craters: Crater[] = []
  const half = size / 2
  const bands: [number, number, number][] = [
    // count, smallest radius, largest radius
    [6, 22, 45],
    [40, 7, 20],
    [260, 1.5, 7],
  ]
  let seed = 1
  for (const [count, small, large] of bands) {
    let placed = 0
    for (let attempt = 0; attempt < count * 6 && placed < count; attempt++) {
      seed++
      const x = (hash2(seed, 1, 907) * 2 - 1) * (half - 10)
      const z = (hash2(seed, 2, 907) * 2 - 1) * (half - 10)
      // Smaller craters are more common: bias toward the small end.
      const t = Math.pow(hash2(seed, 3, 907), 2.2)
      const radius = small + (large - small) * t
      if (avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.radius + radius * 1.4)) continue
      craters.push({ x, z, radius, depth: radius * (0.16 + hash2(seed, 4, 907) * 0.08) })
      placed++
    }
  }
  return craters
}

/**
 * Smooth (bicubic Catmull-Rom) interpolation of a height raster, held at
 * its edges. Its slope changes smoothly through every pixel: a simpler
 * eased blend flattens the slope at each pixel's edge, which under a Sun
 * this low shows as a regular grid of bands across the ground.
 */
function bicubic(values: Float32Array, n: number, pixel: number, x: number, z: number): number {
  const half = (n * pixel) / 2
  const gx = Math.min(n - 1, Math.max(0, (x + half) / pixel - 0.5))
  const gz = Math.min(n - 1, Math.max(0, (z + half) / pixel - 0.5))
  const i = Math.min(n - 2, Math.floor(gx))
  const k = Math.min(n - 2, Math.floor(gz))
  const t = gx - i
  const u = gz - k
  // Catmull-Rom weights for the four samples along each axis.
  const t2 = t * t
  const t3 = t2 * t
  const wx0 = 0.5 * (-t3 + 2 * t2 - t)
  const wx1 = 0.5 * (3 * t3 - 5 * t2 + 2)
  const wx2 = 0.5 * (-3 * t3 + 4 * t2 + t)
  const wx3 = 0.5 * (t3 - t2)
  const u2 = u * u
  const u3 = u2 * u
  const wz = [0.5 * (-u3 + 2 * u2 - u), 0.5 * (3 * u3 - 5 * u2 + 2), 0.5 * (-3 * u3 + 4 * u2 + u), 0.5 * (u3 - u2)]
  const c0 = Math.max(0, i - 1)
  const c1 = i
  const c2 = i + 1
  const c3 = Math.min(n - 1, i + 2)
  let h = 0
  for (let r = 0; r < 4; r++) {
    const row = Math.min(n - 1, Math.max(0, k - 1 + r)) * n
    h += wz[r]! * (values[row + c0]! * wx0 + values[row + c1]! * wx1 + values[row + c2]! * wx2 + values[row + c3]! * wx3)
  }
  return h
}

const PATCH = Float32Array.from(LOLA_PATCH.decimetres, (d) => d / 10)
const WIDE = Float32Array.from(LOLA_WIDE.metres)

/** The 20 m window round the outpost (lolaPatch.ts). */
function patchHeight(x: number, z: number): number {
  return bicubic(PATCH, LOLA_PATCH.size, LOLA_PATCH.pixelMetres, x, z)
}

/** The 12.8 km square round it at 160 m (lolaWide.ts), held at its edges beyond. */
function wideHeight(x: number, z: number): number {
  return bicubic(WIDE, LOLA_WIDE.size, LOLA_WIDE.pixelMetres, x, z)
}

/** Where the wide data takes over from the fine window: past the walkable area (inside 370 m). */
const WIDE_FROM = 385
const WIDE_TO = 470

/**
 * The large-scale shape of the ground: real heights near the lunar south
 * pole from NASA's LOLA laser altimeter, the fine window round the outpost
 * blending into the coarse wide square beyond the walkable area. Both are
 * relative to the fine window's mean, so they line up.
 */
function lolaHeight(x: number, z: number): number {
  const d = Math.max(Math.abs(x), Math.abs(z))
  if (d <= WIDE_FROM) return patchHeight(x, z)
  if (d >= WIDE_TO) return wideHeight(x, z)
  const w = smoothstep(WIDE_FROM, WIDE_TO, d)
  return patchHeight(x, z) * (1 - w) + wideHeight(x, z) * w
}

/** Crater fields beyond the site: cell size, chance of a crater per cell, and radius range. Same crater shape as on the site. */
const FAR_CRATERS: [number, number, number, number][] = [
  [180, 0.45, 18, 60],
  [620, 0.4, 70, 210],
  [2100, 0.35, 240, 700],
]

/** Craters out in the landscape round the site (none inside it: it has its own). */
function farCraterHeight(x: number, z: number): number {
  const fade = smoothstep(WIDE_FROM, WIDE_TO + 60, Math.max(Math.abs(x), Math.abs(z)))
  if (fade <= 0) return 0
  let h = 0
  for (const [cell, chance, small, large] of FAR_CRATERS) {
    const ci = Math.floor(x / cell)
    const ck = Math.floor(z / cell)
    for (let di = -1; di <= 1; di++) {
      for (let dk = -1; dk <= 1; dk++) {
        const i = ci + di
        const k = ck + dk
        if (hash2(i, k, cell) > chance) continue
        const cx = (i + 0.5 + (hash2(i, k, cell + 1) - 0.5) * 0.5) * cell
        const cz = (k + 0.5 + (hash2(i, k, cell + 2) - 0.5) * 0.5) * cell
        const radius = small + (large - small) * Math.pow(hash2(i, k, cell + 3), 2.2)
        const d = Math.hypot(x - cx, z - cz)
        if (d < radius * 2) h += craterProfile({ x: cx, z: cz, radius, depth: radius * (0.16 + hash2(i, k, cell + 4) * 0.08) }, d)
      }
    }
  }
  return h * fade
}

/**
 * The ground's colour variation, the same everywhere: fresh brighter
 * ejecta and darker old ground at a few scales, so the regolith texture's
 * repeat never shows from the air.
 */
export function terrainTone(x: number, z: number): number {
  return (0.8 + worldFbm(x / 30, z / 30, 3, 23) * 0.28) * (0.9 + worldFbm(x / 260, z / 260, 3, 29) * 0.2) * (0.94 + worldFbm(x / 1500, z / 1500, 2, 31) * 0.12)
}

/** Height change made by one crater at distance `d` from its centre: a bowl with a raised rim. */
function craterProfile(crater: Crater, d: number): number {
  const r = crater.radius
  if (d > r * 2) return 0
  if (crater.gentle) {
    // (1 - t^2)^2: flat-bottomed, steepest about 1.5 x depth / radius part way up the wall.
    const t = Math.min(1, d / r)
    const rim = 1.2 * Math.exp(-(((d - r) / (r * 0.25)) ** 2))
    return -crater.depth * (1 - t * t) * (1 - t * t) + rim
  }
  const rim = crater.depth * 0.35
  if (d < r) {
    const t = d / r
    // Bowl: deepest in the middle, rising to the rim crest.
    return -crater.depth * (1 - t * t) + rim * t * t * t * t
  }
  // Outside: the rim falls away over about another radius.
  const t = (d - r) / r
  return rim * Math.exp(-t * t * 4)
}

const cache = new WeakMap<GameMap, LunarTerrain>()
/** Height grids worked out ahead of time in a worker (see ./lunarPrebake.ts). */
const primedGrids = new WeakMap<GameMap, Float32Array>()

/** Hands over a height grid computed elsewhere (a worker), so building the terrain skips that work. */
export function primeTerrainGrid(map: GameMap, grid: Float32Array): void {
  if (!cache.has(map)) primedGrids.set(map, grid)
}

/** The terrain for a lunar map (built once and cached). */
export function lunarTerrain(map: GameMap): LunarTerrain | null {
  const exterior = map.exterior
  if (exterior?.scene !== 'lunar-south-pole') return null
  const cached = cache.get(map)
  if (cached) return cached

  const size = exterior.size
  const half = size / 2
  const count = Math.round(size / LUNAR_CELL) + 1
  const origin = -half
  const flats = exterior.flat
  // Named craters (the ice crater) first; random ones keep clear of them and of cleared ground.
  const named: Crater[] = (exterior.craters ?? []).map((c) => ({ x: c.x, z: c.z, radius: c.radius, depth: c.depth, gentle: true }))
  const craters = [
    ...named,
    ...scatterCraters(size, [
      ...flats.map((f) => ({ x: f.x, z: f.z, radius: f.radius + 6 })),
      ...named.map((c) => ({ x: c.x, z: c.z, radius: c.radius * 1.6 })),
      ...(map.outdoor?.areas ?? []).map((a) => ({ x: a.x, z: a.z, radius: a.radius + 4 })),
    ]),
  ]
  const heaps = exterior.heaps ?? []

  // Bucket craters by grid square so each point only checks nearby ones.
  const BUCKET = 40
  const bucketKey = (bx: number, bz: number) => (bx + 1000) * 4000 + (bz + 1000)
  const buckets = new Map<number, Crater[]>()
  for (const crater of craters) {
    const reach = crater.radius * 2
    for (let bx = Math.floor((crater.x - reach) / BUCKET); bx <= Math.floor((crater.x + reach) / BUCKET); bx++) {
      for (let bz = Math.floor((crater.z - reach) / BUCKET); bz <= Math.floor((crater.z + reach) / BUCKET); bz++) {
        const key = bucketKey(bx, bz)
        const list = buckets.get(key)
        if (list) list.push(crater)
        else buckets.set(key, [crater])
      }
    }
  }

  // The outpost (the first flat area) sits at height 0, where its floors are.
  const home = flats[0] ?? { x: 0, z: 0, radius: 0 }
  const base = lolaHeight(home.x, home.z)
  // Levelled areas, last first (so the outpost's wins), with their levels worked out once.
  const levelled = [...flats].reverse().map((f) => ({ ...f, level: f === home ? 0 : lolaHeight(f.x, f.z) - base, reach: f.radius + 12 }))
  const natural = (x: number, z: number): number => {
    let h = lolaHeight(x, z) - base + (worldFbm(x / 40, z / 40, 3, 11) - 0.5) * 1.5 + (worldFbm(x / 18, z / 18, 3, 17) - 0.5) * 0.8
    if (Math.abs(x) < half + 50 && Math.abs(z) < half + 50) {
      for (const crater of buckets.get(bucketKey(Math.floor(x / BUCKET), Math.floor(z / BUCKET))) ?? []) {
        h += craterProfile(crater, Math.hypot(x - crater.x, z - crater.z))
      }
    }
    h += farCraterHeight(x, z)
    // Heaps and pits of dug regolith.
    for (const heap of heaps) {
      const dx = x - heap.x
      const dz = z - heap.z
      if (Math.abs(dx) > heap.radius * 1.4 || Math.abs(dz) > heap.radius * 1.4) continue
      const d = Math.hypot(dx, dz) / heap.radius
      if (d < 1.4) h += heap.height * Math.exp(-d * d * 2.2)
    }
    // Cleared, levelled ground: each flat area is levelled to the large-scale
    // height at its centre (the outpost's to exactly 0, applied last so it wins).
    for (const f of levelled) {
      const dx = x - f.x
      const dz = z - f.z
      if (Math.abs(dx) > f.reach || Math.abs(dz) > f.reach) continue
      const w = smoothstep(f.reach, f.radius, Math.hypot(dx, dz))
      if (w <= 0) continue
      h = h * (1 - w) + (f.level - 0.02) * w
    }
    return h
  }

  const primed = primedGrids.get(map)
  const grid = primed && primed.length === count * count ? primed : new Float32Array(count * count)
  if (grid !== primed) {
    for (let k = 0; k < count; k++) {
      for (let i = 0; i < count; i++) grid[k * count + i] = natural(origin + i * LUNAR_CELL, origin + k * LUNAR_CELL)
    }
  }
  primedGrids.delete(map)

  const bilinear = (source: Float32Array, x: number, z: number): number => {
    const gx = Math.min(count - 1.001, Math.max(0, (x - origin) / LUNAR_CELL))
    const gz = Math.min(count - 1.001, Math.max(0, (z - origin) / LUNAR_CELL))
    const i = Math.floor(gx)
    const k = Math.floor(gz)
    const fx = gx - i
    const fz = gz - k
    const a = source[k * count + i]!
    const b = source[k * count + i + 1]!
    const c = source[(k + 1) * count + i]!
    const d = source[(k + 1) * count + i + 1]!
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
  }
  const height = (x: number, z: number): number => bilinear(grid, x, z)

  const terrain: LunarTerrain = {
    exterior,
    height,
    grid,
    count,
    origin,
    craters,
    sun: bearingVector(exterior.sun.bearing, exterior.sun.elevation),
    surface: natural,
  }
  cache.set(map, terrain)
  return terrain
}

/**
 * Builds the terrain mesh: its colour variation in the vertex colours,
 * world-space UVs for the regolith texture, and a second UV set across the
 * site for the baked light map (./lunarLight.ts).
 */
export function buildLunarTerrain(map: GameMap, parts: Parts): void {
  const t = lunarTerrain(map)
  if (!t) return
  const segments = t.count - 1
  const size = segments * LUNAR_CELL
  const geometry = new PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2)
  const position = geometry.attributes.position as BufferAttribute
  const uv = geometry.attributes.uv as BufferAttribute
  const lightUv = new Float32Array(position.count * 2)
  const colors = new Float32Array(position.count * 3)
  for (let v = 0; v < position.count; v++) {
    const x = position.getX(v)
    const z = position.getZ(v)
    const i = Math.round((x - t.origin) / LUNAR_CELL)
    const k = Math.round((z - t.origin) / LUNAR_CELL)
    position.setY(v, t.grid[k * t.count + i] ?? 0)
    uv.setXY(v, x / 2.4, z / 2.4)
    lightUv[v * 2] = (x - t.origin) / size
    lightUv[v * 2 + 1] = (z - t.origin) / size
    const tone = terrainTone(x, z)
    colors[v * 3] = tone
    colors[v * 3 + 1] = tone * 0.985
    colors[v * 3 + 2] = tone * 0.96
  }
  geometry.computeVertexNormals()
  geometry.setAttribute('uv1', new BufferAttribute(lightUv, 2))
  parts.add('lunarTerrain', geometry)
  // Parts.add sets a flat tint; replace it with the colour variation.
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
}

/** Where a point falls on the site's light map (0 to 1 across the terrain grid). */
export function siteLightUv(map: GameMap, x: number, z: number): [number, number] {
  const t = lunarTerrain(map)
  if (!t) return [0, 0]
  const size = (t.count - 1) * LUNAR_CELL
  return [(x - t.origin) / size, (z - t.origin) / size]
}

/** Ground height on a lunar map, or null if the map isn't lunar. */
export function lunarGround(map: GameMap): ((x: number, z: number) => number) | null {
  return lunarTerrain(map)?.height ?? null
}

const MARKER_POST = tint('#6b6f75')
const MARKER_LIGHT: Tint = [2.6, 1.7, 0.6]

/**
 * Marker lights along the surface paths (the first steps from the landing
 * pad to the airlock): short posts with an amber light, every few metres on
 * both sides, standing on the ground.
 */
function buildPathMarkers(map: GameMap, parts: Parts, ground: (x: number, z: number) => number): void {
  for (const path of map.outdoor?.paths ?? []) {
    const points = path.points
    for (let p = 0; p + 1 < points.length; p++) {
      const a = points[p]!
      const b = points[p + 1]!
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      const dirX = (b.x - a.x) / length
      const dirZ = (b.z - a.z) / length
      for (let s = p === 0 ? 2 : 0; s < length; s += 4) {
        for (const side of [-1, 1]) {
          const x = a.x + dirX * s - dirZ * side * (path.width / 2)
          const z = a.z + dirZ * s + dirX * side * (path.width / 2)
          const y = ground(x, z)
          parts.cylinder('painted', 0.03, 0.04, 0.35, { x, y: y + 0.17, z }, MARKER_POST, 6)
          parts.box('emissive', 0.07, 0.05, 0.07, { x, y: y + 0.37, z }, MARKER_LIGHT)
        }
      }
    }
  }
}

const CABLE = tint('#2b2f36')

/**
 * Power and data cables lying on the ground from the outpost to each
 * surface place that needs them (the solar field, the antenna): each runs
 * down the nearest module's wall and across the ground.
 */
function buildServices(map: GameMap, t: LunarTerrain, parts: Parts): void {
  const modules = moduleRects(map).map((m) => m.rect)
  if (!modules.length) return
  const ends = ['solar-field', 'antenna'].flatMap((id) => (map.outdoor?.areas ?? []).filter((a) => a.id === id))
  for (const end of ends) {
    // Leave the outpost from the point of its outline nearest the place.
    let start = { x: 0, z: 0 }
    let best = Infinity
    for (const r of modules) {
      const x = Math.max(r.x0, Math.min(r.x1, end.x))
      const z = Math.max(r.z0, Math.min(r.z1, end.z))
      const d = Math.hypot(end.x - x, end.z - z)
      if (d < best) {
        best = d
        start = { x, z }
      }
    }
    const span = Math.hypot(end.x - start.x, end.z - start.z)
    const dx = (end.x - start.x) / span
    const dz = (end.z - start.z) / span
    // Down the wall from a junction box.
    parts.box('painted', 0.3, 0.3, 0.3, { x: start.x + dx * 0.1, y: 1.2, z: start.z + dz * 0.1 }, tint('#3a3f47'))
    parts.box('rubber', 0.06, 1.1, 0.06, { x: start.x + dx * 0.18, y: 0.55, z: start.z + dz * 0.18 }, CABLE)
    const length = span - end.radius * 0.6
    for (let s = 0.2; s < length; s += 1.5) {
      const x0 = start.x + dx * s
      const z0 = start.z + dz * s
      const x1 = start.x + dx * Math.min(length, s + 1.5)
      const z1 = start.z + dz * Math.min(length, s + 1.5)
      const y0 = t.height(x0, z0) + 0.04
      const y1 = t.height(x1, z1) + 0.04
      const seg = Math.hypot(x1 - x0, y1 - y0, z1 - z0)
      const cable = new CylinderGeometry(0.03, 0.03, seg, 6)
      cable.rotateX(Math.PI / 2)
      cable.rotateX(-Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0)))
      cable.rotateY(Math.atan2(dx, dz))
      cable.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
      parts.add('rubber', cable, CABLE)
    }
  }
}

/** Everything on a lunar map's surface that is built from data: the terrain, the outpost's modules, cables and the path markers. */
export function buildLunarSurface(map: GameMap, parts: Parts, extras: MapExtras): void {
  const t = lunarTerrain(map)
  if (!t) return
  buildLunarTerrain(map, parts)
  buildOutpostModules(map, parts, extras, t.height, (x, z) => siteLightUv(map, x, z), terrainTone)
  buildServices(map, t, parts)
  buildPathMarkers(map, parts, t.height)
  // A ring of marker lights round each cleared pad.
  for (const area of map.outdoor?.areas ?? []) {
    if (!area.ring) continue
    const count = 16
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const x = area.x + Math.cos(a) * (area.radius - 2)
      const z = area.z + Math.sin(a) * (area.radius - 2)
      const y = t.height(x, z)
      parts.cylinder('painted', 0.05, 0.06, 0.25, { x, y: y + 0.12, z }, MARKER_POST, 6)
      parts.box('emissive', 0.12, 0.05, 0.12, { x, y: y + 0.27, z }, [0.6, 1.6, 2.6])
    }
  }
}
