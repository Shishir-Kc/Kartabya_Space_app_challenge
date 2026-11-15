/**
 * Things the kit builders produce besides merged geometry: text (signs and
 * the countdown clock), canvas screens and room lights. These stay separate
 * meshes or lights because they can't be merged.
 */
export type Vec3 = [number, number, number]

export interface TextSpec {
  id: string
  text: string
  position: Vec3
  rotationY: number
  fontSize: number
  color: string
  font: 'ui' | 'mono'
  /** Bright, unlit text (the clock); otherwise lit like a painted sign. */
  glow?: boolean
}

export interface ScreenSpec {
  id: string
  kind: 'mission-briefing'
  position: Vec3
  rotationY: number
  width: number
  height: number
}

export interface LightSpec {
  position: Vec3
  intensity: number
  /** Only the current level's lights are switched on. */
  level: string
  /** sRGB hex; the map style's room light colour if left out. */
  color?: string
}

export interface MapExtras {
  texts: TextSpec[]
  screens: ScreenSpec[]
  lights: LightSpec[]
}
