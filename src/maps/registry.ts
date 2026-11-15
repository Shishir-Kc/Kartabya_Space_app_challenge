/**
 * Every map the game can load. Phase 2 adds the spacecraft here and nothing
 * else in the player or scene code has to change.
 */
import { LAUNCH_CENTER } from './launchCenter'
import { OUTPOST } from './outpost'
import { SPACECRAFT } from './spacecraft'
import type { GameMap, MapId } from './types'

const MAPS: Partial<Record<MapId, GameMap>> = {
  'launch-center': LAUNCH_CENTER,
  spacecraft: SPACECRAFT,
  outpost: OUTPOST,
}

/**
 * The map a new run starts on. Dev builds take `?map=spacecraft` to start
 * somewhere else (with `&skipLaunch` to skip the launch sequence).
 */
export const START_MAP: MapId = devStartMap() ?? 'launch-center'

function devStartMap(): MapId | undefined {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return undefined
  const id = new URLSearchParams(window.location.search).get('map') as MapId | null
  return id && id in MAPS ? id : undefined
}

/** The map with this id, or undefined if it has not been built yet. */
export function getMap(id: MapId): GameMap | undefined {
  return MAPS[id]
}

/** The map with this id, falling back to the start map. */
export function requireMap(id: MapId): GameMap {
  return MAPS[id] ?? LAUNCH_CENTER
}
