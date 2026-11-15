/**
 * Click-to-walk routes for younger players. A route goes through door
 * centres (room, its door, corridor, target door, target room) and ends at
 * the console's stand point if the target room has one, at an outdoor
 * zone's target spot, or at the room centre otherwise. Outdoor zones count
 * as places like rooms, joined to the building by its outside doors.
 * Routes stay on one level: elevators are ridden, not walked.
 */
import {
  buildCollision,
  isWalkable,
  levelOf,
  listDoors,
  listPlaces,
  placeAt,
  rectCenter,
  roomAt,
  standPoint,
  type CollisionModel,
  type Door,
} from './collision'
import { GROUND_LEVEL, type GameMap, type Vec2 } from './types'

/** How far before and after a door the route places a waypoint. */
const DOOR_APPROACH = 0.9

export interface Route {
  /** Waypoints still to reach, in order. */
  points: Vec2[]
  /** Yaw to turn to on arrival (facing the console), or null. */
  faceYaw: number | null
  /** Seconds spent making almost no progress; the route gives up after a while. */
  stuck: number
}

/** The yaw that looks along (dx, dz). Matches the camera: yaw 0 looks north (-z). */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz)
}

/** The shortest signed angle from `from` to `to`, in -PI..PI. */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return delta
}

/** Turns `current` toward `target` by at most `maxStep` radians. */
export function turnToward(current: number, target: number, maxStep: number): number {
  const delta = angleDelta(current, target)
  return current + Math.max(-maxStep, Math.min(maxStep, delta))
}

const models = new WeakMap<GameMap, Map<string, CollisionModel>>()

/** Outdoor routes keep this far from walls and fences, more than the player's own radius. */
const ROUTE_CLEARANCE = 0.6

function collisionFor(map: GameMap, level: string): CollisionModel {
  let perLevel = models.get(map)
  if (!perLevel) {
    perLevel = new Map()
    models.set(map, perLevel)
  }
  let model = perLevel.get(level)
  if (!model) {
    model = buildCollision(map, ROUTE_CLEARANCE, level)
    perLevel.set(level, model)
  }
  return model
}

/** Outdoor routes are found on a grid of this size, in metres. */
const GRID = 1

/** True if a straight walk from a to b stays on walkable ground. */
function clearLine(model: CollisionModel, a: Vec2, b: Vec2): boolean {
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  const steps = Math.max(1, Math.ceil(length / 0.25))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    if (!isWalkable(model, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false
  }
  return true
}

/**
 * A walk across open ground that goes around buildings and fences: A* on a
 * coarse grid over the zone, then shortened to the fewest straight legs.
 * Returns the points after `a`, ending at `b`, or null if there is no way.
 */
function outdoorPath(map: GameMap, a: Vec2, b: Vec2): Vec2[] | null {
  const model = collisionFor(map, GROUND_LEVEL)
  if (clearLine(model, a, b)) return [b]
  const zone = map.outdoor?.zones.find((candidate) => placeAt(map, a.x, a.z)?.id === candidate.id)
  if (!zone) return null
  const { x0, z0 } = zone.rect
  const w = Math.ceil((zone.rect.x1 - x0) / GRID) + 1
  const h = Math.ceil((zone.rect.z1 - z0) / GRID) + 1
  const cell = (p: Vec2) => [Math.round((p.x - x0) / GRID), Math.round((p.z - z0) / GRID)] as const
  const center = (i: number, k: number): Vec2 => ({ x: x0 + i * GRID, z: z0 + k * GRID })
  const free = new Int8Array(w * h).fill(-1)
  const walkable = (i: number, k: number) => {
    if (i < 0 || k < 0 || i >= w || k >= h) return false
    const index = k * w + i
    if (free[index] === -1) {
      const p = center(i, k)
      free[index] = isWalkable(model, p.x, p.z) ? 1 : 0
    }
    return free[index] === 1
  }

  const [si, sk] = cell(a)
  const [gi, gk] = cell(b)
  const start = sk * w + si
  const goal = gk * w + gi
  const cost = new Float32Array(w * h).fill(Infinity)
  const from = new Int32Array(w * h).fill(-1)
  const open: { index: number; f: number }[] = [{ index: start, f: 0 }]
  cost[start] = 0
  while (open.length > 0) {
    let best = 0
    for (let j = 1; j < open.length; j++) if ((open[j]?.f ?? Infinity) < (open[best]?.f ?? Infinity)) best = j
    const current = open.splice(best, 1)[0]?.index ?? goal
    if (current === goal) break
    const ci = current % w
    const ck = (current - ci) / w
    for (let di = -1; di <= 1; di++) {
      for (let dk = -1; dk <= 1; dk++) {
        if (di === 0 && dk === 0) continue
        const ni = ci + di
        const nk = ck + dk
        if (!walkable(ni, nk)) continue
        // No cutting corners past a blocked cell.
        if (di !== 0 && dk !== 0 && (!walkable(ci + di, ck) || !walkable(ci, ck + dk))) continue
        const next = nk * w + ni
        const g = (cost[current] ?? Infinity) + (di !== 0 && dk !== 0 ? Math.SQRT2 : 1)
        if (g >= (cost[next] ?? Infinity)) continue
        cost[next] = g
        from[next] = current
        open.push({ index: next, f: g + Math.hypot(gi - ni, gk - nk) })
      }
    }
  }
  if (from[goal] === -1 && goal !== start) return null

  const cells: Vec2[] = []
  for (let index = goal; index !== start && index !== -1; index = from[index] ?? -1) {
    const i = index % w
    cells.unshift(center(i, (index - i) / w))
  }
  cells[cells.length - 1] = b

  // Keep only the corners: skip ahead as far as a straight line stays clear.
  const result: Vec2[] = []
  let anchor = a
  let i = 0
  while (i < cells.length) {
    let far = i
    for (let j = cells.length - 1; j > i; j--) {
      if (clearLine(model, anchor, cells[j] as Vec2)) {
        far = j
        break
      }
    }
    const point = cells[far] as Vec2
    result.push(point)
    anchor = point
    i = far + 1
  }
  return result
}

/** Replaces each straight leg that runs across open ground with one that goes around obstacles. */
function routeAroundOutdoors(map: GameMap, from: Vec2, points: Vec2[], level: string): Vec2[] {
  if (level !== GROUND_LEVEL) return points
  const result: Vec2[] = []
  let previous = from
  for (const point of points) {
    const a = placeAt(map, previous.x, previous.z)
    const b = placeAt(map, point.x, point.z)
    if (a?.kind === 'zone' && b?.kind === 'zone' && a.id === b.id) {
      result.push(...(outdoorPath(map, previous, point) ?? [point]))
    } else {
      result.push(point)
    }
    previous = point
  }
  return result
}

/** A waypoint just off a door, on the side of the given room or zone. */
function doorSide(map: GameMap, door: Door, placeId: string): Vec2 {
  const level = door.level
  const options: Vec2[] =
    door.runs === 'x'
      ? [
          { x: door.center.x, z: door.center.z - DOOR_APPROACH },
          { x: door.center.x, z: door.center.z + DOOR_APPROACH },
        ]
      : [
          { x: door.center.x - DOOR_APPROACH, z: door.center.z },
          { x: door.center.x + DOOR_APPROACH, z: door.center.z },
        ]
  return options.find((point) => placeAt(map, point.x, point.z, level)?.id === placeId) ?? options[0] ?? door.center
}

/** Plans a walk on one level from `from` into the target room or zone, or returns null if there is no way. */
export function planRoute(map: GameMap, from: Vec2, targetRoomId: string, level: string = GROUND_LEVEL): Route | null {
  const start = placeAt(map, from.x, from.z, level)
  const target = listPlaces(map, level).find((place) => place.id === targetRoomId)
  if (!start || !target) return null

  // Breadth-first search over rooms, joined by doors (not elevators).
  const doors = listDoors(map, level).filter((door) => !door.elevator)
  const cameFrom = new Map<string, { room: string; door: Door }>()
  const seen = new Set<string>([start.id])
  const queue: string[] = [start.id]
  while (queue.length > 0) {
    const room = queue.shift()
    if (room === undefined || room === target.id) break
    for (const door of doors) {
      const [a, b] = door.rooms
      if (!a || !b) continue
      const next = a === room ? b : b === room ? a : null
      if (!next || seen.has(next)) continue
      seen.add(next)
      cameFrom.set(next, { room, door })
      queue.push(next)
    }
  }
  if (!seen.has(target.id)) return null

  // Walk back from the target to list the door crossings in order.
  const crossings: { from: string; to: string; door: Door }[] = []
  let current = target.id
  while (current !== start.id) {
    const step = cameFrom.get(current)
    if (!step) return null
    crossings.unshift({ from: step.room, to: current, door: step.door })
    current = step.room
  }

  const points: Vec2[] = []
  for (const crossing of crossings) {
    points.push(doorSide(map, crossing.door, crossing.from))
    points.push(doorSide(map, crossing.door, crossing.to))
  }

  const zone = map.outdoor?.zones.find((candidate) => candidate.id === target.id)
  if (zone) {
    points.push({ x: zone.target.x, z: zone.target.z })
    return { points: routeAroundOutdoors(map, from, points, level), faceYaw: zone.target.yaw, stuck: 0 }
  }

  const item = map.consoles.find(
    (candidate) =>
      levelOf(candidate) === level && roomAt(map, candidate.position.x, candidate.position.z, level)?.id === target.id,
  )
  if (item) {
    points.push(standPoint(item))
    return {
      points: routeAroundOutdoors(map, from, points, level),
      faceYaw: yawToward(-item.facing.x, -item.facing.z),
      stuck: 0,
    }
  }
  points.push(rectCenter(target.rect))
  return { points: routeAroundOutdoors(map, from, points, level), faceYaw: null, stuck: 0 }
}
