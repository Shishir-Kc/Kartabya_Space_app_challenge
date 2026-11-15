/**
 * Prepares a lunar map's terrain and light maps in the background (a web
 * worker), so they are ready before they're needed: the spacecraft starts
 * this for the outpost long before the landing. Whatever isn't ready when
 * it is needed is simply worked out then (and the worker's copy is ignored).
 */
import type { GameMap } from '../../maps/types'
import { primeTerrainGrid } from './lunar'
import { FAR_LIGHT, MID_LIGHT, primeLight } from './lunarLight'

const started = new WeakSet<GameMap>()

export function prebakeLunar(map: GameMap): void {
  if (started.has(map) || typeof Worker === 'undefined' || map.exterior?.scene !== 'lunar-south-pole') return
  started.add(map)
  const worker = new Worker(new URL('./lunarBake.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<{ grid: Float32Array; site: Float32Array; mid: Float32Array; far: Float32Array } | null>) => {
    worker.terminate()
    const result = event.data
    if (!result) return
    primeTerrainGrid(map, result.grid)
    primeLight(map, 'site', result.site)
    primeLight(map, MID_LIGHT, result.mid)
    primeLight(map, FAR_LIGHT, result.far)
  }
  worker.onerror = () => worker.terminate()
  worker.postMessage({ mapId: map.id })
}
