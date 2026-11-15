/**
 * Props for the lunar outpost and its surface: the greenhouse's grow
 * shelves, curtained bunks and the suit rack. (The lander on the landing
 * pad is a model: src/scene/LunarModuleView.tsx.) Built in a
 * local frame (+z is the front, y = 0 the base) from the shared materials.
 */
import { type BufferGeometry, SphereGeometry } from 'three'
import type { Prop } from '../../maps/types'
import { tint } from '../materials/surfaces'
import type { Frame, Tint } from './parts'

const STRUT = tint('#9aa0a8')
const DARK = tint('#23272e')
const SHELF = tint('#d7dade')
const TRAY = tint('#2c3138')
const LEAF = tint('#4f9a45')
const LEAF_LIGHT = tint('#7cc35a')
const STEM = tint('#3b6d32')
const GROW_LIGHT: Tint = [2.2, 0.45, 2.5]
const BUNK_FRAME = tint('#c9cdd3')
const MATTRESS = tint('#5c6f86')
const CURTAIN = tint('#3d5a78')
const SUIT = tint('#e6e8ec')
const VISOR = tint('#b8902e')

/** A sphere, placed in the frame (Frame has no sphere of its own). */
function sphere(f: Frame, key: 'painted' | 'fabric' | 'brushed', radius: number, x: number, y: number, z: number, color: Tint, sx = 1, sy = 1, sz = 1): void {
  const geometry = new SphereGeometry(radius, 10, 7)
  geometry.scale(sx, sy, sz)
  const [wx, wy, wz] = f.point(x, y, z)
  geometry.translate(wx, wy, wz)
  f.parts.add(key, geometry, color)
}

function placed<T extends BufferGeometry>(f: Frame, geometry: T, x: number, y: number, z: number): T {
  geometry.rotateY(f.yaw)
  const [wx, wy, wz] = f.point(x, y, z)
  geometry.translate(wx, wy, wz)
  return geometry
}

/**
 * Greenhouse shelving: three levels of hydroponic trays with plants, each lit
 * from above by pink-purple LED grow strips (red and blue light, which plants use most).
 */
export function growShelf(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box('painted', 0.04, h, 0.04, { x: sx * (w / 2 - 0.02), y: h / 2, z: sz * (d / 2 - 0.02) }, SHELF)
  const levels = 3
  for (let l = 0; l < levels; l++) {
    const y = 0.25 + l * ((h - 0.35) / levels)
    f.box('painted', w, 0.03, d, { y }, SHELF)
    f.box('rubber', w - 0.08, 0.08, d - 0.08, { y: y + 0.055 }, TRAY)
    // Plants: leafy clumps along the tray.
    const count = Math.max(2, Math.floor(w / 0.22))
    for (let p = 0; p < count; p++) {
      const x = -w / 2 + 0.14 + p * ((w - 0.28) / Math.max(1, count - 1))
      const tall = 0.12 + ((p * 7 + l * 3) % 5) * 0.025
      f.box('painted', 0.012, tall, 0.012, { x, y: y + 0.1 + tall / 2 }, STEM)
      sphere(f, 'fabric', 0.08, x, y + 0.12 + tall, 0, p % 2 ? LEAF : LEAF_LIGHT, 1.2, 0.7, 1.1)
      sphere(f, 'fabric', 0.06, x + 0.05, y + 0.1 + tall * 0.6, 0.04, LEAF, 1, 0.6, 1)
    }
    // Grow light strip under the shelf above.
    const top = l === levels - 1 ? h - 0.05 : 0.25 + (l + 1) * ((h - 0.35) / levels) - 0.02
    f.box('emissive', w - 0.1, 0.012, 0.05, { y: top, z: -d * 0.15 }, GROW_LIGHT)
    f.box('emissive', w - 0.1, 0.012, 0.05, { y: top, z: d * 0.15 }, GROW_LIGHT)
  }
  // Misting nozzle line along the top.
  f.box('brushed', w - 0.1, 0.02, 0.02, { y: h - 0.02, z: d / 2 - 0.04 })
  for (let x = -w / 2 + 0.2; x < w / 2; x += 0.4) f.box('brushed', 0.025, 0.05, 0.025, { x, y: h - 0.05, z: d / 2 - 0.04 })
}

/** A bunk with a privacy curtain half drawn along the front. */
export function curtainBunk(f: Frame, prop: Prop): void {
  const { w, d, h } = prop.size
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box('painted', 0.05, h, 0.05, { x: sx * (w / 2 - 0.03), y: h / 2, z: sz * (d / 2 - 0.03) }, BUNK_FRAME)
  for (const y of [0.35, h * 0.58]) {
    f.box('painted', w, 0.06, d, { y }, BUNK_FRAME)
    f.box('fabric', w - 0.08, 0.14, d - 0.08, { y: y + 0.1 }, MATTRESS)
    f.box('fabric', 0.34, 0.1, d - 0.25, { x: -(w / 2 - 0.25), y: y + 0.22 }, SUIT)
  }
  f.box('painted', w, 0.05, d, { y: h }, BUNK_FRAME)
  // Curtain rail and a curtain drawn over half of each bunk.
  f.box('brushed', w, 0.02, 0.02, { y: h - 0.05, z: d / 2 })
  f.box('fabric', w * 0.45, h - 0.12, 0.02, { x: w * 0.27, y: (h - 0.12) / 2 + 0.03, z: d / 2 }, CURTAIN)
}

/** Hooks on the airlock wall with two surface suits and helmets hanging ready. */
export function suitRack(f: Frame, prop: Prop): void {
  const { w } = prop.size
  f.box('brushed', w, 0.05, 0.05, { y: 1.85, z: 0.04 })
  const suits = Math.max(1, Math.floor(w / 0.7))
  for (let i = 0; i < suits; i++) {
    const x = -w / 2 + (i + 0.5) * (w / suits)
    f.box('brushed', 0.03, 0.12, 0.08, { x, y: 1.8, z: 0.08 })
    f.box('fabric', 0.48, 0.62, 0.26, { x, y: 1.4, z: 0.16 }, SUIT)
    f.box('fabric', 0.18, 0.75, 0.2, { x: x - 0.12, y: 0.72, z: 0.16 }, SUIT)
    f.box('fabric', 0.18, 0.75, 0.2, { x: x + 0.12, y: 0.72, z: 0.16 }, SUIT)
    f.box('painted', 0.4, 0.5, 0.16, { x, y: 1.42, z: -0.0 }, tint('#cfd2d6'))
    sphere(f, 'painted', 0.15, x, 2.02, 0.15, SUIT)
    sphere(f, 'brushed', 0.12, x, 2.0, 0.25, VISOR, 1, 0.8, 0.5)
  }
}

const PANEL_CELLS = tint('#1c2c4c')
const PANEL_FRAME = tint('#b9bec6')
const CRACK = tint('#8fa4c4')
const DISH = tint('#e3e5e8')
const DIGGER = tint('#c9a227')
const TRACK = tint('#2a2d33')

/**
 * A tall solar panel on a mast. At the south pole the Sun stays just above
 * the horizon, so panels stand upright and turn to face it, rather than
 * lying flat as they would near the equator. Its front (+z) faces the Sun.
 * Label 'broken': the damaged panel for challenge 11, sagging and cracked.
 */
export function solarPanel(f: Frame, prop: Prop): void {
  const { w, h } = prop.size
  const broken = prop.label === 'broken'
  const panelH = Math.min(4.6, h - 2.2)
  const centreY = h - panelH / 2 - 0.2
  f.box('painted', 1.2, 0.3, 1.2, { y: 0.15 }, STRUT)
  f.cylinder('painted', 0.12, h - 0.2, { y: (h - 0.2) / 2 + 0.1 }, STRUT, 10)
  // Tracking motor at the top of the mast.
  f.box('painted', 0.5, 0.4, 0.5, { y: centreY, z: -0.3 }, DARK)
  const tilt = broken ? 0.5 : 0
  const roll = broken ? 0.18 : 0
  f.box('painted', w, panelH, 0.07, { y: centreY, z: 0, rotX: tilt, rotZ: roll }, PANEL_CELLS)
  f.box('brushed', w + 0.08, 0.06, 0.09, { y: centreY + (panelH / 2) * Math.cos(tilt), z: (panelH / 2) * Math.sin(tilt) * -1, rotX: tilt, rotZ: roll }, PANEL_FRAME)
  f.box('brushed', w + 0.08, 0.06, 0.09, { y: centreY - (panelH / 2) * Math.cos(tilt), z: (panelH / 2) * Math.sin(tilt), rotX: tilt, rotZ: roll }, PANEL_FRAME)
  // Cell grid lines.
  for (let i = 1; i < 6; i++) {
    const x = -w / 2 + (i * w) / 6
    f.box('brushed', 0.02, panelH, 0.075, { x, y: centreY, rotX: tilt, rotZ: roll }, PANEL_FRAME)
  }
  if (broken) {
    // A crack across the cells and a fallen piece below.
    for (let i = 0; i < 5; i++) {
      f.box('painted', 0.7, 0.03, 0.08, { x: -0.9 + i * 0.45, y: centreY + 0.4 - (i % 2) * 0.35 - i * 0.12, z: 0.04, rotZ: (i % 2 ? 0.5 : -0.4) + roll, rotX: tilt }, CRACK)
    }
    f.box('painted', 0.8, 0.05, 0.6, { x: 1.1, y: 0.05, z: 0.9, rotY: 0.6 }, PANEL_CELLS)
  }
}

/** The comms antenna: a dish on a mast, its front (+z) pointing at Earth low on the horizon. */
export function antenna(f: Frame, prop: Prop): void {
  const { h } = prop.size
  f.box('painted', 1.4, 0.3, 1.4, { y: 0.15 }, STRUT)
  f.box('painted', 0.7, 0.9, 0.5, { x: 0.5, y: 0.75, z: -0.4 }, tint('#cfd2d6'))
  f.cylinder('painted', 0.14, h - 1.4, { y: (h - 1.4) / 2 + 0.3 }, STRUT, 10)
  const dishY = h - 1.2
  // The dish: a shallow cap of a sphere, opening toward +z.
  const cap = new SphereGeometry(1.6, 24, 8, 0, Math.PI * 2, 0, 0.75)
  cap.rotateX(-Math.PI / 2)
  cap.translate(0, 0, -1.6 * Math.cos(0.75) + 0.2)
  f.parts.add('painted', placed(f, cap, 0, dishY, 0), DISH)
  // Feed horn on three struts.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    f.box('brushed', 0.03, 0.03, 1.2, { x: Math.cos(a) * 0.5, y: dishY + Math.sin(a) * 0.5, z: 0.55, rotX: Math.sin(a) * 0.35, rotY: -Math.cos(a) * 0.35 })
  }
  f.cylinder('painted', 0.09, 0.3, { y: dishY, z: 1.05, rotX: Math.PI / 2 }, DARK, 10)
}

/** A small tracked excavator digging regolith (for shielding, and later for water). */
export function excavator(f: Frame, prop: Prop): void {
  const { w, d } = prop.size
  for (const sx of [-1, 1]) {
    f.box('rubber', 0.45, 0.6, d, { x: sx * (w / 2 - 0.22), y: 0.3 }, TRACK)
    for (let z = -d / 2 + 0.3; z < d / 2; z += 0.6) f.cylinder('brushed', 0.18, 0.47, { x: sx * (w / 2 - 0.22), y: 0.3, z, rotZ: Math.PI / 2 }, undefined, 10)
  }
  f.box('painted', w - 0.6, 0.9, d * 0.6, { y: 1.05, z: -0.3 }, DIGGER)
  f.box('painted', 0.9, 0.7, 0.9, { x: -0.3, y: 1.85, z: -0.5 }, tint('#e6e8ec'))
  f.box('emissive', 0.5, 0.3, 0.02, { x: -0.3, y: 1.9, z: -0.04 }, [0.1, 0.15, 0.22])
  // Boom, stick and bucket reaching forward and down into the heap.
  f.box('painted', 0.25, 0.25, 2, { y: 1.9, z: 1.2, rotX: 0.5 }, DIGGER)
  f.box('painted', 0.22, 0.22, 1.4, { y: 1.5, z: 2.4, rotX: -0.9 }, DIGGER)
  f.box('brushed', 0.8, 0.5, 0.5, { y: 0.7, z: 2.9, rotX: 0.4 }, TRACK)
}
