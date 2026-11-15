/**
 * The launch complex outside the windows, at dusk: coastal scrubland you can
 * walk on, roads, fences, floodlit paths and lamp posts, locked outbuildings,
 * the launch pad with its flame trench and launch mount, a lattice
 * service tower with the crew access arm and swing arms, lightning towers
 * and floodlights, plus a water tower and low buildings in the distance.
 *
 * All of it is static and goes into the shared merged parts, so the whole
 * outdoor world costs a handful of draw calls. The rocket on the pad is the
 * Saturn V model, drawn on its own (src/scene/SaturnVView.tsx); the pad and
 * tower are sized for it (real size, 110.8 m tall). The facility is
 * fictional; no logos or markings from any real agency or company.
 */
import { BufferAttribute, ConeGeometry, PlaneGeometry, Quaternion, Vector3 } from 'three'
import { fenceSegments, inset, listDoors, listPlaces, outbuildingDoor } from '../../maps/collision'
import { launchPad as padOf, type GameMap, type Rect, type Vec2 } from '../../maps/types'
import { hash2, smoothstep, worldFbm } from '../materials/noise'
import { tint } from '../materials/surfaces'
import { ARM_FLOOR_ABOVE_BASE, SATURN_V } from '../saturnLayout'
import { lunarGround } from './lunar'
import { orient, Parts, type Tint } from './parts'

const TOWER_RED = tint('#8c3b2e')
const STEEL_GREY = tint('#8a9098')
const ASPHALT = tint('#3a3b3e', 0.55)
const PAD_CONCRETE = tint('#b9b6ae')
const TRENCH = tint('#3c3a37')
const BUILDING = tint('#a5a39b')
const WHITE_PAINT = tint('#e9ebee')
const FLOOD: Tint = [6, 5.4, 4.4]
const WINDOW_WARM: Tint = [2.2, 1.5, 0.75]
const WINDOW_COOL: Tint = [1.1, 1.5, 2]
const SECURITY_YELLOW = tint('#c9a227')
const OUTBUILDING = tint('#7f7d77')
const ROOF = tint('#55575b')
const PATH_PAVING = tint('#8f8c85')
const ENTRANCE_LIGHT: Tint = [3, 2.6, 2]
const BOLLARD: Tint = [2.6, 2, 1.2]
const LAMP_HEAD: Tint = [4, 3.4, 2.4]
/** Warm pools of light on the ground under lamps and along paths. */
const POOL_WARM: Tint = [0.4, 0.3, 0.19]

/** Height of the rocket's base (the Saturn V's nozzle exits) above the ground. */
export const ROCKET_BASE = 6.05
/** The launch mount's deck: the first stage stands on it, its engines hanging into the opening below. */
const MOUNT_DECK = ROCKET_BASE + 5.2
/** Half the width of the opening in the mount, and of the flame trench under it. */
const MOUNT_OPENING = 6.7
const TRENCH_HALF = 6
/**
 * The service tower stands this far north of the rocket. The map data puts
 * the tower elevator car and the access arm to match (launchCenter.ts).
 */
const TOWER_SET_BACK = 12
/** The service tower rises past the escape tower's tip. */
export const TOWER_HEIGHT = 116
/**
 * Floor height of the crew access arm: just above the service module, so
 * the hatch opens onto the command module's side (saturnLayout.ts). The
 * map's 'arm' level uses the same number.
 */
export const ARM_FLOOR = Math.round((ROCKET_BASE + ARM_FLOOR_ABOVE_BASE) * 100) / 100

function distanceToRect(x: number, z: number, r: Rect): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1)
  const dz = Math.max(r.z0 - z, 0, z - r.z1)
  return Math.hypot(dx, dz)
}

function lerp3(a: Tint, b: Tint, t: number): Tint {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

interface Layout {
  pad: Vec2
  building: Rect
  padRect: Rect
  roads: Rect[]
  /** Paths, outbuildings and lamp spots: kept flat so walking and lights sit right. */
  flat: Rect[]
}

function layout(map: GameMap, pad: Vec2): Layout {
  const xs = map.rooms.flatMap((room) => [room.rect.x0, room.rect.x1])
  const zs = map.rooms.flatMap((room) => [room.rect.z0, room.rect.z1])
  const building = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
  const outdoor = map.outdoor
  const flat: Rect[] = []
  for (const path of outdoor?.paths ?? []) {
    for (const [a, b] of fenceSegments(path.points, false)) {
      const half = path.width / 2 + 1
      flat.push({
        x0: Math.min(a.x, b.x) - half,
        x1: Math.max(a.x, b.x) + half,
        z0: Math.min(a.z, b.z) - half,
        z1: Math.max(a.z, b.z) + half,
      })
    }
  }
  for (const b of outdoor?.buildings ?? []) flat.push(inset(b.rect, -2))
  for (const lamp of outdoor?.lamps ?? []) flat.push({ x0: lamp.x - 3, x1: lamp.x + 3, z0: lamp.z - 3, z1: lamp.z + 3 })
  return {
    pad,
    building,
    padRect: { x0: pad.x - 15, x1: pad.x + 15, z0: pad.z - 15, z1: pad.z + 15 },
    roads: [
      // East-west road south of the complex, outside the perimeter fence.
      { x0: -300, x1: 300, z0: pad.z + 34, z1: pad.z + 42 },
      // North-south road between the building and the pad.
      { x0: building.x1 + 0.5, x1: building.x1 + 7.5, z0: -300, z1: pad.z + 42 },
    ],
    flat,
  }
}

const TERRAIN_SIZE = 1300
const TERRAIN_SEGMENTS = 220
const TERRAIN_CENTER_X = 40

/** Scrubland height at a point: gentle, flat near the building, pad, roads and paths, falling into the sea in the east. */
function heightAt(l: Layout, x: number, z: number): { h: number; nearBuilding: number; nearPad: number } {
  let h = (worldFbm(x / 70, z / 70, 4, 5) - 0.5) * 1.8 + (worldFbm(x / 14, z / 14, 2, 9) - 0.5) * 0.35
  const nearBuilding = distanceToRect(x, z, l.building)
  const nearPad = distanceToRect(x, z, l.padRect)
  const nearRoad = Math.min(...l.roads.map((road) => distanceToRect(x, z, road)))
  const nearFlat = Math.min(Infinity, ...l.flat.map((rect) => distanceToRect(x, z, rect)))
  const flatness = Math.max(1 - smoothstep(3, 30, Math.min(nearBuilding, nearPad, nearRoad)), 1 - smoothstep(0, 6, nearFlat))
  h = h * (1 - flatness) - 0.06 * flatness
  if (nearBuilding < 2) h = Math.min(h, -0.04)
  h -= smoothstep(300, 380, x) * 6
  return { h, nearBuilding, nearPad }
}

const groundCache = new WeakMap<GameMap, (x: number, z: number) => number>()

/**
 * The outdoor ground height at (x, z), matching the terrain mesh (bilinear
 * between its grid points). The player walks on this outside.
 */
export function groundHeight(map: GameMap): (x: number, z: number) => number {
  const cached = groundCache.get(map)
  if (cached) return cached
  // On the Moon, the lunar terrain (with the outpost's regolith cover).
  const lunar = lunarGround(map)
  if (lunar) {
    groundCache.set(map, lunar)
    return lunar
  }
  const pad = padOf(map)
  if (!pad) return () => 0
  const l = layout(map, pad)
  const cell = TERRAIN_SIZE / TERRAIN_SEGMENTS
  const originX = TERRAIN_CENTER_X - TERRAIN_SIZE / 2
  const originZ = -TERRAIN_SIZE / 2
  const ground = (x: number, z: number) => {
    const gx = (x - originX) / cell
    const gz = (z - originZ) / cell
    const ix = Math.floor(gx)
    const iz = Math.floor(gz)
    const fx = gx - ix
    const fz = gz - iz
    const at = (i: number, k: number) => heightAt(l, originX + i * cell, originZ + k * cell).h
    const a = at(ix, iz)
    const b = at(ix + 1, iz)
    const c = at(ix, iz + 1)
    const d = at(ix + 1, iz + 1)
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
  }
  groundCache.set(map, ground)
  return ground
}

function terrain(parts: Parts, l: Layout): void {
  const geometry = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(TERRAIN_CENTER_X, 0, 0)
  const position = geometry.attributes.position as BufferAttribute
  const colors = new Float32Array(position.count * 3)
  const scrub = tint('#4d4a34')
  const scrubDark = tint('#2e3123')
  const sand = tint('#857a5d')
  const gravel = tint('#4a4844')

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const z = position.getZ(i)
    const { h, nearBuilding, nearPad } = heightAt(l, x, z)
    position.setY(i, h)

    const patches = smoothstep(0.45, 0.65, worldFbm(x / 25, z / 25, 3, 13))
    let color = lerp3(scrub, scrubDark, patches)
    color = lerp3(color, sand, smoothstep(260, 320, x))
    color = lerp3(color, gravel, 1 - smoothstep(2, 14, Math.min(nearBuilding, nearPad)))
    const grain = 0.9 + hash2(Math.round(x * 2), Math.round(z * 2), 3) * 0.2
    colors[i * 3] = color[0] * grain
    colors[i * 3 + 1] = color[1] * grain
    colors[i * 3 + 2] = color[2] * grain
  }
  geometry.computeVertexNormals()
  parts.add('terrain', geometry)
  // Parts.add sets a flat tint; replace it with the painted terrain colours.
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
}

function roads(parts: Parts, l: Layout): void {
  for (const road of l.roads) {
    const w = road.x1 - road.x0
    const d = road.z1 - road.z0
    parts.box('concrete', w, 0.06, d, { x: (road.x0 + road.x1) / 2, y: 0.0, z: (road.z0 + road.z1) / 2 }, ASPHALT)
    // Dashed centre line.
    const alongX = w > d
    const length = alongX ? w : d
    for (let t = 2; t < length - 2; t += 8) {
      const x = alongX ? road.x0 + t : (road.x0 + road.x1) / 2
      const z = alongX ? (road.z0 + road.z1) / 2 : road.z0 + t
      parts.box('painted', alongX ? 3 : 0.15, 0.02, alongX ? 0.15 : 3, { x, y: 0.035, z }, WHITE_PAINT)
    }
  }
}

/** A soft pool of light on the ground: a flat additive glow, no real light. */
function glowPool(parts: Parts, x: number, y: number, z: number, radius: number, color: Tint = POOL_WARM): void {
  parts.add('glow', orient(new PlaneGeometry(radius * 2, radius * 2), { x, y: y + 0.04, z, rotX: -Math.PI / 2 }), color)
}

/** Fences from the map data: posts every 3 m and three rails; the pad fence is yellow with warning plates. */
function fences(parts: Parts, map: GameMap, ground: (x: number, z: number) => number): void {
  for (const fence of map.outdoor?.fences ?? []) {
    const security = fence.id.includes('security')
    const postColor = security ? SECURITY_YELLOW : STEEL_GREY
    const h = fence.height
    for (const [a, b] of fenceSegments(fence.points, fence.closed ?? false)) {
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z)
      const spans = Math.max(1, Math.round(length / 3))
      for (let i = 0; i <= spans; i++) {
        const t = i / spans
        const x = a.x + (b.x - a.x) * t
        const z = a.z + (b.z - a.z) * t
        parts.box('steel', 0.09, h, 0.09, { x, y: ground(x, z) + h / 2, z }, postColor)
      }
      for (let i = 0; i < spans; i++) {
        const t0 = i / spans
        const t1 = (i + 1) / spans
        const x = a.x + (b.x - a.x) * (t0 + t1) / 2
        const z = a.z + (b.z - a.z) * (t0 + t1) / 2
        const span = length / spans
        const gy = ground(x, z)
        for (const y of [0.15, h * 0.5, h - 0.05]) {
          parts.box('steel', alongX ? span : 0.035, 0.035, alongX ? 0.035 : span, { x, y: gy + y, z }, STEEL_GREY)
        }
        // A fine mesh between the rails, as thin vertical wires.
        for (let w = 1; w < 6; w++) {
          const tw = t0 + ((t1 - t0) * w) / 6
          const wx = a.x + (b.x - a.x) * tw
          const wz = a.z + (b.z - a.z) * tw
          parts.box('steel', 0.012, h - 0.2, 0.012, { x: wx, y: gy + h / 2, z: wz }, STEEL_GREY)
        }
        if (security && i % 3 === 1) {
          parts.box('painted', alongX ? 0.7 : 0.03, 0.45, alongX ? 0.03 : 0.7, { x, y: gy + 1.4, z }, SECURITY_YELLOW)
        }
      }
    }
  }
}

/** Buildings the player can't enter: a solid block with a lit, locked door and a few lit windows. */
function outbuildings(parts: Parts, map: GameMap, ground: (x: number, z: number) => number): void {
  for (const b of map.outdoor?.buildings ?? []) {
    const { x0, x1, z0, z1 } = b.rect
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const gy = ground(cx, cz)
    parts.box('concrete', x1 - x0, b.height, z1 - z0, { x: cx, y: gy + b.height / 2, z: cz }, OUTBUILDING)
    parts.box('concrete', x1 - x0 + 0.4, 0.25, z1 - z0 + 0.4, { x: cx, y: gy + b.height + 0.1, z: cz }, ROOF)
    const door = outbuildingDoor(b)
    if (!door) continue
    const { center, normal } = door
    const yaw = Math.atan2(normal.x, normal.z)
    const dy = ground(center.x, center.z)
    const f = (out: number) => ({ x: center.x + normal.x * out, z: center.z + normal.z * out })
    const p = f(0.04)
    parts.box('painted', 1.3, 2.3, 0.08, { x: p.x, y: dy + 1.15, z: p.z, rotY: yaw }, tint('#2b3038'))
    const light = f(0.12)
    parts.box('emissive', 0.8, 0.08, 0.06, { x: light.x, y: dy + 2.6, z: light.z, rotY: yaw }, ENTRANCE_LIGHT)
    const canopy = f(0.6)
    parts.box('painted', 2, 0.1, 1.2, { x: canopy.x, y: dy + 2.75, z: canopy.z, rotY: yaw }, tint('#4f6075'))
    const pool = f(1.6)
    glowPool(parts, pool.x, ground(pool.x, pool.z), pool.z, 3.2)
  }
}

/** Floodlit walkways: a paved strip with lit bollards along both edges and pools of light. */
function paths(parts: Parts, map: GameMap, ground: (x: number, z: number) => number): void {
  for (const path of map.outdoor?.paths ?? []) {
    for (const [a, b] of fenceSegments(path.points, false)) {
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z)
      const mx = (a.x + b.x) / 2
      const mz = (a.z + b.z) / 2
      const extra = path.width
      parts.box(
        'concrete',
        alongX ? length + extra : path.width,
        0.06,
        alongX ? path.width : length + extra,
        { x: mx, y: ground(mx, mz) + 0.01, z: mz },
        PATH_PAVING,
      )
      const count = Math.max(1, Math.round(length / 5))
      for (let i = 0; i <= count; i++) {
        const t = i / count
        const x = a.x + (b.x - a.x) * t
        const z = a.z + (b.z - a.z) * t
        for (const side of [-1, 1]) {
          const bx = alongX ? x : x + side * (path.width / 2 + 0.3)
          const bz = alongX ? z + side * (path.width / 2 + 0.3) : z
          const gy = ground(bx, bz)
          parts.box('steel', 0.14, 0.8, 0.14, { x: bx, y: gy + 0.4, z: bz }, tint('#3a3f47'))
          parts.box('emissive', 0.15, 0.08, 0.15, { x: bx, y: gy + 0.76, z: bz }, BOLLARD)
        }
        if (i % 2 === 0) glowPool(parts, x, ground(x, z), z, 2.6)
      }
    }
  }
}

/** Lamp posts: a pole, an arm, a glowing head and a pool of light below. */
function lamps(parts: Parts, map: GameMap, ground: (x: number, z: number) => number): void {
  for (const lamp of map.outdoor?.lamps ?? []) {
    const gy = ground(lamp.x, lamp.z)
    parts.cylinder('steel', 0.07, 0.1, 6, { x: lamp.x, y: gy + 3, z: lamp.z }, tint('#4a5058'), 8)
    parts.box('steel', 0.9, 0.08, 0.08, { x: lamp.x + 0.4, y: gy + 6, z: lamp.z }, tint('#4a5058'))
    parts.box('painted', 0.5, 0.12, 0.3, { x: lamp.x + 0.8, y: gy + 5.95, z: lamp.z }, tint('#2a2e35'))
    parts.box('emissive', 0.42, 0.02, 0.24, { x: lamp.x + 0.8, y: gy + 5.88, z: lamp.z }, LAMP_HEAD)
    glowPool(parts, lamp.x + 0.8, gy, lamp.z, 5.5)
  }
}

/** Lit entrances on the outside of every door that leads out of the building. */
function entrances(parts: Parts, map: GameMap, ground: (x: number, z: number) => number): void {
  for (const door of listDoors(map)) {
    const places = door.rooms.map((id) => listPlaces(map).find((place) => place.id === id))
    const outsideIndex = places.findIndex((place) => place?.kind === 'zone')
    if (outsideIndex < 0) continue
    const sign = outsideIndex === 0 ? -1 : 1
    const n = door.runs === 'x' ? { x: 0, z: sign } : { x: sign, z: 0 }
    const yaw = Math.atan2(n.x, n.z)
    const at = (out: number) => ({ x: door.center.x + n.x * out, z: door.center.z + n.z * out })
    const light = at(0.16)
    parts.box('emissive', door.width + 0.4, 0.08, 0.06, { x: light.x, y: 2.75, z: light.z, rotY: yaw }, ENTRANCE_LIGHT)
    const canopy = at(0.8)
    parts.box('painted', door.width + 1.6, 0.12, 1.6, { x: canopy.x, y: 2.95, z: canopy.z, rotY: yaw }, tint('#3b4452'))
    const pool = at(2)
    glowPool(parts, pool.x, ground(pool.x, pool.z), pool.z, 4)
  }
}

function launchPad(parts: Parts, l: Layout): void {
  const { pad } = l
  const top = 0.8
  // Pad slabs around a flame trench that runs east from under the rocket.
  // The north slab leaves a hole for the tower elevator's pit (2.8 m square under the service tower).
  const hole = { x0: pad.x - 1.4, x1: pad.x + 1.4, z0: pad.z - TOWER_SET_BACK - 1.4, z1: pad.z - TOWER_SET_BACK + 1.4 }
  const north = { x0: pad.x - 15, x1: pad.x + 15, z0: pad.z - 15, z1: pad.z - TRENCH_HALF }
  for (const r of [
    { x0: north.x0, x1: hole.x0, z0: north.z0, z1: north.z1 },
    { x0: hole.x1, x1: north.x1, z0: north.z0, z1: north.z1 },
    { x0: hole.x0, x1: hole.x1, z0: north.z0, z1: hole.z0 },
    { x0: hole.x0, x1: hole.x1, z0: hole.z1, z1: north.z1 },
  ]) {
    parts.box('concrete', r.x1 - r.x0, top, r.z1 - r.z0, { x: (r.x0 + r.x1) / 2, y: top / 2, z: (r.z0 + r.z1) / 2 }, PAD_CONCRETE)
  }
  const south = 15 - TRENCH_HALF
  parts.box('concrete', 30, top, south, { x: pad.x, y: top / 2, z: pad.z + TRENCH_HALF + south / 2 }, PAD_CONCRETE)
  parts.box('concrete', 8, top, TRENCH_HALF * 2, { x: pad.x - 11, y: top / 2, z: pad.z }, PAD_CONCRETE)
  parts.box('concrete', 22, 0.1, TRENCH_HALF * 2, { x: pad.x + 4, y: 0.0, z: pad.z }, TRENCH)
  // Launch mount: four pillars and a steel deck round a square opening, under the first stage's
  // skirt, with the engines hanging into the opening and the fins standing out over the deck.
  const beam = 1.6
  const span = (MOUNT_OPENING + beam / 2) * 2
  const pillar = MOUNT_DECK - 0.6 - top
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.box('concrete', beam, pillar, beam, { x: pad.x + sx * (MOUNT_OPENING + beam / 2), y: top + pillar / 2, z: pad.z + sz * (MOUNT_OPENING + beam / 2) }, PAD_CONCRETE)
    }
    parts.box('steel', beam, 0.6, span + beam, { x: pad.x + sx * (MOUNT_OPENING + beam / 2), y: MOUNT_DECK - 0.3, z: pad.z }, STEEL_GREY)
    parts.box('steel', span + beam, 0.6, beam, { x: pad.x, y: MOUNT_DECK - 0.3, z: pad.z + sx * (MOUNT_OPENING + beam / 2) }, STEEL_GREY)
  }
  // Four hold-down arms between the fins, from the deck's edge to the first stage's skirt.
  const reach = MOUNT_OPENING - SATURN_V.radius + 0.1
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const along = SATURN_V.radius + reach / 2 - 0.05
    const w = dx === 0 ? 1.1 : reach
    const d = dx === 0 ? reach : 1.1
    parts.box('steel', w, 1.2, d, { x: pad.x + dx * along, y: MOUNT_DECK + 0.6, z: pad.z + dz * along }, STEEL_GREY)
  }
}

/**
 * Square lattice column: four legs, horizontal rings and X-braces. `keepClear`
 * says which face members to leave out (face: 'south' | 'north' | 'east' |
 * 'west', y of the member), so an arm can pass through.
 */
function lattice(
  parts: Parts,
  cx: number,
  cz: number,
  width: number,
  height: number,
  step: number,
  color: Tint,
  beam: number,
  keepClear: (face: string, y: number) => boolean = () => false,
): void {
  const half = width / 2
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.box('steel', beam, height, beam, { x: cx + sx * half, y: height / 2, z: cz + sz * half }, color)
    }
  }
  const diagonal = Math.hypot(width, step)
  const angle = Math.atan2(step, width)
  for (let y = step; y <= height + 0.01; y += step) {
    for (const s of [-1, 1]) {
      const zFace = s > 0 ? 'south' : 'north'
      const xFace = s > 0 ? 'east' : 'west'
      const mid = y - step / 2
      const flip = Math.round(y / step) % 2 === 0 ? 1 : -1
      if (!keepClear(zFace, y)) parts.box('steel', width, beam * 0.7, beam * 0.7, { x: cx, y, z: cz + s * half }, color)
      if (!keepClear(xFace, y)) parts.box('steel', beam * 0.7, beam * 0.7, width, { x: cx + s * half, y, z: cz }, color)
      if (!keepClear(zFace, mid)) {
        parts.box('steel', diagonal, beam * 0.5, beam * 0.5, { x: cx, y: mid, z: cz + s * half, rotZ: flip * angle }, color)
      }
      if (!keepClear(xFace, mid)) {
        parts.box('steel', beam * 0.5, beam * 0.5, diagonal, { x: cx + s * half, y: mid, z: cz, rotX: -flip * angle }, color)
      }
    }
  }
}

function towers(parts: Parts, l: Layout, aviation: [number, number, number][]): void {
  const { x, z } = l.pad
  // Service tower north of the rocket. The tower elevator rides up its middle
  // and the crew access arm (built as rooms from the map data) leaves its
  // south face at the capsule hatch height, so those members are left out.
  const towerZ = z - TOWER_SET_BACK
  const armClear = (face: string, y: number) => face === 'south' && y > ARM_FLOOR - 4.1 && y < ARM_FLOOR + 3.5
  lattice(parts, x, towerZ, 3.2, TOWER_HEIGHT, 4, TOWER_RED, 0.3, armClear)
  parts.box('steel', 3.6, 0.15, 3.6, { x, y: TOWER_HEIGHT + 0.1, z: towerZ }, TOWER_RED)
  parts.cylinder('steel', 0.1, 0.1, 8, { x, y: TOWER_HEIGHT + 4.2, z: towerZ }, STEEL_GREY, 6)
  aviation.push([x, TOWER_HEIGHT + 8.3, towerZ])
  // Swing arms to the stages, from the tower's face to the rocket's side (model heights and the radius there).
  for (const [y, radius] of [
    [18, SATURN_V.radius],
    [40, SATURN_V.radius + 0.5],
    [57, SATURN_V.radius + 0.5],
    [73, 3.6],
    [85, 3.4],
    [95, SATURN_V.serviceRadius],
  ] as const) {
    const length = TOWER_SET_BACK - 1.6 - radius - 0.3
    parts.box('steel', 0.7, 0.7, length, { x, y: ROCKET_BASE + y, z: towerZ + 1.6 + length / 2 }, STEEL_GREY)
  }
  // Work platforms every 8 m, each with a hole for the elevator car.
  for (let y = 8; y < TOWER_HEIGHT; y += 8) {
    if (Math.abs(y - ARM_FLOOR) < 3) continue
    const outer = 2.1
    const inner = 1.2
    parts.box('steel', outer * 2, 0.12, outer - inner, { x, y, z: towerZ - (outer + inner) / 2 }, STEEL_GREY)
    parts.box('steel', outer * 2, 0.12, outer - inner, { x, y, z: towerZ + (outer + inner) / 2 }, STEEL_GREY)
    parts.box('steel', outer - inner, 0.12, inner * 2, { x: x - (outer + inner) / 2, y, z: towerZ }, STEEL_GREY)
    parts.box('steel', outer - inner, 0.12, inner * 2, { x: x + (outer + inner) / 2, y, z: towerZ }, STEEL_GREY)
  }

  // Lightning protection towers around the pad.
  for (const [lx, lz] of [
    [x - 13, z - 12],
    [x + 13, z - 12],
    [x + 2, z + 13],
  ] as const) {
    lattice(parts, lx, lz, 1.2, 128, 4, STEEL_GREY, 0.16)
    parts.cylinder('steel', 0.08, 0.08, 6, { x: lx, y: 131, z: lz }, STEEL_GREY, 6)
    aviation.push([lx, 134.2, lz], [lx, 64, lz])
  }
}

function floodlights(parts: Parts, l: Layout): void {
  const { x, z } = l.pad
  const target = new Vector3(x, ROCKET_BASE + 45, z)
  for (const [fx, fz] of [
    [x - 18, z - 10],
    [x - 18, z + 10],
    [x + 18, z + 10],
    [x + 16, z - 16],
  ] as const) {
    const poleHeight = 20
    parts.cylinder('steel', 0.22, 0.3, poleHeight, { x: fx, y: poleHeight / 2, z: fz }, STEEL_GREY, 8)
    const head = new Vector3(fx, poleHeight + 0.6, fz)
    const toTarget = target.clone().sub(head)
    const yaw = Math.atan2(toTarget.x, toTarget.z)
    const pitch = Math.atan2(toTarget.y, Math.hypot(toTarget.x, toTarget.z))
    parts.box('painted', 2.4, 1.3, 0.5, { x: head.x, y: head.y, z: head.z, rotX: -pitch, rotY: yaw }, tint('#2a2e35'))
    const face = new Vector3(0, 0, 0.27).applyAxisAngle(new Vector3(1, 0, 0), -pitch).applyAxisAngle(new Vector3(0, 1, 0), yaw)
    parts.box('emissive', 2.2, 1.1, 0.02, { x: head.x + face.x, y: head.y + face.y, z: head.z + face.z, rotX: -pitch, rotY: yaw }, FLOOD)

    // A faint cone of light from the head toward the rocket.
    const length = toTarget.length()
    const cone = new ConeGeometry(13, length, 24, 1, true)
    cone.translate(0, -length / 2, 0)
    const direction = toTarget.clone().normalize()
    cone.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), direction))
    cone.translate(head.x, head.y, head.z)
    parts.add('lightCone', cone)
  }
}

function waterTower(parts: Parts, aviation: [number, number, number][]): void {
  const x = -40
  const z = -110
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.box('steel', 0.45, 26, 0.45, { x: x + sx * 3, y: 13, z: z + sz * 3 }, STEEL_GREY)
    }
  }
  for (let y = 6; y < 26; y += 6) {
    parts.box('steel', 6.4, 0.2, 0.2, { x, y, z: z - 3 }, STEEL_GREY)
    parts.box('steel', 6.4, 0.2, 0.2, { x, y, z: z + 3 }, STEEL_GREY)
    parts.box('steel', 0.2, 0.2, 6.4, { x: x - 3, y, z }, STEEL_GREY)
    parts.box('steel', 0.2, 0.2, 6.4, { x: x + 3, y, z }, STEEL_GREY)
  }
  parts.cylinder('painted', 5, 5, 6, { x, y: 29, z }, WHITE_PAINT, 24)
  parts.cylinder('painted', 0.4, 5.2, 2, { x, y: 33, z }, WHITE_PAINT, 24)
  aviation.push([x, 34.3, z])
}

function buildings(parts: Parts, aviation: [number, number, number][]): void {
  const list: [number, number, number, number, number][] = [
    [-70, -150, 40, 18, 9],
    [30, -170, 30, 20, 7],
    [110, -130, 26, 26, 12],
    [-150, -60, 24, 30, 8],
    [120, 75, 40, 16, 8],
    [-90, 95, 30, 20, 6],
    [200, -40, 20, 50, 10],
  ]
  list.forEach(([x, z, w, d, h], index) => {
    parts.box('concrete', w, h, d, { x, y: h / 2, z }, BUILDING)
    // Lit windows on all four sides.
    for (let floor = 0; floor * 3.2 + 1.6 < h - 1; floor++) {
      const y = 1.8 + floor * 3.2
      for (const [faceW, axis] of [
        [w, 'x'],
        [d, 'z'],
      ] as const) {
        for (let t = -faceW / 2 + 1.5; t < faceW / 2 - 1; t += 2.4) {
          for (const side of [-1, 1]) {
            const lit = hash2(Math.round(t * 10), floor * 7 + side, index * 13 + (axis === 'x' ? 1 : 2))
            if (lit < 0.45) continue
            const color = lit > 0.85 ? WINDOW_COOL : WINDOW_WARM
            if (axis === 'x') parts.box('emissive', 1.2, 1, 0.05, { x: x + t, y, z: z + side * (d / 2 + 0.03) }, color)
            else parts.box('emissive', 0.05, 1, 1.2, { x: x + side * (w / 2 + 0.03), y, z: z + t }, color)
          }
        }
      }
    }
    if (h >= 9) aviation.push([x, h + 0.4, z])
  })
}

/** Builds the outdoor world for a map that has one. */
export function buildExterior(map: GameMap, parts: Parts): void {
  const pad = padOf(map)
  if (!pad) return
  const l = layout(map, pad)
  const aviation: [number, number, number][] = []

  const ground = groundHeight(map)
  terrain(parts, l)
  roads(parts, l)
  fences(parts, map, ground)
  outbuildings(parts, map, ground)
  paths(parts, map, ground)
  lamps(parts, map, ground)
  entrances(parts, map, ground)
  launchPad(parts, l)
  towers(parts, l, aviation)
  floodlights(parts, l)
  waterTower(parts, aviation)
  buildings(parts, aviation)

  for (const [x, y, z] of aviation) parts.sphere('aviation', 0.35, { x, y, z }, undefined, 8)
}

/**
 * The launch complex for the launch cinematic, built on its own: the
 * ground, roads, the pad, towers, floodlights, the launch center's
 * building as a lit block, the support buildings and the far buildings.
 * No rocket (the cinematic flies its own), no interiors, fences, paths or
 * lamps. The crew access arm is swung back against the tower, as on real
 * pads before liftoff. TODO: source.
 */
export function buildLaunchStage(map: GameMap, parts: Parts): void {
  const pad = padOf(map)
  if (!pad) return
  const l = layout(map, pad)
  const aviation: [number, number, number][] = []
  const ground = groundHeight(map)
  terrain(parts, l)
  roads(parts, l)
  outbuildings(parts, map, ground)
  launchPad(parts, l)
  towers(parts, l, aviation)
  floodlights(parts, l)
  waterTower(parts, aviation)
  buildings(parts, aviation)
  // The launch center itself, seen from outside: a block with lit windows.
  const ground0 = map.rooms.filter((room) => (room.level ?? 'ground') === 'ground')
  const x0 = Math.min(...ground0.map((r) => r.rect.x0))
  const x1 = Math.max(...ground0.map((r) => r.rect.x1))
  const z0 = Math.min(...ground0.map((r) => r.rect.z0))
  const z1 = Math.max(...ground0.map((r) => r.rect.z1))
  const height = 7.5
  parts.box('concrete', x1 - x0, height, z1 - z0, { x: (x0 + x1) / 2, y: height / 2, z: (z0 + z1) / 2 }, BUILDING)
  for (let t = x0 + 1.5; t < x1 - 1; t += 2.6) {
    for (const y of [2, 5.2]) {
      if (hash2(Math.round(t * 10), Math.round(y), 61) < 0.35) continue
      parts.box('emissive', 1.4, 1, 0.05, { x: t, y, z: z1 + 0.03 }, WINDOW_WARM)
    }
  }
  // The crew access arm, swung back flat against the tower's west side.
  const towerZ = pad.z - TOWER_SET_BACK
  const armLength = TOWER_SET_BACK - 3
  parts.box('steel', armLength, 3, 2, { x: pad.x - 1.6 - armLength / 2, y: ARM_FLOOR + 1.5, z: towerZ + 1.6 }, STEEL_GREY)
  parts.box('painted', 2.2, 2.6, 2.2, { x: pad.x - 1.6 - armLength + 0.4, y: ARM_FLOOR + 1.4, z: towerZ + 1.6 }, WHITE_PAINT)
  for (const [x, y, z] of aviation) parts.sphere('aviation', 0.35, { x, y, z }, undefined, 8)
}
