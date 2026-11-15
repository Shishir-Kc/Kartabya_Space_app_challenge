import { useEffect, useState } from 'react'
import type { Group } from 'three'
import { loadLunarModule, lunarModuleCopy } from './lunarModule'

/**
 * The lander standing with its footpads at `position`, its front (hatch
 * and ladder) turned to `yaw`. Draws nothing until the model has loaded.
 */
export function LunarModuleView({ position, yaw = 0 }: { position: [number, number, number]; yaw?: number }) {
  const [lander, setLander] = useState<Group | null>(null)
  useEffect(() => {
    let cancelled = false
    loadLunarModule()
      .then((gltf) => {
        if (!cancelled) setLander(lunarModuleCopy(gltf))
      })
      .catch((error: unknown) => console.error('Could not load the lunar module model', error))
    return () => {
      cancelled = true
    }
  }, [])
  return lander ? <primitive object={lander} position={position} rotation-y={yaw} /> : null
}
