/**
 * Collision without a physics engine. Instead of walls to bump into, it
 * models where the player is allowed to stand:
 *
 * - Indoors: every room rectangle, shrunk by the player radius plus half a
 *   wall, and one rectangle per door that reaches 1 m into the places on
 *   both sides (otherwise shrinking would leave a gap in each doorway).
 * - Outdoors: every outdoor zone, shrunk by the player radius, minus the
 *   main building's footprint and every outbuilding (grown by the radius).
 * - Obstacles anywhere: console and prop footprints, and fence lines, grown
 *   by the player radius.
 *
 * A position is valid if it is indoors or outdoors, and outside every
 * obstacle. Moves test x and z separately, so walking diagonally into a wall
 * slides along it instead of sticking.
 */
import type { Console, Elevator, GameMap, Level, Outbuilding, OutdoorZone, Prop, Rect, Room, Side, Vec2 } from './types'
import { CAR_WALL_GAP, DOOR_HEIGHT, GROUND_LEVEL, WALL_THICKNESS } from './types'
import { BLOCKING_ROCK, rockFootprint, scatterRocks } from './lunarScatter'

export const PLAYER_RADIUS = 0.32
/** Half the width of a standing crew member's footprint. */
export const CREW_HALF_WIDTH = 0.25
/**
 * The crew figures in the maps (`crew` in each map, placed by
 * src/state/crewPlaces.ts): drawn and solid when true.
 */
export const CREW_FIGURES = true

/** How far a door's walkable rectangle reaches into the rooms either side. */
const DOOR_REACH = 1

/** Console desk size. The desk is wide along the wall it backs onto. */
export const CONSOLE_WIDTH = 1.2
export const CONSOLE_DEPTH = 0.6

/** Distance from the desk centre to where the player stands to use it. */
export const CONSOLE_STAND_DISTANCE = 1

/** A standing crew member's footprint (a square round their capsule), grown by `radius`. Floating and lying crew aren't in the way. */
export function crewBlockers(people: readonly { speakerId: string; x: number; z: number; level?: string; pose: string }[], level: string, radius = PLAYER_RADIUS): BlockerRect[] {
  const half = CREW_HALF_WIDTH + radius
  return people
    .filter((p) => p.pose === 'stand' && (p.level ?? GROUND_LEVEL) === level)
    .map((p) => ({ rect: { x0: p.x - half, x1: p.x + half, z0: p.z - half, z1: p.z + half }, kind: 'prop' as const, id: `crew-${p.speakerId}` }))
}

export function contains(rect: Rect, x: number, z: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1
}

export function inset(rect: Rect, by: number): Rect {
  return { x0: rect.x0 + by, x1: rect.x1 - by, z0: rect.z0 + by, z1: rect.z1 - by }
}

export function rectCenter(rect: Rect): Vec2 {
  return { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 }
}

const DEFAULT_LEVELS: Level[] = [{ id: GROUND_LEVEL, label: 'Ground', y: 0 }]

export function listLevels(map: GameMap): Level[] {
  return map.levels ?? DEFAULT_LEVELS
}

export function levelById(map: GameMap, id: string): Level {
  return listLevels(map).find((level) => level.id === id) ?? DEFAULT_LEVELS[0]!
}

/** Floor height of a level. */
export function levelY(map: GameMap, id: string | undefined): number {
  return levelById(map, id ?? GROUND_LEVEL).y
}

/** The level a room, wall, prop, console or marker is on. */
export function levelOf(item: { level?: string }): string {
  return item.level ?? GROUND_LEVEL
}

/** The room on this level containing this point, if any. */
export function roomAt(map: GameMap, x: number, z: number, level: string = GROUND_LEVEL): Room | undefined {
  return map.rooms.find((room) => levelOf(room) === level && contains(room.rect, x, z))
}

/** The floor area of an elevator shaft (the car plus its walls). */
export function shaftRect(elevator: Elevator): Rect {
  return inset(elevator.car, -(CAR_WALL_GAP + WALL_THICKNESS / 2))
}

/**
 * The main building's footprint at ground level: every ground room out to
 * the outside face of its walls, plus elevator shafts that reach the ground.
 */
export function buildingRects(map: GameMap): Rect[] {
  const rooms = map.rooms.filter((room) => levelOf(room) === GROUND_LEVEL).map((room) => inset(room.rect, -WALL_THICKNESS / 2))
  const shafts = (map.elevators ?? [])
    .filter((elevator) => elevator.stops.some((stop) => stop.level === GROUND_LEVEL) && elevator.shaftTop !== undefined)
    .map(shaftRect)
  return [...rooms, ...shafts]
}

/**
 * The outside of each ground-level module, as solid ground: its walls, the
 * shell round them (`Outdoor.buildingMargin`) and any regolith bags piled
 * against it (`Room.shielding`). Empty without an outdoor area.
 */
export function moduleRects(map: GameMap): { rect: Rect; id: string }[] {
  const margin = map.outdoor?.buildingMargin ?? 0
  return map.rooms
    .filter((room) => levelOf(room) === GROUND_LEVEL)
    .map((room) => ({ rect: inset(room.rect, -(WALL_THICKNESS / 2 + margin + (room.shielding ?? 0))), id: room.id }))
}

/** How far the approach lane to an outside door reaches out from the wall. */
export const PORCH_REACH = 1.4

/**
 * An approach lane through the module's shell (`Outdoor.buildingMargin`) to
 * every outside door, so the player can walk right up to it. Only as wide
 * as the doorway, so the body never pushes into the shell beside it, and
 * too narrow for the rover. Empty for buildings without a shell.
 */
export function buildingCuts(map: GameMap): { rect: Rect; door: boolean }[] {
  if (!map.outdoor?.buildingMargin) return []
  const cuts: { rect: Rect; door: boolean }[] = []
  for (const wall of map.walls) {
    if (levelOf(wall) !== GROUND_LEVEL) continue
    for (const opening of wall.openings ?? []) {
      if (opening.kind !== 'door') continue
      for (const side of [-1, 1]) {
        const probe = wall.runs === 'x' ? { x: opening.center, z: wall.at + side * 0.5 } : { x: wall.at + side * 0.5, z: opening.center }
        if (roomAt(map, probe.x, probe.z)) continue
        const half = opening.width / 2 + 0.07
        const near = wall.at
        const far = wall.at + side * PORCH_REACH
        const across = { lo: opening.center - half, hi: opening.center + half }
        const along = { lo: Math.min(near, far), hi: Math.max(near, far) }
        cuts.push({
          rect:
            wall.runs === 'x'
              ? { x0: across.lo, x1: across.hi, z0: along.lo, z1: along.hi }
              : { x0: along.lo, x1: along.hi, z0: across.lo, z1: across.hi },
          door: true,
        })
      }
    }
  }
  return cuts
}

/** The outdoor zone containing this point (ground level only), if it isn't inside the main building. */
export function zoneAt(map: GameMap, x: number, z: number, level: string = GROUND_LEVEL): OutdoorZone | undefined {
  if (level !== GROUND_LEVEL) return undefined
  if (buildingRects(map).some((rect) => contains(rect, x, z))) return undefined
  return map.outdoor?.zones.find((zone) => contains(zone.rect, x, z))
}

/** Where an outbuilding's (locked) door is, and which way it faces. */
export function outbuildingDoor(building: Outbuilding): { center: Vec2; normal: Vec2 } | null {
  const door = building.door
  if (!door) return null
  const { x0, x1, z0, z1 } = building.rect
  switch (door.side) {
    case 'north':
      return { center: { x: x0 + door.along, z: z0 }, normal: { x: 0, z: -1 } }
    case 'south':
      return { center: { x: x0 + door.along, z: z1 }, normal: { x: 0, z: 1 } }
    case 'east':
      return { center: { x: x1, z: z0 + door.along }, normal: { x: 1, z: 0 } }
    case 'west':
      return { center: { x: x0, z: z0 + door.along }, normal: { x: -1, z: 0 } }
  }
}

/** A room or an outdoor zone: anywhere the player can be. */
export interface Place {
  id: string
  label: string
  shortLabel?: string
  sign?: string
  kind: 'room' | 'zone'
  rect: Rect
  level: string
}

function roomPlace(room: Room): Place {
  return {
    id: room.id,
    label: room.label,
    shortLabel: room.shortLabel,
    sign: room.sign,
    kind: 'room',
    rect: room.rect,
    level: levelOf(room),
  }
}

function zonePlace(zone: OutdoorZone): Place {
  return {
    id: zone.id,
    label: zone.label,
    shortLabel: zone.shortLabel,
    sign: zone.sign,
    kind: 'zone',
    rect: zone.rect,
    level: GROUND_LEVEL,
  }
}

/** Every room and outdoor zone, optionally only those on one level. */
export function listPlaces(map: GameMap, level?: string): Place[] {
  const all = [...map.rooms.map(roomPlace), ...(map.outdoor?.zones ?? []).map(zonePlace)]
  return level === undefined ? all : all.filter((place) => place.level === level)
}

/** The room or outdoor zone at this point on a level, rooms first. */
export function placeAt(map: GameMap, x: number, z: number, level: string = GROUND_LEVEL): Place | undefined {
  const room = roomAt(map, x, z, level)
  if (room) return roomPlace(room)
  const zone = zoneAt(map, x, z, level)
  return zone ? zonePlace(zone) : undefined
}

export interface Door {
  /** Centre of the doorway, on the wall line. */
  center: Vec2
  width: number
  runs: 'x' | 'z'
  /** The places (rooms or outdoor zones) on either side (north/west first). */
  rooms: [string | undefined, string | undefined]
  sliding: boolean
  /** Top of the opening above the floor. */
  height: number
  /** Bottom of the opening above the floor: 0 for doors, higher for hatches. */
  sill: number
  round: boolean
  level: string
  /** Set on elevator landing doors, which open only when the car is there. */
  elevator?: string
  /** Set on an airlock's doors, which open only when the airlock lets them. */
  airlock?: 'inner' | 'outer'
}

/**
 * The walkable rectangle through a doorway: as wide as the opening less
 * the player's radius, reaching a metre into the places on both sides.
 */
export function doorwayRect(door: Door, radius = PLAYER_RADIUS): Rect | null {
  const half = door.width / 2 - radius
  if (half <= 0) return null
  return door.runs === 'x'
    ? { x0: door.center.x - half, x1: door.center.x + half, z0: door.center.z - DOOR_REACH, z1: door.center.z + DOOR_REACH }
    : { x0: door.center.x - DOOR_REACH, x1: door.center.x + DOOR_REACH, z0: door.center.z - half, z1: door.center.z + half }
}

/** Every door in the map (or on one level), read from the wall openings. */
export function listDoors(map: GameMap, level?: string): Door[] {
  const doors: Door[] = []
  for (const wall of map.walls) {
    const wallLevel = levelOf(wall)
    if (level !== undefined && wallLevel !== level) continue
    for (const opening of wall.openings ?? []) {
      if (opening.kind !== 'door') continue
      const center =
        wall.runs === 'x' ? { x: opening.center, z: wall.at } : { x: wall.at, z: opening.center }
      const before =
        wall.runs === 'x'
          ? placeAt(map, center.x, center.z - 0.5, wallLevel)
          : placeAt(map, center.x - 0.5, center.z, wallLevel)
      const after =
        wall.runs === 'x'
          ? placeAt(map, center.x, center.z + 0.5, wallLevel)
          : placeAt(map, center.x + 0.5, center.z, wallLevel)
      doors.push({
        center,
        width: opening.width,
        runs: wall.runs,
        rooms: [before?.id, after?.id],
        sliding: opening.sliding ?? false,
        height: Math.min(opening.height ?? DOOR_HEIGHT, wall.height),
        sill: opening.sill ?? 0,
        round: opening.round ?? false,
        level: wallLevel,
        elevator: opening.elevator,
        airlock: opening.airlock,
      })
    }
  }
  return doors
}

/** The desk footprint of a console. */
export function consoleFootprint(item: Console): Rect {
  const facesZ = Math.abs(item.facing.z) >= Math.abs(item.facing.x)
  const halfX = (facesZ ? CONSOLE_WIDTH : CONSOLE_DEPTH) / 2
  const halfZ = (facesZ ? CONSOLE_DEPTH : CONSOLE_WIDTH) / 2
  return {
    x0: item.position.x - halfX,
    x1: item.position.x + halfX,
    z0: item.position.z - halfZ,
    z1: item.position.z + halfZ,
  }
}

/** The floor footprint of a prop, after its yaw (multiples of 90 degrees). */
export function propFootprint(prop: Prop): Rect {
  const turned = Math.abs(Math.sin(prop.yaw ?? 0)) > 0.5
  const halfX = (turned ? prop.size.d : prop.size.w) / 2
  const halfZ = (turned ? prop.size.w : prop.size.d) / 2
  return {
    x0: prop.position.x - halfX,
    x1: prop.position.x + halfX,
    z0: prop.position.z - halfZ,
    z1: prop.position.z + halfZ,
  }
}

/** Where the player stands to use a console. */
export function standPoint(item: Console): Vec2 {
  return {
    x: item.position.x + item.facing.x * CONSOLE_STAND_DISTANCE,
    z: item.position.z + item.facing.z * CONSOLE_STAND_DISTANCE,
  }
}

/** Why a spot can't be stood on. */
export interface Blocker {
  kind: 'prop' | 'fence' | 'building' | 'edge' | 'wall'
  /** Fence or building id. */
  id?: string
  /** What the player says the first time (fences and edges). */
  message?: string
}

interface BlockerRect extends Blocker {
  rect: Rect
}

/** Fence lines are this thick, for collision. */
const FENCE_THICKNESS = 0.1

export interface CollisionModel {
  /** Which level this model is for. */
  level: string
  /** Rooms and doorways. */
  indoor: Rect[]
  /**
   * Walkable areas that change while playing: an elevator car standing at
   * this level, and its doorway while the doors are open. Rewritten every frame.
   */
  extra: Rect[]
  /** Outdoor zones. */
  zones: Rect[]
  /** Cut out of the outdoor zones: the main building and outbuildings. */
  exclusions: BlockerRect[]
  /** Blocked everywhere: consoles, props and fences. */
  obstacles: BlockerRect[]
  /**
   * The standing crew, where they are now (they move during the mission).
   * Rewritten every frame, like `extra` (see crewBlockers).
   */
  people: BlockerRect[]
  edgeMessage?: string
  /** Outdoors, the player can't go further than this from its centre. */
  boundary?: { x: number; z: number; radius: number }
}

/**
 * Where the player may stand on one level. `radius` is how far from walls
 * and obstacles the player's centre must stay; route planning uses a bigger
 * one for margin. Elevator doorways are left out: they open only when the
 * car is there (see `extra`).
 */
export function buildCollision(map: GameMap, radius = PLAYER_RADIUS, level: string = GROUND_LEVEL, blockingRock = BLOCKING_ROCK): CollisionModel {
  const indoor = map.rooms
    .filter((room) => levelOf(room) === level)
    .map((room) => inset(room.rect, radius + WALL_THICKNESS / 2))

  for (const door of listDoors(map, level)) {
    // Elevator and airlock doors open only sometimes: see `extra`.
    if (door.elevator || door.airlock) continue
    const rect = doorwayRect(door, radius)
    if (rect) indoor.push(rect)
  }

  const outdoor = level === GROUND_LEVEL ? map.outdoor : undefined
  const zones = (outdoor?.zones ?? []).map((zone) => inset(zone.rect, radius))
  const exclusions: BlockerRect[] = []
  if (outdoor) {
    // Each module, its shell and any bags piled on it; elevator shafts.
    for (const { rect } of moduleRects(map)) exclusions.push({ rect: inset(rect, -radius), kind: 'building', id: 'main' })
    for (const elevator of map.elevators ?? []) {
      if (elevator.stops.some((stop) => stop.level === GROUND_LEVEL) && elevator.shaftTop !== undefined) {
        exclusions.push({ rect: inset(shaftRect(elevator), -radius - (outdoor.buildingMargin ?? 0)), kind: 'building', id: 'main' })
      }
    }
    // A lane through the shell up to each outside door.
    for (const cut of buildingCuts(map)) {
      const lane = inset(cut.rect, radius)
      if (lane.x0 < lane.x1 && lane.z0 < lane.z1) indoor.push(lane)
    }
    for (const building of outdoor.buildings) {
      exclusions.push({ rect: inset(building.rect, -radius), kind: 'building', id: building.id })
    }
  }

  const obstacles: BlockerRect[] = []
  for (const item of map.consoles) {
    if (levelOf(item) !== level) continue
    obstacles.push({ rect: inset(consoleFootprint(item), -radius), kind: 'prop' })
  }
  for (const prop of map.props) {
    if (prop.solid === false || levelOf(prop) !== level) continue
    obstacles.push({ rect: inset(propFootprint(prop), -radius), kind: 'prop', id: prop.id })
  }
  for (const fence of outdoor?.fences ?? []) {
    for (const [a, b] of fenceSegments(fence.points, fence.closed ?? false)) {
      const half = FENCE_THICKNESS / 2 + radius
      obstacles.push({
        rect: {
          x0: Math.min(a.x, b.x) - half,
          x1: Math.max(a.x, b.x) + half,
          z0: Math.min(a.z, b.z) - half,
          z1: Math.max(a.z, b.z) + half,
        },
        kind: 'fence',
        id: fence.id,
        message: fence.message,
      })
    }
  }

  // Boulders on the Moon block the way (small rocks are just drawn).
  if (outdoor) {
    for (const rock of scatterRocks(map)) {
      if (rock.size < blockingRock && !rock.edge) continue
      obstacles.push(
        rock.edge
          ? { rect: inset(rockFootprint(rock), -radius), kind: 'edge', id: 'boundary', message: outdoor.edgeMessage }
          : { rect: inset(rockFootprint(rock), -radius), kind: 'prop', id: 'boulder' },
      )
    }
  }

  return { level, indoor, extra: [], people: [], zones, exclusions, obstacles, edgeMessage: outdoor?.edgeMessage, boundary: outdoor?.boundary }
}

/** The centre of an elevator's landing door on one side of the car, on the wall line. */
export function carDoorCenter(elevator: Elevator, side: Side): Vec2 {
  const { x0, x1, z0, z1 } = elevator.car
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  switch (side) {
    case 'north':
      return { x: cx, z: z0 - CAR_WALL_GAP }
    case 'south':
      return { x: cx, z: z1 + CAR_WALL_GAP }
    case 'west':
      return { x: x0 - CAR_WALL_GAP, z: cz }
    case 'east':
      return { x: x1 + CAR_WALL_GAP, z: cz }
  }
}

/** Unit vector pointing out of the car on a side. */
export function sideNormal(side: Side): Vec2 {
  return side === 'north' ? { x: 0, z: -1 } : side === 'south' ? { x: 0, z: 1 } : side === 'west' ? { x: -1, z: 0 } : { x: 1, z: 0 }
}

/** The car's floor, as somewhere to stand. */
export function carWalkable(elevator: Elevator, radius = PLAYER_RADIUS): Rect {
  return inset(elevator.car, radius)
}

/** The open doorway between the car and the landing on one side, as somewhere to stand. */
export function carDoorway(elevator: Elevator, side: Side, radius = PLAYER_RADIUS): Rect {
  const c = carDoorCenter(elevator, side)
  const half = elevator.doorWidth / 2 - radius
  const n = sideNormal(side)
  const inward = CAR_WALL_GAP + 0.6
  const outward = DOOR_REACH
  if (side === 'north' || side === 'south') {
    const za = c.z - n.z * inward
    const zb = c.z + n.z * outward
    return { x0: c.x - half, x1: c.x + half, z0: Math.min(za, zb), z1: Math.max(za, zb) }
  }
  const xa = c.x - n.x * inward
  const xb = c.x + n.x * outward
  return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: c.z - half, z1: c.z + half }
}

/**
 * The segments of a fence line. Fences must run along x or z; a diagonal
 * segment would collide as its whole bounding box.
 */
export function fenceSegments(points: Vec2[], closed: boolean): [Vec2, Vec2][] {
  const segments: [Vec2, Vec2][] = []
  for (let i = 0; i + 1 < points.length; i++) segments.push([points[i] as Vec2, points[i + 1] as Vec2])
  if (closed && points.length > 2) segments.push([points[points.length - 1] as Vec2, points[0] as Vec2])
  return segments
}

function isIndoor(model: CollisionModel, x: number, z: number): boolean {
  return model.indoor.some((rect) => contains(rect, x, z)) || model.extra.some((rect) => contains(rect, x, z))
}

function isOutdoor(model: CollisionModel, x: number, z: number): boolean {
  return model.zones.some((rect) => contains(rect, x, z))
}

/** What stops the player standing here, or null if they can. */
export function blockerAt(model: CollisionModel, x: number, z: number): Blocker | null {
  const obstacle = model.obstacles.find((b) => contains(b.rect, x, z)) ?? model.people.find((b) => contains(b.rect, x, z))
  if (obstacle) return obstacle
  if (isIndoor(model, x, z)) return null
  if (isOutdoor(model, x, z)) {
    const b = model.boundary
    if (b && Math.hypot(x - b.x, z - b.z) > b.radius) return { kind: 'edge', id: 'boundary', message: model.edgeMessage }
    return model.exclusions.find((ex) => contains(ex.rect, x, z)) ?? null
  }
  return { kind: 'wall' }
}

export function isWalkable(model: CollisionModel, x: number, z: number): boolean {
  return blockerAt(model, x, z) === null
}

export interface MoveResult extends Vec2 {
  /** What stopped part of the move, if anything did. */
  blocked: Blocker | null
}

/**
 * Moves by (dx, dz), testing each axis on its own so the player slides along
 * walls. If the player is somehow already in an invalid spot, the move is
 * allowed so they can never get stuck. Walking off the edge of an outdoor
 * zone reports an 'edge' blocker.
 */
export function slideMove(model: CollisionModel, from: Vec2, dx: number, dz: number): MoveResult {
  if (!isWalkable(model, from.x, from.z)) return { x: from.x + dx, z: from.z + dz, blocked: null }
  const outside = !isIndoor(model, from.x, from.z)
  let { x, z } = from
  let blocked: Blocker | null = null
  const tryStep = (nx: number, nz: number): boolean => {
    const blocker = blockerAt(model, nx, nz)
    if (!blocker) return true
    blocked = blocker.kind === 'wall' && outside ? { kind: 'edge', message: model.edgeMessage } : blocker
    return false
  }
  if (dx !== 0 && tryStep(x + dx, z)) x += dx
  if (dz !== 0 && tryStep(x, z + dz)) z += dz
  return { x, z, blocked }
}

// ---------- Floating (microgravity) ----------

/** Floating keeps the player's eyes at least this far from floors, ceilings and the rim of an opening. */
export const FLOAT_MARGIN = 0.4

/** How far from a doorway or hatch the allowed height starts closing in on the opening. */
const OPENING_APPROACH = 1.1

/** Floor height of a room, including a raised floor. */
export function roomFloor(map: GameMap, room: Room): number {
  return levelY(map, levelOf(room)) + (room.floor ?? 0)
}

export interface HeightRange {
  lo: number
  hi: number
}

function roomRange(map: GameMap, room: Room): HeightRange {
  return {
    lo: roomFloor(map, room) + FLOAT_MARGIN,
    hi: levelY(map, levelOf(room)) + room.ceiling - FLOAT_MARGIN,
  }
}

function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

/**
 * Where a floating player's eyes may be at (x, z): between the room's floor
 * and ceiling, less a margin. Near a doorway or hatch the range closes in
 * smoothly on the opening's own height range, so by the time the player
 * reaches the bulkhead they are already lined up with the hole and never
 * snag on its rim. Returns null outside every room and doorway.
 */
export function floatRange(map: GameMap, x: number, z: number, level: string = GROUND_LEVEL): HeightRange | null {
  const doors = listDoors(map, level).filter((door) => !door.elevator)
  const room = roomAt(map, x, z, level)
  let range: HeightRange | null = room ? roomRange(map, room) : null
  const base = levelY(map, level)

  for (const door of doors) {
    const along = door.runs === 'x' ? x - door.center.x : z - door.center.z
    const across = door.runs === 'x' ? z - door.center.z : x - door.center.x
    if (Math.abs(along) > door.width / 2 + 0.3 || Math.abs(across) > OPENING_APPROACH) continue
    const opening = { lo: base + door.sill + FLOAT_MARGIN, hi: base + door.height - FLOAT_MARGIN }
    if (!range) {
      // In the wall's thickness: inside the opening itself.
      if (Math.abs(along) <= door.width / 2) range = opening
      continue
    }
    const t = smooth01(1 - Math.abs(across) / OPENING_APPROACH)
    range = {
      lo: Math.max(range.lo, range.lo + (opening.lo - range.lo) * t),
      hi: Math.min(range.hi, range.hi + (opening.hi - range.hi) * t),
    }
  }
  if (range && range.lo > range.hi) {
    const mid = (range.lo + range.hi) / 2
    range = { lo: mid, hi: mid }
  }
  return range
}
