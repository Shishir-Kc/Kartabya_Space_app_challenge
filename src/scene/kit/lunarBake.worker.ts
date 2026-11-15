/**
 * Works out a lunar map's terrain heights and its baked light maps off the
 * main thread (about two seconds of work), so the landing never stalls
 * while they are made. See ./lunarPrebake.ts.
 */
import { getMap } from '../../maps/registry'
import type { MapId } from '../../maps/types'
import { lunarTerrain } from './lunar'
import { FAR_LIGHT, MID_LIGHT, siteLight, wideLight } from './lunarLight'

self.onmessage = (event: MessageEvent<{ mapId: MapId }>) => {
  const map = getMap(event.data.mapId)
  const terrain = map ? lunarTerrain(map) : null
  if (!map || !terrain) {
    self.postMessage(null)
    return
  }
  const site = siteLight(map)!.data
  const mid = wideLight(map, MID_LIGHT.extent, MID_LIGHT.size)!.data
  const far = wideLight(map, FAR_LIGHT.extent, FAR_LIGHT.size)!.data
  const grid = terrain.grid
  self.postMessage({ grid, site, mid, far }, { transfer: [grid.buffer, site.buffer, mid.buffer, far.buffer] })
}
