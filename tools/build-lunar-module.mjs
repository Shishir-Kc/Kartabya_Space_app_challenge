#!/usr/bin/env node
/**
 * Builds the lander (public/models/lunar-module.glb) from the Sketchfab
 * model "Apollo Lunar Module" by jgut028 (CC BY-NC 4.0):
 *
 *   node tools/build-lunar-module.mjs ~/Downloads/apollo_lunar_module.glb
 *
 * The source is about 100,000 triangles in 19 meshes with 12 flat-colour
 * materials and no textures, at about 0.7 of real size. This:
 *
 *   1. Scales it to real size (footpads 9 m apart, 7 m tall), standing on
 *      y = 0 with the ladder and hatch facing +z, as the game's props do.
 *   2. Drops a stray copy of part of the antenna mesh (about 1,500
 *      triangles) left about 11 m off to one side.
 *   3. Moves each material's colour into vertex colours and merges all of
 *      it into one mesh with one material, so it costs one draw call.
 *   4. Compresses it like the other models (meshopt).
 *
 * The shapes and colours are otherwise the author's. Where the game needs
 * to know things about it (footpads, hatch, engine, cabin windows) is in
 * src/scene/lunarModuleLayout.ts, measured from this output.
 *
 * The Sketchfab file is not in the repo: download it from
 * https://sketchfab.com/3d-models/apollo-lunar-module-e7458d5b149b482d9829ff90ea6bc233
 */
import { statSync } from 'node:fs'
import { dirname, join as joinPath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getBounds, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { compactPrimitive, dedup, join, meshopt, prune, transformPrimitive, weld } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'

/** Source units to metres: the real LM's footpads are 9.4 m apart and it stands 7 m tall. */
const SCALE = 1.4
/** Anything further than this from the vertical axis (metres, after scaling) is the stray copy: the footpads reach 4.5 m. */
const STRAY = 5.2

const [path] = process.argv.slice(2)
if (!path) {
  console.error('Usage: node tools/build-lunar-module.mjs <apollo_lunar_module.glb>')
  process.exit(1)
}

await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(path)
const root = doc.getRoot()

const licence = root.getAsset().extras?.license ?? ''
if (!/CC-BY-NC-4\.0/.test(licence)) throw new Error(`Expected the CC BY-NC 4.0 Apollo Lunar Module, found licence "${licence}"`)

const material = doc.createMaterial('Lunar module').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.6).setMetallicFactor(0).setDoubleSided(true)
const mesh = doc.createMesh('LunarModule')
let dropped = 0

for (const node of root.listNodes()) {
  const source = node.getMesh()
  if (!source) continue
  // The node's world transform, then the scale (every row but the last of the column-major matrix).
  const matrix = node.getWorldMatrix().map((v, i) => (i % 4 === 3 ? v : v * SCALE))
  for (const primitive of source.listPrimitives()) {
    transformPrimitive(primitive, matrix)
    // Drop the triangles of the stray copy.
    const position = primitive.getAttribute('POSITION')
    const indices = primitive.getIndices()
    const kept = []
    const v = []
    for (let t = 0; t < indices.getCount(); t += 3) {
      const corners = [indices.getScalar(t), indices.getScalar(t + 1), indices.getScalar(t + 2)]
      const far = corners.some((i) => {
        position.getElement(i, v)
        return Math.hypot(v[0], v[2]) > STRAY
      })
      if (far) dropped++
      else kept.push(...corners)
    }
    indices.setArray(position.getCount() > 65535 ? new Uint32Array(kept) : new Uint16Array(kept))
    // The material's colour, into the vertices (glTF keeps both in linear RGB).
    const [r, g, b] = primitive.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1]
    const colors = new Float32Array(position.getCount() * 3)
    for (let i = 0; i < position.getCount(); i++) colors.set([r, g, b], i * 3)
    primitive.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(colors))
    // No textures anywhere, and some parts have no UVs: drop them all so every part can merge.
    primitive.setAttribute('TEXCOORD_0', null)
    primitive.setMaterial(material)
    compactPrimitive(primitive)
    mesh.addPrimitive(primitive)
  }
}

const scene = root.listScenes()[0]
for (const child of scene.listChildren()) child.dispose()
scene.addChild(doc.createNode('LunarModule').setMesh(mesh))
root.setDefaultScene(scene)
// Stand it on its footpads at y = 0.
const lowest = getBounds(scene).min[1]
for (const primitive of mesh.listPrimitives()) transformPrimitive(primitive, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -lowest, 0, 1])

await doc.transform(prune(), dedup(), weld(), join({ keepNamed: false }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
const out = joinPath(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'lunar-module.glb')
await io.write(out, doc)

let triangles = 0
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) triangles += (p.getIndices()?.getCount() ?? 0) / 3
const { min, max } = getBounds(scene)
const fmt = (a) => a.map((x) => x.toFixed(2)).join(', ')
console.log(
  `lunar-module: ${triangles} triangles in ${root.listMeshes().length} mesh, ${root.listMaterials().length} material, ${dropped} stray triangles dropped,` +
    ` bounds [${fmt(min)}] to [${fmt(max)}], ${(statSync(out).size / 1024).toFixed(0)} KB`,
)
