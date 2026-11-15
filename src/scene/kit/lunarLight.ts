/**
 * The Moon's sunlight, baked once into light-map textures: the low Sun's
 * direct light on every slope, the very long shadows, and a faint bounce.
 * There is no sky light, because there is no air.
 *
 * - The site (the walkable 800 m): 1.25 m texels, finer than the 2.5 m
 *   terrain grid, with normals blended smoothly between grid points and
 *   soft shadow edges, so nothing is stair-stepped. The outpost's modules,
 *   the lander, solar panels and big rocks throw their shadows too.
 * - The landscape round it, for the landing cinematic: a 6.4 km square at
 *   12.5 m and a 51.2 km square at 100 m, from the same height function, so
 *   it is lit the same way and the site never shows an edge.
 *
 * Shadows come from one sweep along the Sun's direction across each map:
 * walking from the sunny side, it carries the highest line of sight seen so
 * far, lowered by the Sun's slope at each step, and a point is in shadow
 * where that line is above it. One pass, however long the shadows.
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, UnsignedByteType, type Vector3 } from 'three'
import { moduleRects } from '../../maps/collision'
import { scatterRocks } from '../../maps/lunarScatter'
import type { GameMap } from '../../maps/types'
import { LUNAR_CELL, lunarTerrain } from './lunar'
import { ROOF_ABOVE } from './outpostModules'

/** Baked light over a square: `size` x `size` texels from `origin` (x and z), `extent` metres across. */
export interface LightMap {
  size: number
  origin: number
  extent: number
  /** Light per texel: 0 in shadow, up to about 1.6 in full sun. */
  data: Float32Array
  texture: DataTexture | null
}

/** The landscape round the site, for the landing: a 6.4 km square and a 51.2 km square. */
export const MID_LIGHT = { extent: 6400, size: 384 }
export const FAR_LIGHT = { extent: 51200, size: 256 }

/** Light-map values are stored halved (to fit 0 to 2 in a byte): the material doubles them back. */
export const LIGHT_SCALE = 2

/**
 * The sweep. `height` and `normal` are per texel (the ground and anything
 * standing on it; the normal of the ground itself). `bias` lets tiny bumps
 * cast no shadow; `soft` is the width of a shadow's soft edge, metres.
 */
function bake(size: number, origin: number, extent: number, sun: Vector3, height: Float32Array, normal: Float32Array, bias: number, soft: number): Float32Array {
  const texel = extent / size
  const flat = Math.hypot(sun.x, sun.z)
  const sx = sun.x / flat
  const sz = sun.z / flat
  const rise = sun.y / flat
  const step = texel * 0.7
  const reach = extent * 0.7072 + texel
  const centre = origin + extent / 2
  const lit = new Float32Array(size * size)
  const count = new Uint16Array(size * size)
  const sample = (gx: number, gz: number): number => {
    const x = Math.min(size - 1.001, Math.max(0, gx - 0.5))
    const z = Math.min(size - 1.001, Math.max(0, gz - 0.5))
    const i = Math.floor(x)
    const k = Math.floor(z)
    const fx = x - i
    const fz = z - k
    const a = height[k * size + i]!
    const b = height[k * size + i + 1]!
    const c = height[(k + 1) * size + i]!
    const d = height[(k + 1) * size + i + 1]!
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
  }
  for (let w = -reach; w <= reach; w += step) {
    let line = -Infinity
    let previous: number | null = null
    // From the Sun's side across the map.
    for (let u = reach; u >= -reach; u -= step) {
      const x = centre + sx * u - sz * w
      const z = centre + sz * u + sx * w
      const gx = (x - origin) / texel
      const gz = (z - origin) / texel
      if (gx < 0 || gz < 0 || gx >= size || gz >= size) {
        previous = null
        continue
      }
      const h = sample(gx, gz)
      if (previous !== null) line = Math.max(line, previous) - step * rise
      const index = Math.floor(gz) * size + Math.floor(gx)
      lit[index] = lit[index]! + Math.min(1, Math.max(0, (h + bias - line) / soft))
      count[index] = count[index]! + 1
      previous = h
    }
  }
  const light = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) {
    const nx = normal[i * 3]!
    const ny = normal[i * 3 + 1]!
    const nz = normal[i * 3 + 2]!
    const direct = Math.max(0, nx * sun.x + ny * sun.y + nz * sun.z)
    const shade = count[i] ? lit[i]! / count[i]! : 1
    // With the Sun this low, flat ground catches only a glancing light; a
    // curve keeps it readable while slopes facing the Sun stay brightest.
    // Faint light bounced off sunlit ground nearby, more on slopes facing up.
    light[i] = Math.pow(direct, 0.55) * shade * 1.55 + 0.035 * ny
  }
  return light
}

/** Normals per texel from a height raster (central differences). */
function rasterNormals(size: number, texel: number, height: Float32Array): Float32Array {
  const normal = new Float32Array(size * size * 3)
  for (let k = 0; k < size; k++) {
    for (let i = 0; i < size; i++) {
      const hl = height[k * size + Math.max(0, i - 1)]!
      const hr = height[k * size + Math.min(size - 1, i + 1)]!
      const hu = height[Math.max(0, k - 1) * size + i]!
      const hd = height[Math.min(size - 1, k + 1) * size + i]!
      const nx = hl - hr
      const nz = hu - hd
      const ny = 2 * texel
      const l = Math.hypot(nx, ny, nz)
      normal.set([nx / l, ny / l, nz / l], (k * size + i) * 3)
    }
  }
  return normal
}

const siteCache = new WeakMap<GameMap, LightMap>()

/** Hands over light computed elsewhere (a worker): 'site', or a wide map's extent and size. */
export function primeLight(map: GameMap, which: 'site' | { extent: number; size: number }, data: Float32Array): void {
  const t = lunarTerrain(map)
  if (!t) return
  if (which === 'site') {
    if (siteCache.has(map)) return
    const extent = (t.count - 1) * LUNAR_CELL
    const size = Math.round(extent / 1.25)
    if (data.length === size * size) siteCache.set(map, { size, origin: t.origin, extent, data, texture: null })
    return
  }
  let byKey = wideCache.get(map)
  if (!byKey) wideCache.set(map, (byKey = new Map()))
  const key = `${which.extent}:${which.size}`
  if (!byKey.has(key) && data.length === which.size * which.size) byKey.set(key, { size: which.size, origin: -which.extent / 2, extent: which.extent, data, texture: null })
}

/** The walkable site's light map (cached): 1.25 m texels across the terrain grid. */
export function siteLight(map: GameMap): LightMap | null {
  const t = lunarTerrain(map)
  if (!t) return null
  const cached = siteCache.get(map)
  if (cached) return cached
  const extent = (t.count - 1) * LUNAR_CELL
  const size = Math.round(extent / 1.25)
  const texel = extent / size
  const ground = new Float32Array(size * size)
  const normal = new Float32Array(size * size * 3)
  // Normals at the grid points, blended between them, so slopes shade smoothly.
  const gridNormal = new Float32Array(t.count * t.count * 3)
  for (let k = 0; k < t.count; k++) {
    for (let i = 0; i < t.count; i++) {
      const at = (a: number, b: number) => t.grid[Math.min(t.count - 1, Math.max(0, b)) * t.count + Math.min(t.count - 1, Math.max(0, a))]!
      const nx = at(i - 1, k) - at(i + 1, k)
      const nz = at(i, k - 1) - at(i, k + 1)
      const ny = 2 * LUNAR_CELL
      const l = Math.hypot(nx, ny, nz)
      gridNormal.set([nx / l, ny / l, nz / l], (k * t.count + i) * 3)
    }
  }
  for (let k = 0; k < size; k++) {
    for (let i = 0; i < size; i++) {
      const x = t.origin + (i + 0.5) * texel
      const z = t.origin + (k + 0.5) * texel
      ground[k * size + i] = t.height(x, z)
      const gx = Math.min(t.count - 1.001, (x - t.origin) / LUNAR_CELL)
      const gz = Math.min(t.count - 1.001, (z - t.origin) / LUNAR_CELL)
      const a = Math.floor(gx)
      const b = Math.floor(gz)
      const fx = gx - a
      const fz = gz - b
      let nx = 0
      let ny = 0
      let nz = 0
      for (const [da, db, wgt] of [
        [0, 0, (1 - fx) * (1 - fz)],
        [1, 0, fx * (1 - fz)],
        [0, 1, (1 - fx) * fz],
        [1, 1, fx * fz],
      ] as const) {
        const j = ((b + db) * t.count + a + da) * 3
        nx += gridNormal[j]! * wgt
        ny += gridNormal[j + 1]! * wgt
        nz += gridNormal[j + 2]! * wgt
      }
      const l = Math.hypot(nx, ny, nz)
      normal.set([nx / l, ny / l, nz / l], (k * size + i) * 3)
    }
  }
  // Things standing on the ground throw shadows: raise the shadow test's ground under them.
  const height = Float32Array.from(ground)
  const raise = (x0: number, x1: number, z0: number, z1: number, top: (x: number, z: number) => number | null) => {
    for (let k = Math.max(0, Math.floor((z0 - t.origin) / texel)); k <= Math.min(size - 1, Math.floor((z1 - t.origin) / texel)); k++) {
      for (let i = Math.max(0, Math.floor((x0 - t.origin) / texel)); i <= Math.min(size - 1, Math.floor((x1 - t.origin) / texel)); i++) {
        const value = top(t.origin + (i + 0.5) * texel, t.origin + (k + 0.5) * texel)
        if (value !== null) height[k * size + i] = Math.max(height[k * size + i]!, value)
      }
    }
  }
  for (const rock of scatterRocks(map)) {
    // Not the boundary ring: from the air its shadows would draw a perfect circle on the ground.
    if (rock.size < 1 || rock.edge) continue
    const r = rock.size * 0.5
    raise(rock.x - r, rock.x + r, rock.z - r, rock.z + r, (x, z) => {
      const d = Math.hypot(x - rock.x, z - rock.z) / r
      return d < 1 ? t.height(rock.x, rock.z) + rock.size * 0.55 * Math.sqrt(1 - d * d) : null
    })
  }
  for (const { rect, id } of moduleRects(map)) {
    const room = map.rooms.find((r) => r.id === id)
    const top = (room?.ceiling ?? 0) + ROOF_ABOVE + (room?.shielding ?? 0)
    raise(rect.x0, rect.x1, rect.z0, rect.z1, () => top)
  }
  for (const prop of map.props) {
    if (!prop.ground || prop.solid === false) continue
    const reach = Math.max(prop.size.w, prop.size.d) / 2
    const base = t.height(prop.position.x, prop.position.z)
    raise(prop.position.x - reach, prop.position.x + reach, prop.position.z - reach, prop.position.z + reach, () => base + prop.size.h)
  }
  const data = bake(size, t.origin, extent, t.sun, height, normal, texel * 0.25, texel * 0.32)
  const light: LightMap = { size, origin: t.origin, extent, data, texture: null }
  // Toward its edges (beyond the walkable ring), the site's fine detail fades
  // into the landscape's coarser light, so from the air there is no edge.
  const landscape = bakeWide(map, MID_LIGHT.extent, MID_LIGHT.size, light)
  let byKey = wideCache.get(map)
  if (!byKey) wideCache.set(map, (byKey = new Map()))
  if (!byKey.has(`${MID_LIGHT.extent}:${MID_LIGHT.size}`)) byKey.set(`${MID_LIGHT.extent}:${MID_LIGHT.size}`, landscape)
  for (let k = 0; k < size; k++) {
    for (let i = 0; i < size; i++) {
      const x = t.origin + (i + 0.5) * texel
      const z = t.origin + (k + 0.5) * texel
      const w = Math.min(1, Math.max(0, (Math.max(Math.abs(x), Math.abs(z)) - EDGE_FADE[0]) / (EDGE_FADE[1] - EDGE_FADE[0])))
      if (w <= 0) continue
      const f = w * w * (3 - 2 * w)
      data[k * size + i] = data[k * size + i]! * (1 - f) + sampleLight(landscape, x, z) * f
    }
  }
  siteCache.set(map, light)
  return light
}

/** Where the site's fine light fades into the landscape's (metres out from the outpost, square distance). */
const EDGE_FADE = [330, 398] as const

const wideCache = new WeakMap<GameMap, Map<string, LightMap>>()

/**
 * The landscape round the site, for the landing: `extent` metres square
 * centred on the outpost, at `size` texels a side, lit from the same
 * height function. Also returns nothing extra: heights come from
 * `lunarTerrain(map).surface`.
 */
export function wideLight(map: GameMap, extent: number, size: number): LightMap | null {
  const t = lunarTerrain(map)
  if (!t) return null
  let byKey = wideCache.get(map)
  if (!byKey) wideCache.set(map, (byKey = new Map()))
  const key = `${extent}:${size}`
  const cached = byKey.get(key)
  if (cached) return cached
  // The near landscape is baked with the site (matched to it, and the site's edges fade into it).
  if (extent === MID_LIGHT.extent && size === MID_LIGHT.size) {
    siteLight(map)
    const made = byKey.get(key)
    if (made) return made
  }
  // The far one is matched to the near landscape.
  const finer = wideLight(map, MID_LIGHT.extent, MID_LIGHT.size)
  const light = bakeWide(map, extent, size, extent === MID_LIGHT.extent ? undefined : (finer ?? undefined))
  byKey.set(key, light)
  return light
}

/**
 * Bakes a landscape light map. A coarser bake comes out darker on average
 * (smoothing the slopes loses light under the low-Sun curve), so it is
 * matched to `finer`'s average where they overlap (the site's raw light for
 * the near landscape, which `siteLight` passes in; otherwise the site).
 */
function bakeWide(map: GameMap, extent: number, size: number, finer?: LightMap): LightMap {
  const t = lunarTerrain(map)!
  const texel = extent / size
  const origin = -extent / 2
  const height = new Float32Array(size * size)
  for (let k = 0; k < size; k++) {
    for (let i = 0; i < size; i++) height[k * size + i] = t.surface(origin + (i + 0.5) * texel, origin + (k + 0.5) * texel)
  }
  const normal = rasterNormals(size, texel, height)
  const data = bake(size, origin, extent, t.sun, height, normal, texel * 0.2, texel * 0.4)
  if (finer) {
    const reach = finer.extent / 2 - finer.extent / finer.size
    let sumFine = 0
    let sumCoarse = 0
    const steps = 60
    for (let a = 0; a < steps; a++) {
      for (let b = 0; b < steps; b++) {
        const x = -reach + (2 * reach * (a + 0.5)) / steps
        const z = -reach + (2 * reach * (b + 0.5)) / steps
        sumFine += sampleLight(finer, x, z)
        sumCoarse += data[Math.floor((z - origin) / texel) * size + Math.floor((x - origin) / texel)]!
      }
    }
    const gain = sumCoarse > 0 ? Math.min(1.6, Math.max(0.7, sumFine / sumCoarse)) : 1
    for (let i = 0; i < data.length; i++) data[i] = data[i]! * gain
  }
  return { size, origin, extent, data, texture: null }
}

/** A light map's value at a point, blended between texels. */
function sampleLight(light: LightMap, x: number, z: number): number {
  const texel = light.extent / light.size
  const gx = Math.min(light.size - 1.001, Math.max(0, (x - light.origin) / texel - 0.5))
  const gz = Math.min(light.size - 1.001, Math.max(0, (z - light.origin) / texel - 0.5))
  const i = Math.floor(gx)
  const k = Math.floor(gz)
  const fx = gx - i
  const fz = gz - k
  const at = (a: number, b: number) => light.data[b * light.size + a]!
  return (at(i, k) * (1 - fx) + at(i + 1, k) * fx) * (1 - fz) + (at(i, k + 1) * (1 - fx) + at(i + 1, k + 1) * fx) * fz
}

/** The light map as a texture for the terrain material (made once, kept with the light map). */
export function lightTexture(light: LightMap): DataTexture {
  if (light.texture) return light.texture
  const pixels = new Uint8Array(light.size * light.size * 4)
  for (let i = 0; i < light.size * light.size; i++) {
    const v = Math.round(Math.min(1, Math.max(0, light.data[i]! / LIGHT_SCALE)) * 255)
    pixels[i * 4] = v
    pixels[i * 4 + 1] = v
    pixels[i * 4 + 2] = v
    pixels[i * 4 + 3] = 255
  }
  const texture = new DataTexture(pixels, light.size, light.size, RGBAFormat, UnsignedByteType)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  // Light maps use the second UV set (uv1).
  texture.channel = 1
  texture.anisotropy = 4
  texture.needsUpdate = true
  light.texture = texture
  return texture
}

/** Where a point falls on a light map (0 to 1 across it). */
export function lightUv(light: LightMap, x: number, z: number): [number, number] {
  return [(x - light.origin) / light.extent, (z - light.origin) / light.extent]
}

/** Baked sunlight at a point on the site, blended between texels (0 in shadow, about 1.6 in full sun). */
export function lightAt(map: GameMap, x: number, z: number): number {
  const light = siteLight(map)
  return light ? sampleLight(light, x, z) : 1
}
