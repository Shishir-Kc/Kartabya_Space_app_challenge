/**
 * Scene colours that aren't part of a surface material: lighting, the dusk
 * sky, fog and markers. Surfaces live in
 * ./materials/surfaces.ts. All values are sRGB hex.
 */
export const PALETTE = {
  marker: '#ffb547',

  // Dusk sky, from the zenith down to the glow at the horizon.
  skyTop: '#07112a',
  skyMid: '#22325e',
  skyHorizon: '#c46f78',
  skyGlow: '#ff9a52',
  moon: '#f4efe4',
  stars: '#e8ecf6',
  fog: '#4f4566',
  oceanDeep: '#0a1426',

  hemisphereSky: '#8a8fb8',
  hemisphereGround: '#8c7f72',
  keyLight: '#d6defa',
  // Warm amber room light, like late-evening lamps.
  roomLight: '#ffcf9a',
} as const

/** Fog starts and ends here, in metres: distant terrain fades into the dusk. */
export const FOG_NEAR = 70
export const FOG_FAR = 520
