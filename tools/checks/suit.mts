/**
 * Checks for the Moon suit files the game wears (suit-artemis-<body>.glb),
 * run headless with `npx tsx tools/checks/suit.mts`:
 * one per body, on that body's exact skeleton and bind matrices, inside the
 * triangle and size budget, no textures (so no NASA logo or flag), every
 * vertex weighted, and the name tag and patch spots on the suit.
 *
 * How it moves in every clip is checked by eye in a dev build (both bodies,
 * front and back, every clip); see README "Rebuilding the models".
 */
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dequantize } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'

const MODELS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'models')
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

let failed = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed++
}

for (const variant of ['male', 'female']) {
  const file = join(MODELS, `suit-artemis-${variant}.glb`)
  const suit = await io.read(file)
  await suit.transform(dequantize())
  const body = await io.read(join(MODELS, `astronaut-${variant}.glb`))
  const root = suit.getRoot()
  const info = root.listScenes()[0].getExtras().moonSuit as any
  check(info?.variant === variant, `${variant}: the file says which body it fits`)
  const size = statSync(file).size
  check(size < 1.2 * 1024 * 1024, `${variant}: compressed GLB, ${(size / 1024).toFixed(0)} KB`)
  const primitives = root.listMeshes().flatMap((m) => m.listPrimitives())
  const triangles = primitives.reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? 0) / 3, 0)
  check(triangles >= 25000 && triangles <= 35000, `${variant}: ${triangles} triangles (budget 25,000 to 35,000)`)
  check(root.listTextures().length === 0, `${variant}: no textures, so no NASA logo image`)
  check(root.listAnimations().length === 0, `${variant}: no clips of its own (it plays the body's)`)
  check(primitives.map((p) => p.getMaterial()?.getName()).sort().join() === 'Lamps,MoonSuit,Visor', `${variant}: three parts, the suit, the gold visor and the glowing helmet lamps`)
  check(/omarkamel140/.test(info?.model ?? ''), `${variant}: the file credits the model's author (CC BY 4.0)`)

  // The same skeleton and bind matrices as the body, so it binds to the body's own bones.
  const skin = root.listSkins()[0]
  const bodySkin = body.getRoot().listNodes().find((n) => n.getName() === 'Body')!.getSkin()!
  const names = skin.listJoints().map((j) => j.getName())
  check(names.join() === bodySkin.listJoints().map((j) => j.getName()).join(), `${variant}: the suit's 65 joints are the body's, in order`)
  // Bound in the body's rest pose: each joint's rest world matrix times the suit's bind matrix is one
  // and the same transform for every joint (only the file's own position compression, the same for all).
  const restWorld = (name: string) => body.getRoot().listNodes().find((n) => n.getName() === name)!.getWorldMatrix()
  const multiply = (a: number[], b: number[]) => {
    const out = new Array(16).fill(0)
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r]! * b[c * 4 + k]!
    return out
  }
  const shared = names.map((name, k) => multiply(restWorld(name) as number[], skin.getInverseBindMatrices()!.getElement(k, []) as number[]))
  let spread = 0
  for (const m of shared) for (let i = 0; i < 16; i++) spread = Math.max(spread, Math.abs(m[i]! - shared[0]![i]!))
  check(spread < 1e-3, `${variant}: the suit is bound in the body's own rest pose (largest spread ${spread.toExponential(1)})`)

  // Every vertex weighted, weights summing to one, only on joints that exist.
  let bad = 0
  let unused = 0
  const used = new Set<string>()
  for (const p of primitives) {
    const joints = p.getAttribute('JOINTS_0')!
    const weights = p.getAttribute('WEIGHTS_0')!
    for (let v = 0; v < joints.getCount(); v++) {
      const j = joints.getElement(v, [])
      const w = weights.getElement(v, [])
      const sum = w.reduce((s, x) => s + x, 0)
      if (Math.abs(sum - 1) > 0.01 || j.some((x) => x >= names.length)) bad++
      j.forEach((x, i) => w[i]! > 0.01 && used.add(names[x]!))
    }
  }
  void unused
  check(bad === 0, `${variant}: every vertex is weighted to real joints, weights summing to one (${bad} bad)`)
  for (const bone of ['spine_03', 'upperarm_l', 'lowerarm_r', 'hand_l', 'thigh_r', 'calf_l', 'foot_r']) check(used.has(bone), `${variant}: the suit moves with ${bone}`)
  check([...used].some((name) => /^(index|middle|pinky|ring|thumb)_/.test(name)), `${variant}: the gloves' fingers curl with the finger bones`)
  // ...but only part way (the rest stays with the palm), so a fist half-closes the stiff glove instead of crumpling it.
  let crumple = 0
  for (const p of primitives) {
    const joints = p.getAttribute('JOINTS_0')!
    const weights = p.getAttribute('WEIGHTS_0')!
    for (let v = 0; v < joints.getCount(); v++) {
      const j = joints.getElement(v, [])
      const w = weights.getElement(v, [])
      const finger = j.reduce((sum, joint, i) => sum + (/^(index|middle|pinky|ring|thumb)_/.test(names[joint]!) ? w[i]! : 0), 0)
      if (finger > 0.45) crumple++
    }
  }
  check(crumple === 0, `${variant}: no glove point follows the fingers more than 45% (${crumple} do)`)
  check(!used.has('Head') && !used.has('neck_01'), `${variant}: the helmet is fixed to the chest (nothing follows the head or neck)`)

  // The backpack (everything over 30 cm behind the spine) rides on the chest alone: an arm bone pulling
  // on it is what made the suit hunch over.
  // World position = Q * file position, Q being any joint's rest world matrix times its bind matrix.
  const Q = shared[0]!
  const forward = (body.getRoot().listScenes()[0]!.getExtras() as any).astronaut.forward[2] > 0 ? 1 : -1
  let pack = 0
  let pulled = 0
  for (const p of primitives) {
    const position = p.getAttribute('POSITION')!
    const joints = p.getAttribute('JOINTS_0')!
    const weights = p.getAttribute('WEIGHTS_0')!
    for (let v = 0; v < position.getCount(); v++) {
      const [x, y, z] = position.getElement(v, []) as number[]
      const wy = Q[1]! * x! + Q[5]! * y! + Q[9]! * z! + Q[13]!
      const wz = Q[2]! * x! + Q[6]! * y! + Q[10]! * z! + Q[14]!
      if (wz * forward > -0.3 || wy < 1.0 || wy > 1.7) continue
      pack++
      const j = joints.getElement(v, [])
      const w = weights.getElement(v, [])
      if (j.some((joint, i) => w[i]! > 0.01 && names[joint] !== 'spine_03')) pulled++
    }
  }
  check(pack > 500 && pulled === 0, `${variant}: the backpack (${pack} points behind the back) moves with the chest only (${pulled} pulled by other bones)`)

  // The name tag and patch spots.
  const tag = info?.anchors?.nameTag
  const patch = info?.anchors?.patch
  check(tag?.bone === 'spine_03' && tag.position[2] > 0.1 && tag.position[0] > 0, `${variant}: the name tag is on the front of the chest, left side (${tag?.position.map((x: number) => x.toFixed(2))})`)
  check(patch?.bone === 'upperarm_r' && patch.position[0] < -0.2 && patch.position[1] < 1.65, `${variant}: the patch is on the right upper arm, over the suit's blank badge, clear of the flag (${patch?.position.map((x: number) => x.toFixed(2))})`)
}

console.log(failed ? `\n${failed} suit check(s) FAILED.` : '\nAll suit checks passed.')
process.exit(failed ? 1 : 0)
