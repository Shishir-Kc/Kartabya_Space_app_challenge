#!/usr/bin/env node
/**
 * Builds the rocket (public/models/saturn-v.glb) from the Sketchfab model
 * "Saturn V - NASA" by Stanley Creative:
 *
 *   node tools/build-saturn-v.mjs ~/Downloads/saturn_v_-_nasa.glb
 *
 * The model is CC BY-ND 4.0 (no derivatives), so only technical changes
 * for the web are made here: unused data pruned, identical meshes shared
 * (the five F-1s and six J-2s are copies) and meshopt compression. The
 * shapes, parts, names, materials and texture (with its markings) are
 * the author's, untouched. The game scales nothing: the model is real
 * size, in metres (110.8 m tall). It moves the stages apart at run time
 * by their own nodes (src/scene/saturnV.ts) and adds the floodlight glow
 * in the shader; neither changes the file.
 *
 * The Sketchfab file is not in the repo: download it from
 * https://sketchfab.com/3d-models/saturn-v-nasa-7a2c9709ff8144c8b3b18ec84b5e112e
 */
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'

/** The nodes src/scene/saturnV.ts splits the rocket by. */
const STAGE_NODES = [
  'Saturn V First Stage_91',
  'Saturn V Second Stage_113',
  'Second Stage Interstage_109',
  'Saturn V Third Stage_131',
  'Saturn V Third Stage Interstage_130',
  'LEM Fairing Bottom_125',
  'LEM Fairing Hinge.000_118',
  'LEM Fairing Hinge.001_120',
  'LEM Fairing Hinge.002_122',
  'LEM Fairing Hinge.003_124',
  'Lunar Module Placeholder_54',
  'Apollo Capsule and SM_14',
  'Launch Escape System_53',
]

const [path] = process.argv.slice(2)
if (!path) {
  console.error('Usage: node tools/build-saturn-v.mjs <saturn_v_-_nasa.glb>')
  process.exit(1)
}

await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(path)
const root = doc.getRoot()

const licence = root.getAsset().extras?.license ?? ''
if (!/CC-BY-ND-4\.0/.test(licence)) throw new Error(`Expected the CC BY-ND 4.0 Saturn V, found licence "${licence}"`)
const names = new Set(root.listNodes().map((node) => node.getName()))
const missing = STAGE_NODES.filter((name) => !names.has(name))
if (missing.length) throw new Error(`The rocket is missing nodes: ${missing.join(', ')}`)

await doc.transform(prune({ keepLeaves: true }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'saturn-v.glb')
await io.write(out, doc)

let triangles = 0
for (const mesh of root.listMeshes()) {
  for (const primitive of mesh.listPrimitives()) triangles += (primitive.getIndices()?.getCount() ?? 0) / 3
}
console.log(
  `saturn-v: ${triangles} triangles in ${root.listMeshes().length} meshes, ${root.listMaterials().length} materials,` +
    ` ${root.listTextures().length} texture, ${(statSync(out).size / 1024).toFixed(0)} KB`,
)
