/**
 * Builders for every prop kind and for console bodies. Each builds in a
 * local frame (+z is the front, y = 0 the base) from the shared materials,
 * so all props land in the same merged meshes.
 */
import { SphereGeometry } from 'three'
import { levelOf, levelY } from '../../maps/collision'
import type { Console, GameMap, Prop } from '../../maps/types'
import { tint } from '../materials/surfaces'
import { Frame, Parts, type Tint } from './parts'
import type { MapExtras } from './specs'
import { cargoBag, dashboard, foldTable, galley, handhold, laptop, rack, seat, sleepingBag, waterTank } from './spacecraftProps'
import { antenna, curtainBunk, excavator, growShelf, solarPanel, suitRack } from './outpostProps'
import { groundHeight } from './exterior'

const SLATE = tint('#4f6075')
const DARK = tint('#1b1f26')
const BRUSHED_DARK = tint('#5a6068')
const MATTRESS = tint('#7d8fa6')
const PILLOW = tint('#eef0f2')
const SEAT = tint('#33435c')
const TABLE_TOP = tint('#d4d8dd')
const WOOD = tint('#8a6a45')
const WOOD_DARK = tint('#6b5136')
const STRAP = tint('#2c3138')
const LAMP: Tint = [3, 2.4, 1.6]
const SIGN_PLATE = tint('#1d2430')
const HELMET_WHITE = tint('#eef0f2')
const VISOR = tint('#b8902e')
const HATCH_FRAME = tint('#d9dce1')
const HATCH_LIGHT: Tint = [2.6, 2.6, 2.4]
const EXIT_GREEN: Tint = [0.2, 2.2, 0.6]
const BLAST_GREY = tint('#6f747b')
const BUTTONS: Tint[] = [
  [0.3, 2, 0.7],
  [2.4, 1.4, 0.2],
  [0.4, 1.4, 2.6],
  [0.3, 2, 0.7],
  [2.4, 0.4, 0.3],
]

function paintOf(prop: Prop, fallback: Tint = SLATE): Tint {
  return prop.paint ? tint(prop.paint) : fallback
}

function bunk(f: Frame, prop: Prop): void {
  const { w, d } = prop.size
  const frame = paintOf(prop)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.box('painted', 0.05, 1.9, 0.05, { x: sx * (w / 2 - 0.03), y: 0.95, z: sz * (d / 2 - 0.03) }, frame)
    }
  }
  for (const y of [0.32, 1.32]) {
    f.box('painted', w, 0.06, d, { y }, frame)
    f.box('fabric', w - 0.06, 0.14, d - 0.06, { y: y + 0.1 }, MATTRESS)
    f.box('fabric', 0.34, 0.1, d - 0.2, { x: -(w / 2 - 0.25), y: y + 0.22 }, PILLOW)
  }
  f.box('brushed', w - 0.1, 0.04, 0.03, { y: 1.62, z: d / 2 - 0.02 })
}

function locker(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  f.box('painted', w, h, d, { y: h / 2 }, paintOf(prop))
  // Vents near the top and bottom of the door, and a handle.
  for (let i = 0; i < 4; i++) {
    f.box('rubber', w - 0.18, 0.015, 0.01, { y: h - 0.22 - i * 0.04, z: d / 2 + 0.004 })
    f.box('rubber', w - 0.18, 0.015, 0.01, { y: 0.2 + i * 0.04, z: d / 2 + 0.004 })
  }
  f.box('brushed', 0.02, 0.14, 0.03, { x: w / 2 - 0.08, y: h / 2, z: d / 2 + 0.012 })
  f.box('rubber', 0.006, h - 0.06, 0.006, { y: h / 2, z: d / 2 + 0.002 }, DARK)
}

function desk(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  f.box('painted', w, 0.04, d, { y: h - 0.02 }, TABLE_TOP)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.box('brushed', 0.04, h - 0.04, 0.04, { x: sx * (w / 2 - 0.05), y: (h - 0.04) / 2, z: sz * (d / 2 - 0.05) })
    }
  }
  // Desk lamp in the back corner.
  const lx = w / 2 - 0.16
  const lz = -d / 2 + 0.12
  f.cylinder('brushed', 0.07, 0.02, { x: lx, y: h + 0.01, z: lz }, BRUSHED_DARK)
  f.box('brushed', 0.02, 0.34, 0.02, { x: lx, y: h + 0.18, z: lz })
  f.box('brushed', 0.02, 0.02, 0.2, { x: lx, y: h + 0.35, z: lz + 0.09 })
  f.box('painted', 0.12, 0.06, 0.1, { x: lx, y: h + 0.33, z: lz + 0.2 }, DARK)
  f.box('emissive', 0.1, 0.01, 0.08, { x: lx, y: h + 0.3, z: lz + 0.2 }, LAMP)
  // A rubber desk mat.
  f.box('rubber', w * 0.55, 0.006, d * 0.6, { x: -0.1, y: h + 0.003 })
}

function picture(f: Frame, prop: Prop): void {
  const { w, h } = prop.size
  f.box('brushed', w, h, 0.03, { y: h / 2, z: 0.015 }, DARK)
  f.decal('earth', w - 0.08, h - 0.08, { y: h / 2, z: 0.032 })
}

function table(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  f.box('painted', w, 0.05, d, { y: h - 0.025 }, TABLE_TOP)
  f.box('rubber', w - 0.1, 0.004, d - 0.1, { y: h + 0.002 })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.box('brushed', 0.08, h - 0.05, 0.08, { x: sx * (w / 2 - 0.15), y: (h - 0.05) / 2, z: sz * (d / 2 - 0.2) })
    }
  }
  f.box('brushed', 0.06, 0.06, d - 0.5, { x: 0, y: 0.2 })
}

function chair(f: Frame): void {
  f.box('fabric', 0.46, 0.07, 0.44, { y: 0.46 }, SEAT)
  f.box('fabric', 0.46, 0.42, 0.06, { y: 0.74, z: -0.2 }, SEAT)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.box('brushed', 0.03, 0.43, 0.03, { x: sx * 0.2, y: 0.215, z: sz * 0.18 })
    }
    f.box('brushed', 0.025, 0.5, 0.025, { x: sx * 0.2, y: 0.72, z: -0.235 })
  }
}

function wallScreen(f: Frame, prop: Prop, extras: MapExtras): void {
  const { w, h } = prop.size
  f.box('painted', w, h, 0.06, { y: h / 2, z: 0.03 }, DARK)
  // The spacecraft's CO2 scrubber readout is drawn in the decal atlas.
  if (prop.label === 'co2') f.decal('co2-panel', w - 0.06, (w - 0.06) * 0.75, { y: h / 2, z: 0.062 }, [1.5, 1.5, 1.5])
  if (prop.label === 'mission-briefing') {
    extras.screens.push({
      id: prop.id,
      kind: 'mission-briefing',
      position: f.point(0, h / 2, 0.062),
      rotationY: f.yaw,
      width: w - 0.1,
      height: h - 0.1,
    })
  }
}

function crate(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  const onPallet = prop.pallet ?? (prop.elevation ?? 0) === 0
  const base = onPallet ? 0.14 : 0
  if (onPallet) {
    f.box('painted', w, 0.03, d, { y: 0.125 }, WOOD)
    for (const sx of [-1, 0, 1]) {
      f.box('painted', 0.1, 0.11, d, { x: sx * (w / 2 - 0.05), y: 0.055 }, WOOD_DARK)
    }
  }
  f.box('painted', w - 0.04, h, d - 0.04, { y: base + h / 2 }, paintOf(prop))
  // Edge frame.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.box('brushed', 0.05, h, 0.05, { x: sx * (w / 2 - 0.025), y: base + h / 2, z: sz * (d / 2 - 0.025) })
    }
    for (const y of [base + 0.025, base + h - 0.025]) {
      f.box('brushed', 0.05, 0.05, d, { x: sx * (w / 2 - 0.025), y })
      f.box('brushed', w, 0.05, 0.05, { y, z: sx * (d / 2 - 0.025) })
    }
  }
  // Two cargo straps over the top.
  for (const sx of [-1, 1]) {
    f.box('rubber', 0.05, h + 0.012, d - 0.028, { x: sx * (w / 4), y: base + h / 2 }, STRAP)
  }
  if (prop.label) {
    const labelW = Math.min(w - 0.2, 1.1)
    const labelH = labelW / 4.57
    f.decal(`crate:${prop.label}`, labelW, labelH, { y: base + h * 0.6, z: d / 2 - 0.018 })
    const sideW = Math.min(d - 0.2, 1.1)
    f.decal(`crate:${prop.label}`, sideW, sideW / 4.57, {
      x: w / 2 - 0.018,
      y: base + h * 0.6,
      rotY: Math.PI / 2,
    })
  }
}

function gantry(f: Frame, prop: Prop): void {
  const { w, d } = prop.size
  const paint = paintOf(prop)
  for (const sz of [-1, 1]) {
    const z = sz * (d / 2)
    f.box('painted', w, 0.02, 0.2, { y: 0.14, z }, paint)
    f.box('painted', w, 0.26, 0.025, { y: 0, z }, paint)
    f.box('painted', w, 0.02, 0.2, { y: -0.14, z }, paint)
  }
  // Trolley, chain and hook.
  const tx = w * 0.18
  f.box('painted', 0.5, 0.22, d + 0.3, { x: tx, y: -0.28 }, DARK)
  f.box('brushed', 0.03, 1.3, 0.03, { x: tx, y: -1.05 })
  f.box('brushed', 0.12, 0.16, 0.05, { x: tx, y: -1.75 }, BRUSHED_DARK)
}

function floorMarking(f: Frame, prop: Prop): void {
  if (!prop.label) return
  f.decal(`floor:${prop.label}`, prop.size.w, prop.size.d, { y: 0.004, rotX: -Math.PI / 2 })
}

function clock(f: Frame, prop: Prop, extras: MapExtras): void {
  const { w, h } = prop.size
  f.box('painted', w, h, 0.06, { y: h / 2, z: 0.03 }, DARK)
  extras.texts.push({
    id: prop.id,
    text: 'T-MINUS 06:00:00',
    position: f.point(0, h / 2, 0.064),
    rotationY: f.yaw,
    fontSize: 0.1,
    color: '#ff7a5c',
    font: 'mono',
    glow: true,
  })
}

function bench(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  f.box('fabric', w, 0.08, d, { y: h - 0.04 }, SEAT)
  for (const sx of [-1, 1]) {
    f.box('brushed', 0.05, h - 0.08, d - 0.06, { x: sx * (w / 2 - 0.08), y: (h - 0.08) / 2 })
  }
}

/** Hooks on a rail, with spare helmets hanging from them. */
function helmetRack(f: Frame, prop: Prop): void {
  const { w } = prop.size
  f.box('brushed', w, 0.05, 0.04, { y: 0.35, z: 0.02 })
  const count = w > 0.8 ? 3 : 2
  for (let i = 0; i < count; i++) {
    // A white helmet with a gold visor bulging from its front.
    const x = (i - (count - 1) / 2) * (w / count)
    f.box('brushed', 0.02, 0.02, 0.14, { x, y: 0.33, z: 0.09 })
    f.parts.add('painted', placeSphere(f, 0.13, x, 0.15, 0.2), HELMET_WHITE)
    f.parts.add('painted', placeSphere(f, 0.1, x, 0.16, 0.26), VISOR)
  }
}

function placeSphere(f: Frame, radius: number, x: number, y: number, z: number): SphereGeometry {
  const geometry = new SphereGeometry(radius, 14, 10)
  const [wx, wy, wz] = f.point(x, y, z)
  geometry.translate(wx, wy, wz)
  return geometry
}

/** The capsule hatch: a dark rounded-square opening with a lit frame. */
function hatch(f: Frame, prop: Prop): void {
  const { w, h } = prop.size
  f.box('painted', w + 0.24, h + 0.24, 0.06, { y: h / 2, z: 0.03 }, HATCH_FRAME)
  f.box('rubber', w, h, 0.02, { y: h / 2, z: 0.065 }, DARK)
  for (const sx of [-1, 1]) {
    f.box('emissive', 0.03, h + 0.1, 0.02, { x: sx * (w / 2 + 0.06), y: h / 2, z: 0.07 }, HATCH_LIGHT)
  }
  for (const y of [-0.05, h + 0.05]) {
    f.box('emissive', w + 0.15, 0.03, 0.02, { y, z: 0.07 }, HATCH_LIGHT)
  }
  // A small porthole and a handle on the hatch itself.
  f.box('emissive', 0.22, 0.22, 0.01, { y: h * 0.7, z: 0.078 }, [0.25, 0.45, 0.7])
  f.box('brushed', 0.3, 0.05, 0.05, { y: h * 0.42, z: 0.1 })
}

/** A plate with white text. */
function sign(f: Frame, prop: Prop, extras: MapExtras): void {
  const { w, h } = prop.size
  f.box('painted', w, h, 0.02, { y: h / 2, z: 0.01 }, prop.paint ? tint(prop.paint) : SIGN_PLATE)
  extras.texts.push({
    id: prop.id,
    text: prop.label ?? '',
    position: f.point(0, h / 2, 0.023),
    rotationY: f.yaw,
    fontSize: h * 0.5,
    color: '#f4f6fb',
    font: 'ui',
  })
}

/** Big painted letters straight on the wall, with an optional painted arrow. */
function wallText(f: Frame, prop: Prop, extras: MapExtras): void {
  const { w, h } = prop.size
  const color = prop.paint ?? '#e8eaee'
  const arrowSpace = prop.arrow ? h * 1.6 : 0
  const textShift = prop.arrow === 'right' ? -arrowSpace / 2 : prop.arrow === 'left' ? arrowSpace / 2 : 0
  extras.texts.push({
    id: prop.id,
    text: prop.label ?? '',
    position: f.point(textShift, h / 2, 0.012),
    rotationY: f.yaw,
    fontSize: h,
    color,
    font: 'ui',
  })
  if (!prop.arrow) return
  const dir = prop.arrow === 'right' ? 1 : -1
  const ax = dir * (w / 2 - h * 0.3)
  const paint = tint(color)
  f.box('painted', h * 1.1, h * 0.22, 0.01, { x: ax - dir * h * 0.35, y: h / 2, z: 0.006 }, paint)
  f.box('painted', h * 0.6, h * 0.22, 0.01, { x: ax, y: h / 2 + h * 0.2, z: 0.006, rotZ: -dir * 0.75 }, paint)
  f.box('painted', h * 0.6, h * 0.22, 0.01, { x: ax, y: h / 2 - h * 0.2, z: 0.006, rotZ: dir * 0.75 }, paint)
}

/** A small glowing green EXIT sign. */
function exitSign(f: Frame, prop: Prop, extras: MapExtras): void {
  const { w, h, d } = prop.size
  f.box('emissive', w, h, d, { y: h / 2, z: d / 2 }, EXIT_GREEN)
  extras.texts.push({
    id: prop.id,
    text: prop.label ?? 'EXIT',
    position: f.point(0, h / 2, d + 0.004),
    rotationY: f.yaw,
    fontSize: h * 0.62,
    color: '#ffffff',
    font: 'ui',
    glow: true,
  })
}

/**
 * A heavy blast door frame across the tunnel, its door held open against
 * the wall. Local x is along the tunnel, z across it (size.d is the tunnel width).
 */
function blastDoor(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  const jamb = 0.32
  for (const sz of [-1, 1]) {
    f.box('steel', w, h, jamb, { y: h / 2, z: sz * (d / 2 - jamb / 2) }, BLAST_GREY)
    f.decal('hazard', h - 0.2, 0.28, { x: -w / 2 - 0.002, y: h / 2, z: sz * (d / 2 - jamb / 2), rotZ: Math.PI / 2, rotY: -Math.PI / 2 })
    f.decal('hazard', h - 0.2, 0.28, { x: w / 2 + 0.002, y: h / 2, z: sz * (d / 2 - jamb / 2), rotZ: Math.PI / 2, rotY: Math.PI / 2 })
  }
  f.box('steel', w, 0.45, d, { y: h - 0.225 }, BLAST_GREY)
  f.decal('hazard', d - 0.1, 0.3, { x: -w / 2 - 0.002, y: h - 0.225, rotY: -Math.PI / 2 })
  f.decal('hazard', d - 0.1, 0.3, { x: w / 2 + 0.002, y: h - 0.225, rotY: Math.PI / 2 })
  // The door leaf, swung open flat against the north wall, east of the frame.
  f.box('steel', 1.7, h - 0.6, 0.14, { x: w / 2 + 0.9, y: (h - 0.6) / 2 + 0.05, z: -(d / 2 - 0.08) }, BLAST_GREY)
  f.box('brushed', 0.12, 0.6, 0.06, { x: w / 2 + 1.5, y: 1.1, z: -(d / 2 - 0.18) })
  // Threshold plate.
  f.box('brushed', w + 0.1, 0.03, d - jamb * 2, { y: 0.015 })
}

/** A red fire hose cabinet. */
function hoseCabinet(f: Frame, prop: Prop): void {
  const { w, h, d } = prop.size
  f.box('painted', w, h, d, { y: h / 2, z: d / 2 }, tint('#b8251c'))
  f.box('glass', w - 0.1, h - 0.2, 0.01, { y: h / 2 + 0.05, z: d + 0.006 })
  f.box('rubber', w - 0.18, 0.3, 0.06, { y: h / 2 + 0.05, z: d - 0.05 }, tint('#c9a227'))
  f.decal('extinguisher', 0.12, 0.18, { x: w / 2 - 0.1, y: 0.13, z: d + 0.004 })
}

/** Adds one prop to the merged parts (and any text or screens it needs). */
export function buildProp(map: GameMap, prop: Prop, parts: Parts, extras: MapExtras): void {
  const base = prop.ground ? groundHeight(map)(prop.position.x, prop.position.z) : levelY(map, levelOf(prop))
  const f = new Frame(parts, prop.position.x, prop.position.z, prop.yaw ?? 0, base + (prop.elevation ?? 0))
  switch (prop.kind) {
    case 'bunk':
      return bunk(f, prop)
    case 'locker':
      return locker(f, prop)
    case 'desk':
      return desk(f, prop)
    case 'picture':
      return picture(f, prop)
    case 'table':
      return table(f, prop)
    case 'chair':
      return chair(f)
    case 'wall-screen':
      return wallScreen(f, prop, extras)
    case 'crate':
      return crate(f, prop)
    case 'gantry':
      return gantry(f, prop)
    case 'floor-marking':
      return floorMarking(f, prop)
    case 'clock':
      return clock(f, prop, extras)
    case 'bench':
      return bench(f, prop)
    case 'helmet-rack':
      return helmetRack(f, prop)
    case 'hatch':
      return hatch(f, prop)
    case 'sign':
      return sign(f, prop, extras)
    case 'wall-text':
      return wallText(f, prop, extras)
    case 'exit-sign':
      return exitSign(f, prop, extras)
    case 'blast-door':
      return blastDoor(f, prop)
    case 'hose-cabinet':
      return hoseCabinet(f, prop)
    case 'seat':
      return seat(f, prop)
    case 'dashboard':
      return dashboard(f, prop)
    case 'rack':
      return rack(f, prop)
    case 'cargo-bag':
      return cargoBag(f, prop)
    case 'sleeping-bag':
      return sleepingBag(f, prop)
    case 'water-tank':
      return waterTank(f, prop)
    case 'galley':
      return galley(f, prop)
    case 'fold-table':
      return foldTable(f, prop)
    case 'laptop':
      return laptop(f, prop)
    case 'handhold':
      return handhold(f, prop)
    case 'lander':
      // A model, drawn on its own (src/scene/LunarModuleView.tsx); the prop gives it its place, collision and baked shadow.
      return
    case 'grow-shelf':
      return growShelf(f, prop)
    case 'curtain-bunk':
      return curtainBunk(f, prop)
    case 'suit-rack':
      return suitRack(f, prop)
    case 'solar-panel':
      return solarPanel(f, prop)
    case 'antenna':
      return antenna(f, prop)
    case 'excavator':
      return excavator(f, prop)
    case 'tribute':
    case 'developer':
      // Drawn on their own (src/scene/DeveloperTribute.tsx); the props give the tribute its place, collision and baked shadows.
      return
  }
}

/**
 * The static body of a console: cabinet, sloped desk, screen housing and a
 * row of lit buttons. The screen itself is a separate mesh (ConsoleView).
 */
export function buildConsoleBody(map: GameMap, item: Console, parts: Parts): void {
  const yaw = Math.atan2(item.facing.x, item.facing.z)
  const f = new Frame(parts, item.position.x, item.position.z, yaw, levelY(map, levelOf(item)))
  f.box('painted', 1.2, 0.72, 0.5, { y: 0.36, z: -0.05 }, tint('#3b4452'))
  f.box('rubber', 1.2, 0.04, 0.42, { y: 0.78, z: 0.04, rotX: 0.22 })
  f.box('brushed', 1.04, 0.66, 0.06, { y: 1.23, z: -0.2, rotX: -0.3 }, tint('#3a3f47'))
  f.box('brushed', 0.08, 0.5, 0.08, { y: 0.98, z: -0.24 }, BRUSHED_DARK)
  BUTTONS.forEach((color, i) => {
    f.box('emissive', 0.06, 0.015, 0.04, { x: -0.36 + i * 0.18, y: 0.82, z: 0.14, rotX: 0.22 }, color)
  })
}
