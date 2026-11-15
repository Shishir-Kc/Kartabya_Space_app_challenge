/**
 * Turns one map's data into everything the renderer needs: merged geometry
 * per material, plus the text, screens and lights that can't be merged.
 * Every map gets the same kit, so the spacecraft and outpost inherit the
 * launch center's look for free.
 */
import type { GameMap } from '../../maps/types'
import { buildElevators } from './elevators'
import { buildExterior } from './exterior'
import { buildInterior } from './interior'
import { Parts, type BuiltPart } from './parts'
import { buildConsoleBody, buildProp } from './props'
import { buildLunarSurface } from './lunar'
import { buildStation } from './station'
import type { MapExtras } from './specs'

export interface BuiltMap {
  parts: BuiltPart[]
  extras: MapExtras
}

export function buildMap(map: GameMap): BuiltMap {
  const parts = new Parts()
  const extras: MapExtras = { texts: [], screens: [], lights: [] }

  // Spacecraft modules get padded walls and round hatches; the launch center its offices.
  if (map.style === 'station') buildStation(map, parts, extras)
  else buildInterior(map, parts, extras)
  for (const prop of map.props) buildProp(map, prop, parts, extras)
  for (const item of map.consoles) buildConsoleBody(map, item, parts)
  buildElevators(map, parts, extras)
  buildExterior(map, parts)
  buildLunarSurface(map, parts, extras)

  return { parts: parts.build(), extras }
}
