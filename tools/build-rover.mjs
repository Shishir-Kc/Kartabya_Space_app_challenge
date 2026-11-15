#!/usr/bin/env node
/**
 * Builds the lunar rover (public/models/rover.glb) from the CC BY 4.0
 * Sketchfab model "Lunar Rover" by Versal. Two steps:
 *
 *   1. flatpak run org.blender.Blender --background --factory-startup \
 *        --python "$PWD/tools/build-rover.py" -- <lunar_rover.glb> <work dir>/rover-built.glb [preview dir]
 *      (or blender --background ... without Flatpak; Flatpak Blender needs
 *      full paths and can't read /tmp, so keep the work dir in your home
 *      folder). Removes the
 *      screws, thins and colours the parts, scales it to the game's wheel
 *      size and groups it into a body and four steering, spinning wheels,
 *      with the wheel layout and the driver's seat in a .json beside it.
 *
 *   2. node tools/build-rover.mjs <work dir>/rover-built.glb
 *      Adds the layout to the model (src/scene/RoverView.tsx reads it),
 *      compresses it like the astronauts and writes public/models/rover.glb.
 *
 * The Sketchfab file is not in the repo: download it from
 * https://sketchfab.com/3d-models/lunar-rover-82cab6e9ada74d12a98bd6a342e83048
 */
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'

const [path] = process.argv.slice(2)
if (!path) {
  console.error('Usage: node tools/build-rover.mjs <work dir>/rover-built.glb')
  process.exit(1)
}

await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(path)
const root = doc.getRoot()
const layout = JSON.parse(readFileSync(path.replace(/\.glb$/, '.json'), 'utf8'))

const names = new Set(root.listNodes().map((node) => node.getName()))
const missing = ['Body', ...['fl', 'fr', 'rl', 'rr'].flatMap((key) => [`wheel_${key}`, `spin_${key}`, `fender_${key}`])].filter((name) => !names.has(name))
if (missing.length) throw new Error(`The rover is missing nodes: ${missing.join(', ')}`)

root.listScenes()[0].setExtras({
  rover: {
    ...layout,
    source: 'Lunar Rover by Versal (Sketchfab, CC BY 4.0): screws removed, thinned, coloured, scaled and grouped into a body and four wheels',
  },
})
root.setDefaultScene(root.listScenes()[0])

await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'rover.glb')
await io.write(out, doc)

let triangles = 0
for (const mesh of root.listMeshes()) {
  for (const primitive of mesh.listPrimitives()) triangles += (primitive.getIndices()?.getCount() ?? 0) / 3
}
console.log(
  `rover: ${triangles} triangles in ${root.listMeshes().length} meshes, ${root.listMaterials().length} material(s),` +
    ` wheelbase ${layout.base} m, track ${layout.track} m, wheel radius ${layout.radius} m, ${(statSync(out).size / 1024).toFixed(0)} KB`,
)
