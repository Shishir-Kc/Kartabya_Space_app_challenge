/**
 * Builders for the spacecraft's props: crew seats, the cockpit dashboard,
 * equipment racks, soft stowage bags, sleeping bags, water tanks, the galley,
 * a fold-down table, laptops and handholds. Like the launch center's props,
 * each is built in a local frame (+z is the front, y = 0 the base) from the
 * shared materials, so they merge into the same few meshes.
 */
import { tint } from '../materials/surfaces'
import type { Prop } from '../../maps/types'
import type { Frame, Tint } from './parts'

const SEAT_FRAME = tint('#5d636c')
const SEAT_PAD = tint('#3d4a5e')
const HARNESS = tint('#d9692a')
const BUCKLE = tint('#c7ccd3')
const DASH = tint('#2a3038')
const DASH_TRIM = tint('#c9cdd3')
const SCREEN_BLUE: Tint = [0.08, 0.2, 0.42]
const SCREEN_GREEN: Tint = [0.06, 0.32, 0.18]
const RACK_FRAME = tint('#dfe1e4')
const RACK_MODULE = tint('#c4c8ce')
const RACK_DARK = tint('#2b3038')
const BAG_WHITE = tint('#e6e1d3')
const BAG_STRAP = tint('#4a4f57')
const WEBBING = tint('#9a917b')
const SLEEP_BAG = tint('#3f6f8f')
const SLEEP_BAG_ALT = tint('#6d7f4a')
const TANK_BLUE = tint('#d8e4ef')
const TANK_CAP = tint('#2c6db3')
const HANDRAIL = tint('#7aa7c7')
const TABLE = tint('#d5d8dc')
const LAPTOP = tint('#2d3138')

const LED_GREEN: Tint = [0.3, 2, 0.7]
const LED_AMBER: Tint = [2.4, 1.4, 0.2]
const LED_BLUE: Tint = [0.4, 1.2, 2.6]
const LED_RED: Tint = [2.2, 0.35, 0.3]

function paint(prop: Prop, fallback: Tint): Tint {
  return prop.paint ? tint(prop.paint) : fallback
}

/**
 * A crew seat, facing its front (+z): a reclined seat pan and backrest on a
 * metal frame, a headrest, and an orange five-point harness.
 */
export function seat(f: Frame, prop: Prop): void {
  const { w, d } = prop.size
  // Frame: two side rails and a cross brace.
  for (const sx of [-1, 1]) {
    f.box('painted', 0.05, 0.08, d, { x: sx * (w / 2 - 0.04), y: 0.3, z: 0 }, SEAT_FRAME)
    f.box('painted', 0.05, 0.42, 0.05, { x: sx * (w / 2 - 0.04), y: 0.15, z: d / 2 - 0.08 }, SEAT_FRAME)
    f.box('painted', 0.05, 0.42, 0.05, { x: sx * (w / 2 - 0.04), y: 0.15, z: -d / 2 + 0.08 }, SEAT_FRAME)
  }
  // Seat pan, tipped back a little.
  f.box('fabric', w - 0.06, 0.1, d * 0.62, { y: 0.42, z: d * 0.12, rotX: -0.12 }, SEAT_PAD)
  // Backrest, reclined, and the headrest.
  const backY = 0.86
  const backZ = -d / 2 + 0.12
  f.box('fabric', w - 0.06, 0.9, 0.1, { y: backY, z: backZ, rotX: -0.35 }, SEAT_PAD)
  f.box('painted', w - 0.02, 0.92, 0.04, { y: backY, z: backZ - 0.07, rotX: -0.35 }, SEAT_FRAME)
  f.box('fabric', w * 0.55, 0.22, 0.12, { y: 1.38, z: backZ - 0.2, rotX: -0.35 }, SEAT_PAD)
  // Harness: two shoulder straps, a lap belt and a round buckle.
  for (const sx of [-1, 1]) {
    f.box('rubber', 0.05, 0.62, 0.012, { x: sx * 0.12, y: 0.94, z: backZ + 0.07, rotX: -0.35, rotZ: sx * 0.08 }, HARNESS)
  }
  f.box('rubber', w - 0.12, 0.05, 0.012, { y: 0.5, z: 0.06, rotX: -0.12 }, HARNESS)
  f.cylinder('brushed', 0.045, 0.02, { y: 0.56, z: 0.07, rotX: Math.PI / 2 - 0.12 }, BUCKLE, 14)
  // Armrests.
  for (const sx of [-1, 1]) {
    f.box('painted', 0.06, 0.05, d * 0.5, { x: sx * (w / 2 - 0.02), y: 0.66, z: 0.02 }, SEAT_FRAME)
  }
}

/**
 * The cockpit's curved dashboard: a desk with a bank of screens bent round
 * in three panels, button rows and a grab bar along the top.
 */
export function dashboard(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  const third = w / 3
  // Desk and cabinet.
  f.box('painted', w, 0.7, d * 0.7, { y: 0.35, z: -d * 0.15 }, DASH)
  f.box('rubber', w, 0.04, d, { y: 0.72, z: 0 })
  // Screen bank: a centre panel and two side panels angled toward the seats.
  for (const i of [-1, 0, 1]) {
    const angle = -i * 0.32
    const x = i * third * 0.97
    const z = -d / 2 + 0.06 + Math.abs(i) * 0.12
    f.box('painted', third, h - 0.78, 0.06, { x, y: 0.78 + (h - 0.78) / 2, z, rotY: angle, rotX: -0.2 }, DASH)
    // Two screens per panel.
    for (const s of [-1, 1]) {
      const sx = x + Math.cos(angle) * s * third * 0.24
      const sz = z + 0.035 - Math.sin(angle) * s * third * 0.24
      f.box('emissive', third * 0.42, (h - 0.78) * 0.55, 0.01, { x: sx, y: 0.78 + (h - 0.78) * 0.55, z: sz, rotY: angle, rotX: -0.2 }, s > 0 ? SCREEN_BLUE : SCREEN_GREEN)
    }
    // Button row under the screens.
    for (let b = 0; b < 5; b++) {
      const bx = x + Math.cos(angle) * (b - 2) * 0.12
      const bz = z + 0.08 - Math.sin(angle) * (b - 2) * 0.12
      const colors = [LED_GREEN, LED_AMBER, LED_BLUE, LED_GREEN, LED_RED]
      f.box('emissive', 0.05, 0.015, 0.035, { x: bx, y: 0.76, z: bz + 0.12, rotY: angle }, colors[b] ?? LED_GREEN)
    }
  }
  // Grab bar along the top edge.
  f.box('brushed', w * 0.9, 0.04, 0.04, { y: h + 0.03, z: -d / 2 + 0.16 }, DASH_TRIM)
}

/**
 * An equipment rack: an off-white frame with modules in it. The label picks
 * the contents: 'fans', 'filters', 'tanks' or 'avionics'. Small status
 * lights on every rack.
 */
export function rack(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  const front = d / 2
  // Frame and back panel.
  f.box('painted', w, h, 0.04, { y: h / 2, z: -d / 2 + 0.02 }, RACK_FRAME)
  for (const sx of [-1, 1]) f.box('painted', 0.05, h, d, { x: sx * (w / 2 - 0.025), y: h / 2 }, RACK_FRAME)
  f.box('painted', w, 0.05, d, { y: h - 0.025 }, RACK_FRAME)
  f.box('painted', w, 0.05, d, { y: 0.025 }, RACK_FRAME)

  const inner = w - 0.12
  const kind = prop.label ?? 'avionics'
  if (kind === 'fans') {
    const rows = Math.max(1, Math.floor((h - 0.3) / 0.42))
    for (let r = 0; r < rows; r++) {
      const y = 0.3 + r * 0.42
      f.box('painted', inner, 0.38, d - 0.08, { y, z: 0 }, RACK_MODULE)
      for (const sx of [-0.25, 0.25]) {
        f.cylinder('rubber', 0.13, 0.03, { x: sx * inner, y, z: front - 0.02, rotX: Math.PI / 2 }, RACK_DARK, 16)
        f.cylinder('brushed', 0.03, 0.035, { x: sx * inner, y, z: front - 0.005, rotX: Math.PI / 2 }, undefined, 8)
      }
    }
  } else if (kind === 'filters') {
    const count = Math.max(2, Math.floor(inner / 0.2))
    for (let i = 0; i < count; i++) {
      const x = -inner / 2 + (i + 0.5) * (inner / count)
      f.cylinder('painted', 0.075, h * 0.55, { x, y: h * 0.42, z: 0.02 }, i % 2 ? RACK_MODULE : RACK_FRAME, 12)
      f.cylinder('painted', 0.08, 0.04, { x, y: h * 0.7 + 0.02, z: 0.02 }, TANK_CAP, 12)
    }
    f.box('painted', inner, 0.22, d - 0.06, { y: h - 0.2 }, RACK_MODULE)
  } else if (kind === 'batteries') {
    // Battery modules, each with a charge bar.
    const rows = Math.max(2, Math.floor((h - 0.3) / 0.32))
    for (let r = 0; r < rows; r++) {
      const y = 0.25 + r * 0.32
      for (const sx of [-0.25, 0.25]) {
        f.box('painted', inner * 0.46, 0.27, d - 0.06, { x: sx * inner, y }, r % 2 ? RACK_DARK : tint('#3d4652'))
        f.box('emissive', inner * 0.3, 0.025, 0.01, { x: sx * inner, y: y + 0.06, z: front - 0.025 }, r === rows - 1 ? LED_AMBER : LED_GREEN)
        f.box('brushed', 0.04, 0.04, 0.03, { x: sx * inner - inner * 0.17, y: y - 0.06, z: front - 0.02 })
      }
    }
  } else if (kind === 'tanks') {
    const count = Math.max(1, Math.floor(inner / 0.34))
    for (let i = 0; i < count; i++) {
      const x = -inner / 2 + (i + 0.5) * (inner / count)
      f.cylinder('painted', 0.14, h * 0.72, { x, y: h * 0.42, z: 0 }, RACK_FRAME, 16)
      f.cylinder('brushed', 0.05, 0.08, { x, y: h * 0.82, z: 0 }, undefined, 10)
      f.box('painted', 0.02, h * 0.6, 0.02, { x: x + 0.15, y: h * 0.42, z: 0.1 }, TANK_CAP)
    }
  } else {
    // Avionics: drawers with handles and a control panel.
    const drawers = Math.max(2, Math.floor((h - 0.6) / 0.3))
    for (let i = 0; i < drawers; i++) {
      const y = 0.22 + i * 0.3
      f.box('painted', inner, 0.26, d - 0.06, { y, z: -0.01 }, i % 2 ? RACK_MODULE : RACK_FRAME)
      f.box('brushed', inner * 0.4, 0.025, 0.03, { y: y + 0.06, z: front - 0.02 })
    }
    f.decal('rack-panel', Math.min(inner, 0.5), Math.min(inner, 0.5) * 0.75, { y: h - 0.32, z: front - 0.03 })
  }

  // Status lights down one side.
  const lights = [LED_GREEN, LED_GREEN, LED_AMBER, LED_BLUE]
  lights.forEach((color, i) => {
    f.box('emissive', 0.025, 0.025, 0.01, { x: w / 2 - 0.09, y: h - 0.12 - i * 0.07, z: front }, color)
  })
}

/** A soft white stowage bag strapped to the wall, with a label. */
export function cargoBag(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  const color = paint(prop, BAG_WHITE)
  f.box('fabric', w, h, d, { y: h / 2 }, color)
  // Puffy top and a zip flap.
  f.box('fabric', w * 0.9, 0.04, d * 0.9, { y: h + 0.01 }, color)
  f.box('rubber', w * 0.8, 0.012, 0.02, { y: h * 0.82, z: d / 2 + 0.005 }, BAG_STRAP)
  // Two straps round the bag, to wall brackets.
  for (const sx of [-0.3, 0.3]) {
    f.box('rubber', 0.04, h + 0.06, d + 0.03, { x: sx * w, y: h / 2 }, BAG_STRAP)
  }
  if (w >= 0.35) f.decal('stowage-label', Math.min(0.3, w * 0.5), Math.min(0.3, w * 0.5) * 0.375, { y: h * 0.5, z: d / 2 + 0.017 })
}

/** A sleeping bag in its wall pocket: a padded backing and a zipped bag, with straps. */
export function sleepingBag(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  f.box('padded', w + 0.1, h + 0.1, 0.04, { y: h / 2, z: -d / 2 + 0.02 }, tint('#cfd2d6'))
  const color = paint(prop, prop.id.endsWith('2') || prop.id.endsWith('4') ? SLEEP_BAG_ALT : SLEEP_BAG)
  f.box('fabric', w, h * 0.86, d - 0.06, { y: h * 0.43, z: 0.02 }, color)
  // Hood with the opening.
  f.box('fabric', w * 0.8, h * 0.12, d - 0.1, { y: h * 0.92, z: 0.0 }, color)
  f.box('rubber', w * 0.42, h * 0.07, 0.01, { y: h * 0.9, z: d / 2 - 0.04 }, RACK_DARK)
  // Zip down the front and two restraint straps.
  f.box('rubber', 0.015, h * 0.7, 0.01, { x: w * 0.22, y: h * 0.45, z: d / 2 - 0.035 }, BAG_STRAP)
  for (const y of [0.3, 0.62]) {
    f.box('rubber', w + 0.04, 0.04, d - 0.02, { y: h * y }, BAG_STRAP)
  }
}

/**
 * A soft water container, part of the storm shelter's lining: water and
 * stowage absorb radiation, so the crew shelter behind them in a solar storm.
 */
export function waterTank(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  // Stacked bladders in a strapped frame.
  const rows = Math.max(1, Math.round(h / 0.45))
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * (h / rows)
    f.box('fabric', w - 0.04, h / rows - 0.04, d, { y }, TANK_BLUE)
    f.cylinder('painted', 0.035, 0.04, { x: w / 2 - 0.12, y: y + h / rows / 2 - 0.08, z: d / 2 + 0.01, rotX: Math.PI / 2 }, TANK_CAP, 10)
  }
  for (const sx of [-0.35, 0.35]) f.box('fabric', 0.05, h, 0.012, { x: sx * w, y: h / 2, z: d / 2 + 0.006 }, WEBBING)
  f.decal('water-label', Math.min(0.32, w * 0.6), Math.min(0.32, w * 0.6) * 0.375, { y: h * 0.62, z: d / 2 + 0.012 })
}

/** The galley: a food warmer, a drink station with hot and cold water, and drawers. */
export function galley(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  f.box('painted', w, h, d, { y: h / 2 }, RACK_FRAME)
  // Food warmer: a door with a handle, on the left.
  f.box('brushed', w * 0.45, h * 0.42, 0.02, { x: -w * 0.24, y: h * 0.7, z: d / 2 + 0.01 })
  f.box('painted', w * 0.3, 0.03, 0.04, { x: -w * 0.24, y: h * 0.52, z: d / 2 + 0.03 }, RACK_DARK)
  // Drink station on the right: control panel and two nozzles.
  f.decal('galley-panel', w * 0.4, w * 0.4 * 0.625, { x: w * 0.25, y: h * 0.78, z: d / 2 + 0.012 })
  for (const sx of [0.16, 0.34]) {
    f.cylinder('brushed', 0.015, 0.08, { x: sx * w, y: h * 0.52, z: d / 2 + 0.03 }, undefined, 8)
  }
  // Drawers below.
  for (let i = 0; i < 2; i++) {
    const y = h * (0.12 + i * 0.18)
    f.box('painted', w - 0.06, h * 0.15, 0.02, { y, z: d / 2 + 0.01 }, RACK_MODULE)
    f.box('brushed', w * 0.3, 0.02, 0.03, { y: y + 0.03, z: d / 2 + 0.03 })
  }
  // Food packs held in an elastic net on the side.
  for (let i = 0; i < 3; i++) {
    f.box('fabric', 0.1, 0.14, 0.03, { x: -w / 2 + 0.1 + i * 0.12, y: h * 0.3, z: d / 2 + 0.03 }, [tint('#c94f3a'), tint('#e0b545'), tint('#5a9a5c')][i])
  }
}

/** A table folded down from the wall on two struts, with restraint straps on top. */
export function foldTable(f: Frame, prop: Prop): void {
  const { w, d } = prop.size
  f.box('painted', w, 0.035, d, { y: 0, z: 0 }, TABLE)
  f.box('rubber', w * 0.9, 0.01, 0.03, { y: 0.02, z: d * 0.2 }, BAG_STRAP)
  f.box('rubber', w * 0.9, 0.01, 0.03, { y: 0.02, z: -d * 0.2 }, BAG_STRAP)
  for (const sx of [-0.4, 0.4]) {
    f.box('brushed', 0.03, 0.03, d * 0.9, { x: sx * w, y: -0.2, z: -d * 0.05, rotX: -0.6 })
  }
  f.box('brushed', w, 0.06, 0.04, { y: -0.02, z: -d / 2 })
}

/** A laptop held open on a wall bracket. */
export function laptop(f: Frame, prop: Prop): void {
  const { w, h } = prop.size
  f.box('brushed', 0.08, 0.2, 0.04, { y: h * 0.4, z: 0.02 })
  f.box('painted', w, 0.025, w * 0.7, { y: 0.02, z: w * 0.35, rotX: 0.5 }, LAPTOP)
  f.box('painted', w, w * 0.68, 0.02, { y: w * 0.4, z: 0.04 }, LAPTOP)
  f.decal('laptop-screen', w * 0.9, w * 0.56, { y: w * 0.4, z: 0.052 }, [1.4, 1.4, 1.4])
}

/** A handhold: a short rail on two stand-offs, for pulling yourself along. */
export function handhold(f: Frame, prop: Prop): void {
  const { w } = prop.size
  f.box('painted', w, 0.035, 0.035, { y: 0, z: 0.06 }, paint(prop, HANDRAIL))
  for (const sx of [-1, 1]) f.box('painted', 0.03, 0.03, 0.07, { x: sx * (w / 2 - 0.03), z: 0.03 }, paint(prop, HANDRAIL))
}
