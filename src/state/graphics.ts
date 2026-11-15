/**
 * Graphics tiers. Medium is the default: it looks good and stays light on
 * the dev laptop (i7-1165G7, Iris Xe, 8 GB RAM). Low is the fallback the
 * game drops to on its own if the frame rate stays under 40.
 */
export type GraphicsPresetId = 'low' | 'medium' | 'high'

export const GRAPHICS_ORDER: readonly GraphicsPresetId[] = ['low', 'medium', 'high']

export interface GraphicsPreset {
  label: string
  /** Highest canvas pixel ratio; the screen's own ratio is used if lower. */
  maxPixelRatio: number
  /** Multisample antialiasing on the canvas. */
  msaa: boolean
  /** Fast approximate antialiasing as a post-process (used when MSAA is off). */
  fxaa: boolean
  /** Shadows from the key light, rendered once and then frozen. */
  shadows: boolean
  /** Reflections and soft fill light from an environment map. */
  environment: boolean
  ambientOcclusion: boolean
  /** Soft glow on emissive surfaces only. */
  bloom: boolean
  /** Frosted glass behind HUD panels. */
  glassBlur: boolean
  /** The crew figures cast shadows too (about 10 draw calls each in the shadow pass). */
  crewShadows: boolean
}

export const GRAPHICS_PRESETS: Record<GraphicsPresetId, GraphicsPreset> = {
  low: {
    label: 'Low',
    maxPixelRatio: 1,
    msaa: false,
    fxaa: true,
    shadows: false,
    environment: false,
    ambientOcclusion: false,
    bloom: false,
    glassBlur: false,
    crewShadows: false,
  },
  medium: {
    label: 'Medium',
    maxPixelRatio: 1.5,
    msaa: true,
    fxaa: false,
    shadows: true,
    environment: true,
    ambientOcclusion: false,
    bloom: false,
    glassBlur: true,
    crewShadows: false,
  },
  high: {
    label: 'High',
    maxPixelRatio: 2,
    msaa: true,
    fxaa: false,
    shadows: true,
    environment: true,
    ambientOcclusion: true,
    bloom: true,
    glassBlur: true,
    crewShadows: true,
  },
}

export function pixelRatioFor(preset: GraphicsPreset): number {
  const screen = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return Math.min(screen, preset.maxPixelRatio)
}

/** The next tier down, or null at the bottom. */
export function lowerTier(id: GraphicsPresetId): GraphicsPresetId | null {
  const index = GRAPHICS_ORDER.indexOf(id)
  return index > 0 ? (GRAPHICS_ORDER[index - 1] ?? null) : null
}
