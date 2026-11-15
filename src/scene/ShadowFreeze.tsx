import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/** Frames to render shadows for before freezing them. */
const SHADOW_FRAMES = 20

/**
 * Nothing that casts a shadow ever moves, so the shadow map is rendered for
 * the first few frames of each map and then frozen.
 */
export function ShadowFreeze({ mapId, freeze = true }: { mapId: string; freeze?: boolean }) {
  const gl = useThree((state) => state.gl)
  const frames = useRef(0)

  useEffect(() => {
    gl.shadowMap.autoUpdate = true
    gl.shadowMap.needsUpdate = true
    frames.current = 0
  }, [gl, mapId])

  useFrame(() => {
    // On the Moon the player's long shadow moves, so the shadow map keeps updating.
    if (!freeze || frames.current >= SHADOW_FRAMES) return
    frames.current += 1
    if (frames.current === SHADOW_FRAMES) gl.shadowMap.autoUpdate = false
  })
  return null
}
