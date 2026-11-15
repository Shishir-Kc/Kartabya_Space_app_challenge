/**
 * The lander: "Apollo Lunar Module" by jgut028 (Sketchfab, CC BY-NC 4.0),
 * scaled to real size, cleaned of a stray part and merged into one mesh
 * with one vertex-coloured material by tools/build-lunar-module.mjs.
 * Where its parts are is in lunarModuleLayout.ts.
 *
 * Loaded once; each place that shows it (the outpost's landing pad, the
 * landing cinematic) takes its own copy of the scene, sharing the one
 * geometry and material, which stay loaded for the rest of the session.
 */
import type { Group } from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

let model: Promise<GLTF> | null = null

export function loadLunarModule(): Promise<GLTF> {
  if (!model) {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    model = loader.loadAsync(`${import.meta.env.BASE_URL}models/lunar-module.glb`)
    // Let a failed load be tried again next time.
    model.catch(() => {
      model = null
    })
  }
  return model
}

/** A copy of the lander to place in a scene (its geometry and material are shared, so don't dispose them). */
export function lunarModuleCopy(gltf: GLTF): Group {
  return gltf.scene.clone(true)
}
