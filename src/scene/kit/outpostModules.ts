/**
 * The lunar outpost's outside: each room is a habitat module standing on
 * the surface, like the modules in concept art for a lunar base.
 *
 * - Every ground-level room gets a rounded-box shell that fits round its
 *   walls exactly: flat sides, rounded top edges and corners, a white
 *   quilted thermal blanket, grey regolith dust staining the lower parts,
 *   and a few gold foil panels. Modules that touch (the corridor and the
 *   rooms either side) butt together, with a joint band where they meet.
 * - Windows are cut straight through the shell where the interior windows
 *   are, so the view out lines up; the airlock's outer door is a notch with
 *   a framed doorway, a porch platform, a short ramp, a canopy with a lit
 *   AIRLOCK sign and marker lights.
 * - Radiator panels on the roofs, external lights, handrails, and a vent
 *   mast with a beacon. The modules stand on a pad of compacted regolith.
 * - The storm shelter is the one module covered in regolith bags (see
 *   `Room.shielding`), with a sign saying why.
 *
 * Everything is built from the map's rooms and walls, so the inside and
 * the outside always agree.
 */
import { BufferAttribute, BufferGeometry, ExtrudeGeometry, Matrix4, Path, PlaneGeometry, Shape, SphereGeometry, Vector3 } from 'three'
import { levelOf, roomAt } from '../../maps/collision'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import type { GameMap, Opening, Rect, Room } from '../../maps/types'
import { GROUND_LEVEL, WALL_THICKNESS } from '../../maps/types'
import { hash2, smoothstep, worldFbm } from '../materials/noise'
import { tint } from '../materials/surfaces'
import type { Parts, Tint } from './parts'
import type { MapExtras } from './specs'

/** The shell's outer face, out from a room's wall line: half a wall plus the shell itself. */
export const SHELL_OUT = WALL_THICKNESS / 2 + 0.24
/** The roof's outer surface above the ceiling. */
export const ROOF_ABOVE = 0.3
/** Radius of the rounded top edges and corners. */
const ROUND = 0.6
/** The shell's bottom, just into the pad. */
const BASE = -0.06

const BLANKET: Tint = [0.95, 0.95, 0.93]
const DUST: Tint = [0.44, 0.43, 0.41]
const GOLD: Tint = [1.0, 0.72, 0.3]
const JOINT = tint('#b9bec6')
const FRAME = tint('#9aa0a8')
const RAIL = tint('#c9a227')
const DARK = tint('#3a3f47')
const RADIATOR = tint('#e8eaee')
const BAG_TINTS = [tint('#8d8a83'), tint('#7f7c75'), tint('#97938b')]
const LAMP: Tint = [2.6, 2.4, 2]
const SIGN_LIGHT: Tint = [2.4, 1.5, 0.45]
const MARKER_LIGHT: Tint = [2.6, 1.7, 0.6]
const BEACON: Tint = [2.6, 0.4, 0.3]

interface Side {
  /** Outward normal (flat). */
  n: { x: number; z: number }
  /** Direction along the side (flat). */
  t: { x: number; z: number }
  /** The wall line's coordinate across the side (z for north/south, x for east/west). */
  edge: number
  /** The side's extent along `t`. */
  a0: number
  a1: number
  runs: 'x' | 'z'
}

function sidesOf(rect: Rect): Side[] {
  return [
    { n: { x: 0, z: -1 }, t: { x: 1, z: 0 }, edge: rect.z0, a0: rect.x0, a1: rect.x1, runs: 'x' },
    { n: { x: 0, z: 1 }, t: { x: 1, z: 0 }, edge: rect.z1, a0: rect.x0, a1: rect.x1, runs: 'x' },
    { n: { x: -1, z: 0 }, t: { x: 0, z: 1 }, edge: rect.x0, a0: rect.z0, a1: rect.z1, runs: 'z' },
    { n: { x: 1, z: 0 }, t: { x: 0, z: 1 }, edge: rect.x1, a0: rect.z0, a1: rect.z1, runs: 'z' },
  ]
}

/** World (x, z) of a point `along` a side and `out` from its wall line. */
function onSide(side: Side, along: number, out: number): { x: number; z: number } {
  return side.runs === 'x' ? { x: along, z: side.edge + side.n.z * out } : { x: side.edge + side.n.x * out, z: along }
}

/** The roof top of a module. */
function roofOf(room: Room): number {
  return room.ceiling + ROOF_ABOVE
}

/** Paints a geometry white with regolith dust rising up its lower part (vertex colours). */
function stain(geometry: BufferGeometry, base: Tint, rise = 1.3): void {
  const position = geometry.attributes.position as BufferAttribute
  const colors = new Float32Array(position.count * 3)
  for (let v = 0; v < position.count; v++) {
    const x = position.getX(v)
    const y = position.getY(v)
    const z = position.getZ(v)
    const blotch = worldFbm(x / 1.4, z / 1.4 + y / 2, 3, 61)
    const dust = (1 - smoothstep(0.05, rise * (0.7 + 0.6 * blotch), y)) * (0.75 + 0.25 * blotch)
    for (let c = 0; c < 3; c++) colors[v * 3 + c] = base[c]! * (1 - dust) + DUST[c]! * dust
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
}

/** Reverses every triangle of a non-indexed geometry (after a mirroring transform). */
function flipWinding(geometry: BufferGeometry): void {
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.attributes[name] as BufferAttribute
    const size = attribute.itemSize
    const array = attribute.array as Float32Array
    for (let t = 0; t < attribute.count; t += 3) {
      for (let k = 0; k < size; k++) {
        const a = array[(t + 1) * size + k]!
        array[(t + 1) * size + k] = array[(t + 2) * size + k]!
        array[(t + 2) * size + k] = a
      }
    }
    attribute.needsUpdate = true
  }
}

/**
 * A curved patch from a grid of points, facing `outward(u, v)`: used for
 * the rounded edges and corners. `point(u, v)` with u, v in 0..1.
 */
function patch(
  rows: number,
  cols: number,
  point: (u: number, v: number) => Vector3,
  outward: (u: number, v: number) => Vector3,
): BufferGeometry {
  const positions: number[] = []
  const add = (p: Vector3) => positions.push(p.x, p.y, p.z)
  const e1 = new Vector3()
  const e2 = new Vector3()
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const u0 = i / rows
      const u1 = (i + 1) / rows
      const v0 = j / cols
      const v1 = (j + 1) / cols
      const a = point(u0, v0)
      const b = point(u1, v0)
      const c = point(u1, v1)
      const d = point(u0, v1)
      const want = outward((u0 + u1) / 2, (v0 + v1) / 2)
      const facing = e1.subVectors(b, a).cross(e2.subVectors(c, a)).dot(want) >= 0
      for (const [p, q, r] of facing ? [[a, b, c], [a, c, d]] : [[a, c, b], [a, d, c]]) {
        add(p!)
        add(q!)
        add(r!)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  // Indexed, like the boxes it is merged with; shared corners make it smooth.
  const indexed = mergeVertices(geometry)
  geometry.dispose()
  indexed.computeVertexNormals()
  return indexed
}

interface Hole {
  lo: number
  hi: number
  bottom: number
  top: number
  door: boolean
}

/** Windows and doors in the wall along this stretch of a side. */
function holesIn(map: GameMap, side: Side, from: number, to: number): Hole[] {
  const holes: Hole[] = []
  for (const wall of map.walls) {
    if (levelOf(wall) !== GROUND_LEVEL || wall.runs !== side.runs || Math.abs(wall.at - side.edge) > 1e-6) continue
    for (const opening of wall.openings ?? []) {
      if (opening.center < from || opening.center > to) continue
      holes.push(holeOf(opening, wall.height))
    }
  }
  return holes.sort((a, b) => a.lo - b.lo)
}

function holeOf(opening: Opening, wallHeight: number): Hole {
  const half = opening.width / 2
  if (opening.kind === 'window') return { lo: opening.center - half, hi: opening.center + half, bottom: opening.sill ?? 1, top: opening.top ?? 1.6, door: false }
  return { lo: opening.center - half, hi: opening.center + half, bottom: BASE, top: Math.min(opening.height ?? 2.1, wallHeight), door: true }
}

/**
 * A flat stretch of shell along a side, from `from` to `to` and `y0` to
 * `y1`, with windows as holes and doors as notches from the bottom. Its
 * back sits on the wall's outer face; its front is the shell's outer face.
 */
function faceSlab(side: Side, from: number, to: number, y0: number, y1: number, holes: Hole[]): BufferGeometry {
  const shape = new Shape()
  shape.moveTo(from, y0)
  for (const h of holes.filter((h) => h.door)) {
    shape.lineTo(h.lo, y0)
    shape.lineTo(h.lo, h.top)
    shape.lineTo(h.hi, h.top)
    shape.lineTo(h.hi, y0)
  }
  shape.lineTo(to, y0)
  shape.lineTo(to, y1)
  shape.lineTo(from, y1)
  shape.closePath()
  for (const h of holes.filter((h) => !h.door && h.top < y1)) {
    const hole = new Path()
    hole.moveTo(h.lo, h.bottom)
    hole.lineTo(h.hi, h.bottom)
    hole.lineTo(h.hi, h.top)
    hole.lineTo(h.lo, h.top)
    hole.closePath()
    shape.holes.push(hole)
  }
  const geometry = new ExtrudeGeometry(shape, { depth: SHELL_OUT - WALL_THICKNESS / 2, bevelEnabled: false, curveSegments: 1 })
  geometry.deleteAttribute('uv')
  // Local x runs along the side, y up, z out of the wall.
  const t = new Vector3(side.t.x, 0, side.t.z)
  const up = new Vector3(0, 1, 0)
  const n = new Vector3(side.n.x, 0, side.n.z)
  const origin = side.runs === 'x' ? new Vector3(0, 0, side.edge + side.n.z * (WALL_THICKNESS / 2)) : new Vector3(side.edge + side.n.x * (WALL_THICKNESS / 2), 0, 0)
  const m = new Matrix4().makeBasis(t, up, n).setPosition(origin)
  geometry.applyMatrix4(m)
  if (m.determinant() < 0) flipWinding(geometry)
  geometry.computeVertexNormals()
  // Indexed, like the boxes it is merged with (flat faces keep their own corners: normals differ).
  const indexed = mergeVertices(geometry)
  geometry.dispose()
  return indexed
}

/** Whether a room's side has no module beyond it near `along`. */
function openAt(map: GameMap, side: Side, along: number): boolean {
  const p = onSide(side, along, 0.35)
  return !roomAt(map, p.x, p.z)
}

/** The side perpendicular to `side` at one of its ends. */
function sideAtEnd(sides: Side[], side: Side, end: number): Side {
  return sides.find((o) => o.runs !== side.runs && Math.abs(o.edge - end) < 1e-9)!
}

/** Whether a room's corner at `end` of `side` turns outward: open beyond both sides there. */
function convexCorner(map: GameMap, sides: Side[], side: Side, end: number): boolean {
  const other = sideAtEnd(sides, side, end)
  const inward = end === side.a0 ? 0.025 : -0.025
  return openAt(map, side, end + inward) && openAt(map, other, side.edge - (side.n.x + side.n.z) * 0.025)
}

/** One module's shell, joint bands and roof. */
function buildShell(map: GameMap, room: Room, parts: Parts): void {
  const rect = room.rect
  const top = roofOf(room)
  const sides = sidesOf(rect)
  const spring = top - ROUND
  const inner = SHELL_OUT - ROUND
  /** The roof's reach past each wall line (rounded sides stop where the curve starts). */
  const roofOut: number[] = []
  const allStretches: { from: number; to: number; neighbour: Room | undefined }[][] = []

  for (const [index, side] of sides.entries()) {
    // Group the side into stretches by what is beyond it.
    const stretches: { from: number; to: number; neighbour: Room | undefined }[] = []
    for (let s = side.a0 + 0.025; s < side.a1; s += 0.05) {
      const p = onSide(side, s, 0.35)
      const neighbour = roomAt(map, p.x, p.z)
      const last = stretches[stretches.length - 1]
      if (last && last.neighbour === neighbour) last.to = Math.min(side.a1, s + 0.025)
      else stretches.push({ from: Math.max(side.a0, s - 0.025), to: Math.min(side.a1, s + 0.025), neighbour })
    }
    const exposed = stretches.some((s) => !s.neighbour || roofOf(s.neighbour) < top - 1e-6)
    roofOut[index] = exposed ? inner : 0
    allStretches[index] = stretches
    const convexStart = convexCorner(map, sides, side, side.a0)
    const convexEnd = convexCorner(map, sides, side, side.a1)

    for (const stretch of stretches) {
      const neighbourTop = stretch.neighbour ? roofOf(stretch.neighbour) : -Infinity
      if (stretch.neighbour && neighbourTop >= top - 1e-6) {
        // Butting onto an equal or taller module: a joint band over the roof where they meet.
        if (neighbourTop <= top + 1e-6 && room.id < stretch.neighbour.id) {
          const mid = (stretch.from + stretch.to) / 2
          const p = onSide(side, mid, 0)
          const length = stretch.to - stretch.from
          parts.box('painted', side.runs === 'x' ? length : 0.24, 0.05, side.runs === 'x' ? 0.24 : length, { x: p.x, y: top + 0.02, z: p.z }, JOINT)
        }
        continue
      }
      const atStart = Math.abs(stretch.from - side.a0) < 1e-6
      const atEnd = Math.abs(stretch.to - side.a1) < 1e-6
      const from = atStart && convexStart ? side.a0 - inner : stretch.from
      const to = atEnd && convexEnd ? side.a1 + inner : stretch.to
      const bottom = stretch.neighbour ? neighbourTop : BASE
      // The flat face, up to where the roof edge starts to curve.
      if (spring - bottom > 0.05) {
        const face = faceSlab(side, from, to, bottom, spring, holesIn(map, side, stretch.from, stretch.to))
        parts.add('padded', face)
        stain(face, BLANKET)
      }
      // The rounded top edge.
      const centre = (along: number) => {
        const p = onSide(side, along, inner)
        return new Vector3(p.x, spring, p.z)
      }
      const n = new Vector3(side.n.x, 0, side.n.z)
      const up = new Vector3(0, 1, 0)
      const arc = patch(
        8,
        Math.max(1, Math.ceil((to - from) / 2)),
        (u, v) => centre(from + (to - from) * v).add(n.clone().multiplyScalar(Math.cos((u * Math.PI) / 2) * ROUND)).add(up.clone().multiplyScalar(Math.sin((u * Math.PI) / 2) * ROUND)),
        (u) => n.clone().multiplyScalar(Math.cos((u * Math.PI) / 2)).add(up.clone().multiplyScalar(Math.sin((u * Math.PI) / 2))),
      )
      parts.add('padded', arc, BLANKET)
      // Close an arc's open end where it stops short of a corner.
      for (const [end, at] of [
        [!(atStart && convexStart), from],
        [!(atEnd && convexEnd), to],
      ] as const) {
        if (!end) continue
        const t = new Vector3(side.t.x, 0, side.t.z).multiplyScalar(at === from ? -1 : 1)
        const c = centre(at)
        // Only the part outside the room's own walls and ceiling: from where each
        // ray out of the curve's axis leaves the room box, out to the curve.
        const leave = (u: number) => {
          const a = (u * Math.PI) / 2
          const outward = Math.cos(a) > 1e-6 ? (WALL_THICKNESS / 2 - inner) / Math.cos(a) : Infinity
          const upward = Math.sin(a) > 1e-6 ? (room.ceiling - spring) / Math.sin(a) : Infinity
          return Math.min(ROUND, outward, upward)
        }
        const cap = patch(
          6,
          1,
          (u, v) => {
            const a = (u * Math.PI) / 2
            const r = leave(u) + (ROUND - leave(u)) * v
            return c.clone().add(n.clone().multiplyScalar(Math.cos(a) * r)).add(up.clone().multiplyScalar(Math.sin(a) * r))
          },
          () => t,
        )
        parts.add('padded', cap, BLANKET)
      }
      // Gold foil and a lamp on longer exposed stretches.
      decorateFace(map, side, stretch.from, stretch.to, bottom, spring, parts)
    }

  }

  // Rounded corners where two exposed sides turn outward together: a rounded post and a dome cap.
  const [northSide, southSide] = sides as [Side, Side, Side, Side]
  for (const side of [northSide, southSide]) {
    for (const end of [side.a0, side.a1]) {
      if (!convexCorner(map, sides, side, end)) continue
      const other = sideAtEnd(sides, side, end)
      const n1 = new Vector3(side.n.x, 0, side.n.z)
      const n2 = new Vector3(other.n.x, 0, other.n.z)
      const corner = onSide(side, end, 0)
      const cx = corner.x + (n1.x + n2.x) * inner
      const cz = corner.z + (n1.z + n2.z) * inner
      const dir = (th: number) => n1.clone().multiplyScalar(Math.cos(th)).add(n2.clone().multiplyScalar(Math.sin(th)))
      const post = patch(
        6,
        3,
        (u, v) => new Vector3(cx, BASE + (spring - BASE) * v, cz).add(dir((u * Math.PI) / 2).multiplyScalar(ROUND)),
        (u) => dir((u * Math.PI) / 2),
      )
      parts.add('padded', post)
      stain(post, BLANKET)
      const dome = patch(
        6,
        6,
        (u, v) => {
          const th = (u * Math.PI) / 2
          const ph = (v * Math.PI) / 2
          return new Vector3(cx, spring, cz).add(dir(th).multiplyScalar(Math.cos(ph) * ROUND)).add(new Vector3(0, Math.sin(ph) * ROUND, 0))
        },
        (u, v) => dir((u * Math.PI) / 2).multiplyScalar(Math.cos((v * Math.PI) / 2)).add(new Vector3(0, Math.sin((v * Math.PI) / 2), 0)),
      )
      parts.add('padded', dome, BLANKET)
    }
  }

  // The flat roof, out to where each rounded edge starts (or to the wall line where modules butt).
  const [north, south, west, east] = roofOut as [number, number, number, number]
  const x0 = rect.x0 - west
  const x1 = rect.x1 + east
  const z0 = rect.z0 - north
  const z1 = rect.z1 + south
  parts.box('padded', x1 - x0, 0.04, z1 - z0, { x: (x0 + x1) / 2, y: top - 0.02, z: (z0 + z1) / 2 }, BLANKET)
  // Where a rounded side is partly shared with an equal module, fill the roof out to the wall line there.
  for (const [index, side] of sides.entries()) {
    if (roofOut[index] === 0) continue
    for (const stretch of allStretches[index] ?? []) {
      if (!stretch.neighbour || roofOf(stretch.neighbour) < top - 1e-6) continue
      const a = onSide(side, (stretch.from + stretch.to) / 2, inner)
      const b = onSide(side, (stretch.from + stretch.to) / 2, 0)
      const length = stretch.to - stretch.from
      parts.box('padded', side.runs === 'x' ? length : Math.abs(b.x - a.x) + 0.01, 0.04, side.runs === 'x' ? Math.abs(b.z - a.z) + 0.01 : length, { x: (a.x + b.x) / 2, y: top - 0.02, z: (a.z + b.z) / 2 }, BLANKET)
    }
  }
}

/** Gold foil panels, window frames, lamps and handrails on an exposed stretch of shell. */
function decorateFace(map: GameMap, side: Side, from: number, to: number, bottom: number, spring: number, parts: Parts): void {
  const face = SHELL_OUT
  const holes = holesIn(map, side, from, to)
  const at = (along: number, out: number, y: number) => ({ ...onSide(side, along, out), y })
  const flatBox = (key: 'brushed' | 'painted' | 'emissive', along: number, length: number, y: number, height: number, depth: number, out: number, colour: Tint) => {
    const p = at(along, out, y)
    parts.box(key, side.runs === 'x' ? length : depth, height, side.runs === 'x' ? depth : length, p, colour)
  }
  // Window frames.
  for (const h of holes) {
    if (h.door) continue
    const mid = (h.lo + h.hi) / 2
    const w = h.hi - h.lo
    flatBox('brushed', mid, w + 0.16, h.top + 0.04, 0.08, 0.05, face + 0.02, FRAME)
    flatBox('brushed', mid, w + 0.16, h.bottom - 0.04, 0.08, 0.05, face + 0.02, FRAME)
    flatBox('brushed', h.lo - 0.04, 0.08, (h.top + h.bottom) / 2, h.top - h.bottom, 0.05, face + 0.02, FRAME)
    flatBox('brushed', h.hi + 0.04, 0.08, (h.top + h.bottom) / 2, h.top - h.bottom, 0.05, face + 0.02, FRAME)
  }
  const length = to - from
  if (bottom > 0.5) return
  const clear = (lo: number, hi: number) => !holes.some((h) => h.hi > lo - 0.3 && h.lo < hi + 0.3)
  // A gold foil panel where the stretch is long and clear.
  if (length >= 3) {
    const seed = hash2(Math.round(from * 7), Math.round(side.edge * 7), 71)
    const mid = from + length * (0.3 + 0.4 * seed)
    if (clear(mid - 0.8, mid + 0.8)) flatBox('brushed', mid, 1.5, 1.25, 0.9, 0.02, face + 0.01, GOLD)
  }
  // An outside lamp near each end of a long stretch.
  if (length >= 2.5) {
    for (const along of [from + 0.7, to - 0.7]) {
      if (!clear(along - 0.2, along + 0.2)) continue
      flatBox('painted', along, 0.22, spring - 0.12, 0.12, 0.1, face + 0.05, DARK)
      flatBox('emissive', along, 0.16, spring - 0.19, 0.03, 0.07, face + 0.06, LAMP)
    }
  }
  // A handrail along the lower wall, broken round doors.
  if (length >= 1.6) {
    let start = from + 0.3
    for (const h of [...holes.filter((h) => h.door), { lo: to + 0.1, hi: to + 0.1 } as Hole]) {
      const end = Math.min(h.lo - 0.4, to - 0.3)
      if (end - start > 0.6) {
        flatBox('painted', (start + end) / 2, end - start, 1.1, 0.04, 0.04, face + 0.1, RAIL)
        for (let s = start + 0.1; s < end; s += 1.2) flatBox('painted', s, 0.04, 1.1, 0.04, 0.1, face + 0.05, RAIL)
      }
      start = h.hi + 0.4
    }
  }
}

/** A single sandbag: a soft, squashed pillow. */
function bagShape(): BufferGeometry {
  const g = new SphereGeometry(1, 8, 5)
  const position = g.attributes.position as BufferAttribute
  for (let v = 0; v < position.count; v++) {
    const se = (u: number) => Math.sign(u) * Math.pow(Math.abs(u), 0.45)
    position.setXYZ(v, se(position.getX(v)) * 0.27, se(position.getY(v)) * 0.11, se(position.getZ(v)) * 0.19)
  }
  g.computeVertexNormals()
  return g
}

/**
 * Regolith bags piled over a module: staggered rows up its exposed sides
 * and a thick layer over its roof. Only the storm shelter has them, so the
 * one shielded module shows why it's the safe place in a solar storm.
 */
function buildShielding(map: GameMap, room: Room, parts: Parts, extras: MapExtras): void {
  const thick = room.shielding ?? 0
  if (thick <= 0) return
  const bag = bagShape()
  const top = roofOf(room)
  const place = (x: number, y: number, z: number, yaw: number, seed: number) => {
    const g = bag.clone()
    const s = 0.92 + hash2(seed, 3, 91) * 0.16
    g.scale(s, 0.9 + hash2(seed, 4, 91) * 0.2, s)
    g.rotateY(yaw + (hash2(seed, 5, 91) - 0.5) * 0.12)
    g.translate(x, y, z)
    parts.add('fabric', g, BAG_TINTS[Math.floor(hash2(seed, 6, 91) * BAG_TINTS.length)])
  }
  let seed = 0
  const layers = Math.max(1, Math.round(thick / 0.36))
  const sides = sidesOf(room.rect)
  // Never into another module or its shell.
  const others = map.rooms.filter((o) => o !== room && levelOf(o) === GROUND_LEVEL).map((o) => o.rect)
  const free = (x: number, z: number) => !others.some((r) => x > r.x0 - SHELL_OUT - 0.2 && x < r.x1 + SHELL_OUT + 0.2 && z > r.z0 - SHELL_OUT - 0.2 && z < r.z1 + SHELL_OUT + 0.2)
  for (const side of sides) {
    if (!openAt(map, side, (side.a0 + side.a1) / 2)) continue
    const yaw = side.runs === 'x' ? 0 : Math.PI / 2
    for (let layer = 0; layer < layers; layer++) {
      const out = SHELL_OUT + 0.19 + layer * 0.36
      // Wrap round convex corners.
      const from = side.a0 - (convexCorner(map, sides, side, side.a0) ? SHELL_OUT + thick : 0)
      const to = side.a1 + (convexCorner(map, sides, side, side.a1) ? SHELL_OUT + thick : 0)
      const rows = Math.ceil((top + 0.1) / 0.2)
      for (let row = 0; row < rows; row++) {
        const y = 0.1 + row * 0.2
        // A pile leans in a little as it rises.
        const lean = row * 0.012
        for (let s = from + (row % 2 ? 0.27 : 0); s < to; s += 0.52) {
          const p = onSide(side, s + 0.26, out - lean)
          if (free(p.x, p.z)) place(p.x, y, p.z, yaw, seed++)
        }
      }
    }
  }
  // The roof: layers of bags over the whole top, reaching over the edges.
  const r = room.rect
  const reach = SHELL_OUT + thick * 0.6
  for (let layer = 0; layer < layers; layer++) {
    const y = top + 0.1 + layer * 0.2
    let row = 0
    for (let z = r.z0 - reach + 0.19; z < r.z1 + reach; z += 0.37, row++) {
      for (let x = r.x0 - reach + (row % 2 ? 0.27 : 0); x < r.x1 + reach; x += 0.52) {
        if (free(x + 0.26, z)) place(x + 0.26, y, z, 0, seed++)
      }
    }
  }
  bag.dispose()
  // The sign out front.
  const front = sidesOf(r).find((s) => s.n.z > 0 && openAt(map, s, (s.a0 + s.a1) / 2))
  if (!front) return
  const mid = (front.a0 + front.a1) / 2
  const p = onSide(front, mid, SHELL_OUT + thick + 0.9)
  for (const dx of [-0.75, 0.75]) parts.box('painted', 0.06, 1.3, 0.06, { x: p.x + dx, y: 0.65, z: p.z }, FRAME)
  parts.box('painted', 1.9, 0.6, 0.05, { x: p.x, y: 1.35, z: p.z }, tint('#a3261c'))
  // One text with two lines (one draw call).
  extras.texts.push({ id: 'shelter-shielding-sign', text: 'STORM SHELTER\nREGOLITH SHIELDING', position: [p.x, 1.35, p.z + 0.03], rotationY: 0, fontSize: 0.15, color: '#ffffff', font: 'ui' })
}

/** Outside doors: where each one is, which way out is, and its size. */
export function outsideDoors(map: GameMap): { x: number; z: number; normal: { x: number; z: number }; width: number; height: number }[] {
  const doors: { x: number; z: number; normal: { x: number; z: number }; width: number; height: number }[] = []
  for (const wall of map.walls) {
    if (levelOf(wall) !== GROUND_LEVEL) continue
    for (const opening of wall.openings ?? []) {
      if (opening.kind !== 'door') continue
      for (const side of [-1, 1]) {
        const x = wall.runs === 'x' ? opening.center : wall.at
        const z = wall.runs === 'x' ? wall.at : opening.center
        const probe = wall.runs === 'x' ? { x, z: z + side * 0.5 } : { x: x + side * 0.5, z }
        if (roomAt(map, probe.x, probe.z)) continue
        doors.push({ x, z, normal: wall.runs === 'x' ? { x: 0, z: side } : { x: side, z: 0 }, width: opening.width, height: opening.height ?? 2.1 })
      }
    }
  }
  return doors
}

/**
 * The airlock entrance: a framed doorway in the shell, a porch platform and
 * a short ramp down to the ground, side rails, a canopy with a lit AIRLOCK
 * sign, and marker lights either side.
 */
function buildPorch(map: GameMap, parts: Parts, extras: MapExtras, ground: (x: number, z: number) => number): void {
  for (const door of outsideDoors(map)) {
    const { normal: n, width } = door
    const sx = n.z
    const sz = -n.x
    const along = Math.abs(n.x) > 0
    const face = SHELL_OUT
    const box = (key: 'painted' | 'emissive', w: number, h: number, d: number, out: number, across: number, y: number, colour?: Tint, rot?: number) =>
      parts.box(key, along ? d : w, h, along ? w : d, { x: door.x + n.x * out + sx * across, y, z: door.z + n.z * out + sz * across, ...(rot ? (along ? { rotZ: -n.x * rot } : { rotX: n.z * rot }) : {}) }, colour)
    const y0 = ground(door.x + n.x * (face + 1), door.z + n.z * (face + 1))
    // Door frame on the shell's face.
    for (const s of [-1, 1]) box('painted', 0.16, door.height + 0.12, 0.1, face + 0.04, s * (width / 2 + 0.08), door.height / 2, FRAME)
    box('painted', width + 0.32, 0.16, 0.1, face + 0.04, 0, door.height + 0.08, FRAME)
    // Porch: a grated platform flush with the door sill, then a short ramp.
    const deck = 2
    box('painted', width + 1.6, 0.08, deck, face + deck / 2, 0, y0 + 0.02, DARK)
    const ramp = 0.9
    box('painted', width + 0.6, 0.06, Math.hypot(ramp, 0.06), face + deck + ramp / 2, 0, y0 - 0.01, DARK, Math.atan2(0.06, ramp))
    // Side rails along the porch.
    for (const s of [-1, 1]) {
      const across = s * (width / 2 + 0.75)
      for (const out of [face + 0.3, face + deck - 0.1]) box('painted', 0.05, 1, 0.05, out, across, y0 + 0.5, RAIL)
      box('painted', 0.05, 0.05, deck - 0.4, face + deck / 2 + 0.1, across, y0 + 1, RAIL)
    }
    // Canopy over the porch on two posts.
    const canopy = 1.5
    box('painted', width + 1.4, 0.1, canopy, face + canopy / 2, 0, door.height + 0.42, FRAME)
    for (const s of [-1, 1]) box('painted', 0.1, door.height + 0.4 - y0, 0.1, face + canopy - 0.05, s * (width / 2 + 0.6), (door.height + 0.4 + y0) / 2, FRAME)
    // The lit sign on the canopy's front edge.
    const signOut = face + canopy + 0.03
    box('emissive', 1.3, 0.3, 0.03, signOut, 0, door.height + 0.64, SIGN_LIGHT)
    extras.texts.push({
      id: `airlock-entrance-sign-${door.x}-${door.z}`,
      text: 'AIRLOCK',
      position: [door.x + n.x * (signOut + 0.03), door.height + 0.64, door.z + n.z * (signOut + 0.03)],
      rotationY: Math.atan2(n.x, n.z),
      fontSize: 0.2,
      color: '#1b1d21',
      font: 'ui',
    })
    // Marker lights either side of the ramp's foot.
    for (const s of [-1, 1]) {
      const out = face + deck + ramp + 0.3
      const x = door.x + n.x * out + sx * s * (width / 2 + 0.6)
      const z = door.z + n.z * out + sz * s * (width / 2 + 0.6)
      parts.cylinder('painted', 0.05, 0.06, 0.4, { x, y: ground(x, z) + 0.2, z }, FRAME, 6)
      parts.box('emissive', 0.1, 0.06, 0.1, { x, y: ground(x, z) + 0.43, z }, MARKER_LIGHT)
    }
  }
}

/** Radiator panels on the roofs, and a vent mast with a beacon on the corridor. */
function buildRoofKit(map: GameMap, parts: Parts): void {
  for (const room of map.rooms) {
    if (levelOf(room) !== GROUND_LEVEL || room.shielding) continue
    const r = room.rect
    const w = r.x1 - r.x0
    const d = r.z1 - r.z0
    const top = roofOf(room)
    // Radiators on the bigger side modules: thin upright fins on legs, edge-on to the Sun.
    if (w >= 5 && d >= 4 && w * d < 60) {
      const cx = (r.x0 + r.x1) / 2
      const cz = (r.z0 + r.z1) / 2
      for (const dz of [-0.7, 0.7]) {
        parts.box('painted', Math.min(3.2, w - 1.6), 1.1, 0.05, { x: cx, y: top + 0.85, z: cz + dz }, RADIATOR)
        for (let i = 0; i < 8; i++) parts.box('brushed', 0.025, 1.0, 0.07, { x: cx - Math.min(3.2, w - 1.6) / 2 + 0.2 + i * ((Math.min(3.2, w - 1.6) - 0.4) / 7), y: top + 0.85, z: cz + dz }, FRAME)
        for (const dx of [-1, 1]) parts.box('painted', 0.06, 0.3, 0.06, { x: cx + dx * (Math.min(3.2, w - 1.6) / 2 - 0.2), y: top + 0.15, z: cz + dz }, FRAME)
      }
    }
  }
  // The vent mast with its beacon, on the corridor roof.
  const corridor = map.rooms.find((room) => room.id === 'corridor')
  if (!corridor) return
  const top = roofOf(corridor)
  const vent = { x: 3, z: 0 }
  parts.cylinder('painted', 0.1, 0.12, 1.8, { x: vent.x, y: top + 0.9, z: vent.z }, FRAME, 10)
  parts.cylinder('painted', 0.25, 0.25, 0.18, { x: vent.x, y: top + 1.85, z: vent.z }, JOINT, 12)
  parts.box('emissive', 0.1, 0.1, 0.1, { x: vent.x, y: top + 2.0, z: vent.z }, BEACON)
}

/**
 * The levelled pad of compacted regolith the modules stand on: lit like the
 * terrain round it (the same baked light map), a shade darker and smoother.
 */
function buildPad(map: GameMap, parts: Parts, lightUv: (x: number, z: number) => [number, number], tone: (x: number, z: number) => number): void {
  const rooms = map.rooms.filter((room) => levelOf(room) === GROUND_LEVEL)
  const out = (room: Room) => SHELL_OUT + 1.2 + (room.shielding ?? 0)
  const x0 = Math.min(...rooms.map((r) => r.rect.x0 - out(r)))
  const x1 = Math.max(...rooms.map((r) => r.rect.x1 + out(r)))
  const z0 = Math.min(...rooms.map((r) => r.rect.z0 - out(r)))
  const z1 = Math.max(...rooms.map((r) => r.rect.z1 + out(r)))
  const geometry = new PlaneGeometry(x1 - x0, z1 - z0, Math.ceil(x1 - x0), Math.ceil(z1 - z0))
  geometry.rotateX(-Math.PI / 2)
  // Just under the floors (at 0) and just over the levelled ground (at -0.02).
  geometry.translate((x0 + x1) / 2, -0.008, (z0 + z1) / 2)
  const position = geometry.attributes.position as BufferAttribute
  const uv = geometry.attributes.uv as BufferAttribute
  const second = new Float32Array(position.count * 2)
  const colors = new Float32Array(position.count * 3)
  for (let v = 0; v < position.count; v++) {
    const x = position.getX(v)
    const z = position.getZ(v)
    uv.setXY(v, x / 2.4, z / 2.4)
    const [u, w] = lightUv(x, z)
    second[v * 2] = u
    second[v * 2 + 1] = w
    // Compacted: a little darker, and a faint edge where it meets loose ground.
    const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z)
    const value = tone(x, z) * (0.84 + 0.1 * smoothstep(0, 0.6, edge))
    colors[v * 3] = value
    colors[v * 3 + 1] = value * 0.985
    colors[v * 3 + 2] = value * 0.96
  }
  geometry.setAttribute('uv1', new BufferAttribute(second, 2))
  parts.add('lunarTerrain', geometry)
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
}

/** Every module's outside, the airlock porch and the storm shelter's bags. */
export function buildOutpostModules(
  map: GameMap,
  parts: Parts,
  extras: MapExtras,
  ground: (x: number, z: number) => number,
  lightUv: (x: number, z: number) => [number, number],
  tone: (x: number, z: number) => number,
): void {
  const rooms = map.rooms.filter((room) => levelOf(room) === GROUND_LEVEL)
  if (!rooms.length) return
  buildPad(map, parts, lightUv, tone)
  for (const room of rooms) buildShell(map, room, parts)
  for (const room of rooms) buildShielding(map, room, parts, extras)
  buildPorch(map, parts, extras, ground)
  buildRoofKit(map, parts)
}
