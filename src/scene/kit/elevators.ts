/**
 * The parts of each elevator that never move: at every stop, a call button
 * beside the landing door, a floor indicator and a sign above it; and a
 * roof over shafts that stand above ground. The car and all the doors move,
 * so they are separate meshes (src/scene/Elevators.tsx).
 */
import { carDoorCenter, levelY, sideNormal } from '../../maps/collision'
import type { GameMap } from '../../maps/types'
import { WALL_THICKNESS } from '../../maps/types'
import { tint } from '../materials/surfaces'
import { Frame, type Parts, type Tint } from './parts'
import type { MapExtras } from './specs'

const PLATE = tint('#3a3f47')
const SIGN_PLATE = tint('#1d2430')
const CALL_GLOW: Tint = [2.6, 1.6, 0.3]
const INDICATOR: Tint = [2.4, 1.3, 0.25]

export function buildElevators(map: GameMap, parts: Parts, extras: MapExtras): void {
  for (const elevator of map.elevators ?? []) {
    for (const stop of elevator.stops) {
      const base = levelY(map, stop.level)

      // Call button panel, facing into the landing.
      const call = new Frame(parts, stop.call.x, stop.call.z, stop.call.yaw, base)
      call.box('brushed', 0.16, 0.26, 0.03, { y: 1.2, z: 0.015 }, PLATE)
      call.box('emissive', 0.06, 0.06, 0.02, { y: 1.24, z: 0.035 }, CALL_GLOW)
      call.box('painted', 0.06, 0.06, 0.02, { y: 1.14, z: 0.035 }, tint('#8a9099'))

      // Indicator and sign above the landing door, on the landing side.
      const door = carDoorCenter(elevator, stop.door)
      const n = sideNormal(stop.door)
      const face = WALL_THICKNESS / 2
      const yaw = Math.atan2(n.x, n.z)
      const landing = new Frame(parts, door.x + n.x * face, door.z + n.z * face, yaw, base)
      landing.box('emissive', 0.36, 0.06, 0.02, { y: elevator.doorHeight + 0.16, z: 0.03 }, INDICATOR)
      const signY = elevator.doorHeight + 0.38
      const width = 0.3 + elevator.label.length * 0.085
      landing.box('painted', width, 0.24, 0.02, { y: signY, z: 0.01 }, SIGN_PLATE)
      extras.texts.push({
        id: `elevator-sign-${elevator.id}-${stop.level}`,
        text: elevator.label,
        position: landing.point(0, signY, 0.024),
        rotationY: yaw,
        fontSize: 0.12,
        color: '#f4f6fb',
        font: 'ui',
      })
    }

    // A roof over a shaft that stands above ground.
    if (elevator.shaftTop !== undefined) {
      const { x0, x1, z0, z1 } = elevator.car
      parts.box('concrete', x1 - x0 + 0.9, 0.2, z1 - z0 + 0.9, {
        x: (x0 + x1) / 2,
        y: elevator.shaftTop + 0.1,
        z: (z0 + z1) / 2,
      }, tint('#55575b'))
    }
  }
}
