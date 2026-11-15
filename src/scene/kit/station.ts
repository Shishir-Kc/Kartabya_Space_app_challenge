/**
 * Builds a spacecraft interior ("station" style) from map data: padded
 * off-white walls, a blue-grey floor and a bright ceiling with LED strips,
 * so young players can always tell which way is up. Round hatches get a
 * rim with hazard stripes and an opened hatch door; the docking tunnel is a
 * round tube; a capsule narrows toward its front. Handrails run along every
 * wall, which is also a hint that you float here.
 *
 * It shares wallPieces() with the launch center, so a hatch or window is
 * cut out of a wall exactly where collision expects it.
 */
import { BufferAttribute, type BufferGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Path, PlaneGeometry, Shape, TorusGeometry } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { levelOf, levelY, roomAt, roomFloor } from '../../maps/collision'
import { DOOR_HEIGHT, WALL_THICKNESS, type DoorOpening, type GameMap, type Room, type Wall, type WindowOpening } from '../../maps/types'
import { tint } from '../materials/surfaces'
import { wallPieces } from './interior'
import { orient, type Parts, type Tint } from './parts'
import type { MapExtras } from './specs'

const WALL_PAD = tint('#e9e7e0')
const FLOOR_PAD = tint('#8a95a5')
const CEILING_PAD = tint('#f3f3f0')
const BULKHEAD = tint('#d4d7dc')
const RIM = tint('#c3c8cf')
const HAZARD_YELLOW = tint('#e9b81a')
const HAZARD_BLACK = tint('#22252a')
const HANDRAIL = tint('#7aa7c7')
const CABLE = tint('#3a4250')
const CABLE_ORANGE = tint('#c9772f')
const HATCH_DOOR = tint('#b9bec6')
/** Cool white LED strips: slightly blue. */
const LED: Tint = [1.05, 1.15, 1.35]

/** Turns a geometry inside out, for surfaces seen from inside (the tunnel tube). */
function insideOut<T extends BufferGeometry>(geometry: T): T {
  const index = geometry.getIndex()
  if (index) {
    const array = index.array
    for (let i = 0; i < array.length; i += 3) {
      const a = array[i + 1]!
      array[i + 1] = array[i + 2]!
      array[i + 2] = a
    }
    index.needsUpdate = true
  }
  const normal = geometry.attributes.normal as BufferAttribute
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i))
  return geometry
}

/** Placement for something centred on a wall line at distance `along` and height `y`, facing along +z or +x. */
function onWall(wall: Wall, along: number, y: number, out = 0): { x: number; y: number; z: number; rotY?: number } {
  return wall.runs === 'x' ? { x: along, y, z: wall.at + out } : { x: wall.at + out, y, z: along, rotY: Math.PI / 2 }
}

/**
 * Fills the square around a round opening: a bulkhead plate with a round
 * hole, as thick as the wall. `size` is the square cut out of the wall.
 */
function roundPlate(parts: Parts, wall: Wall, center: number, y: number, width: number, height: number, radius: number): void {
  const shape = new Shape()
  shape.moveTo(-width / 2, -height / 2)
  shape.lineTo(width / 2, -height / 2)
  shape.lineTo(width / 2, height / 2)
  shape.lineTo(-width / 2, height / 2)
  shape.closePath()
  const hole = new Path()
  hole.absarc(0, 0, radius, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  // Extruded shapes come without an index; the boxes they merge with have one.
  const geometry = mergeVertices(new ExtrudeGeometry(shape, { depth: WALL_THICKNESS, bevelEnabled: false, curveSegments: 28 }))
  geometry.translate(0, 0, -WALL_THICKNESS / 2)
  parts.add('painted', orient(geometry, onWall(wall, center, y)), BULKHEAD)
}

/** A rim round a hatch on both faces, striped yellow and black, and a lip through the wall. */
function hatchRim(parts: Parts, wall: Wall, center: number, y: number, radius: number, stripes: boolean): void {
  const segments = 16
  for (const side of [-1, 1]) {
    for (let i = 0; i < segments; i++) {
      const torus = new TorusGeometry(radius + 0.035, 0.04, 6, 4, (Math.PI * 2) / segments)
      torus.rotateZ((i * Math.PI * 2) / segments)
      const color = stripes ? (i % 2 === 0 ? HAZARD_YELLOW : HAZARD_BLACK) : RIM
      parts.add('painted', orient(torus, onWall(wall, center, y, side * (WALL_THICKNESS / 2 + 0.01))), color)
    }
  }
  // The lip: a short tube lining the hole.
  const lip = insideOut(new CylinderGeometry(radius, radius, WALL_THICKNESS + 0.02, 28, 1, true))
  lip.rotateX(Math.PI / 2)
  parts.add('brushed', orient(lip, onWall(wall, center, y)), RIM)
}

/** The opened hatch door, swung flat against the bulkhead beside the opening, on the side with more room. */
function openHatchDoor(parts: Parts, map: GameMap, wall: Wall, center: number, y: number, radius: number): void {
  const level = levelOf(wall)
  let best: { side: number; room: Room } | null = null
  for (const side of [-1, 1]) {
    const probe = wall.runs === 'x' ? { x: center, z: wall.at + side * 0.6 } : { x: wall.at + side * 0.6, z: center }
    const room = roomAt(map, probe.x, probe.z, level)
    if (room && (!best || (room.floor ?? 0) < (best.room.floor ?? 0))) best = { side, room }
  }
  if (!best) return
  const disc = new CylinderGeometry(radius + 0.05, radius + 0.05, 0.08, 28)
  disc.rotateX(Math.PI / 2)
  const out = best.side * (WALL_THICKNESS / 2 + 0.05)
  parts.add('painted', orient(disc, onWall(wall, center + radius * 2 + 0.2, y, out)), HATCH_DOOR)
  // Handle and a small window in the hatch.
  parts.add('brushed', orient(new CylinderGeometry(0.03, 0.03, 0.3, 8).rotateZ(Math.PI / 2), onWall(wall, center + radius * 2 + 0.2, y, out + best.side * 0.06)))
  const port = new CircleGeometry(0.1, 20)
  if (best.side < 0) port.rotateY(Math.PI)
  parts.add('emissive', orient(port, onWall(wall, center + radius * 2 + 0.2, y + radius * 0.45, out + best.side * 0.042)), [0.12, 0.22, 0.38])
}

function dressHatch(parts: Parts, map: GameMap, wall: Wall, opening: DoorOpening): void {
  const base = levelY(map, levelOf(wall))
  const sill = opening.sill ?? 0
  const top = Math.min(opening.height ?? DOOR_HEIGHT, wall.height)
  const y = base + (sill + top) / 2
  const radius = Math.min(opening.width, top - sill) / 2
  roundPlate(parts, wall, opening.center, y, opening.width, top - sill, radius)
  hatchRim(parts, wall, opening.center, y, radius, true)
  openHatchDoor(parts, map, wall, opening.center, y, radius)
}

/** A square doorway between modules: a chunky frame on both faces. */
function dressDoorway(parts: Parts, map: GameMap, wall: Wall, opening: DoorOpening): void {
  const base = levelY(map, levelOf(wall))
  const top = Math.min(opening.height ?? DOOR_HEIGHT, wall.height)
  for (const side of [-1, 1]) {
    const out = side * (WALL_THICKNESS / 2 + 0.03)
    for (const edge of [-1, 1]) {
      const along = opening.center + edge * (opening.width / 2 + 0.05)
      const at = onWall(wall, along, base + top / 2, out)
      parts.box('painted', wall.runs === 'x' ? 0.1 : 0.06, top, wall.runs === 'x' ? 0.06 : 0.1, { x: at.x, y: at.y, z: at.z }, RIM)
    }
    const head = onWall(wall, opening.center, base + top + 0.05, out)
    parts.box('painted', wall.runs === 'x' ? opening.width + 0.2 : 0.06, 0.1, wall.runs === 'x' ? 0.06 : opening.width + 0.2, { x: head.x, y: head.y, z: head.z }, RIM)
  }
}

function dressWindow(parts: Parts, map: GameMap, wall: Wall, opening: WindowOpening): void {
  const base = levelY(map, levelOf(wall))
  const { center, width, sill, top } = opening
  const height = top - sill
  const y = base + (sill + top) / 2
  if (opening.round) {
    const radius = Math.min(width, height) / 2
    roundPlate(parts, wall, center, y, width, height, radius)
    hatchRim(parts, wall, center, y, radius, false)
    parts.add('glass', orient(new CircleGeometry(radius, 28), onWall(wall, center, y)))
    return
  }
  parts.add('glass', orient(new PlaneGeometry(width, height), onWall(wall, center, y)))
  for (const side of [-1, 1]) {
    const out = side * (WALL_THICKNESS / 2 + 0.03)
    for (const edge of [-1, 1]) {
      const at = onWall(wall, center + edge * (width / 2 + 0.04), y, out)
      parts.box('painted', wall.runs === 'x' ? 0.08 : 0.06, height + 0.16, wall.runs === 'x' ? 0.06 : 0.08, { x: at.x, y: at.y, z: at.z }, RIM)
    }
    for (const edgeY of [sill - 0.04, top + 0.04]) {
      const at = onWall(wall, center, base + edgeY, out)
      parts.box('painted', wall.runs === 'x' ? width + 0.16 : 0.06, 0.08, wall.runs === 'x' ? 0.06 : width + 0.16, { x: at.x, y: at.y, z: at.z }, RIM)
    }
  }
}

/** Handrails, cable runs and standoffs along each solid stretch of wall, facing into a room. */
function dressWalls(parts: Parts, map: GameMap, wall: Wall): void {
  const level = levelOf(wall)
  const base = levelY(map, level)
  for (const piece of wallPieces(wall)) {
    if (piece.y0 !== 0 || piece.b - piece.a < 0.7) continue
    for (const side of [-1, 1]) {
      const mid = (piece.a + piece.b) / 2
      const probe = wall.runs === 'x' ? { x: mid, z: wall.at + side * 0.4 } : { x: wall.at + side * 0.4, z: mid }
      const room = roomAt(map, probe.x, probe.z, level)
      if (!room || (room.floor ?? 0) > 0) continue
      const a = Math.max(piece.a, wall.runs === 'x' ? room.rect.x0 : room.rect.z0) + 0.2
      const b = Math.min(piece.b, wall.runs === 'x' ? room.rect.x1 : room.rect.z1) - 0.2
      const length = b - a
      if (length < 0.4) continue
      const center = (a + b) / 2
      const face = side * (WALL_THICKNESS / 2)
      const height = Math.min(wall.height, room.ceiling)
      // Handrails only where the crew float.
      for (const y of map.gravity === 'micro' ? [0.95, Math.min(1.9, height - 0.5)] : []) {
        const at = onWall(wall, center, base + y, face + side * 0.08)
        parts.box('painted', wall.runs === 'x' ? length : 0.035, 0.035, wall.runs === 'x' ? 0.035 : length, { x: at.x, y: at.y, z: at.z }, HANDRAIL)
        for (let s = a + 0.1; s <= b; s += 1.1) {
          const st = onWall(wall, s, base + y, face + side * 0.04)
          parts.box('painted', 0.03, 0.03, 0.03, { x: st.x, y: st.y, z: st.z, rotY: wall.runs === 'x' ? 0 : Math.PI / 2 }, HANDRAIL)
        }
      }
      // Cable bundle under the ceiling, and a thinner orange one.
      const cable = onWall(wall, center, base + height - 0.12, face + side * 0.06)
      const rod = new CylinderGeometry(0.03, 0.03, length, 8)
      rod.rotateZ(Math.PI / 2)
      if (wall.runs === 'z') rod.rotateY(Math.PI / 2)
      parts.add('rubber', orient(rod, cable), CABLE)
      const thin = new CylinderGeometry(0.014, 0.014, length, 6)
      thin.rotateZ(Math.PI / 2)
      if (wall.runs === 'z') thin.rotateY(Math.PI / 2)
      parts.add('rubber', orient(thin, onWall(wall, center, base + height - 0.2, face + side * 0.05)), CABLE_ORANGE)
    }
  }
}

/** A room's floor, ceiling, light strips and lights; a raised-floor room is a round tube instead. */
function buildRoom(parts: Parts, map: GameMap, room: Room, extras: MapExtras): void {
  const { x0, x1, z0, z1 } = room.rect
  const w = x1 - x0
  const d = z1 - z0
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const base = levelY(map, levelOf(room))
  const floor = roomFloor(map, room)
  const top = base + room.ceiling

  if ((room.floor ?? 0) > 0) {
    // The docking tunnel: a padded tube with rings and two handrails.
    const alongX = w >= d
    const length = alongX ? w : d
    const radius = Math.min(alongX ? d : w, top - floor) / 2
    const y = (floor + top) / 2
    const tube = insideOut(new CylinderGeometry(radius, radius, length, 32, 1, true))
    tube.rotateZ(Math.PI / 2)
    if (!alongX) tube.rotateY(Math.PI / 2)
    parts.add('padded', orient(tube, { x: cx, y, z: cz }), WALL_PAD)
    for (let t = 0.25; t < length; t += 0.5) {
      const ring = new TorusGeometry(radius - 0.01, 0.025, 6, 32)
      ring.rotateY(Math.PI / 2)
      if (!alongX) ring.rotateY(Math.PI / 2)
      const at = alongX ? { x: x0 + t, y, z: cz } : { x: cx, y, z: z0 + t }
      parts.add('painted', orient(ring, at), RIM)
    }
    for (const side of [-1, 1]) {
      const rail = alongX ? { x: cx, y: y - 0.12, z: cz + side * (radius - 0.1) } : { x: cx + side * (radius - 0.1), y: y - 0.12, z: cz }
      parts.box('painted', alongX ? length - 0.3 : 0.035, 0.035, alongX ? 0.035 : length - 0.3, rail, HANDRAIL)
    }
    // A light strip along the top of the tube.
    parts.box('emissive', alongX ? length - 0.4 : 0.08, 0.01, alongX ? 0.08 : length - 0.4, { x: cx, y: y + radius - 0.03, z: cz }, LED)
    return
  }

  // Floating crews push off padded floors; walking crews (on the Moon) need deck plating.
  if (map.gravity === 'micro') parts.add('padded', orient(new PlaneGeometry(w, d), { x: cx, y: floor, z: cz, rotX: -Math.PI / 2 }), FLOOR_PAD)
  else parts.add('floor', orient(new PlaneGeometry(w, d), { x: cx, y: floor, z: cz, rotX: -Math.PI / 2 }))
  parts.add('padded', orient(new PlaneGeometry(w, d), { x: cx, y: top, z: cz, rotX: Math.PI / 2 }), CEILING_PAD)

  // Foot loops on the floor, in a row down the middle (only where people float).
  const alongX = w >= d
  const long = alongX ? w : d
  for (let t = 0.8; map.gravity === 'micro' && t < long - 0.5; t += 1.6) {
    const at = alongX ? { x: x0 + t, y: floor + 0.02, z: cz } : { x: cx, y: floor + 0.02, z: z0 + t }
    parts.box('rubber', alongX ? 0.32 : 0.06, 0.04, alongX ? 0.06 : 0.32, at, HAZARD_BLACK)
  }

  // LED strips: two along the ceiling, toward the walls.
  const short = alongX ? d : w
  for (const side of [-1, 1]) {
    const offset = side * Math.min(0.55, short / 2 - 0.4)
    const at = alongX ? { x: cx, y: top - 0.015, z: cz + offset } : { x: cx + offset, y: top - 0.015, z: cz }
    parts.box('painted', alongX ? long - 0.6 : 0.2, 0.02, alongX ? 0.2 : long - 0.6, { ...at, y: top - 0.005 }, RIM)
    parts.box('emissive', alongX ? long - 0.7 : 0.12, 0.01, alongX ? 0.12 : long - 0.7, at, LED)
  }

  const lights = room.lights ?? Math.max(1, Math.round(long / 5))
  for (let i = 0; i < lights; i++) {
    const t = (i + 0.5) / lights - 0.5
    extras.lights.push({
      position: [alongX ? cx + t * long : cx, top - 0.5, alongX ? cz : cz + t * long],
      intensity: 1.6 * room.ceiling * room.ceiling,
      level: levelOf(room),
      color: room.lightColor,
    })
  }

  if (room.shape === 'capsule') {
    // The capsule narrows toward its front (east) end: slanted panels in
    // the two side corners and along the top front edge.
    const taper = 1.2
    for (const side of [-1, 1]) {
      const zWall = side > 0 ? z1 : z0
      const inset = 0.42
      const length = Math.hypot(taper, inset)
      const angle = Math.atan2(inset, taper) * side
      parts.box('padded', length, room.ceiling, 0.08, { x: x1 - taper / 2, y: base + room.ceiling / 2, z: zWall - side * (WALL_THICKNESS / 2 + inset / 2 + 0.04), rotY: angle }, WALL_PAD)
    }
    const drop = 0.6
    const slope = Math.hypot(0.9, drop)
    parts.box('padded', slope, 0.08, d - 0.2, { x: x1 - 0.45, y: top - drop / 2, z: cz, rotZ: -Math.atan2(drop, 0.9) }, CEILING_PAD)
  }
}

export function buildStation(map: GameMap, parts: Parts, extras: MapExtras): void {
  for (const room of map.rooms) buildRoom(parts, map, room, extras)

  for (const wall of map.walls) {
    const base = levelY(map, levelOf(wall))
    for (const piece of wallPieces(wall)) {
      const length = piece.b - piece.a
      const height = piece.y1 - piece.y0
      const mid = (piece.a + piece.b) / 2
      const y = base + (piece.y0 + piece.y1) / 2
      if (wall.runs === 'x') parts.box('padded', length, height, WALL_THICKNESS, { x: mid, y, z: wall.at }, WALL_PAD)
      else parts.box('padded', WALL_THICKNESS, height, length, { x: wall.at, y, z: mid }, WALL_PAD)
    }
    for (const opening of wall.openings ?? []) {
      if (opening.kind === 'window') dressWindow(parts, map, wall, opening)
      else if (opening.round) dressHatch(parts, map, wall, opening)
      else dressDoorway(parts, map, wall, opening)
    }
    dressWalls(parts, map, wall)
  }
}
