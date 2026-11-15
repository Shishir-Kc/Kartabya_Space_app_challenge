import { rectCenter } from '../maps/collision'
import type { Marker } from '../maps/types'
import { useGame } from '../state/store'
import { PALETTE } from './palette'

/** A translucent amber ring on the floor that brightens when in range. */
export function MarkerRing({ marker, y = 0 }: { marker: Marker; y?: number }) {
  const focused = useGame((state) => state.focus?.id === marker.id)
  const center = rectCenter(marker.rect)
  const size = Math.min(marker.rect.x1 - marker.rect.x0, marker.rect.z1 - marker.rect.z0)
  const radius = Math.max(0.45, Math.min(0.9, size / 2))

  return (
    <mesh position={[center.x, y + 0.015, center.z]} rotation-x={-Math.PI / 2} renderOrder={1}>
      <ringGeometry args={[radius * 0.72, radius, 40]} />
      <meshBasicMaterial
        color={PALETTE.marker}
        transparent
        opacity={focused ? 0.9 : 0.45}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
