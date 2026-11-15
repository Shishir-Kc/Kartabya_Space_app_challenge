/**
 * Every surface type in the game, in one place. Each textured surface is a
 * procedural height field (see ./heightfield.ts), generated once and cached,
 * so switching graphics tiers or maps never regenerates it.
 *
 * Textured surfaces use world-space UVs in metres divided by their tile
 * size, so a texture keeps the same scale on every box and lines up across
 * neighbouring boxes. All of them use vertex colours as a tint, which is how
 * one "painted" material covers slate blue, safety orange and olive.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  type Color,
  DoubleSide,
  type Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector4,
  type Texture,
} from 'three'
import { buildSurfaceTextures, type SurfaceSpec, type SurfaceTextures } from './heightfield'
import { clamp01, gridDistance, hash2, smoothstep, tileFbm, tileNoise } from './noise'

export type TexturedSurface =
  | 'wall'
  | 'floor'
  | 'ceiling'
  | 'brushed'
  | 'painted'
  | 'rubber'
  | 'fabric'
  | 'concrete'
  | 'steel'
  | 'padded'
  | 'regolith'

export type MaterialKey =
  | TexturedSurface
  | 'terrain'
  | 'glass'
  | 'emissive'
  | 'decal'
  | 'lightCone'
  | 'aviation'
  | 'glow'
  | 'lunarTerrain'

/** Metres covered by one repeat of each textured surface. */
export const TILE_METRES: Record<TexturedSurface, number> = {
  wall: 1.2,
  floor: 1.2,
  ceiling: 1.2,
  // These five are real scanned materials once loaded (PBR_SURFACES): sized to their real-world scale.
  brushed: 1,
  painted: 1.2,
  rubber: 0.8,
  fabric: 0.5,
  concrete: 3,
  steel: 1,
  padded: 0.6,
  regolith: 2.4,
}

export function isTextured(key: MaterialKey): key is TexturedSurface {
  return key in TILE_METRES
}

/** Groove depth profile: 0 in the middle of a seam, 1 away from it. */
function seam(distance: number, halfWidth: number, size: number): number {
  return smoothstep(halfWidth / size, (halfWidth + 1.5) / size, distance)
}

const SPECS: Record<TexturedSurface, SurfaceSpec> = {
  // Lunar regolith: fine grey dust and grit, pitted with tiny craters and
  // scattered pebbles. Kept close to white so lighting sets the brightness.
  regolith: {
    size: 512,
    height: (u, v) => {
      let h = 0.5 + tileFbm(u, v, 16, 4, 211) * 0.25 + tileNoise(u, v, 128, 213) * 0.08
      // Tiny pits.
      const cell = 24
      const cu = Math.floor(u * cell)
      const cv = Math.floor(v * cell)
      if (hash2(cu, cv, 217) > 0.82) {
        const px = (cu + 0.5) / cell
        const pv = (cv + 0.5) / cell
        const d = Math.hypot(u - px, v - pv) * cell
        const r = 0.18 + hash2(cu, cv, 219) * 0.2
        if (d < r) h -= 0.25 * (1 - (d / r) ** 2)
        else if (d < r * 1.4) h += 0.06
      }
      // Pebbles.
      if (hash2(Math.floor(u * 90), Math.floor(v * 90), 223) > 0.985) h += 0.2
      return h
    },
    color: (u, v, h) => {
      const tone = 0.78 + tileFbm(u, v, 6, 3, 227) * 0.22 + (h - 0.5) * 0.25
      return [tone * 0.74, tone * 0.73, tone * 0.71]
    },
    roughness: () => 0.98,
    metalness: () => 0,
    normalStrength: 2.4,
    occlusionStrength: 3,
  },

  // Spacecraft wall padding: soft fabric-covered cushions, 0.6 m square,
  // each with a stitched border, sewn together along deep seams.
  padded: {
    size: 256,
    height: (u, v) => {
      const edge = Math.min(gridDistance(u, 1), gridDistance(v, 1))
      const puff = smoothstep(0, 0.16, edge)
      // A dashed stitch line a little inside each cushion's edge.
      const along = gridDistance(u, 1) < gridDistance(v, 1) ? v : u
      const dash = Math.sin(along * Math.PI * 2 * 40) > 0 ? 1 : 0
      const stitch = Math.abs(edge - 0.07) < 0.006 ? 0.12 * dash : 0
      return 0.2 + 0.75 * puff - stitch + tileNoise(u, v, 24, 107) * 0.03
    },
    color: (u, v, h) => {
      const tone = 0.93 + tileFbm(u, v, 4, 3, 109) * 0.06
      const shade = 0.82 + 0.18 * Math.min(1, h * 1.2)
      return [0.9 * tone * shade, 0.9 * tone * shade, 0.87 * tone * shade]
    },
    roughness: () => 0.93,
    metalness: () => 0,
    normalStrength: 2.2,
    occlusionStrength: 3,
  },

  // Off-white composite panels, 1.2 m square, with seams and two rows of fasteners.
  wall: {
    size: 512,
    height: (u, v) => {
      const edge = Math.min(gridDistance(u, 1), gridDistance(v, 1))
      let h = 0.6 * seam(edge, 1.5, 512) + tileNoise(u, v, 32, 3) * 0.02
      for (const rowV of [0.05, 0.95]) {
        for (const colU of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          const d = Math.hypot(u - colU, v - rowV) * 512
          if (d < 5) h += 0.25 * (1 - (d / 5) ** 2)
        }
      }
      return h
    },
    color: (u, v, h) => {
      const tone = 0.95 + tileFbm(u, v, 4, 3, 11) * 0.08
      return h > 0.7 ? [0.62, 0.63, 0.64] : [0.86 * tone, 0.87 * tone, 0.85 * tone]
    },
    roughness: (u, v, h) => (h > 0.7 ? 0.5 : 0.62 + tileNoise(u, v, 16, 5) * 0.12),
    metalness: (_u, _v, h) => (h > 0.7 ? 0.5 : 0),
    normalStrength: 3,
    occlusionStrength: 8,
  },

  // Dark metal deck plating: 1.2 m plates, seams, diamond tread.
  floor: {
    size: 512,
    height: (u, v) => {
      const edge = Math.min(gridDistance(u, 1), gridDistance(v, 1))
      const cells = 16
      const cu = u * cells
      const cv = v * cells
      const i = Math.floor(cu)
      const j = Math.floor(cv)
      const lx = cu - i - 0.5
      const ly = cv - j - 0.5
      const flip = (i + j) % 2 === 0 ? 1 : -1
      const a = (lx + flip * ly) / Math.SQRT2
      const b = (lx - flip * ly) / Math.SQRT2
      const ellipse = (a / 0.36) ** 2 + (b / 0.11) ** 2
      const tread = ellipse < 1 ? 0.3 * (1 - ellipse) : 0
      return (0.5 + tread + tileNoise(u, v, 24, 7) * 0.03) * seam(edge, 2, 512)
    },
    color: (u, v, h) => {
      const tone = 0.9 + tileFbm(u, v, 3, 3, 21) * 0.2
      const lift = h > 0.6 ? 1.12 : 1
      return [0.29 * tone * lift, 0.3 * tone * lift, 0.32 * tone * lift]
    },
    roughness: (u, v, h) => (h > 0.6 ? 0.55 : 0.72 + tileNoise(u, v, 12, 9) * 0.12),
    metalness: () => 0.35,
    normalStrength: 4,
    occlusionStrength: 6,
  },

  // Modular ceiling tiles (0.6 m grid) with a slotted vent grille in one corner.
  ceiling: {
    size: 512,
    height: (u, v) => {
      const edge = Math.min(gridDistance(u, 0.5), gridDistance(v, 0.5))
      let h = 0.6 * seam(edge, 1.5, 512)
      if (u > 0.58 && u < 0.92 && v > 0.08 && v < 0.42) {
        const slot = gridDistance(v, 0.04)
        h = Math.min(h, 0.15 + 0.45 * seam(slot, 3, 512))
      }
      return h + tileNoise(u, v, 32, 13) * 0.015
    },
    color: (u, v, h) => {
      const tone = 0.96 + tileNoise(u, v, 6, 17) * 0.06
      return h < 0.3 ? [0.32, 0.33, 0.35] : [0.7 * tone, 0.71 * tone, 0.73 * tone]
    },
    roughness: () => 0.85,
    metalness: () => 0,
    normalStrength: 2.5,
    occlusionStrength: 6,
  },

  // Brushed metal: fine streaks along one direction.
  brushed: {
    size: 256,
    height: (u, v) => 0.5 + tileNoise(0.37, v, 128, 23) * 0.06 + tileNoise(u, v, 64, 29) * 0.02,
    color: (_u, v) => {
      const streak = 0.94 + tileNoise(0.61, v, 128, 31) * 0.1
      return [0.7 * streak, 0.72 * streak, 0.75 * streak]
    },
    roughness: (_u, v) => 0.46 + tileNoise(0.17, v, 64, 37) * 0.12,
    metalness: () => 0.75,
    normalStrength: 0.6,
    occlusionStrength: 0,
  },

  // Painted metal, white so vertex colours tint it. Sparse worn patches show bare metal.
  painted: {
    size: 256,
    height: (u, v) => 0.5 + tileNoise(u, v, 48, 41) * 0.04,
    color: (u, v) => {
      const wear = smoothstep(0.72, 0.76, tileFbm(u, v, 6, 4, 43))
      const tone = 0.93 + tileNoise(u, v, 8, 47) * 0.07
      const paint = [tone, tone, tone] as const
      return [
        paint[0] + (0.62 - paint[0]) * wear,
        paint[1] + (0.62 - paint[1]) * wear,
        paint[2] + (0.64 - paint[2]) * wear,
      ]
    },
    roughness: (u, v) => 0.5 - smoothstep(0.72, 0.76, tileFbm(u, v, 6, 4, 43)) * 0.2,
    metalness: (u, v) => 0.1 + smoothstep(0.72, 0.76, tileFbm(u, v, 6, 4, 43)) * 0.25,
    normalStrength: 0.8,
    occlusionStrength: 0,
  },

  // Rubber or vinyl: console tops, mats, cargo straps.
  rubber: {
    size: 256,
    height: (u, v) => tileNoise(u, v, 96, 53) * 0.5 + tileNoise(u, v, 24, 59) * 0.2,
    color: (u, v) => {
      const tone = 0.95 + tileNoise(u, v, 12, 61) * 0.1
      return [0.17 * tone, 0.18 * tone, 0.2 * tone]
    },
    roughness: () => 0.92,
    metalness: () => 0,
    normalStrength: 1.2,
    occlusionStrength: 2,
  },

  // Woven fabric, white so vertex colours tint it: mattresses, pillows, chairs.
  fabric: {
    size: 256,
    height: (u, v) => {
      const weave = Math.sin(u * Math.PI * 2 * 48) * Math.sin(v * Math.PI * 2 * 48)
      return 0.5 + weave * 0.2 + tileNoise(u, v, 16, 67) * 0.05
    },
    color: (u, v) => {
      const tone = 0.9 + tileNoise(u, v, 8, 71) * 0.1
      return [tone, tone, tone]
    },
    roughness: () => 0.95,
    metalness: () => 0,
    normalStrength: 1.5,
    occlusionStrength: 3,
  },

  // Concrete pad and roads, white-ish so vertex colours can darken it to asphalt.
  concrete: {
    size: 512,
    height: (u, v) => {
      const edge = Math.min(gridDistance(u, 1), gridDistance(v, 1))
      const pit = hash2(Math.floor(u * 160), Math.floor(v * 160), 73) > 0.985 ? -0.25 : 0
      return (0.5 + tileFbm(u, v, 8, 4, 79) * 0.15 + pit) * seam(edge, 2, 512)
    },
    color: (u, v) => {
      const tone = 0.78 + tileFbm(u, v, 4, 4, 83) * 0.3
      return [0.74 * tone, 0.73 * tone, 0.7 * tone]
    },
    roughness: (u, v) => 0.85 + tileNoise(u, v, 8, 89) * 0.1,
    metalness: () => 0,
    normalStrength: 1.5,
    occlusionStrength: 4,
  },

  // Structural steel for the tower, fences, poles and the water tower.
  steel: {
    size: 128,
    height: (u, v) => 0.5 + tileNoise(u, v, 32, 97) * 0.06,
    color: (u, v) => {
      const tone = 0.85 + tileFbm(u, v, 4, 3, 101) * 0.2
      return [tone, tone, tone]
    },
    roughness: (u, v) => 0.58 + tileNoise(u, v, 8, 103) * 0.15,
    metalness: () => 0.4,
    normalStrength: 0.8,
    occlusionStrength: 0,
  },
}

const textureCache = new Map<TexturedSurface, SurfaceTextures>()

/** The generated textures of a surface (cached), for materials outside the merged map, like the astronaut's suit. */
export function surfaceTextures(surface: TexturedSurface): SurfaceTextures {
  let textures = textureCache.get(surface)
  if (!textures) {
    textures = buildSurfaceTextures(SPECS[surface])
    textureCache.set(surface, textures)
  }
  return textures
}

let glowTexture: CanvasTexture | null = null

/** A soft round spot, bright in the middle, for pools of light on the ground. */
function radialGlowTexture(): CanvasTexture {
  if (glowTexture) return glowTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
  }
  glowTexture = new CanvasTexture(canvas)
  glowTexture.colorSpace = SRGBColorSpace
  return glowTexture
}

export type MaterialLibrary = Record<MaterialKey, Material>

/** The most holes the terrain shader takes; more would need a bigger uniform array. */
const MAX_TERRAIN_HOLES = 8

/**
 * Cuts rectangular holes (x0, z0, x1, z1 in world metres) in the terrain, so
 * elevator cars can pass down through the ground instead of slicing through
 * it. Fragments inside a hole are discarded. Call once per map.
 */
export function cutTerrainHoles(material: MeshStandardMaterial, holes: { x0: number; x1: number; z0: number; z1: number }[]): void {
  const values = Array.from({ length: MAX_TERRAIN_HOLES }, (_, i) => {
    const hole = holes[i]
    return hole ? new Vector4(hole.x0, hole.z0, hole.x1, hole.z1) : new Vector4(0, 0, 0, 0)
  })
  const count = Math.min(holes.length, MAX_TERRAIN_HOLES)
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHoles = { value: values }
    shader.uniforms.uHoleCount = { value: count }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vWorldXZ;
uniform vec4 uHoles[${MAX_TERRAIN_HOLES}];
uniform int uHoleCount;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
for (int i = 0; i < ${MAX_TERRAIN_HOLES}; i++) {
  if (i >= uHoleCount) break;
  vec4 hole = uHoles[i];
  if (vWorldXZ.x > hole.x && vWorldXZ.x < hole.z && vWorldXZ.y > hole.y && vWorldXZ.y < hole.w) discard;
}`,
      )
  }
  // A different shader per hole count, so three.js doesn't reuse a cached program without holes.
  material.customProgramCacheKey = () => `terrain-holes-${count}`
  material.needsUpdate = true
}

/**
 * The lunar ground's material: the regolith texture times the colour
 * variation in the vertex colours, lit only by a baked light map (values
 * stored halved, so the intensity doubles them back; the shader divides
 * light maps by pi, so that is undone too). The texture is mixed with a
 * copy of itself at another scale so its repeat doesn't show, and fades
 * to its own average colour with distance, so it never shimmers into
 * stripes from the air.
 */
export function lunarTerrainMaterial(lightMap: Texture | null): MeshBasicMaterial {
  const map = surfaceTextures('regolith').map
  map.anisotropy = Math.max(map.anisotropy, 8)
  const material = new MeshBasicMaterial({ vertexColors: true, map, lightMap, lightMapIntensity: 2 * Math.PI })
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 nearTexel = texture2D( map, vMapUv );
        vec4 wideTexel = texture2D( map, vMapUv * 0.173 + vec2( 0.31, 0.57 ) );
        vec4 sampledDiffuseColor = mix( nearTexel, wideTexel, 0.4 );
        // Far away, the texture's own average colour (its smallest mip level).
        vec3 average = textureLod( map, vec2( 0.5 ), 12.0 ).rgb;
        float far = smoothstep( 0.06, 0.5, length( fwidth( vMapUv ) ) );
        sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, average, far );
        diffuseColor *= sampledDiffuseColor;
      #endif`,
    )
  }
  material.customProgramCacheKey = () => 'lunar-terrain'
  return material
}

/**
 * Creates one material per surface. `decalAtlas` is the shared texture for
 * hazard stripes, stencils, signs on equipment and the Earth picture.
 */
/**
 * Surfaces drawn with real, scanned CC0 textures from ambientCG (built by
 * tools/build-pbr-textures.mjs into public/textures/pbr/, credited in
 * ASSETS.md): colour detail, normal map and occlusion/roughness/metalness.
 * Until they load (or if they can't), the procedural ones above stand in.
 */
export const PBR_SURFACES: readonly TexturedSurface[] = ['brushed', 'painted', 'rubber', 'fabric', 'concrete']

/** Loaded once and shared by every map (never disposed, so memory stays flat across maps). */
interface PbrTextures {
  map: Texture
  normalMap: Texture
  ormMap: Texture
}

const pbrCache = new Map<TexturedSurface, Promise<PbrTextures | null>>()

function loadPbr(surface: TexturedSurface): Promise<PbrTextures | null> {
  let pending = pbrCache.get(surface)
  if (!pending) {
    const loader = new TextureLoader()
    const base = `${import.meta.env.BASE_URL}textures/pbr/${surface}-`
    const load = (name: string, srgb: boolean) =>
      loader.loadAsync(`${base}${name}.webp`).then((texture) => {
        texture.wrapS = RepeatWrapping
        texture.wrapT = RepeatWrapping
        texture.anisotropy = 4
        if (srgb) texture.colorSpace = SRGBColorSpace
        return texture
      })
    pending = Promise.all([load('color', true), load('normal', false), load('orm', false)])
      .then(([map, normalMap, ormMap]): PbrTextures => ({ map, normalMap, ormMap }))
      .catch((error: unknown) => {
        console.warn(`Real ${surface} texture not loaded; the procedural one stays`, error)
        return null
      })
    pbrCache.set(surface, pending)
  }
  return pending
}

/** Swaps a surface material's textures for the real ones when they arrive. */
function upgradeToPbr(material: MeshStandardMaterial, surface: TexturedSurface): void {
  if (typeof window === 'undefined' || !PBR_SURFACES.includes(surface)) return
  void loadPbr(surface).then((textures) => {
    if (!textures) return
    material.map = textures.map
    material.normalMap = textures.normalMap
    material.aoMap = textures.ormMap
    material.roughnessMap = textures.ormMap
    material.metalnessMap = textures.ormMap
    material.needsUpdate = true
  })
}

export function createMaterialLibrary(decalAtlas: CanvasTexture): MaterialLibrary {
  const textured = (surface: TexturedSurface) => {
    const { map, normalMap, ormMap } = surfaceTextures(surface)
    const material = new MeshStandardMaterial({
      map,
      normalMap,
      aoMap: ormMap,
      roughnessMap: ormMap,
      metalnessMap: ormMap,
      roughness: 1,
      metalness: 1,
      vertexColors: true,
    })
    upgradeToPbr(material, surface)
    return material
  }

  const aviation = new MeshBasicMaterial()
  ;(aviation.color as Color).setRGB(4, 0.25, 0.18)

  return {
    wall: textured('wall'),
    floor: textured('floor'),
    ceiling: textured('ceiling'),
    brushed: textured('brushed'),
    painted: textured('painted'),
    rubber: textured('rubber'),
    fabric: textured('fabric'),
    concrete: textured('concrete'),
    steel: textured('steel'),
    padded: textured('padded'),
    regolith: textured('regolith'),
    // The lunar ground: its light and shadows come from a baked light map (kit/lunarLight.ts).
    lunarTerrain: lunarTerrainMaterial(null),
    terrain: new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    glass: new MeshStandardMaterial({
      color: '#a8c8dc',
      transparent: true,
      opacity: 0.12,
      roughness: 0.18,
      metalness: 0,
      side: DoubleSide,
      depthWrite: false,
      // Kept faint: the studio environment's light panels would otherwise
      // show in the glass as extra suns in the dusk sky.
      envMapIntensity: 0.25,
    }),
    emissive: new MeshBasicMaterial({ vertexColors: true }),
    decal: new MeshStandardMaterial({
      map: decalAtlas,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      roughness: 0.7,
      metalness: 0,
      vertexColors: true,
    }),
    lightCone: new MeshBasicMaterial({
      color: '#ffdca8',
      transparent: true,
      opacity: 0.06,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    }),
    aviation,
    glow: new MeshBasicMaterial({
      map: radialGlowTexture(),
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  }
}

/** Linear-space tint from an sRGB hex colour, for vertex colours. */
export function tint(hex: string, brightness = 1): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16)
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return [
    toLinear((value >> 16) & 255) * brightness,
    toLinear((value >> 8) & 255) * brightness,
    toLinear(value & 255) * brightness,
  ]
}

/** Clamp helper re-exported for kit code. */
export { clamp01 }
