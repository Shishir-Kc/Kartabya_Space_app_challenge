#!/usr/bin/env node
/**
 * Builds the Moon suit both astronauts wear on the lunar surface from a
 * static suit model, rigged onto each body's skeleton. Two models (profiles):
 *
 *   node tools/build-nasa-suit.mjs "<path to astronaut.glb>" artemis
 *     "astronaut" by omarkamel140 on Sketchfab, CC BY 4.0: the suit the game
 *     uses (https://sketchfab.com/3d-models/astronaut-7736b318582f447c9b8194e9c23d1347).
 *     Writes public/models/suit-artemis-<body>.glb.
 *
 *   node tools/build-nasa-suit.mjs "<path to Mark III Spacesuit.glb>" mark3
 *     NASA's Mark III Spacesuit (NASA 3D Resources, NASA origin, no
 *     copyright; credit NASA, no NASA logos), the earlier Moon suit:
 *     https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Mark%20III%20Spacesuit
 *     Writes public/models/suit-mark3-<body>.glb.
 *
 * Each file is the suit as one skinned mesh on that body's skeleton (same 65
 * joints and bind matrices as public/models/astronaut-<body>.glb), so the
 * game binds it to the astronaut's own bones and it plays every clip
 * (idle, walk, jog, sprint) and floating pose: that is how it is animated.
 * No Blender: the rigging is done here, in steps.
 *
 *   1. Reads the suit (a static mesh: the Mark III's arms reach forward,
 *      the Sketchfab astronaut stands in an A-pose), drops any NASA logo
 *      decal (no NASA insignia in the game), merges the flat-colour parts
 *      into one vertex-coloured part, makes the visor gold (the low Sun)
 *      and keeps helmet lamps as their own glowing part.
 *   2. Turns it to face the body's way, scales it so the helmet's top is
 *      HELMET_TOP times the body's height, and stands it on the floor
 *      round the pelvis.
 *   3. Simplifies it to about TARGET_TRIANGLES (meshoptimizer).
 *   4. Poses the body's skeleton into the suit: each upper arm and forearm
 *      aimed down the suit's sleeve, each thigh and shin down its leg.
 *   5. Weights every suit vertex from the nearest points of the posed body,
 *      then smooths the weights over the suit's surface. The helmet and
 *      visor are fixed to the upper chest (the Mark III's helmet is part of
 *      its hard upper torso; it doesn't turn with the head), the gloves to
 *      the hands and the boots to the feet.
 *   6. Undoes the pose: each vertex goes back through its own skinning, so
 *      the suit sits on the T-pose rest the clips were made for.
 *   7. Finds where the chest name tag and the shoulder patch go on the
 *      suit, and writes the model with them in its scene extras.
 */
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions'
import { dedup, dequantize, meshopt, prune, simplify, weld } from '@gltf-transform/functions'
import draco3d from 'draco3d'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three'

const GOLD_ROUGHNESS = 0.16
const GOLD_METALNESS = 0.95
/** Bone line radii for splitting points into arm and body (metres): a bulky sleeve and a bulky torso. */
const ARM_RADIUS = 0.11
const TORSO_RADIUS = 0.24
const SUIT_FILE = process.argv[2]
const PROFILE_ID = process.argv[3] ?? 'mark3'

/**
 * What differs between the suit models. `front`: the way the model faces
 * (+1 is +z). `part`: which group a material goes in ('suit', 'visor',
 * 'lamps', or null to leave it out). `trimVisor`: keep only the visor's
 * front half. `patchSide`: the upper arm the game's mission patch goes on.
 */
const PROFILES = {
  mark3: {
    out: 'suit-mark3',
    model: 'NASA Mark III Spacesuit (NASA 3D Resources)',
    front: -1,
    trimVisor: true,
    patchSide: 'l',
    rigidNode: () => false,
    splitArms: false,
    fitArms: false,
    fingers: false,
    helmetHalfWidth: 0.3,
    visor: { roughness: GOLD_ROUGHNESS, metalness: GOLD_METALNESS },
    // The NASA logo decal is the only textured part; the visor is the darkest part, high up.
    part: (material, colour, centreY, highest) =>
      material.getBaseColorTexture() !== null ? null : Math.max(colour[0], colour[1], colour[2]) < VISOR_DARKNESS && centreY > highest - 0.4 ? 'visor' : 'suit',
  },
  artemis: {
    out: 'suit-artemis',
    model: '"astronaut" by omarkamel140 (Sketchfab, CC BY 4.0)',
    front: 1,
    trimVisor: false,
    // Its left shoulder has a US flag; the right one a plain blue badge, where the game's patch goes.
    patchSide: 'r',
    part: (material) => (/visor/i.test(material.getName()) ? 'visor' : /lamp/i.test(material.getName()) ? 'lamps' : 'suit'),
    // The backpack (life support pack) is its own set of meshes: fixed to the upper chest, like the helmet.
    rigidNode: (name) => /materials\.002/.test(name),
    // Its arms hang close to the body (an A-pose), so the torso sits next to the arms: points are
    // split into arm and body by which bone line they are nearer, and never take weights across.
    splitArms: true,
    // Its arms hang to hip height: each arm is found from its glove and fitted shoulder to elbow to
    // wrist to glove, and the glove's fingers follow the finger bones, so they curl with the clips.
    fitArms: true,
    fingers: true,
    // The glove's fingers follow the finger bones only this much (the rest stays with the palm): a stiff
    // suit glove half-closes when the hand makes a fist, instead of crumpling into the cuff.
    fingerFollow: Number(process.env.SUIT_FINGER_FOLLOW ?? 0.35),
    // The gloves' material colour ("Rubber - charcoal"); the wrist displays are nearly as dark, but bluer.
    gloveColour: [0.0108164, 0.0134117, 0.0149306],
    // Half the helmet's width: above the neck, only this close to the middle is helmet (the shoulder tops are not).
    helmetHalfWidth: 0.2,
    // Less mirror-like, so the visor reads gold when there is nothing bright to reflect.
    visor: { roughness: 0.28, metalness: 0.55 },
  },
}
const PROFILE = PROFILES[PROFILE_ID]
if (!SUIT_FILE || !PROFILE) {
  console.error('Usage: node tools/build-nasa-suit.mjs "<suit.glb>" [artemis|mark3]')
  process.exit(1)
}
const MODELS = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models')

/** The helmet's top, as a multiple of the body's height (the male body is 1.82 m: the helmet tops out at 1.95 m). */
const HELMET_TOP = 1.95 / 1.82
const TARGET_TRIANGLES = Number(process.env.SUIT_TRIANGLES ?? 30000)
/**
 * Nearest body points blended for each suit vertex; then the weights are
 * smoothed in space (every suit vertex within SMOOTH_RADIUS, falling off
 * with distance) SMOOTHING times. In space, not along the surface: the
 * suit is many overlapping pieces (shells, rings, liners), and pieces
 * lying on top of each other must get the same weights or the inner one
 * pokes through the outer one when the body moves.
 */
const NEIGHBOURS = 8
const SMOOTHING = 3
const SMOOTH_RADIUS = 0.05
/** The Mark III's visor: the darkest part, high up. */
const VISOR_DARKNESS = 0.15
const GOLD = { color: [0.83, 0.6, 0.22] }
/** Helmet lamps glow cool white. */
const LAMP = { color: [0.77, 0.91, 1], emissive: 2.5 }

await MeshoptDecoder.ready
await MeshoptEncoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
    'draco3d.decoder': await draco3d.createDecoderModule({}),
  })

// ---------------------------------------------------------------- 1. The suit
/** Reads the suit into plain arrays in its own world space: one group each for the suit, the visor and any lamps. */
async function readSuit() {
  const doc = await io.read(SUIT_FILE)
  // Weld and simplify in place first: the file splits vertices at every seam.
  for (const material of doc.getRoot().listMaterials()) {
    if (PROFILE.part(material, material.getBaseColorFactor(), 0, 0) === null) for (const primitive of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) if (primitive.getMaterial() === material) primitive.dispose()
  }
  let before = 0
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) before += p.getIndices().getCount() / 3
  await doc.transform(weld({ tolerance: 0.0005 }), simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, TARGET_TRIANGLES / before), error: 0.004, lockBorder: false }))

  const groups = { suit: { p: [], n: [], c: [], i: [], r: [] }, visor: { p: [], n: [], c: [], i: [], r: [] }, lamps: { p: [], n: [], c: [], i: [], r: [] } }
  let highest = -Infinity
  const parts = []
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const world = new Matrix4().fromArray(node.getWorldMatrix())
    const normalMatrix = new Matrix3().getNormalMatrix(world)
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial()
      const position = primitive.getAttribute('POSITION')
      const normal = primitive.getAttribute('NORMAL')
      const points = []
      const normals = []
      const v = new Vector3()
      for (let k = 0; k < position.getCount(); k++) {
        v.fromArray(position.getElement(k, [])).applyMatrix4(world)
        points.push(v.toArray())
        highest = Math.max(highest, v.y)
        normals.push(v.fromArray(normal.getElement(k, [])).applyMatrix3(normalMatrix).normalize().toArray())
      }
      parts.push({ material, points, normals, indices: Array.from(primitive.getIndices().getArray()), rigid: PROFILE.rigidNode(node.getName()) })
    }
  }
  for (const part of parts) {
    const colour = part.material.getBaseColorFactor()
    const centreY = part.points.reduce((s, p) => s + p[1], 0) / part.points.length
    const kind = PROFILE.part(part.material, colour, centreY, highest)
    if (!kind) continue
    const group = groups[kind]
    const offset = group.p.length
    for (let k = 0; k < part.points.length; k++) {
      group.p.push(part.points[k])
      group.n.push(part.normals[k])
      group.c.push(kind === 'suit' ? [colour[0], colour[1], colour[2]] : [1, 1, 1])
      group.r.push(part.rigid ? 1 : 0)
    }
    for (const index of part.indices) group.i.push(index + offset)
  }
  return { groups, before }
}

// ---------------------------------------------------------------- The body
async function readBody(variant) {
  const doc = await io.read(join(MODELS, `astronaut-${variant}.glb`))
  await doc.transform(dequantize())
  const root = doc.getRoot()
  // The body mesh's own skin: its bind matrices also undo the file's mesh compression.
  const bodyNode = root.listNodes().find((n) => n.getName() === 'Body')
  const skin = bodyNode.getSkin()
  const joints = skin.listJoints()
  const names = joints.map((j) => j.getName())
  const ibm = joints.map((_, j) => new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(j, [])))
  // Each joint's local transform and parent (by joint index, or the world matrix of a non-joint parent).
  const index = new Map(joints.map((j, k) => [j, k]))
  const parentOf = new Map()
  for (const node of root.listNodes()) for (const child of node.listChildren()) parentOf.set(child, node)
  const local = joints.map((j) => new Matrix4().compose(new Vector3(...j.getTranslation()), new Quaternion(...j.getRotation()), new Vector3(...j.getScale())))
  const parent = joints.map((j) => {
    const p = parentOf.get(j)
    return p && index.has(p) ? index.get(p) : -1
  })
  const base = joints.map((j) => {
    const p = parentOf.get(j)
    return p && !index.has(p) ? new Matrix4().fromArray(p.getWorldMatrix()) : new Matrix4()
  })
  // The body mesh (skin and outfit): points with their skinning.
  const points = []
  for (const primitive of bodyNode.getMesh().listPrimitives()) {
    const position = primitive.getAttribute('POSITION')
    const j0 = primitive.getAttribute('JOINTS_0')
    const w0 = primitive.getAttribute('WEIGHTS_0')
    for (let k = 0; k < position.getCount(); k++) points.push({ p: position.getElement(k, []), j: j0.getElement(k, []), w: w0.getElement(k, []) })
  }
  return { doc, names, ibm, local, parent, base, points, info: root.listScenes()[0].getExtras().astronaut }
}

/** World matrices of every joint from local transforms (parents come before children in the list order? not guaranteed: resolve recursively). */
function worldMatrices(body, local) {
  const out = new Array(local.length)
  const solve = (k) => {
    if (out[k]) return out[k]
    const p = body.parent[k]
    out[k] = (p >= 0 ? solve(p).clone() : body.base[k].clone()).multiply(local[k])
    return out[k]
  }
  for (let k = 0; k < local.length; k++) solve(k)
  return out
}

const position = (m) => new Vector3().setFromMatrixPosition(m)

/** Turns joint `k` (in world space) so its child's position moves onto the line toward `target`. */
function aim(body, local, k, child, target) {
  const world = worldMatrices(body, local)
  const from = position(world[k])
  const current = position(world[child]).sub(from).normalize()
  const wanted = target.clone().sub(from).normalize()
  const turn = new Quaternion().setFromUnitVectors(current, wanted)
  const worldRotation = new Quaternion().setFromRotationMatrix(world[k])
  const parentWorld = body.parent[k] >= 0 ? world[body.parent[k]] : body.base[k]
  const parentRotation = new Quaternion().setFromRotationMatrix(parentWorld)
  const localRotation = parentRotation.invert().multiply(turn.multiply(worldRotation))
  const t = new Vector3()
  const s = new Vector3()
  local[k].decompose(t, new Quaternion(), s)
  local[k].compose(t, localRotation, s)
}

function centroid(points) {
  const c = new Vector3()
  for (const p of points) c.add(p)
  return points.length ? c.divideScalar(points.length) : null
}

// ---------------------------------------------------------------- Build one body's suit
async function build(variant, suitSource) {
  const body = await readBody(variant)
  const J = (name) => body.names.indexOf(name)
  const rest = worldMatrices(body, body.local)
  const at = (name) => position(rest[J(name)])
  const height = body.info.height
  const forward = body.info.forward[2] > 0 ? 1 : -1

  // 2. Face the body's way, scale and stand it round the pelvis.
  const all = [...suitSource.groups.suit.p, ...suitSource.groups.visor.p, ...suitSource.groups.lamps.p]
  const min = all.reduce((m, p) => Math.min(m, p[1]), Infinity)
  const max = all.reduce((m, p) => Math.max(m, p[1]), -Infinity)
  const scale = (height * HELMET_TOP) / (max - min)
  // Turn it half round if it faces the other way from the body.
  const turn = forward === PROFILE.front ? 1 : -1
  const place = (p) => new Vector3(p[0] * turn * scale, (p[1] - min) * scale, p[2] * turn * scale)
  const pelvis = at('pelvis')
  // Centred on the legs at knee height (the hands hang near the hips, so the hips can't be used).
  const kneeY = (at('calf_l').y + at('calf_r').y) / 2
  const knees = []
  for (const p of suitSource.groups.suit.p) {
    const q = place(p)
    if (Math.abs(q.y - kneeY) < 0.05) knees.push(q)
  }
  const kneeCentre = centroid(knees)
  const kneeMid = at('calf_l').add(at('calf_r')).multiplyScalar(0.5)
  const shift = new Vector3(kneeMid.x - kneeCentre.x, 0, kneeMid.z - kneeCentre.z)
  const groups = {}
  for (const [name, g] of Object.entries(suitSource.groups)) {
    groups[name] = {
      p: g.p.map((p) => place(p).add(shift)),
      n: g.n.map((n) => new Vector3(n[0] * turn, n[1], n[2] * turn).normalize()),
      c: g.c,
      i: g.i,
      r: g.r,
    }
  }
  // The Mark III's visor is nearly a whole bubble inside the helmet: only its front half is ever meant to show.
  if (PROFILE.trimVisor) {
    const head = at('Head')
    const g = groups.visor
    const kept = []
    for (let t = 0; t < g.i.length; t += 3) {
      const z = (g.p[g.i[t]].z + g.p[g.i[t + 1]].z + g.p[g.i[t + 2]].z) / 3
      if ((z - head.z) * forward > 0.02) kept.push(g.i[t], g.i[t + 1], g.i[t + 2])
    }
    g.i = kept
  }
  const suitPoints = groups.suit.p

  // 4. Pose the skeleton into the suit.
  const local = body.local.map((m) => m.clone())
  const suitColours = groups.suit.c
  for (const side of ['l', 'r']) {
    const sign = side === 'l' ? 1 : -1
    const shoulder = at(`upperarm_${side}`)
    if (PROFILE.fitArms) {
      fitArm(side, sign, shoulder)
      continue
    }
    const arm = suitPoints.filter((p) => p.x * sign > Math.abs(shoulder.x) + 0.04 && p.y > pelvis.y + 0.1)
    const reach = Math.max(...arm.map((p) => p.distanceTo(shoulder)))
    const band = (a, b) => centroid(arm.filter((p) => {
      const d = p.distanceTo(shoulder) / reach
      return d >= a && d <= b
    }))
    const elbow = band(0.45, 0.55)
    const wrist = band(0.78, 0.86)
    if (process.env.SUIT_DEBUG) {
      const bodyElbow = at(`lowerarm_${side}`).distanceTo(shoulder)
      const bodyWrist = at(`hand_${side}`).distanceTo(shoulder)
      const bodyTip = at(`middle_03_${side}`)?.distanceTo(shoulder)
      console.log(`${variant} ${side}: suit elbow ${elbow.distanceTo(shoulder).toFixed(3)} body ${bodyElbow.toFixed(3)}; suit wrist ${wrist.distanceTo(shoulder).toFixed(3)} body ${bodyWrist.toFixed(3)}; suit tip ${reach.toFixed(3)} body middle_03 ${bodyTip?.toFixed(3)}`)
    }
    aim(body, local, J(`upperarm_${side}`), J(`lowerarm_${side}`), elbow)
    const posedElbow = position(worldMatrices(body, local)[J(`lowerarm_${side}`)])
    aim(body, local, J(`lowerarm_${side}`), J(`hand_${side}`), posedElbow.clone().add(wrist.clone().sub(elbow)).lerp(wrist, 0.5))
    const hip = at(`thigh_${side}`)
    const leg = suitPoints.filter((p) => p.x * sign > 0.02 && p.y < pelvis.y - 0.12)
    const knee = centroid(leg.filter((p) => Math.abs(p.y - at(`calf_${side}`).y) < 0.04))
    const ankle = centroid(leg.filter((p) => Math.abs(p.y - (at(`foot_${side}`).y + 0.06)) < 0.03))
    if (knee) aim(body, local, J(`thigh_${side}`), J(`calf_${side}`), knee)
    if (ankle) aim(body, local, J(`calf_${side}`), J(`foot_${side}`), ankle)
    void hip
  }
  /**
   * Fits one arm of a suit whose arms hang down (fitArms). The glove is the dark part out past the
   * shoulder; the wrist is where it starts. The elbow is the sleeve's middle at the body's own
   * elbow-to-wrist proportion. The upper arm, forearm and hand are aimed at elbow, wrist and glove.
   */
  function fitArm(side, sign, shoulder) {
    const dark = (k) => suitColours[k].every((c, i) => Math.abs(c - PROFILE.gloveColour[i]) < 0.001)
    const glove = []
    suitPoints.forEach((p, k) => {
      if (dark(k) && p.x * sign > Math.abs(shoulder.x) + 0.25) glove.push(p)
    })
    if (glove.length < 50) throw new Error(`No ${side} glove found`)
    const nearest = Math.min(...glove.map((p) => p.distanceTo(shoulder)))
    const wrist = centroid(glove.filter((p) => p.distanceTo(shoulder) < nearest + 0.025))
    const gloveCentre = centroid(glove)
    const bodyRatio = at(`lowerarm_${side}`).distanceTo(shoulder) / at(`hand_${side}`).distanceTo(shoulder)
    const sleeveLength = wrist.distanceTo(shoulder)
    const axis = wrist.clone().sub(shoulder).normalize()
    const sleeve = suitPoints.filter((p) => {
      const v = p.clone().sub(shoulder)
      const t = v.dot(axis)
      return Math.abs(t - bodyRatio * sleeveLength) < 0.025 && v.addScaledVector(axis, -t).length() < 0.16
    })
    const elbow = centroid(sleeve)
    if (process.env.SUIT_DEBUG) {
      const ds = glove.map((p) => p.distanceTo(wrist)).sort((a, b) => a - b)
      const q = (f) => ds[Math.floor(f * (ds.length - 1))].toFixed(3)
      const ys = glove.map((p) => p.y)
      console.log(`  glove from wrist: p10 ${q(0.1)} p50 ${q(0.5)} p90 ${q(0.9)} max ${q(1)}; y ${Math.min(...ys).toFixed(2)}..${Math.max(...ys).toFixed(2)}; x ${Math.min(...glove.map((p) => p.x * sign)).toFixed(2)}..${Math.max(...glove.map((p) => p.x * sign)).toFixed(2)}; wrist ${wrist.toArray().map((x) => x.toFixed(2))}`)
      console.log(
        `${variant} ${side}: suit elbow ${elbow.distanceTo(shoulder).toFixed(3)} body ${at(`lowerarm_${side}`).distanceTo(shoulder).toFixed(3)};` +
          ` suit wrist ${sleeveLength.toFixed(3)} body ${at(`hand_${side}`).distanceTo(shoulder).toFixed(3)};` +
          ` glove ${glove.length} points, centre ${gloveCentre.distanceTo(wrist).toFixed(3)} past the wrist`,
      )
    }
    aim(body, local, J(`upperarm_${side}`), J(`lowerarm_${side}`), elbow)
    aim(body, local, J(`lowerarm_${side}`), J(`hand_${side}`), wrist)
    aim(body, local, J(`hand_${side}`), J(`middle_01_${side}`), gloveCentre)
  }
  const posed = worldMatrices(body, local)
  const skinning = posed.map((m, k) => m.clone().multiply(body.ibm[k]))

  // The posed body: where each of its points is now.
  const posedBody = body.points.map(({ p, j, w }) => {
    const v = new Vector3(...p)
    const out = new Vector3()
    for (let k = 0; k < 4; k++) if (w[k] > 0) out.addScaledVector(v.clone().applyMatrix4(skinning[j[k]]), w[k])
    return { p: out, j, w }
  })

  // 5. Weights: from the nearest posed body points, by joint name kept to the bones that matter.
  const remap = (name) => {
    const m = /^(index|middle|pinky|ring|thumb)_(\d+)(_leaf)?_([lr])$/.exec(name)
    // With PROFILE.fingers the glove's fingers follow the finger bones (a leaf bone counts as the one before it).
    if (m && PROFILE.fingers) return m[3] ? `${m[1]}_0${Number(m[2]) - 1}_${m[4]}` : name
    if (m) return `hand_${m[4]}`
    const ball = /^ball(_leaf)?_([lr])$/.exec(name)
    if (ball) return `foot_${ball[2]}`
    if (/^(neck_01|Head)$/.test(name) || /^Head_leaf$/.test(name)) return 'spine_03'
    return name.replace(/_leaf/, '')
  }
  const target = body.names.map((name) => Math.max(0, J(remap(name))))
  const neck = at('neck_01')
  const jointCount = body.names.length
  const n = groups.suit.p.length + groups.visor.p.length + groups.lamps.p.length
  const all3 = [...groups.suit.p, ...groups.visor.p, ...groups.lamps.p]
  const weights = new Float32Array(n * jointCount)
  const rigid = new Uint8Array(n)
  const chest = J('spine_03')
  const bodyX = new Float32Array(posedBody.length * 3)
  posedBody.forEach((b, k) => b.p.toArray(bodyX, k * 3))
  const allRigid = [...groups.suit.r, ...groups.visor.r, ...groups.lamps.r]

  // Arm or body: which bone line (posed) a point is nearer, each scaled by how thick that part is.
  const ARM_JOINT = /^(?:upperarm|lowerarm|hand|(?:index|middle|pinky|ring|thumb)_\d+)_([lr])$/
  const remapped = body.names.map((name, k) => body.names[target[k]])
  const posedAt = (name) => position(posed[J(name)])
  const segment = (p, a, b) => {
    const ab = b.clone().sub(a)
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()))
    return p.distanceTo(a.clone().addScaledVector(ab, t))
  }
  const line = (p, points) => {
    let d = Infinity
    for (let i = 0; i + 1 < points.length; i++) d = Math.min(d, segment(p, points[i], points[i + 1]))
    return d
  }
  const armLines = Object.fromEntries(
    ['l', 'r'].map((side) => {
      const elbow = posedAt(`lowerarm_${side}`)
      const wrist = posedAt(`hand_${side}`)
      const fingertip = wrist.clone().add(wrist.clone().sub(elbow).setLength(0.2))
      return [side, [posedAt(`upperarm_${side}`), elbow, wrist, fingertip]]
    }),
  )
  const torsoLine = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'].map(posedAt)
  /** 'l' or 'r' for a point on that arm, null for the body (only with PROFILE.splitArms). */
  const armOf = (p) => {
    if (!PROFILE.splitArms) return undefined
    const torso = line(p, torsoLine) / TORSO_RADIUS
    let side = null
    let best = torso
    for (const s of ['l', 'r']) {
      const d = line(p, armLines[s]) / ARM_RADIUS
      if (d < best) {
        best = d
        side = s
      }
    }
    return side
  }
  /** The arm a body point's strongest joint belongs to, or null. */
  const pointArm = posedBody.map((b) => {
    let k = 0
    for (let i = 1; i < 4; i++) if (b.w[i] > b.w[k]) k = i
    return ARM_JOINT.exec(remapped[b.j[k]])?.[1] ?? null
  })
  const isArmJoint = remapped.map((name) => ARM_JOINT.exec(name)?.[1] ?? null)
  /** For a finger joint (when the glove follows the fingers): its hand's joint index; else 0. */
  const fingerOf = body.names.map((name) => {
    const m = PROFILE.fingers && /^(?:index|middle|pinky|ring|thumb)_\d+_([lr])$/.exec(name)
    return m ? J(`hand_${m[1]}`) : 0
  })

  for (let v = 0; v < n; v++) {
    const p = all3[v]
    const helmetPart = v >= groups.suit.p.length
    // The helmet, visor and lamps (and the backpack, when it is its own part): fixed to the upper chest.
    if (helmetPart || allRigid[v] || (p.y > neck.y - 0.03 && Math.abs(p.x) < PROFILE.helmetHalfWidth)) {
      weights[v * jointCount + chest] = 1
      rigid[v] = 1
      continue
    }
    const arm = armOf(p)
    const best = new Array(NEIGHBOURS).fill(null).map(() => ({ d: Infinity, k: -1 }))
    for (let k = 0; k < posedBody.length; k++) {
      // Arm points only learn from that arm, body points never from an arm.
      if (arm !== undefined && pointArm[k] !== arm) continue
      const dx = bodyX[k * 3] - p.x
      const dy = bodyX[k * 3 + 1] - p.y
      const dz = bodyX[k * 3 + 2] - p.z
      const d = dx * dx + dy * dy + dz * dz
      if (d < best[NEIGHBOURS - 1].d) {
        let i = NEIGHBOURS - 1
        while (i > 0 && best[i - 1].d > d) {
          best[i] = best[i - 1]
          i--
        }
        best[i] = { d, k }
      }
    }
    for (const { d, k } of best) {
      if (k < 0) continue
      const b = posedBody[k]
      const f = 1 / (d + 1e-6)
      for (let i = 0; i < 4; i++) {
        if (!(b.w[i] > 0)) continue
        const joint = target[b.j[i]]
        // A body point never takes an arm bone; an arm point never a bone of the other arm.
        if (arm === null && isArmJoint[b.j[i]]) continue
        if (arm && isArmJoint[b.j[i]] && isArmJoint[b.j[i]] !== arm) continue
        if (fingerOf[joint]) {
          // A glove finger: partly the finger, partly the palm (PROFILE.fingerFollow).
          weights[v * jointCount + joint] += f * b.w[i] * PROFILE.fingerFollow
          weights[v * jointCount + fingerOf[joint]] += f * b.w[i] * (1 - PROFILE.fingerFollow)
          continue
        }
        weights[v * jointCount + joint] += f * b.w[i]
      }
    }
  }
  // Smooth in space: a grid of SMOOTH_RADIUS cells finds each vertex's neighbours, on any piece.
  const normalise = (w, v) => {
    let sum = 0
    for (let j = 0; j < jointCount; j++) sum += w[v * jointCount + j]
    if (sum > 0) for (let j = 0; j < jointCount; j++) w[v * jointCount + j] /= sum
  }
  // A point that found nothing to learn from (every neighbour filtered out) goes with the chest.
  for (let v = 0; v < n; v++) {
    let sum = 0
    for (let j = 0; j < jointCount; j++) sum += weights[v * jointCount + j]
    if (sum === 0) weights[v * jointCount + chest] = 1
  }
  for (let v = 0; v < n; v++) normalise(weights, v)
  const cell = (p) => `${Math.floor(p.x / SMOOTH_RADIUS)},${Math.floor(p.y / SMOOTH_RADIUS)},${Math.floor(p.z / SMOOTH_RADIUS)}`
  const grid = new Map()
  all3.forEach((p, v) => {
    const key = cell(p)
    const list = grid.get(key)
    if (list) list.push(v)
    else grid.set(key, [v])
  })
  const nearby = all3.map((p) => {
    const cx = Math.floor(p.x / SMOOTH_RADIUS)
    const cy = Math.floor(p.y / SMOOTH_RADIUS)
    const cz = Math.floor(p.z / SMOOTH_RADIUS)
    const found = []
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const u of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            const d = all3[u].distanceTo(p)
            if (d < SMOOTH_RADIUS) found.push([u, 1 - d / SMOOTH_RADIUS])
          }
    return found
  })
  let current = weights
  for (let pass = 0; pass < SMOOTHING; pass++) {
    const next = new Float32Array(current.length)
    for (let v = 0; v < n; v++) {
      if (rigid[v]) {
        next.set(current.subarray(v * jointCount, (v + 1) * jointCount), v * jointCount)
        continue
      }
      let total = 0
      for (const [u, f] of nearby[v]) {
        total += f
        for (let j = 0; j < jointCount; j++) next[v * jointCount + j] += current[u * jointCount + j] * f
      }
      for (let j = 0; j < jointCount; j++) next[v * jointCount + j] /= total
    }
    current = next
  }
  // Keep the four strongest per vertex.
  const joints4 = new Uint16Array(n * 4)
  const weights4 = new Float32Array(n * 4)
  for (let v = 0; v < n; v++) {
    const list = []
    for (let j = 0; j < jointCount; j++) if (current[v * jointCount + j] > 1e-4) list.push([j, current[v * jointCount + j]])
    list.sort((a, b) => b[1] - a[1])
    const top = list.slice(0, 4)
    const sum = top.reduce((s, x) => s + x[1], 0) || 1
    top.forEach(([j, w], i) => {
      joints4[v * 4 + i] = j
      weights4[v * 4 + i] = w / sum
    })
  }

  // 6. Undo the pose: each vertex goes back through its own skinning. The joints' moves (rest to posed)
  // are blended as dual quaternions, which always gives a rigid move, so it can be undone exactly even
  // where an arm turned 90 degrees next to a chest that didn't (blending matrices there collapses them).
  // The file's positions are in the skin's compressed space: world = Q * file, the same Q for every joint.
  const Q = rest[0].clone().multiply(body.ibm[0])
  const Qinverse = Q.clone().invert()
  const moves = posed.map((m, k) => {
    const d = m.clone().multiply(rest[k].clone().invert())
    const t = new Vector3()
    const r = new Quaternion()
    d.decompose(t, r, new Vector3())
    // Dual part: 0.5 * (t, 0) * r.
    const tq = new Quaternion(t.x, t.y, t.z, 0)
    const dual = tq.multiply(r)
    return { r, dual: new Quaternion(dual.x * 0.5, dual.y * 0.5, dual.z * 0.5, dual.w * 0.5) }
  })
  const restP = new Float32Array(n * 3)
  const restN = new Float32Array(n * 3)
  const worldRest = []
  const allN = [...groups.suit.n, ...groups.visor.n, ...groups.lamps.n]
  for (let v = 0; v < n; v++) {
    const real = new Quaternion(0, 0, 0, 0)
    const dual = new Quaternion(0, 0, 0, 0)
    const first = moves[joints4[v * 4]].r
    for (let i = 0; i < 4; i++) {
      const w = weights4[v * 4 + i]
      if (!w) continue
      const m = moves[joints4[v * 4 + i]]
      const s = first.dot(m.r) < 0 ? -w : w
      real.set(real.x + m.r.x * s, real.y + m.r.y * s, real.z + m.r.z * s, real.w + m.r.w * s)
      dual.set(dual.x + m.dual.x * s, dual.y + m.dual.y * s, dual.z + m.dual.z * s, dual.w + m.dual.w * s)
    }
    const length = Math.hypot(real.x, real.y, real.z, real.w)
    real.set(real.x / length, real.y / length, real.z / length, real.w / length)
    dual.set(dual.x / length, dual.y / length, dual.z / length, dual.w / length)
    // Translation: 2 * dual * conj(real).
    const tq = dual.clone().multiply(real.clone().conjugate())
    const t = new Vector3(tq.x * 2, tq.y * 2, tq.z * 2)
    const back = real.clone().invert()
    const w = all3[v].clone().sub(t).applyQuaternion(back)
    worldRest.push(w)
    w.clone().applyMatrix4(Qinverse).toArray(restP, v * 3)
    allN[v].clone().applyQuaternion(back).normalize().toArray(restN, v * 3)
  }

  // 7. Anchors for the name tag (left chest) and the patch (left upper arm, outside) on the rest suit, in model metres.
  const restPoint = (v) => worldRest[v]
  const restWorldNormal = (v) => new Vector3(restN[v * 3], restN[v * 3 + 1], restN[v * 3 + 2])
  const suitCount = groups.suit.p.length
  const surface = (filter, score) => {
    let best = -1
    let bestScore = -Infinity
    for (let v = 0; v < suitCount; v++) {
      const p = restPoint(v)
      if (!filter(p)) continue
      const s = score(p)
      if (s > bestScore) {
        bestScore = s
        best = v
      }
    }
    if (best < 0) throw new Error('No suit surface found for an anchor')
    const p = restPoint(best)
    const normal = new Vector3()
    for (let v = 0; v < suitCount; v++) if (restPoint(v).distanceTo(p) < 0.03) normal.add(restWorldNormal(v))
    return { position: p.toArray(), normal: normal.normalize().toArray() }
  }
  const chestY = at('spine_03').y + 0.1
  const nameTag = surface((p) => Math.abs(p.x - 0.1) < 0.025 && Math.abs(p.y - chestY) < 0.025, (p) => p.z * forward)
  const side = PROFILE.patchSide
  const out = side === 'l' ? 1 : -1
  const upper = at(`upperarm_${side}`)
  // The top of the upper arm in the T-pose (its outside once the arm hangs down), a hand's width out from the shoulder joint.
  const patch = surface(
    (p) => Math.abs(p.x - (upper.x + 0.12 * out)) < 0.025 && Math.abs(p.z - upper.z) < 0.05 && p.y > upper.y - 0.02 && p.y < upper.y + 0.16,
    (p) => p.y,
  )

  // Write: the body's own file, its skin kept, with the suit as the only mesh.
  const doc = body.doc
  const root = doc.getRoot()
  for (const node of root.listNodes()) if (node.getMesh() && node.getName() !== 'Body') node.dispose()
  for (const animation of root.listAnimations()) animation.dispose()
  const bodyNode = root.listNodes().find((node) => node.getName() === 'Body')
  for (const primitive of bodyNode.getMesh().listPrimitives()) primitive.dispose()
  const buffer = root.listBuffers()[0]
  const accessor = (name, type, array) => doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer)
  const suitMaterial = doc.createMaterial('MoonSuit').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.82).setMetallicFactor(0)
  const visorMaterial = doc.createMaterial('Visor').setBaseColorFactor([...GOLD.color, 1]).setRoughnessFactor(PROFILE.visor.roughness).setMetallicFactor(PROFILE.visor.metalness)
  const lampMaterial = doc.createMaterial('Lamps').setBaseColorFactor([...LAMP.color, 1]).setEmissiveFactor(LAMP.color).setRoughnessFactor(0.3).setMetallicFactor(0)
  if (groups.lamps.p.length) {
    const strength = doc.createExtension(KHRMaterialsEmissiveStrength).createEmissiveStrength().setEmissiveStrength(LAMP.emissive)
    lampMaterial.setExtension('KHR_materials_emissive_strength', strength)
  }
  const colours = new Float32Array(n * 3)
  ;[...groups.suit.c, ...groups.visor.c, ...groups.lamps.c].forEach((c, v) => colours.set(c, v * 3))
  const shared = {
    POSITION: accessor('position', 'VEC3', restP),
    NORMAL: accessor('normal', 'VEC3', restN),
    COLOR_0: accessor('colour', 'VEC3', colours),
    JOINTS_0: accessor('joints', 'VEC4', joints4),
    WEIGHTS_0: accessor('weights', 'VEC4', weights4),
  }
  const IndexArray = n > 65535 ? Uint32Array : Uint16Array
  const visorCount = groups.visor.p.length
  for (const [name, list, material] of [
    ['suit', groups.suit.i, suitMaterial],
    ['visor', groups.visor.i.map((i) => i + suitCount), visorMaterial],
    ['lamps', groups.lamps.i.map((i) => i + suitCount + visorCount), lampMaterial],
  ]) {
    if (list.length === 0) continue
    const primitive = doc.createPrimitive().setMaterial(material).setIndices(accessor(`${name}-indices`, 'SCALAR', new IndexArray(list)))
    for (const [semantic, value] of Object.entries(shared)) primitive.setAttribute(semantic, value)
    bodyNode.getMesh().addPrimitive(primitive)
  }
  const triangles = (groups.suit.i.length + groups.visor.i.length + groups.lamps.i.length) / 3
  root.listScenes()[0].setExtras({
    moonSuit: {
      variant,
      model: PROFILE.model,
      triangles,
      anchors: {
        nameTag: { bone: 'spine_03', ...nameTag, up: [0, 1, 0], width: 0.12 },
        // "Up" on the patch points back toward the shoulder (the arm runs out along x in the T-pose).
        patch: { bone: `upperarm_${side}`, ...patch, up: [-out, 0, 0], width: 0.085 },
      },
    },
  })
  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  const file = join(MODELS, `${PROFILE.out}-${variant}.glb`)
  await io.write(file, doc)

  // Report: rest pose sanity (arms out sideways, standing on the floor), in world metres.
  let restMin = Infinity
  let restMax = -Infinity
  let reachL = -Infinity
  for (let v = 0; v < n; v++) {
    const w = worldRest[v]
    restMin = Math.min(restMin, w.y)
    restMax = Math.max(restMax, w.y)
    reachL = Math.max(reachL, w.x)
  }
  console.log(
    `${variant}: ${triangles} triangles, ${n} vertices, ${(statSync(file).size / 1024).toFixed(0)} KB;` +
      ` rest height ${restMin.toFixed(2)}..${restMax.toFixed(2)} m, left reach x ${reachL.toFixed(2)} m (hand at ${at('middle_01_l').x.toFixed(2)});` +
      ` name tag at ${nameTag.position.map((x) => x.toFixed(2))}, patch at ${patch.position.map((x) => x.toFixed(2))}`,
  )
}

const suit = await readSuit()
console.log(`${PROFILE.model}: ${suit.before} triangles in the file, simplified to ${(suit.groups.suit.i.length + suit.groups.visor.i.length + suit.groups.lamps.i.length) / 3}`)
for (const variant of ['male', 'female']) await build(variant, suit)
void readFileSync
void Document
