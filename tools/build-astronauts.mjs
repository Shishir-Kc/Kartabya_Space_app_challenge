#!/usr/bin/env node
/**
 * Builds the player astronaut models from two CC0 packs by Quaternius:
 *   - Universal Base Characters [Standard]  (bodies, hair, eyes)
 *   - Universal Animation Library [Standard] (animations on the same rig)
 *
 * Usage:
 *   node tools/build-astronauts.mjs "<path to Universal Base Characters[Standard]>" "<path to UAL1_Standard.glb>"
 *
 * Writes public/models/astronaut-male.glb and astronaut-female.glb. For each:
 *   - the base body with one hairstyle, eyebrows and eyes, all on one skeleton;
 *   - the body split by bone weights into skin (head, neck, hands) and an
 *     outfit primitive (everything else), whose vertex colours mark the boots,
 *     so outfits are a material swap at runtime;
 *   - clips retargeted by bone name: idle, walk, jog, sprint, jump, crouch, sneak;
 *   - the body's light-skin colour texture as a separate WebP next to the
 *     model (the model itself carries the dark one), so skin tone is a texture swap;
 *   - anchor points for the chest name tag and the shoulder patch;
 *   - textures resized to 1024 px WebP, geometry and animation compressed
 *     with meshopt (EXT_meshopt_compression).
 *
 * The source packs are not in the repo; download them from quaternius.com or
 * quaternius.itch.io (free Standard versions) and point this script at them.
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, mergeDocuments, meshopt, prune, resample, textureCompress, unpartition } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'

/** How much the dark skin tone is darkened from the pack's own "dark" texture. */
const DARK_SKIN_BRIGHTNESS = 0.5

const [ubcDir, ualPath] = process.argv.slice(2)
if (!ubcDir || !ualPath) {
  console.error('Usage: node tools/build-astronauts.mjs <Universal Base Characters dir> <UAL1_Standard.glb>')
  process.exit(1)
}

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models')

const VARIANTS = {
  male: { body: 'Superhero_Male_FullBody.gltf', hair: 'Hair_SimpleParted.gltf', lightSkin: 'T_Superhero_Male_Ligh.png' },
  female: { body: 'Superhero_Female_FullBody.gltf', hair: 'Hair_Long.gltf', lightSkin: 'T_Superhero_Female_Light_BaseColor.png' },
}

/** Library clip name -> name in our files. */
const CLIPS = {
  Idle_Loop: 'idle',
  Walk_Loop: 'walk',
  Jog_Fwd_Loop: 'jog',
  Sprint_Loop: 'sprint',
  Jump_Loop: 'jump',
  Crouch_Idle_Loop: 'crouch',
  Crouch_Fwd_Loop: 'sneak',
}

/** Natural ground speed of each clip in m/s, measured from the root-motion version of the library. */
const CLIP_SPEEDS = { walk: 0.975, jog: 5.357, sprint: 8.25, sneak: 0.75 }

const SKIN_BONES = /^(Head|neck_01|hand_[lr]|(index|middle|pinky|ring|thumb)_\d+(_leaf)?_[lr])$/
const BOOT_BONES = /^(foot|ball)(_leaf)?_[lr]$/
/** Boots come this far up the calf, above the ankle joint. */
const BOOT_TOP = 0.2

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const IMAGE_DIRS = [
  ['Base Characters', 'Textures', 'Normals Unity - Godot'],
  ['Hairstyles', 'Textures', 'Normals Unity - Godot'],
  ['Base Characters', 'Textures'],
  ['Hairstyles', 'Textures'],
].map((parts) => join(ubcDir, ...parts))

/**
 * Finds an image the .gltf refers to. Some references in the pack point at
 * files with a stray "_png" suffix, and normal maps are taken from the
 * OpenGL-convention folder, which is what glTF expects.
 */
function findImage(uri, gltfDir) {
  const names = [uri, uri.replace(/_png\.png$/, '.png')]
  const dirs = /Normal/.test(uri) ? [...IMAGE_DIRS, gltfDir] : [gltfDir, ...IMAGE_DIRS]
  for (const dir of dirs) {
    for (const name of names) {
      const path = join(dir, name)
      if (existsSync(path)) return path
    }
  }
  throw new Error(`Image not found: ${uri}`)
}

async function readGltf(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'))
  const dir = dirname(path)
  const resources = {}
  for (const buffer of json.buffers ?? []) resources[buffer.uri] = new Uint8Array(readFileSync(join(dir, buffer.uri)))
  for (const image of json.images ?? []) resources[image.uri] = new Uint8Array(readFileSync(findImage(image.uri, dir)))
  return io.readJSON({ json, resources })
}

function jointPosition(skin, name) {
  const joints = skin.listJoints()
  const index = joints.findIndex((joint) => joint.getName() === name)
  if (index < 0) throw new Error(`No joint ${name}`)
  const ibm = skin.getInverseBindMatrices().getElement(index, [])
  return invertTranslation(ibm)
}

/** Translation of the inverse of a rigid 4x4 column-major matrix. */
function invertTranslation(m) {
  const r = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]
  const t = [m[12], m[13], m[14]]
  // inverse(R) = transpose(R) for rotation (scale ~1 in this rig); position = -R^T t
  return [
    -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]),
    -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]),
    -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2]),
  ]
}

/** The front-most (along `axis`, sign `dir`) vertex near a target point, plus its averaged normal. */
function surfacePoint(position, normal, candidates, target, ignoreAxis, axis, dir, radius) {
  let best = null
  const nearby = []
  const p = [0, 0, 0]
  for (const i of candidates) {
    position.getElement(i, p)
    let ok = true
    for (let k = 0; k < 3; k++) {
      if (k === ignoreAxis) continue
      if (Math.abs(p[k] - target[k]) > radius) ok = false
    }
    if (!ok) continue
    nearby.push(i)
    if (!best || p[axis] * dir > best[axis] * dir) best = [...p]
  }
  if (!best) throw new Error('No surface near anchor target')
  const n = [0, 0, 0]
  const sum = [0, 0, 0]
  for (const i of nearby) {
    position.getElement(i, p)
    if (Math.abs(p[axis] - best[axis]) > 0.02) continue
    normal.getElement(i, n)
    sum[0] += n[0]
    sum[1] += n[1]
    sum[2] += n[2]
  }
  const length = Math.hypot(...sum) || 1
  return { position: best, normal: sum.map((v) => v / length) }
}

async function build(variant, spec) {
  const doc = await readGltf(join(ubcDir, 'Base Characters', 'Godot - UE', spec.body))
  const root = doc.getRoot()
  const skin = root.listSkins()[0]
  const jointNames = skin.listJoints().map((joint) => joint.getName())
  const bodyNode = root.listNodes().find((node) => node.getMesh() && /Super[Hh]ero/.test(node.getName()))
  const armature = bodyNode.getParentNode()
  bodyNode.setName('Body')
  for (const node of root.listNodes()) {
    if (node.getMesh() && node !== bodyNode) node.setName(node.getName() === 'Eyes' ? 'Eyes' : 'Eyebrows')
  }

  // Hair: merge it in and bind it to the body's skeleton (same joints, same order).
  const hairDoc = await readGltf(join(ubcDir, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)', spec.hair))
  const hairJoints = hairDoc.getRoot().listSkins()[0].listJoints().map((joint) => joint.getName())
  if (hairJoints.join() !== jointNames.join()) throw new Error('Hair skeleton does not match the body')
  const scenesBefore = new Set(root.listScenes())
  mergeDocuments(doc, hairDoc)
  const hairNode = root.listNodes().find((node) => node.getMesh() && node.getName() === spec.hair.replace('.gltf', ''))
  const oldHairSkin = hairNode.getSkin()
  hairNode.setSkin(skin).setName('Hair')
  armature.addChild(hairNode)
  oldHairSkin.dispose()

  // Animations: merge the library, point each kept channel at our bones, drop the rest.
  const ual = await io.read(ualPath)
  mergeDocuments(doc, ual)
  const bones = new Map(skin.listJoints().map((joint) => [joint.getName(), joint]))
  for (const animation of root.listAnimations()) {
    const name = CLIPS[animation.getName()]
    if (!name) {
      animation.dispose()
      continue
    }
    animation.setName(name)
    for (const channel of animation.listChannels()) {
      const target = bones.get(channel.getTargetNode()?.getName())
      if (target) channel.setTargetNode(target)
      else channel.dispose()
    }
  }
  for (const scene of root.listScenes()) if (!scenesBefore.has(scene)) scene.dispose()
  for (const node of root.listNodes()) {
    if (node.getMesh()?.getName() === 'Mannequin') node.dispose()
  }

  // Keep only the attributes we use.
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        if (/^(TEXCOORD_[1-9]|COLOR_\d)$/.test(semantic)) primitive.setAttribute(semantic, null)
      }
    }
  }

  // Split the body: skin (head, neck, hands) and outfit (the rest, boots marked in vertex colour).
  const body = bodyNode.getMesh().listPrimitives()[0]
  const position = body.getAttribute('POSITION')
  const normal = body.getAttribute('NORMAL')
  const joints = body.getAttribute('JOINTS_0')
  const weights = body.getAttribute('WEIGHTS_0')
  const indices = body.getIndices()
  const ankleY = Math.max(jointPosition(skin, 'foot_l')[1], jointPosition(skin, 'foot_r')[1])

  const count = position.getCount()
  const region = new Uint8Array(count) // 0 skin, 1 suit, 2 boots
  const j = [0, 0, 0, 0]
  const w = [0, 0, 0, 0]
  const p = [0, 0, 0]
  for (let i = 0; i < count; i++) {
    joints.getElement(i, j)
    weights.getElement(i, w)
    let top = 0
    for (let k = 1; k < 4; k++) if (w[k] > w[top]) top = k
    const bone = jointNames[j[top]] ?? ''
    position.getElement(i, p)
    if (SKIN_BONES.test(bone)) region[i] = 0
    else if (BOOT_BONES.test(bone) || (/^calf_/.test(bone) && p[1] < ankleY + BOOT_TOP)) region[i] = 2
    else region[i] = 1
  }

  const skinTris = []
  const outfitTris = []
  const tri = indices.getArray()
  for (let t = 0; t < tri.length; t += 3) {
    const a = region[tri[t]]
    const b = region[tri[t + 1]]
    const c = region[tri[t + 2]]
    const skinVotes = (a === 0) + (b === 0) + (c === 0)
    ;(skinVotes >= 2 ? skinTris : outfitTris).push(tri[t], tri[t + 1], tri[t + 2])
  }

  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const v = region[i] === 2 ? 0.12 : 1
    colors[i * 3] = v
    colors[i * 3 + 1] = v
    colors[i * 3 + 2] = v
  }
  const colorAccessor = doc.createAccessor('OutfitMask').setType('VEC3').setArray(colors)
  const IndexArray = tri.constructor
  const skinIndices = doc.createAccessor('SkinIndices').setType('SCALAR').setArray(new IndexArray(skinTris))
  const outfitIndices = doc.createAccessor('OutfitIndices').setType('SCALAR').setArray(new IndexArray(outfitTris))

  body.setIndices(skinIndices)
  body.getMaterial().setName('Skin')
  // The pack's "dark" skin is only about 5% darker than its light one, so the
  // two look the same in game. Deepen it to a clearly dark brown, keeping the
  // hue and all the detail (pores, lips, brows): about half the brightness.
  const skinTexture = body.getMaterial().getBaseColorTexture()
  if (skinTexture) {
    const deep = await sharp(Buffer.from(skinTexture.getImage()))
      .modulate({ brightness: DARK_SKIN_BRIGHTNESS, saturation: 1.08 })
      .png()
      .toBuffer()
    skinTexture.setImage(new Uint8Array(deep)).setMimeType('image/png')
  }
  const outfitMaterial = doc.createMaterial('Outfit').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0)
  const outfit = doc.createPrimitive().setMaterial(outfitMaterial).setIndices(outfitIndices)
  for (const semantic of body.listSemantics()) outfit.setAttribute(semantic, body.getAttribute(semantic))
  outfit.setAttribute('COLOR_0', colorAccessor)
  bodyNode.getMesh().addPrimitive(outfit)

  // Anchors for the name tag (left chest) and mission patch (left shoulder), in model space.
  const forward = Math.sign(jointPosition(skin, 'ball_l')[2] - jointPosition(skin, 'foot_l')[2]) || 1
  const leftSign = Math.sign(jointPosition(skin, 'clavicle_l')[0]) || 1
  const outfitVerts = [...new Set(outfitTris)]
  const chest = jointPosition(skin, 'spine_03')
  const nameTag = surfacePoint(position, normal, outfitVerts, [leftSign * 0.1, chest[1] + 0.02, 0], 2, 2, forward, 0.03)
  const upperArm = jointPosition(skin, 'upperarm_l')
  const patch = surfacePoint(position, normal, outfitVerts, [0, upperArm[1] - 0.1, upperArm[2]], 0, 0, leftSign, 0.04)

  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < count; i++) {
    position.getElement(i, p)
    minY = Math.min(minY, p[1])
    maxY = Math.max(maxY, p[1])
  }

  root.listScenes()[0].setExtras({
    astronaut: {
      variant,
      forward: [0, 0, forward],
      height: maxY - minY,
      clipSpeeds: CLIP_SPEEDS,
      anchors: {
        nameTag: { bone: 'spine_03', ...nameTag },
        patch: { bone: 'upperarm_l', ...patch },
      },
      defaultSkin: 'dark',
      lightSkin: `astronaut-${variant}-skin-light.webp`,
      source: 'Quaternius Universal Base Characters + Universal Animation Library (CC0 1.0)',
    },
  })
  root.setDefaultScene(root.listScenes()[0])

  await doc.transform(
    prune(),
    dedup(),
    resample(),
    unpartition(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 88 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )

  mkdirSync(OUT_DIR, { recursive: true })
  const out = join(OUT_DIR, `astronaut-${variant}.glb`)
  await io.write(out, doc)

  // The other skin tone, as a texture swapped in at runtime.
  const skinOut = join(OUT_DIR, `astronaut-${variant}-skin-light.webp`)
  await sharp(join(ubcDir, 'Base Characters', 'Textures', spec.lightSkin))
    .resize(1024, 1024)
    .webp({ quality: 88 })
    .toFile(skinOut)

  let triangles = 0
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) triangles += primitive.getIndices().getCount() / 3
  }
  console.log(
    `${variant}: ${triangles} triangles (skin ${skinTris.length / 3}, outfit ${outfitTris.length / 3}),` +
      ` ${root.listMaterials().length} materials, ${root.listTextures().length} textures,` +
      ` clips ${root.listAnimations().map((a) => a.getName()).join('/')},` +
      ` height ${(maxY - minY).toFixed(2)} m, forward ${forward > 0 ? '+z' : '-z'}, left ${leftSign > 0 ? '+x' : '-x'},` +
      ` ${(statSync(out).size / 1024).toFixed(0)} KB, light skin ${(statSync(skinOut).size / 1024).toFixed(0)} KB`,
  )
}

for (const [variant, spec] of Object.entries(VARIANTS)) await build(variant, spec)
