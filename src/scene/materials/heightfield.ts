/**
 * Builds the textures for one surface from a tileable height field.
 *
 * From the height field it derives:
 * - a normal map, from the slope;
 * - an ambient occlusion value, from how far each texel sits below the
 *   blurred height around it (grooves and seams get darker);
 * - a shading term multiplied into the colour, so grooves still read when
 *   a light shines straight at them.
 *
 * Occlusion, roughness and metalness are packed into one texture as
 * R = occlusion, G = roughness, B = metalness, the layout three.js reads
 * when the same texture is set as aoMap, roughnessMap and metalnessMap.
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'
import { clamp01 } from './noise'

export type Rgb = readonly [number, number, number]

export interface SurfaceSpec {
  /** Texture size in texels (square, power of two). */
  size: number
  /** Height at (u, v), both in [0, 1). Roughly 0 (groove) to 1 (raised). */
  height: (u: number, v: number) => number
  /** sRGB colour (0..1 per channel) at (u, v), given the height there. */
  color: (u: number, v: number, h: number) => Rgb
  roughness: (u: number, v: number, h: number) => number
  metalness: (u: number, v: number, h: number) => number
  /** How steep slopes look in the normal map. */
  normalStrength: number
  /** How dark grooves get, 0 for none. */
  occlusionStrength: number
}

export interface SurfaceTextures {
  map: DataTexture
  normalMap: DataTexture
  ormMap: DataTexture
}

function makeTexture(data: Uint8Array, size: number, srgb: boolean): DataTexture {
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 8
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace
  texture.needsUpdate = true
  return texture
}

/** Box blur that wraps at the edges, done as two passes. */
function blurWrapped(source: Float32Array, size: number, radius: number): Float32Array {
  const temp = new Float32Array(size * size)
  const out = new Float32Array(size * size)
  const span = radius * 2 + 1
  for (let y = 0; y < size; y++) {
    let sum = 0
    for (let k = -radius; k <= radius; k++) sum += source[y * size + ((k + size) % size)]!
    for (let x = 0; x < size; x++) {
      temp[y * size + x] = sum / span
      const add = (x + radius + 1) % size
      const remove = (x - radius + size) % size
      sum += source[y * size + add]! - source[y * size + remove]!
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0
    for (let k = -radius; k <= radius; k++) sum += temp[((k + size) % size) * size + x]!
    for (let y = 0; y < size; y++) {
      out[y * size + x] = sum / span
      const add = (y + radius + 1) % size
      const remove = (y - radius + size) % size
      sum += temp[add * size + x]! - temp[remove * size + x]!
    }
  }
  return out
}

export function buildSurfaceTextures(spec: SurfaceSpec): SurfaceTextures {
  const { size } = spec
  const heights = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      heights[y * size + x] = spec.height((x + 0.5) / size, (y + 0.5) / size)
    }
  }

  const blurred = blurWrapped(heights, size, Math.max(1, Math.round(size / 96)))
  const color = new Uint8Array(size * size * 4)
  const normal = new Uint8Array(size * size * 4)
  const orm = new Uint8Array(size * size * 4)
  // Slope is measured per texel, so scale by size to keep strength resolution-independent.
  const slopeScale = spec.normalStrength * (size / 256)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      const h = heights[i]!

      const left = heights[y * size + ((x - 1 + size) % size)]!
      const right = heights[y * size + ((x + 1) % size)]!
      const down = heights[((y - 1 + size) % size) * size + x]!
      const up = heights[((y + 1) % size) * size + x]!
      let nx = -(right - left) * 0.5 * slopeScale
      let ny = -(up - down) * 0.5 * slopeScale
      let nz = 1
      const length = Math.hypot(nx, ny, nz)
      nx /= length
      ny /= length
      nz /= length
      normal[i * 4] = Math.round((nx * 0.5 + 0.5) * 255)
      normal[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      normal[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255)
      normal[i * 4 + 3] = 255

      const below = Math.max(0, blurred[i]! - h)
      const occlusion = clamp01(1 - below * spec.occlusionStrength)
      const shade = 1 - (1 - occlusion) * 0.65

      const [r, g, b] = spec.color(u, v, h)
      color[i * 4] = Math.round(clamp01(r * shade) * 255)
      color[i * 4 + 1] = Math.round(clamp01(g * shade) * 255)
      color[i * 4 + 2] = Math.round(clamp01(b * shade) * 255)
      color[i * 4 + 3] = 255

      orm[i * 4] = Math.round(Math.max(0.25, occlusion) * 255)
      orm[i * 4 + 1] = Math.round(clamp01(spec.roughness(u, v, h)) * 255)
      orm[i * 4 + 2] = Math.round(clamp01(spec.metalness(u, v, h)) * 255)
      orm[i * 4 + 3] = 255
    }
  }

  return {
    map: makeTexture(color, size, true),
    normalMap: makeTexture(normal, size, false),
    ormMap: makeTexture(orm, size, false),
  }
}
