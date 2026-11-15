/**
 * Small, deterministic noise helpers for procedural textures and terrain.
 * The "tile" versions wrap at u, v = 1, so textures repeat without seams.
 */

/** Integer hash to [0, 1). Same inputs always give the same value. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function wrap(i: number, period: number): number {
  return ((i % period) + period) % period
}

/** Value noise that tiles over [0, 1) with `period` cells across. */
export function tileNoise(u: number, v: number, period: number, seed = 0): number {
  const x = u * period
  const y = v * period
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const a = hash2(wrap(x0, period), wrap(y0, period), seed)
  const b = hash2(wrap(x0 + 1, period), wrap(y0, period), seed)
  const c = hash2(wrap(x0, period), wrap(y0 + 1, period), seed)
  const d = hash2(wrap(x0 + 1, period), wrap(y0 + 1, period), seed)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** Tiling fractal noise in [0, 1). */
export function tileFbm(u: number, v: number, period: number, octaves: number, seed = 0): number {
  let sum = 0
  let amplitude = 0.5
  let total = 0
  let p = period
  for (let i = 0; i < octaves; i++) {
    sum += tileNoise(u, v, p, seed + i * 17) * amplitude
    total += amplitude
    amplitude *= 0.5
    p *= 2
  }
  return sum / total
}

/** Non-tiling value noise over world coordinates, for terrain. */
export function worldNoise(x: number, z: number, seed = 0): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const fx = smooth(x - x0)
  const fz = smooth(z - z0)
  const a = hash2(x0, z0, seed)
  const b = hash2(x0 + 1, z0, seed)
  const c = hash2(x0, z0 + 1, seed)
  const d = hash2(x0 + 1, z0 + 1, seed)
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
}

export function worldFbm(x: number, z: number, octaves: number, seed = 0): number {
  let sum = 0
  let amplitude = 0.5
  let total = 0
  let f = 1
  for (let i = 0; i < octaves; i++) {
    sum += worldNoise(x * f, z * f, seed + i * 31) * amplitude
    total += amplitude
    amplitude *= 0.5
    f *= 2
  }
  return sum / total
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  return smooth(clamp01((x - edge0) / (edge1 - edge0)))
}

/** Distance from `t` (in [0,1)) to the nearest multiple of `step`, wrapping. */
export function gridDistance(t: number, step: number): number {
  const m = ((t % step) + step) % step
  return Math.min(m, step - m)
}
