/**
 * Builds the inside of a map from its data: floors, ceilings, walls cut
 * around doors and windows, and a dressing pass that adds detail to every
 * wall stretch.
 *
 * The dressing pass walks each solid stretch of wall, works out which room
 * it faces, and fits kick panels, cable trays, handrails and wall equipment
 * there. Wall detail stays under 15 cm deep so it never needs collision,
 * and equipment is skipped where a console or prop stands against the wall.
 */
import { consoleFootprint, levelOf, levelY, placeAt, propFootprint, roomAt } from '../../maps/collision'
import { DOOR_HEIGHT, WALL_THICKNESS, type GameMap, type Rect, type Room, type Wall } from '../../maps/types'
import { HAZARD_CELL_METRES } from '../materials/canvasTextures'
import type { MaterialKey } from '../materials/surfaces'
import { tint } from '../materials/surfaces'
import { orient, Parts, type Tint } from './parts'
import type { MapExtras } from './specs'
import { PlaneGeometry } from 'three'

/** A solid run of wall: from `a` to `b` along the wall, `y0` to `y1` up. */
export interface WallPiece {
  a: number
  b: number
  y0: number
  y1: number
}

/**
 * Splits a wall around its openings: full-height pieces between openings,
 * a lintel above each door, and a sill plus lintel around each window.
 * Walls are stretched by half a thickness at each end so corners close.
 */
export function wallPieces(wall: Wall): WallPiece[] {
  const half = WALL_THICKNESS / 2
  const start = Math.min(wall.from, wall.to) - half
  const end = Math.max(wall.from, wall.to) + half
  const openings = [...(wall.openings ?? [])].sort((p, q) => p.center - q.center)
  const pieces: WallPiece[] = []
  let cursor = start

  for (const opening of openings) {
    const a = opening.center - opening.width / 2
    const b = opening.center + opening.width / 2
    if (a > cursor) pieces.push({ a: cursor, b: a, y0: 0, y1: wall.height })
    if (opening.kind === 'door') {
      const top = Math.min(opening.height ?? DOOR_HEIGHT, wall.height)
      if (opening.sill) pieces.push({ a, b, y0: 0, y1: opening.sill })
      if (top < wall.height) pieces.push({ a, b, y0: top, y1: wall.height })
    } else {
      if (opening.sill > 0) pieces.push({ a, b, y0: 0, y1: opening.sill })
      if (opening.top < wall.height) pieces.push({ a, b, y0: opening.top, y1: wall.height })
    }
    cursor = Math.max(cursor, b)
  }
  if (end > cursor) pieces.push({ a: cursor, b: end, y0: 0, y1: wall.height })
  return pieces
}

/** One side of a wall facing into a room, between `from` and `to` along the wall. */
interface WallSide {
  runs: 'x' | 'z'
  /** +1 if the room is on the +z (or +x) side of the wall. */
  sign: 1 | -1
  /** Coordinate of the wall's face on that side. */
  face: number
  from: number
  to: number
  room: Room
  /** Height of wall visible from this room. */
  height: number
  /** Floor height of the level this side is on; every y below is measured from here. */
  base: number
  level: string
  concrete: boolean
}

const BRUSHED_DARK = tint('#5a6068')
const KICK = tint('#8f948f')
const SIGN_PLATE = tint('#1d2430')
const STATUS_GREEN: Tint = [0.25, 2.4, 0.7]
/** Warm, soft ceiling panels: bright enough to read as lights, not so bright they flare. */
const PANEL_LIGHT: Tint = [1.35, 1.12, 0.86]
const RED = tint('#b8251c')
const SLATE = tint('#4f6075')
const CONDUIT = tint('#9aa0a6')
const CABLE = tint('#3a4250')
const ROOF = tint('#55575b')
const CONCRETE_WALL = tint('#a9a69f')
const CONCRETE_KICK = tint('#6e6c67')

/** Just enough of a wall side to place things against it. */
type SideFrame = Pick<WallSide, 'runs' | 'sign' | 'face' | 'base'>

/** World position at distance `s` along the side, `out` metres from its face. */
function sidePoint(side: SideFrame, s: number, out: number): { x: number; z: number } {
  return side.runs === 'x'
    ? { x: s, z: side.face + side.sign * out }
    : { x: side.face + side.sign * out, z: s }
}

/** The yaw that turns a +z-facing plane to face out of this side into the room. */
function faceYaw(side: SideFrame): number {
  return side.runs === 'x' ? (side.sign > 0 ? 0 : Math.PI) : side.sign * (Math.PI / 2)
}

/** A box against the wall: `length` along it, `depth` out of it, starting `out` from the face. */
function sideBox(
  parts: Parts,
  key: MaterialKey,
  side: SideFrame,
  s: number,
  y: number,
  length: number,
  height: number,
  depth: number,
  out: number,
  color?: Tint,
): void {
  const c = sidePoint(side, s, out + depth / 2)
  const wy = y + side.base
  if (side.runs === 'x') parts.box(key, length, height, depth, { x: c.x, y: wy, z: c.z }, color)
  else parts.box(key, depth, height, length, { x: c.x, y: wy, z: c.z }, color)
}

/** A rod running along the wall. */
function sideRod(
  parts: Parts,
  key: MaterialKey,
  side: SideFrame,
  s: number,
  y: number,
  length: number,
  radius: number,
  out: number,
  color?: Tint,
): void {
  const c = sidePoint(side, s, out)
  parts.cylinder(
    key,
    radius,
    radius,
    length,
    side.runs === 'x'
      ? { x: c.x, y: y + side.base, z: c.z, rotZ: Math.PI / 2 }
      : { x: c.x, y: y + side.base, z: c.z, rotX: Math.PI / 2 },
    color,
    8,
  )
}

function sideDecal(parts: Parts, cell: string, side: SideFrame, s: number, y: number, w: number, h: number, out: number): void {
  const c = sidePoint(side, s, out)
  parts.decal(cell, w, h, { x: c.x, y: y + side.base, z: c.z, rotY: faceYaw(side) })
}

/** Every solid, full-height stretch of wall, split by the room it faces. */
function wallSides(map: GameMap): WallSide[] {
  const sides: WallSide[] = []
  for (const wall of map.walls) {
    const full = wallPieces(wall).filter((piece) => piece.y0 === 0 && piece.y1 === wall.height)
    for (const piece of full) {
      for (const sign of [-1, 1] as const) {
        let current: WallSide | null = null
        for (let s = piece.a + 0.05; s <= piece.b - 0.05 + 1e-6; s += 0.1) {
          const probe = wall.runs === 'x' ? { x: s, z: wall.at + sign * 0.3 } : { x: wall.at + sign * 0.3, z: s }
          const room = roomAt(map, probe.x, probe.z, levelOf(wall))
          if (room && current && current.room === room) {
            current.to = s + 0.05
            continue
          }
          if (current) sides.push(current)
          current = room
            ? {
                runs: wall.runs,
                sign,
                face: wall.at + sign * (WALL_THICKNESS / 2),
                from: s - 0.05,
                to: s + 0.05,
                room,
                height: Math.min(wall.height, room.ceiling),
                base: levelY(map, levelOf(wall)),
                level: levelOf(wall),
                concrete: wall.finish === 'concrete',
              }
            : null
        }
        if (current) sides.push(current)
      }
    }
  }
  // Keep each stretch inside its room, clear of the corner walls.
  for (const side of sides) {
    const r = side.room.rect
    const lo = (side.runs === 'x' ? r.x0 : r.z0) + WALL_THICKNESS / 2
    const hi = (side.runs === 'x' ? r.x1 : r.z1) - WALL_THICKNESS / 2
    side.from = Math.max(side.from, lo)
    side.to = Math.min(side.to, hi)
  }
  return sides.filter((side) => side.to - side.from > 0.2)
}

/** Ranges along a side where something stands against the wall. */
function blockedRanges(map: GameMap, side: WallSide): [number, number][] {
  const rects: Rect[] = [
    ...map.consoles.filter((item) => levelOf(item) === side.level).map(consoleFootprint),
    ...map.props.filter((prop) => levelOf(prop) === side.level).map(propFootprint),
  ]
  const ranges: [number, number][] = []
  for (const r of rects) {
    const distance =
      side.runs === 'x'
        ? side.sign > 0
          ? r.z0 - side.face
          : side.face - r.z1
        : side.sign > 0
          ? r.x0 - side.face
          : side.face - r.x1
    if (distance > 1 || distance < -0.3) continue
    const lo = side.runs === 'x' ? r.x0 : r.z0
    const hi = side.runs === 'x' ? r.x1 : r.z1
    ranges.push([lo - 0.25, hi + 0.25])
  }
  return ranges
}

type Equipment = 'extinguisher' | 'fusebox' | 'intercom'
const EQUIPMENT_CYCLE: Equipment[] = ['extinguisher', 'fusebox', 'intercom']

function addEquipment(parts: Parts, side: WallSide, s: number, kind: Equipment): void {
  if (kind === 'extinguisher') {
    sideBox(parts, 'painted', side, s, 1.15, 0.32, 0.52, 0.12, 0, RED)
    sideDecal(parts, 'extinguisher', side, s, 1.15, 0.28, 0.42, 0.122)
  } else if (kind === 'fusebox') {
    sideBox(parts, 'painted', side, s, 1.5, 0.36, 0.46, 0.1, 0, SLATE)
    sideDecal(parts, 'fusebox', side, s, 1.5, 0.3, 0.42, 0.102)
  } else {
    sideBox(parts, 'brushed', side, s, 1.45, 0.2, 0.3, 0.04, 0, BRUSHED_DARK)
    sideDecal(parts, 'intercom', side, s, 1.45, 0.18, 0.27, 0.042)
  }
}

function dressSide(map: GameMap, parts: Parts, side: WallSide, counter: { value: number }): void {
  const length = side.to - side.from
  const mid = (side.from + side.to) / 2

  // Darker kick panel along the bottom.
  sideBox(parts, side.concrete ? 'concrete' : 'wall', side, mid, 0.13, length, 0.26, 0.015, 0, side.concrete ? CONCRETE_KICK : KICK)

  // Cable tray with conduit and brackets, just under the ceiling.
  if (length >= 0.6) {
    const y = side.height - 0.16
    sideBox(parts, 'brushed', side, mid, y, length, 0.012, 0.14, 0.005)
    sideBox(parts, 'brushed', side, mid, y + 0.025, length, 0.05, 0.008, 0.14)
    sideRod(parts, 'rubber', side, mid, y + 0.03, length, 0.025, 0.07, CABLE)
    sideRod(parts, 'painted', side, mid, y - 0.1, length, 0.018, 0.05, CONDUIT)
    for (let s = side.from + 0.3; s < side.to - 0.1; s += 1.2) {
      sideBox(parts, 'brushed', side, s, y - 0.04, 0.03, 0.09, 0.15, 0, BRUSHED_DARK)
    }
  }

  // Handrails.
  if (side.room.dressing?.handrails && length >= 0.8) {
    sideRod(parts, 'brushed', side, mid, 0.95, length - 0.1, 0.022, 0.08)
    for (let s = side.from + 0.25; s < side.to - 0.1; s += 1.5) {
      sideBox(parts, 'brushed', side, s, 0.95, 0.03, 0.03, 0.08, 0)
    }
  }

  // Wall equipment, skipping anything standing against this wall.
  if (length >= 1.6) {
    const blocked = blockedRanges(map, side)
    for (let s = side.from + 0.9; s <= side.to - 0.7; s += 3.6) {
      if (blocked.some(([lo, hi]) => s + 0.3 > lo && s - 0.3 < hi)) continue
      const kind = EQUIPMENT_CYCLE[counter.value % EQUIPMENT_CYCLE.length] ?? 'extinguisher'
      counter.value += 1
      addEquipment(parts, side, s, kind)
    }
  }
}

function sideOf(map: GameMap, wall: Wall, along: number, sign: 1 | -1): WallSide | null {
  const probe = wall.runs === 'x' ? { x: along, z: wall.at + sign * 0.3 } : { x: wall.at + sign * 0.3, z: along }
  const room = roomAt(map, probe.x, probe.z, levelOf(wall))
  if (!room) return null
  return {
    runs: wall.runs,
    sign,
    face: wall.at + sign * (WALL_THICKNESS / 2),
    from: along,
    to: along,
    room,
    height: Math.min(wall.height, room.ceiling),
    base: levelY(map, levelOf(wall)),
    level: levelOf(wall),
    concrete: wall.finish === 'concrete',
  }
}

/** Door frames, status lights, signs and hazard stripes, on both sides (inside or outside). */
function dressDoors(map: GameMap, parts: Parts, extras: MapExtras): void {
  for (const wall of map.walls) {
    for (const opening of wall.openings ?? []) {
      if (opening.kind !== 'door') continue
      const center = opening.center
      const width = opening.width
      const top = Math.min(opening.height ?? DOOR_HEIGHT, wall.height)
      const level = levelOf(wall)
      const base = levelY(map, level)
      const sides = ([-1, 1] as const).map((sign) => {
        const probe = wall.runs === 'x' ? { x: center, z: wall.at + sign * 0.3 } : { x: wall.at + sign * 0.3, z: center }
        const place = placeAt(map, probe.x, probe.z, level)
        return place ? { runs: wall.runs, sign, face: wall.at + sign * (WALL_THICKNESS / 2), base, place } : null
      })

      sides.forEach((side, index) => {
        if (!side) return
        // Chunky frame: two jambs and a head.
        for (const edge of [-1, 1]) {
          sideBox(parts, 'brushed', side, center + edge * (width / 2 + 0.05), (top + 0.1) / 2, 0.1, top + 0.1, 0.05, 0)
        }
        sideBox(parts, 'brushed', side, center, top + 0.05, width + 0.2, 0.1, 0.05, 0)
        // Status light above the door.
        sideBox(parts, 'emissive', side, center, top + 0.16, 0.14, 0.05, 0.03, 0, STATUS_GREEN)

        // Sign naming the room or zone on the other side.
        const other = sides[1 - index]
        const label = other?.place.sign
        if (label && other.place.id !== side.place.id) {
          const signWidth = 0.3 + label.length * 0.088
          const y = top + 0.36
          sideBox(parts, 'painted', side, center, y, signWidth, 0.24, 0.02, 0, SIGN_PLATE)
          const p = sidePoint(side, center, 0.024)
          extras.texts.push({
            id: `sign-${wall.runs}-${wall.at}-${center}-${side.sign}`,
            text: label,
            position: [p.x, y + base, p.z],
            rotationY: faceYaw(side),
            fontSize: 0.13,
            color: '#f4f6fb',
            font: 'ui',
          })
        }
      })

      // Hazard stripe band across the doorway.
      const band = 0.6
      const along = width / HAZARD_CELL_METRES
      const at =
        wall.runs === 'x'
          ? { x: center, y: base + 0.003, z: wall.at, rotX: -Math.PI / 2 }
          : { x: wall.at, y: base + 0.003, z: center, rotX: -Math.PI / 2, rotY: Math.PI / 2 }
      parts.decal('hazard', width, band, at, undefined, along)
    }
  }
}

/** Glass panes, frames and sills for every window. */
function dressWindows(map: GameMap, parts: Parts): void {
  for (const wall of map.walls) {
    for (const opening of wall.openings ?? []) {
      if (opening.kind !== 'window') continue
      const { center, width, sill, top } = opening
      const height = top - sill
      const y = (sill + top) / 2 + levelY(map, levelOf(wall))
      const glass = new PlaneGeometry(width, height)
      parts.add(
        'glass',
        orient(glass, wall.runs === 'x' ? { x: center, y, z: wall.at } : { x: wall.at, y, z: center, rotY: Math.PI / 2 }),
      )
      for (const sign of [-1, 1] as const) {
        const side = sideOf(map, wall, center, sign)
        if (!side) continue
        const ly = (sill + top) / 2
        for (const edge of [-1, 1]) {
          sideBox(parts, 'brushed', side, center + edge * (width / 2 + 0.03), ly, 0.06, height + 0.12, 0.05, 0)
        }
        sideBox(parts, 'brushed', side, center, top + 0.03, width + 0.12, 0.06, 0.05, 0)
        sideBox(parts, 'brushed', side, center, sill - 0.02, width + 0.16, 0.04, 0.14, 0)
      }
    }
  }
}

/** Recessed ceiling light panels, and the real lights that go with them. */
function lightRooms(map: GameMap, parts: Parts, extras: MapExtras): void {
  for (const room of map.rooms) {
    const { x0, x1, z0, z1 } = room.rect
    const base = levelY(map, levelOf(room))
    const top = base + room.ceiling
    const alongX = x1 - x0 >= z1 - z0
    const long = alongX ? x1 - x0 : z1 - z0
    const short = alongX ? z1 - z0 : x1 - x0
    const count = Math.max(1, Math.round(long / 2.4))
    const rows = short > 4.5 ? 2 : 1
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5
      for (let row = 0; row < rows; row++) {
        const offset = rows === 1 ? 0 : (row - 0.5) * (short / 2)
        const x = alongX ? cx + t * long : cx + offset
        const z = alongX ? cz + offset : cz + t * long
        const w = alongX ? 1.1 : 0.45
        const d = alongX ? 0.45 : 1.1
        parts.box('brushed', w + 0.08, 0.02, d + 0.08, { x, y: top - 0.01, z }, BRUSHED_DARK)
        parts.box('emissive', w, 0.01, d, { x, y: top - 0.025, z }, PANEL_LIGHT)
      }
    }

    const lights = room.lights ?? Math.max(1, Math.round(long / 8))
    for (let i = 0; i < lights; i++) {
      const t = (i + 0.5) / lights - 0.5
      extras.lights.push({
        // Hung well below the ceiling, so the ceiling right above it doesn't flare into a hot spot.
        position: [alongX ? cx + t * long : cx, top - 0.55, alongX ? cz : cz + t * long],
        intensity: 1.45 * room.ceiling * room.ceiling,
        level: levelOf(room),
      })
    }
  }
}

/** Walkway lines painted on the floor along the room's long axis. */
function paintWalkways(map: GameMap, parts: Parts): void {
  for (const room of map.rooms) {
    if (!room.dressing?.walkway) continue
    const { x0, x1, z0, z1 } = room.rect
    const y = levelY(map, levelOf(room)) + 0.003
    const alongX = x1 - x0 >= z1 - z0
    const long = (alongX ? x1 - x0 : z1 - z0) - 0.6
    const short = alongX ? z1 - z0 : x1 - x0
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    for (const edge of [-1, 1]) {
      const offset = edge * (short / 2 - 0.45)
      parts.decal(
        'paint-yellow',
        long,
        0.07,
        alongX
          ? { x: cx, y, z: cz + offset, rotX: -Math.PI / 2 }
          : { x: cx + offset, y, z: cz, rotX: -Math.PI / 2, rotY: Math.PI / 2 },
      )
    }
  }
}

export function buildInterior(map: GameMap, parts: Parts, extras: MapExtras): void {
  for (const room of map.rooms) {
    const { x0, x1, z0, z1 } = room.rect
    const w = x1 - x0
    const d = z1 - z0
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const base = levelY(map, levelOf(room))
    const concrete = room.finish === 'concrete'
    parts.add('floor', orient(new PlaneGeometry(w, d), { x: cx, y: base, z: cz, rotX: -Math.PI / 2 }))
    parts.add(
      concrete ? 'concrete' : 'ceiling',
      orient(new PlaneGeometry(w, d), { x: cx, y: base + room.ceiling, z: cz, rotX: Math.PI / 2 }),
      concrete ? CONCRETE_WALL : undefined,
    )
    // A roof slab over the walls, so the building reads as solid from outside.
    parts.box('concrete', w + 0.2, 0.15, d + 0.2, { x: cx, y: base + room.ceiling + 0.095, z: cz }, ROOF)
    // Raised floors (the access arm) get a steel deck underneath, seen from the ground.
    if (base > 1) parts.box('steel', w + 0.2, 0.25, d + 0.2, { x: cx, y: base - 0.13, z: cz }, ROOF)
  }

  for (const wall of map.walls) {
    const base = levelY(map, levelOf(wall))
    const key = wall.finish === 'concrete' ? 'concrete' : 'wall'
    const tintColor = wall.finish === 'concrete' ? CONCRETE_WALL : undefined
    for (const piece of wallPieces(wall)) {
      const length = piece.b - piece.a
      const height = piece.y1 - piece.y0
      const mid = (piece.a + piece.b) / 2
      const y = base + (piece.y0 + piece.y1) / 2
      if (wall.runs === 'x') parts.box(key, length, height, WALL_THICKNESS, { x: mid, y, z: wall.at }, tintColor)
      else parts.box(key, WALL_THICKNESS, height, length, { x: wall.at, y, z: mid }, tintColor)
    }
  }

  const counter = { value: 0 }
  for (const side of wallSides(map)) dressSide(map, parts, side, counter)
  dressDoors(map, parts, extras)
  dressWindows(map, parts)
  lightRooms(map, parts, extras)
  paintWalkways(map, parts)
}
