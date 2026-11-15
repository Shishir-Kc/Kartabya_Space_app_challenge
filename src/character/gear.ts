/**
 * Suit gear for the astronaut, so no outfit ever reads as a bare body:
 *
 * - The suit is loosened: pushed out along its normals (more on the torso and
 *   seat, a lot more for the bulky surface suit), so it reads as fabric.
 * - Gloves: the hands are split off the skin into their own mesh, puffed out
 *   and coloured, so hands are never bare.
 * - Feet are always inside boots, so they are cut out of the skin (and the
 *   suit) entirely. Each boot is a closed, rounded shell round where the foot
 *   was (heel, thick sole, toe cap), bending at the toes with the toe bone,
 *   and an ankle cuff on the shin that the shell's top blends into, so no
 *   pose, pointed toes included, opens a gap.
 * - Gear: collar, harness, belt, pockets, knee and elbow pads, glove cuffs;
 *   for the surface suit also hard
 *   bearing rings at the joints and a detailed life-support backpack with
 *   hoses to a chest display. All of it is one skinned mesh per outfit,
 *   each piece fixed to one bone, coloured by vertex colour: one draw call.
 * - Seams, panel lines and a front zip are drawn by the suit's shader, in
 *   the body's rest pose, so they move with it.
 *
 * Everything is placed by measuring the body in its rest (T) pose.
 */
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Matrix4,
  type MeshStandardMaterial,
  Quaternion,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { OutfitId } from './outfits'

/** Bones whose skin counts as hands (for gloves). */
const HAND_BONE = /^(hand_[lr]|(index|middle|pinky|ring|thumb)_\d+(_leaf)?_[lr])$/
const TORSO_BONE = /^(pelvis|spine_0[123]|clavicle_[lr])$/
const THIGH_BONE = /^thigh_[lr]$/
/** Bones whose skin counts as feet and toes (always inside boots). */
const FOOT_BONE = /^(foot|ball|ball_leaf)_([lr])$/

export interface GearColours {
  /** Gloves. */
  glove: string
  /** Boots. */
  boot: string
  /** Harness, belt and straps. */
  strap: string
  /** Pockets: a shade of the suit. */
  pocket: string
  /** Knee and elbow pads, collar. */
  pad: string
}

/** How much each outfit is loosened, in metres: limbs and torso. */
const FIT: Record<OutfitId, { limb: number; torso: number; glove: number }> = {
  flight: { limb: 0.006, torso: 0.011, glove: 0.007 },
  launch: { limb: 0.008, torso: 0.014, glove: 0.008 },
  // The surface suit is pressurised and layered: the body's shape disappears.
  surface: { limb: 0.035, torso: 0.05, glove: 0.02 },
}

/** The dominant bone of each vertex (by weight), as a name. */
function dominantBones(mesh: SkinnedMesh): string[] {
  const index = mesh.geometry.attributes.skinIndex as BufferAttribute
  const weight = mesh.geometry.attributes.skinWeight as BufferAttribute
  const names: string[] = []
  for (let v = 0; v < index.count; v++) {
    let best = 0
    let bestWeight = -1
    for (let k = 0; k < 4; k++) {
      const w = weight.getComponent(v, k)
      if (w > bestWeight) {
        bestWeight = w
        best = index.getComponent(v, k)
      }
    }
    names.push(mesh.skeleton.bones[best]?.name ?? '')
  }
  return names
}

/**
 * The body's meshes are quantised: their local units aren't metres. This
 * matrix takes a mesh-local rest-pose point to model space in metres. It is
 * a bone's rest transform times its inverse bind matrix.
 */
export function restToModel(mesh: SkinnedMesh, rootInverse: Matrix4, boneName = 'Head'): Matrix4 {
  const bones = mesh.skeleton.bones
  const i = Math.max(0, bones.findIndex((b) => b.name === boneName))
  const bone = bones[i]!
  return new Matrix4().multiplyMatrices(rootInverse, bone.matrixWorld).multiply(mesh.skeleton.boneInverses[i]!)
}

/** How many local units make a metre's worth of model space. */
function localScale(toModel: Matrix4): number {
  const s = new Vector3()
  toModel.decompose(new Vector3(), new Quaternion(), s)
  return Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)) || 1
}

/** A copy of the geometry with float positions pushed out along the normals. */
function inflated(mesh: SkinnedMesh, toModel: Matrix4, amount: (bone: string) => number, only?: (bone: string) => boolean): BufferGeometry {
  const source = mesh.geometry
  const geometry = source.clone()
  const position = source.attributes.position as BufferAttribute
  const normal = source.attributes.normal as BufferAttribute
  const bones = dominantBones(mesh)
  const scale = localScale(toModel)
  const out = new Float32Array(position.count * 3)
  const n = new Vector3()
  for (let v = 0; v < position.count; v++) {
    n.set(normal.getX(v), normal.getY(v), normal.getZ(v)).normalize()
    const bone = bones[v] ?? ''
    const push = only && !only(bone) ? 0 : amount(bone) / scale
    out[v * 3] = position.getX(v) + n.x * push
    out[v * 3 + 1] = position.getY(v) + n.y * push
    out[v * 3 + 2] = position.getZ(v) + n.z * push
  }
  geometry.setAttribute('position', new BufferAttribute(out, 3))
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * Fabric hangs over the body rather than following every curve: across the
 * hips and seat, the suit is filled out to a smooth rounded profile front
 * and back, so the body's shape never shows through.
 */
function smoothBand(geometry: BufferGeometry, toModel: Matrix4, lo: number, hi: number, halfWidth: number, backToo: boolean): void {
  const position = geometry.attributes.position as BufferAttribute
  const toLocal = toModel.clone().invert()
  const p = new Vector3()
  const points: Vector3[] = []
  for (let v = 0; v < position.count; v++) points.push(p.set(position.getX(v), position.getY(v), position.getZ(v)).clone().applyMatrix4(toModel))
  const bins = 16
  const width = new Float32Array(bins)
  const back = new Float32Array(bins)
  const front = new Float32Array(bins)
  let centreZ = 0
  let n = 0
  for (const q of points) {
    if (q.y < lo || q.y > hi) continue
    centreZ += q.z
    n++
  }
  centreZ /= Math.max(1, n)
  for (const q of points) {
    if (q.y < lo || q.y > hi || Math.abs(q.x) > 0.3) continue
    const b = Math.min(bins - 1, Math.floor(((q.y - lo) / (hi - lo)) * bins))
    width[b] = Math.max(width[b]!, Math.abs(q.x))
    back[b] = Math.max(back[b]!, centreZ - q.z)
    front[b] = Math.max(front[b]!, q.z - centreZ)
  }
  for (let v = 0; v < points.length; v++) {
    const q = points[v]!
    if (q.y < lo || q.y > hi || Math.abs(q.x) > halfWidth) continue
    const b = Math.min(bins - 1, Math.floor(((q.y - lo) / (hi - lo)) * bins))
    const w = Math.max(0.05, width[b]!)
    const across = Math.max(0, 1 - (q.x / w) ** 2)
    // Fade in and out at the top and bottom of the band, so there's no step.
    const fade = Math.min(1, (q.y - lo) / 0.06, (hi - q.y) / 0.06)
    const backZ = centreZ - back[b]! * Math.pow(across, 0.35)
    const frontZ = centreZ + front[b]! * Math.pow(across, 0.35) * 0.96
    let z = q.z
    if (backToo && q.z < centreZ && q.z > backZ) z = q.z + (backZ - q.z) * fade
    if (q.z > centreZ && q.z < frontZ) z = q.z + (frontZ - q.z) * fade * 0.85
    if (z !== q.z) {
      const local = new Vector3(q.x, q.y, z).applyMatrix4(toLocal)
      position.setXYZ(v, local.x, local.y, local.z)
    }
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
}

/** The loosened suit geometry for an outfit. */
export function fittedSuit(outfit: SkinnedMesh, toModel: Matrix4, id: OutfitId): BufferGeometry {
  const fit = FIT[id]
  const geometry = inflated(outfit, toModel, (bone) => (TORSO_BONE.test(bone) ? fit.torso : THIGH_BONE.test(bone) ? (fit.torso + fit.limb) / 2 : fit.limb))
  // The seat and hips, front and back; and the chest, at the front.
  smoothBand(geometry, toModel, 0.8, 1.12, 0.16, true)
  smoothBand(geometry, toModel, 1.16, 1.44, 0.17, false)
  // Feet are inside the boots: any suit over them (socks) goes too.
  removeTriangles(geometry, dominantBones(outfit), (bone) => FOOT_BONE.test(bone))
  return geometry
}

/** Drops the triangles whose three corners all belong to matching bones. Returns them. */
function removeTriangles(geometry: BufferGeometry, bones: string[], match: (bone: string) => boolean): number[] {
  const index = geometry.index
  if (!index) return []
  const keep: number[] = []
  const cut: number[] = []
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t)
    const b = index.getX(t + 1)
    const c = index.getX(t + 2)
    ;([a, b, c].every((v) => match(bones[v] ?? '')) ? cut : keep).push(a, b, c)
  }
  if (cut.length) geometry.setIndex(keep)
  return cut
}

/** Where each foot was, in the rest pose (model space): what its boot must enclose. */
export interface Feet {
  l: Box3
  r: Box3
}

/**
 * Splits the hands and feet off the skin mesh: returns the hand triangles'
 * index (for gloves) and where each foot was (for boots), and removes both
 * from the skin, so bare hands and feet never show.
 */
export function splitSkin(skin: SkinnedMesh, toModel: Matrix4): { hands: BufferAttribute | null; feet: Feet | null } {
  const geometry = skin.geometry
  const bones = dominantBones(skin)
  const feet: Feet = { l: new Box3(), r: new Box3() }
  const position = geometry.attributes.position as BufferAttribute
  const p = new Vector3()
  for (let v = 0; v < position.count; v++) {
    const side = FOOT_BONE.exec(bones[v] ?? '')?.[2] as 'l' | 'r' | undefined
    if (side) feet[side].expandByPoint(p.set(position.getX(v), position.getY(v), position.getZ(v)).applyMatrix4(toModel))
  }
  removeTriangles(geometry, bones, (bone) => FOOT_BONE.test(bone))
  const hands = removeTriangles(geometry, bones, (bone) => HAND_BONE.test(bone))
  return {
    hands: hands.length ? new BufferAttribute(new Uint32Array(hands), 1) : null,
    feet: feet.l.isEmpty() || feet.r.isEmpty() ? null : feet,
  }
}

/** The glove geometry for an outfit: the hand triangles, puffed out. */
export function gloveGeometry(skin: SkinnedMesh, toModel: Matrix4, hands: BufferAttribute, id: OutfitId): BufferGeometry {
  const geometry = inflated(skin, toModel, () => FIT[id].glove)
  geometry.setIndex(hands)
  return geometry
}

// ---------- Gear pieces ----------

interface Piece {
  geometry: BufferGeometry
  bone: string
  color: string
  /** Skin weights by rest-pose position, for pieces that bend (boots); otherwise all on `bone`. */
  weights?: (p: Vector3) => [string, number][]
}

/** Rest-pose (bind) positions of bones in model space, and a way to find the body's surface. */
export interface BodyMeasure {
  bone: (name: string) => Vector3
  /** Where the feet were (cut out of the skin), if known. */
  feet?: Feet
  /** Furthest suit point from the bone's axis, in a direction, near a height (model space). */
  reach: (from: Vector3, direction: Vector3, band?: number) => number
}

export function measureBody(outfit: SkinnedMesh, rootInverse: Matrix4, toModel: Matrix4): BodyMeasure {
  const position = outfit.geometry.attributes.position as BufferAttribute
  const points: Vector3[] = []
  for (let v = 0; v < position.count; v += 2) points.push(new Vector3(position.getX(v), position.getY(v), position.getZ(v)).applyMatrix4(toModel))
  const bones = new Map<string, Vector3>()
  for (const bone of outfit.skeleton.bones) bones.set(bone.name, new Vector3().setFromMatrixPosition(new Matrix4().multiplyMatrices(rootInverse, bone.matrixWorld)))
  return {
    bone: (name) => bones.get(name)?.clone() ?? new Vector3(),
    reach: (from, direction, band = 0.05) => {
      const d = direction.clone().normalize()
      let best = 0.05
      for (const p of points) {
        const offset = p.clone().sub(from)
        const along = offset.dot(d)
        if (along <= 0) continue
        const side = offset.clone().addScaledVector(d, -along).length()
        if (side < band && along > best) best = along
      }
      return best
    },
  }
}

function at(geometry: BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): BufferGeometry {
  if (rx) geometry.rotateX(rx)
  if (ry) geometry.rotateY(ry)
  if (rz) geometry.rotateZ(rz)
  geometry.translate(x, y, z)
  return geometry
}

type AddPiece = (geometry: BufferGeometry, bone: string, color: string, weights?: Piece['weights']) => void

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * A rounded shoe-like block, along z (heel at -z, toe at +z): a squashed
 * superellipsoid with a flat bottom at `y0`, its top at `top(t)` and its
 * half-width `half(t)` (t runs 0 at the heel to 1 at the toe). `round` below
 * 1 makes it boxier; 1 is an ellipsoid.
 */
function shoeBlock(length: number, y0: number, top: (t: number) => number, half: (t: number) => number, round: number): BufferGeometry {
  const g = new SphereGeometry(1, 28, 16)
  const position = g.attributes.position as BufferAttribute
  const se = (u: number) => Math.sign(u) * Math.pow(Math.abs(u), round)
  for (let v = 0; v < position.count; v++) {
    const x = se(position.getX(v))
    const y = se(position.getY(v))
    const z = se(position.getZ(v))
    const t = (z + 1) / 2
    position.setXYZ(v, x * half(t), y0 + ((y + 1) / 2) * (top(t) - y0), (z * length) / 2)
  }
  g.computeVertexNormals()
  return g
}

/**
 * One boot, closed all round where the foot was: a thick sole that curls up
 * into a toe bumper, a rounded upper (heel, instep, toe cap) and an ankle
 * cuff on the shin. The front bends with the toe bone; the upper's top
 * blends into the shin, so pointing the toes never opens a gap. Moon boots
 * are bigger and rounder, with a very thick treaded sole and a tall padded cuff.
 */
function boots(m: BodyMeasure, s: 'l' | 'r', surface: boolean, c: GearColours, add: AddPiece, limb: number): void {
  const foot = m.bone(`foot_${s}`)
  const ball = m.bone(`ball_${s}`)
  const calf = `calf_${s}`
  // What the boot must enclose: the foot as cut out of the skin, or a guess from the bones.
  const box =
    m.feet?.[s].clone() ??
    new Box3(new Vector3(foot.x - 0.05, 0, foot.z - 0.07), new Vector3(foot.x + 0.05, foot.y + 0.03, ball.z + 0.08))
  const size = box.getSize(new Vector3())
  const centre = box.getCenter(new Vector3())
  const length = surface ? size.z * 1.18 + 0.05 : size.z + 0.034
  const width = surface ? size.x * 1.45 + 0.04 : size.x + 0.03
  const cz = centre.z + (surface ? 0.012 : 0.004)
  const sole = surface ? 0.06 : 0.03
  const y0 = box.min.y - 0.004
  const heelTop = Math.max(box.max.y + 0.014, foot.y + 0.07) + (surface ? 0.03 : 0)
  const toeTop = y0 + sole + (surface ? 0.1 : 0.055)
  const half = (t: number) => (width / 2) * (0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.85)))
  const upperTop = (t: number) => heelTop + (toeTop - heelTop) * smooth(0.25, 0.85, t)
  // Weights: the toe end follows the toe bone; the top of the upper eases into the shin.
  const weights = (shinShare: number) => (p: Vector3): [string, number][] => {
    const toe = smooth(ball.z - 0.025, ball.z + 0.04, p.z)
    const shin = smooth(foot.y - 0.005, foot.y + 0.07, p.y) * shinShare * (1 - toe)
    return [
      [`foot_${s}`, 1 - toe - shin],
      [`ball_${s}`, toe],
      [calf, shin],
    ]
  }
  const place = (g: BufferGeometry) => at(g, centre.x, 0, cz)
  // Sole, curling up at the toe and heel into a bumper.
  const soleTop = (t: number) => y0 + sole + 0.028 * smooth(0.82, 1, t) + 0.012 * (1 - smooth(0, 0.12, t))
  add(place(shoeBlock(length + 0.012, y0, soleTop, (t) => half(t) + 0.007, surface ? 0.45 : 0.3)), `foot_${s}`, surface ? '#3a3d42' : '#1b1d21', weights(0))
  // The upper.
  add(place(shoeBlock(length, y0 + sole * 0.5, upperTop, half, surface ? 0.55 : 0.42)), `foot_${s}`, c.boot, weights(0.85))
  if (surface) {
    // Deep treads across the sole.
    for (let i = 0; i < 7; i++) {
      const z = cz - length / 2 + 0.05 + (i * (length - 0.1)) / 6
      add(at(new BoxGeometry(width * 0.9, 0.022, 0.026), centre.x, y0 - 0.006, z), `foot_${s}`, '#2a2c30', weights(0))
    }
  } else {
    // Two straps across the instep.
    for (const t of [0.42, 0.6]) {
      const z = cz - length / 2 + t * length
      add(at(new BoxGeometry(half(t) * 2 + 0.012, 0.016, 0.026), centre.x, upperTop(t) - 0.012, z), `foot_${s}`, c.strap, weights(0.85))
    }
  }
  // The ankle cuff, on the shin, over the bottom of the suit leg: snug for
  // flight and launch boots, tall and padded for moon boots.
  const ankle = new Vector3(foot.x, foot.y + 0.09, foot.z)
  let reach = 0
  for (const d of [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)]) reach = Math.max(reach, m.reach(ankle, d, 0.03))
  const leg = Math.max(0.04, Math.min(0.065, reach)) + limb
  const radius = leg + (surface ? 0.035 : 0.01)
  const cuffLo = foot.y - (surface ? 0.03 : 0.03)
  const cuffHi = foot.y + (surface ? 0.27 : 0.1)
  add(at(new CylinderGeometry(radius * (surface ? 1 : 0.94), radius * 1.06, cuffHi - cuffLo, 18), foot.x, (cuffLo + cuffHi) / 2, foot.z - 0.004), calf, c.boot)
  // A padded rim (and for moon boots, padded rings up the cuff).
  for (const y of surface ? [cuffLo + 0.1, cuffHi - 0.015] : [cuffHi - 0.006]) {
    add(at(new TorusGeometry(radius * (surface ? 1 : 0.94) + 0.002, surface ? 0.02 : 0.009, 8, 22), foot.x, y, foot.z - 0.004, Math.PI / 2), calf, c.pad)
  }
}

/** The gear pieces for an outfit, placed on the rest-pose body (model space). */
function gearPieces(m: BodyMeasure, id: OutfitId, c: GearColours): Piece[] {
  const pieces: Piece[] = []
  const add = (geometry: BufferGeometry, bone: string, color: string, weights?: Piece['weights']) => pieces.push({ geometry, bone, color, weights })
  const surface = id === 'surface'
  const bulk = surface ? FIT.surface.torso : FIT[id].torso
  const front = new Vector3(0, 0, 1)
  const back = new Vector3(0, 0, -1)

  // Collar or neck ring.
  const neck = m.bone('neck_01')
  add(at(new TorusGeometry(surface ? 0.11 : 0.072, surface ? 0.03 : 0.02, 8, 24), neck.x, neck.y - 0.035, neck.z + 0.01, Math.PI / 2), 'neck_01', c.pad)

  // Belt round the waist, with a buckle.
  const waist = m.bone('spine_01')
  const waistFront = m.reach(waist, front, 0.08) + bulk
  const waistSide = m.reach(waist, new Vector3(1, 0, 0), 0.08) + bulk
  const belt = new TorusGeometry(1, 0.015, 6, 32)
  belt.rotateX(Math.PI / 2)
  belt.scale(waistSide + 0.01, 1, waistFront + 0.01)
  add(at(belt, waist.x, waist.y - 0.04, waist.z), 'spine_01', c.strap)
  add(at(new BoxGeometry(0.06, 0.04, 0.018), waist.x, waist.y - 0.04, waist.z + waistFront + 0.02), 'spine_01', c.pad)

  // Harness: straps over each shoulder, front and back, from the belt.
  const chest = m.bone('spine_03')
  const chestFront = m.reach(chest, front, 0.1) + bulk
  const chestBack = m.reach(chest, back, 0.1) + bulk
  for (const side of [-1, 1]) {
    const x = side * 0.09
    const top = chest.y + 0.14
    const low = waist.y - 0.03
    add(at(new BoxGeometry(0.032, top - low, 0.01), x, (top + low) / 2, chest.z + chestFront + 0.008, -0.12), 'spine_03', c.strap)
    // At the back the straps stop at mid-back and join a cross strap (an H harness), well clear of the seat.
    const backLow = chest.y - 0.14
    add(at(new BoxGeometry(0.032, top - backLow, 0.01), x, (top + backLow) / 2, chest.z - chestBack - 0.008), 'spine_03', c.strap)
    if (side > 0) add(at(new BoxGeometry(0.26, 0.03, 0.01), 0, chest.y - 0.05, chest.z - chestBack - 0.01), 'spine_03', c.strap)
    add(at(new BoxGeometry(0.032, 0.01, chestFront + chestBack), x, top + 0.01, chest.z + (chestFront - chestBack) / 2), 'spine_03', c.strap)
    // Chest pockets.
    if (!surface) add(at(new BoxGeometry(0.08, 0.075, 0.025), side * 0.075, chest.y - 0.02, chest.z + chestFront + 0.012), 'spine_03', c.pocket)
  }

  // Leg pockets on the outside of each thigh, knee pads, and boots.
  for (const s of ['l', 'r'] as const) {
    const sign = s === 'l' ? 1 : -1
    const thigh = m.bone(`thigh_${s}`)
    const calf = m.bone(`calf_${s}`)
    const pocketY = (thigh.y + calf.y) / 2
    const out = m.reach(new Vector3(thigh.x, pocketY, thigh.z), new Vector3(sign, 0, 0), 0.06) + (surface ? FIT.surface.limb : FIT[id].limb)
    if (!surface) add(at(new BoxGeometry(0.03, 0.13, 0.11), thigh.x + sign * (out + 0.012), pocketY, thigh.z), `thigh_${s}`, c.pocket)
    // A seat pocket over each side of the seat, as on a real flight suit.
    if (!surface) {
      const seatBack = m.reach(new Vector3(thigh.x, thigh.y - 0.06, thigh.z), back, 0.07) + bulk
      add(at(new BoxGeometry(0.12, 0.13, 0.03), thigh.x, thigh.y - 0.06, thigh.z - seatBack - 0.01), 'pelvis', c.pocket)
    }
    const kneeFront = m.reach(calf, front, 0.06) + (surface ? FIT.surface.limb : FIT[id].limb)
    add(at(new BoxGeometry(0.1, 0.11, 0.03), calf.x, calf.y - 0.01, calf.z + kneeFront + 0.012), `calf_${s}`, c.pad)

    boots(m, s, surface, c, add, surface ? FIT.surface.limb : FIT[id].limb)
  }

  // Elbow pads and glove cuffs.
  for (const s of ['l', 'r'] as const) {
    const sign = s === 'l' ? 1 : -1
    const elbow = m.bone(`lowerarm_${s}`)
    const hand = m.bone(`hand_${s}`)
    const behind = m.reach(elbow, back, 0.05) + (surface ? FIT.surface.limb : FIT[id].limb)
    add(at(new BoxGeometry(0.08, 0.07, 0.025), elbow.x + sign * 0.01, elbow.y, elbow.z - behind - 0.01), `lowerarm_${s}`, c.pad)
    add(at(new TorusGeometry(surface ? 0.058 : 0.045, surface ? 0.02 : 0.014, 8, 20), hand.x - sign * 0.035, hand.y, hand.z, 0, Math.PI / 2), `hand_${s}`, c.glove)
  }

  if (surface) {
    // Hard bearing rings at the shoulders, elbows, wrists and knees, and round the waist.
    const ring = (radius: number, x: number, y: number, z: number, bone: string, axis: 'x' | 'y') =>
      add(at(new TorusGeometry(radius, 0.018, 8, 24), x, y, z, axis === 'y' ? Math.PI / 2 : 0, axis === 'x' ? Math.PI / 2 : 0), bone, '#9aa0a8')
    for (const s of ['l', 'r'] as const) {
      const sign = s === 'l' ? 1 : -1
      const shoulder = m.bone(`upperarm_${s}`)
      const elbow = m.bone(`lowerarm_${s}`)
      const hand = m.bone(`hand_${s}`)
      const calf = m.bone(`calf_${s}`)
      ring(0.105, shoulder.x + sign * 0.03, shoulder.y, shoulder.z, `upperarm_${s}`, 'x')
      ring(0.085, elbow.x + sign * 0.02, elbow.y, elbow.z, `lowerarm_${s}`, 'x')
      ring(0.07, hand.x - sign * 0.06, hand.y, hand.z, `lowerarm_${s}`, 'x')
      ring(0.1, calf.x, calf.y + 0.04, calf.z, `calf_${s}`, 'y')
    }
    const hips = new TorusGeometry(1, 0.022, 8, 32)
    hips.rotateX(Math.PI / 2)
    hips.scale(waistSide + 0.025, 1, waistFront + 0.025)
    add(at(hips, waist.x, waist.y + 0.04, waist.z), 'spine_01', '#9aa0a8')

    // Life-support backpack: rounded main body, top cap, side vents, straps,
    // and two hoses to a display and control box on the chest.
    const packZ = chest.z - chestBack - 0.13
    const pack = new BoxGeometry(0.44, 0.56, 0.24, 1, 1, 1)
    add(at(pack, chest.x, chest.y - 0.02, packZ), 'spine_03', '#e6e8ec')
    add(at(new CylinderGeometry(0.12, 0.12, 0.44, 16, 1, false, 0, Math.PI), chest.x, chest.y + 0.26, packZ, 0, 0, Math.PI / 2), 'spine_03', '#d5d8dc')
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) add(at(new BoxGeometry(0.012, 0.03, 0.18), chest.x + side * 0.226, chest.y - 0.18 + i * 0.06, packZ), 'spine_03', '#4a4f57')
    }
    add(at(new BoxGeometry(0.3, 0.12, 0.02), chest.x, chest.y - 0.18, packZ - 0.125), 'spine_03', '#9aa0a8')
    add(at(new BoxGeometry(0.17, 0.1, 0.07), chest.x, chest.y - 0.04, chest.z + chestFront + 0.045), 'spine_03', '#d5d8dc')
    add(at(new BoxGeometry(0.11, 0.05, 0.005), chest.x, chest.y - 0.03, chest.z + chestFront + 0.081), 'spine_03', '#1b2b4a')
    for (const side of [-1, 1]) {
      // A hose looping from the pack over the side to the chest box.
      for (let i = 0; i <= 6; i++) {
        const t = i / 6
        const a = t * Math.PI
        const x = chest.x + side * (0.2 + Math.sin(a) * 0.06)
        const z = packZ + (chest.z + chestFront + 0.04 - packZ) * t
        const y = chest.y - 0.12 + Math.sin(a) * 0.05
        add(at(new SphereGeometry(0.022, 8, 6), x, y, z), 'spine_03', '#c9772f')
      }
    }
  }
  return pieces
}

/**
 * One skinned mesh holding all of an outfit's gear, bound to the body's
 * skeleton: each piece moves with its bone.
 */
export function buildGear(outfit: SkinnedMesh, m: BodyMeasure, toModel: Matrix4, id: OutfitId, colours: GearColours, material: MeshStandardMaterial): SkinnedMesh {
  const toLocal = toModel.clone().invert()
  const bones = outfit.skeleton.bones
  const parts: BufferGeometry[] = []
  const boneIndex = (name: string) => Math.max(0, bones.findIndex((b) => b.name === name))
  const p = new Vector3()
  for (const piece of gearPieces(m, id, colours)) {
    const g = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry
    g.deleteAttribute('uv')
    const count = g.attributes.position!.count
    const skinIndex = new Uint16Array(count * 4)
    const skinWeight = new Float32Array(count * 4)
    const colors = new Float32Array(count * 3)
    const color = new Color(piece.color)
    const main = boneIndex(piece.bone)
    const position = g.attributes.position as BufferAttribute
    for (let v = 0; v < count; v++) {
      if (piece.weights) {
        const w = piece.weights(p.set(position.getX(v), position.getY(v), position.getZ(v))).filter(([, x]) => x > 0).slice(0, 4)
        const total = w.reduce((sum, [, x]) => sum + x, 0) || 1
        w.forEach(([name, x], k) => {
          skinIndex[v * 4 + k] = boneIndex(name)
          skinWeight[v * 4 + k] = x / total
        })
        if (w.length === 0) {
          skinIndex[v * 4] = main
          skinWeight[v * 4] = 1
        }
      } else {
        skinIndex[v * 4] = main
        skinWeight[v * 4] = 1
      }
      colors[v * 3] = color.r
      colors[v * 3 + 1] = color.g
      colors[v * 3 + 2] = color.b
    }
    g.applyMatrix4(toLocal)
    g.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4))
    g.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4))
    g.setAttribute('color', new BufferAttribute(colors, 3))
    parts.push(g)
    piece.geometry.dispose()
  }
  const geometry = mergeGeometries(parts, false) ?? new BufferGeometry()
  for (const g of parts) g.dispose()
  const mesh = new SkinnedMesh(geometry, material)
  mesh.position.copy(outfit.position)
  mesh.quaternion.copy(outfit.quaternion)
  mesh.scale.copy(outfit.scale)
  mesh.bind(outfit.skeleton, outfit.bindMatrix)
  mesh.frustumCulled = false
  return mesh
}

/**
 * Seams, panel lines and a front zip on the suit, drawn in its rest pose so
 * they move with the body: darker lines across the chest yoke, waist, knees
 * and down the sides, and a lighter zip down the front.
 */
export function suitSeams(material: MeshStandardMaterial, rest: Matrix4): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRest = { value: rest }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uRest;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = (uRest * vec4(position, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 p = vRest;
          float line = 0.0;
          // Horizontal panel seams: chest yoke, waist, mid-thigh, knees.
          line = max(line, 1.0 - smoothstep(0.0, 0.006, abs(p.y - 1.40)));
          line = max(line, 1.0 - smoothstep(0.0, 0.006, abs(p.y - 1.06)));
          line = max(line, 1.0 - smoothstep(0.0, 0.006, abs(p.y - 0.76)));
          line = max(line, 1.0 - smoothstep(0.0, 0.006, abs(p.y - 0.58)));
          // Side seams on the torso.
          line = max(line, (1.0 - smoothstep(0.0, 0.007, abs(abs(p.x) - 0.15))) * step(1.0, p.y) * step(p.y, 1.45));
          diffuseColor.rgb *= 1.0 - 0.35 * line;
          // A zip down the front, from the collar to the waist.
          float zip = (1.0 - smoothstep(0.004, 0.009, abs(p.x))) * step(0.0, p.z) * step(1.0, p.y) * step(p.y, 1.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.64, 0.68), zip);
        }`,
      )
  }
  material.customProgramCacheKey = () => 'suit-seams'
  material.needsUpdate = true
}
