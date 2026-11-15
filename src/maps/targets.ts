/**
 * Things the player can use with E: consoles and markers. Each frame the
 * player controller asks for the nearest one in range and in view.
 */
import { getChallenge } from '../data/challenges'
import { levelOf, outbuildingDoor, placeAt, rectCenter } from './collision'
import type { GameMap, Vec2 } from './types'

/** How close the player has to be to use something. */
export const INTERACT_RANGE = 2.2

/** How far off the view direction something may be and still count. */
const INTERACT_MAX_ANGLE = (70 * Math.PI) / 180
const INTERACT_MIN_COS = Math.cos(INTERACT_MAX_ANGLE)

export interface InteractTarget {
  id: string
  /** Notices show their text without the E key. */
  kind: 'console' | 'marker' | 'notice' | 'elevator' | 'sequence' | 'airlock' | 'rover'
  /** Text after "Press E:". */
  prompt: string
  point: Vec2
  /** Only targets in the player's room or zone count, so nothing works through a wall. */
  roomId: string | undefined
  /** Height of the target's floor, so a target on another level never counts. */
  level: string
  /** Only offered after this challenge's console has been used. */
  requires?: number
}

export function listTargets(map: GameMap): InteractTarget[] {
  const consoles = map.consoles.map((item): InteractTarget => ({
    id: item.id,
    kind: 'console',
    prompt: getChallenge(item.challengeId)?.title ?? `Challenge ${item.challengeId}`,
    point: item.position,
    roomId: placeAt(map, item.position.x, item.position.z, levelOf(item))?.id,
    level: levelOf(item),
  }))
  const markers = map.markers.map((marker): InteractTarget => {
    const point = rectCenter(marker.rect)
    return {
      id: marker.id,
      kind: marker.kind === 'notice' ? 'notice' : 'marker',
      prompt: marker.label,
      point,
      roomId: placeAt(map, point.x, point.z, levelOf(marker))?.id,
      level: levelOf(marker),
      requires: marker.kind === 'sequence' ? marker.requires : undefined,
    }
  })
  // Every outbuilding door says it's locked, a metre in front of it.
  const outdoor = map.outdoor
  const notices = (outdoor?.buildings ?? []).flatMap((building): InteractTarget[] => {
    const door = outbuildingDoor(building)
    if (!door || !outdoor) return []
    const point = { x: door.center.x + door.normal.x, z: door.center.z + door.normal.z }
    return [
      {
        id: `${building.id}-door`,
        kind: 'notice',
        prompt: outdoor.lockedMessage,
        point,
        roomId: placeAt(map, point.x, point.z)?.id,
        level: 'ground',
      },
    ]
  })
  return [...consoles, ...markers, ...notices]
}

/** The nearest target within range and within about 70 degrees of the view. */
export function findFocus(
  targets: readonly InteractTarget[],
  roomId: string | undefined,
  x: number,
  z: number,
  yaw: number,
): InteractTarget | null {
  const forwardX = -Math.sin(yaw)
  const forwardZ = -Math.cos(yaw)
  let best: InteractTarget | null = null
  let bestDistance = Infinity

  for (const target of targets) {
    if (roomId === undefined || target.roomId !== roomId) continue
    const dx = target.point.x - x
    const dz = target.point.z - z
    const distance = Math.hypot(dx, dz)
    if (distance > INTERACT_RANGE || distance >= bestDistance) continue
    if (distance > 0.05) {
      const cos = (dx * forwardX + dz * forwardZ) / distance
      if (cos < INTERACT_MIN_COS) continue
    }
    best = target
    bestDistance = distance
  }
  return best
}
