/**
 * Suits the astronaut can wear. All use the same body: an outfit is only a
 * material on the body's outfit part (everything but head, neck and hands).
 * The model marks the boots in its vertex colours, so they stay dark.
 */
import type { GearColours } from './gear'

export type OutfitId = 'flight' | 'launch' | 'surface'

export interface Outfit {
  label: string
  /** Suit colour, sRGB hex. Never close to a skin tone. */
  color: string
  roughness: number
  /** Gloves, boots, straps, pockets and pads. */
  gear: GearColours
}

export const OUTFITS: Record<OutfitId, Outfit> = {
  // On Earth, in the launch center; also indoors at the outpost.
  flight: {
    label: 'Blue flight coverall',
    color: '#2f5c9c',
    roughness: 0.9,
    gear: { glove: '#2a2d33', boot: '#23262b', strap: '#47618a', pocket: '#284f88', pad: '#3a3f47' },
  },
  // On the spacecraft: strong safety orange, with white gloves.
  launch: {
    label: 'Orange launch suit',
    color: '#e8641e',
    roughness: 0.84,
    gear: { glove: '#eef0f2', boot: '#2a2d33', strap: '#b04a16', pocket: '#cf5716', pad: '#3a3f47' },
  },
  // On the lunar surface: an Artemis-style Moon suit (public/models/suit-artemis-<body>.glb); this colour and gear are
  // the built-in fallback, worn only if that file can't load.
  surface: {
    label: 'Artemis Moon suit',
    color: '#e6e8ec',
    roughness: 0.7,
    gear: { glove: '#f2f3f5', boot: '#d9dce1', strap: '#8e949c', pocket: '#d5d8dc', pad: '#b9bec6' },
  },
}
