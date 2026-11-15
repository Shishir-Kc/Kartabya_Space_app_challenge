/**
 * Third-person camera placement. The camera sits behind and a little above
 * the player's right shoulder. If that spot is inside a wall, behind a
 * door lintel or above the ceiling, the camera is pulled in toward the
 * player's head until it is clear.
 */
import { buildingRects, inset, moduleRects, levelOf, levelY, listDoors, roomFloor } from '../maps/collision'
import type { GameMap, Rect } from '../maps/types'
import { groundHeight } from './kit/exterior'
import { DOOR_HEIGHT, WALL_THICKNESS } from '../maps/types'
import { EYE_HEIGHT } from '../state/player'

/** How far behind the head the camera sits when nothing is in the way. */
export const CAMERA_DISTANCE = 3.2
/** Lift above the head, and offset to the right, so the body doesn't hide the crosshair. */
export const CAMERA_LIFT = 0.35
export const CAMERA_SHOULDER = 0.4
/** Third-person pitch is clamped tighter so the camera doesn't dive into floor or ceiling. */
export const THIRD_PERSON_MAX_PITCH = (55 * Math.PI) / 180

/** Keeps the near clip plane off the walls. */
const CAMERA_RADIUS = 0.15
/** Check the line from head to camera at this many points. */
const SAMPLES = 32

interface Space {
  rect: Rect
  /** Floor height of the space. */
  bottom: number
  /** The camera must stay this far below the top. */
  top: number
}

export interface CameraSpace {
  /** Rooms and doorways. */
  spaces: Space[]
  /** Outdoor zones: open to the sky, above the ground. */
  zones: Rect[]
  /** Building footprints the camera can't enter from outside. */
  solid: Rect[]
  ground: (x: number, z: number) => number
}

/** Where the camera may be on one level: each room up to its ceiling, each doorway up to its lintel. */
export function buildCameraSpace(map: GameMap, level = 'ground'): CameraSpace {
  const base = levelY(map, level)
  const spaces: Space[] = map.rooms
    .filter((room) => levelOf(room) === level)
    .map((room) => ({
      rect: inset(room.rect, CAMERA_RADIUS + WALL_THICKNESS / 2),
      bottom: roomFloor(map, room),
      top: base + room.ceiling,
    }))
  for (const door of listDoors(map, level)) {
    if (door.elevator) continue
    const half = door.width / 2 - CAMERA_RADIUS
    if (half <= 0) continue
    spaces.push({
      rect:
        door.runs === 'x'
          ? { x0: door.center.x - half, x1: door.center.x + half, z0: door.center.z - 1, z1: door.center.z + 1 }
          : { x0: door.center.x - 1, x1: door.center.x + 1, z0: door.center.z - half, z1: door.center.z + half },
      bottom: base + door.sill,
      top: base + Math.min(DOOR_HEIGHT, door.height),
    })
  }
  if (level !== 'ground') return { spaces, zones: [], solid: [], ground: () => base }
  const zones = (map.outdoor?.zones ?? []).map((zone) => zone.rect)
  const solid = [
    ...buildingRects(map),
    ...moduleRects(map).map((m) => m.rect),
    ...(map.outdoor?.buildings ?? []).map((building) => building.rect),
  ].map((rect) => inset(rect, -CAMERA_RADIUS))
  return { spaces, zones, solid, ground: groundHeight(map) }
}

function inRect(rect: Rect, x: number, z: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1
}

function isClear(space: CameraSpace, x: number, y: number, z: number): boolean {
  const inside = space.spaces.some(
    ({ rect, bottom, top }) => inRect(rect, x, z) && y >= bottom + 0.2 && y <= top - CAMERA_RADIUS,
  )
  if (inside) return true
  if (!space.zones.some((rect) => inRect(rect, x, z))) return false
  if (space.solid.some((rect) => inRect(rect, x, z))) return false
  return y >= space.ground(x, z) + 0.25
}

export interface CameraTarget {
  x: number
  y: number
  z: number
}

/** The camera spot with nothing in the way, for a player at (x, z) standing at height `baseY`, looking along yaw and pitch. */
export function idealCamera(
  x: number,
  z: number,
  yaw: number,
  pitch: number,
  baseY = 0,
  distance = CAMERA_DISTANCE,
  shoulder = CAMERA_SHOULDER,
  eyeHeight = EYE_HEIGHT,
): CameraTarget {
  const p = Math.max(-THIRD_PERSON_MAX_PITCH, Math.min(THIRD_PERSON_MAX_PITCH, pitch))
  const cosPitch = Math.cos(p)
  // View direction, matching the camera's YXZ rotation.
  const dirX = -Math.sin(yaw) * cosPitch
  const dirY = Math.sin(p)
  const dirZ = -Math.cos(yaw) * cosPitch
  // Right of the view, flat on the floor.
  const rightX = Math.cos(yaw)
  const rightZ = -Math.sin(yaw)
  return {
    x: x - dirX * distance + rightX * shoulder,
    y: baseY + eyeHeight - dirY * distance + CAMERA_LIFT,
    z: z - dirZ * distance + rightZ * shoulder,
  }
}

/**
 * How far along the line from the head to `target` the camera can go
 * (0 = at the head, 1 = all the way), stopping before the first blocked point.
 */
export function clearFraction(
  space: CameraSpace,
  x: number,
  z: number,
  target: CameraTarget,
  baseY = 0,
  eyeHeight = EYE_HEIGHT,
): number {
  let last = 0
  const eye = baseY + eyeHeight
  for (let i = 1; i <= SAMPLES; i++) {
    const t = i / SAMPLES
    const px = x + (target.x - x) * t
    const py = eye + (target.y - eye) * t
    const pz = z + (target.z - z) * t
    if (!isClear(space, px, py, pz)) break
    last = t
  }
  return last
}
