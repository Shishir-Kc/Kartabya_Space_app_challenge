import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, type Mesh, PlaneGeometry, ShadowMaterial } from 'three'
import type { GameMap } from '../maps/types'
import { player } from '../state/player'
import { LUNAR_CELL, lunarTerrain } from './kit/lunar'

/** Size of the patch, in grid cells across. It covers the sun's shadow box around the player. */
const CELLS = 34

/**
 * The lunar terrain's light is baked, so it can't take real-time shadows.
 * This invisible patch of terrain follows the player and shows only the
 * shadows falling on it: the player's and the rover's long shadows from
 * the low Sun. It snaps to the terrain grid, so it fits the ground exactly.
 */
export function LunarShadows({ map }: { map: GameMap }) {
  const terrain = useMemo(() => lunarTerrain(map), [map])
  const mesh = useRef<Mesh>(null)
  const resources = useMemo(() => {
    const geometry = new PlaneGeometry(CELLS * LUNAR_CELL, CELLS * LUNAR_CELL, CELLS, CELLS)
    geometry.rotateX(-Math.PI / 2)
    const material = new ShadowMaterial({ opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    return { geometry, material }
  }, [])
  useEffect(
    () => () => {
      resources.geometry.dispose()
      resources.material.dispose()
    },
    [resources],
  )

  const centre = useRef<[number, number] | null>(null)
  useFrame(() => {
    if (!terrain || !mesh.current) return
    // Recentre on the grid point nearest the player, rewriting heights only when it moves.
    const ci = Math.round((player.x - terrain.origin) / LUNAR_CELL)
    const ck = Math.round((player.z - terrain.origin) / LUNAR_CELL)
    if (centre.current && centre.current[0] === ci && centre.current[1] === ck) return
    centre.current = [ci, ck]
    const position = resources.geometry.attributes.position as BufferAttribute
    const half = CELLS / 2
    for (let v = 0; v < position.count; v++) {
      const col = v % (CELLS + 1)
      const row = Math.floor(v / (CELLS + 1))
      const i = Math.min(terrain.count - 1, Math.max(0, ci - half + col))
      const k = Math.min(terrain.count - 1, Math.max(0, ck - half + row))
      position.setXYZ(v, terrain.origin + i * LUNAR_CELL, (terrain.grid[k * terrain.count + i] ?? 0) + 0.02, terrain.origin + k * LUNAR_CELL)
    }
    position.needsUpdate = true
    resources.geometry.computeVertexNormals()
    resources.geometry.computeBoundingSphere()
  })

  if (!terrain) return null
  return <mesh ref={mesh} geometry={resources.geometry} material={resources.material} receiveShadow frustumCulled={false} renderOrder={1} />
}
