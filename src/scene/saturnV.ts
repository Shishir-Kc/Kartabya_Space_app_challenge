/**
 * The rocket: "Saturn V - NASA" by Stanley Creative (Sketchfab, CC BY-ND
 * 4.0), compressed for the web by tools/build-saturn-v.mjs and otherwise
 * the author's own: real size, in metres, standing on +y with the F-1
 * nozzle exits at y = 0 (see saturnLayout.ts for where things are).
 *
 * Loaded once. Each place that shows it builds its own copy from the
 * loaded file, merged by material so it costs a few draw calls:
 *
 *   - buildSaturnVStack: the whole rocket in one piece, for the pad, the
 *     launch center's windows and the menu lobby.
 *   - buildSaturnVPieces: the stages apart, for the launch cinematic. The
 *     pieces follow the model's own parts (first stage, the second stage's
 *     interstage ring, second stage, third stage with the lunar module
 *     adapter's four hinged panels, the lunar module, the command and
 *     service module, the escape tower), and each turns about its middle.
 *
 * Neither changes the model's shapes or colours. Both add the floodlight
 * glow the pad's rocket has always had (bright near the ground, fading
 * upward) in the shader, and give the metal parts a soft environment to
 * reflect so they don't render black where the scene has none.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  type MeshStandardMaterial,
  type Object3D,
  PMREMGenerator,
  PropertyBinding,
  Quaternion,
  type Texture,
  Vector3,
  type WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { type PieceId, SATURN_V } from './saturnLayout'

let model: Promise<GLTF> | null = null

export function loadSaturnV(): Promise<GLTF> {
  if (!model) {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    model = loader.loadAsync(`${import.meta.env.BASE_URL}models/saturn-v.glb`)
    // Let a failed load be tried again next time.
    model.catch(() => {
      model = null
    })
  }
  return model
}

/** The adapter's four panels, hinged at their foot on the third stage. */
const PANEL_NODES = ['LEM Fairing Hinge.000_118', 'LEM Fairing Hinge.001_120', 'LEM Fairing Hinge.002_122', 'LEM Fairing Hinge.003_124']

/** The model's nodes each piece is made of (names as in the file), and the parts of them that belong to another piece. */
const PIECES: Record<PieceId, { nodes: string[]; except?: string[] }> = {
  first: { nodes: ['Saturn V First Stage_91'] },
  interstage: { nodes: ['Second Stage Interstage_109'] },
  // The interstage under the third stage stays with the second stage when they part, as on the real rocket.
  second: { nodes: ['Saturn V Second Stage_113', 'Saturn V Third Stage Interstage_130'], except: ['Second Stage Interstage_109'] },
  third: { nodes: ['Saturn V Third Stage_131'], except: ['Saturn V Third Stage Interstage_130', ...PANEL_NODES] },
  lander: { nodes: ['Lunar Module Placeholder_54'] },
  spacecraft: { nodes: ['Apollo Capsule and SM_14'] },
  tower: { nodes: ['Launch Escape System_53'] },
}

/** The glow's colour from the ground up (linear): warm white, dim brown by 45% of the way, near black at the top. */
const glowChunk = /* glsl */ `
  float glowT = clamp((vGlowY - uGlowGround) / uGlowHeight, 0.0, 1.0);
  vec3 glowRamp = glowT < 0.45
    ? mix(vec3(1.0, 0.879, 0.716), vec3(0.155, 0.127, 0.098), glowT / 0.45)
    : mix(vec3(0.155, 0.127, 0.098), vec3(0.0116, 0.0103, 0.0091), (glowT - 0.45) / 0.55);
  // Bare metal (the engines, the spacecraft) mostly mirrors light rather than scattering it.
  totalEmissiveRadiance += diffuseColor.rgb * (1.0 - 0.85 * metalnessFactor) * glowRamp * vec3(1.0, 0.791, 0.578) * uGlow;
`

/**
 * The floodlight glow: `strength` 0 for none (high up, lit only by the
 * Sun), about 1 floodlit on the pad; it fades out from the ground's
 * height in the world to `height` above it.
 */
export type SetGlow = (strength: number, ground?: number, height?: number) => void

/** One copy of the rocket's materials, sharing the glow's settings. */
function rocketMaterials(gltf: GLTF, environment: Texture | null): { byUuid: Map<string, MeshStandardMaterial>; setGlow: SetGlow; list: MeshStandardMaterial[] } {
  const uniforms = { uGlow: { value: 0.75 }, uGlowGround: { value: 0 }, uGlowHeight: { value: 120 } }
  const setGlow: SetGlow = (strength, ground = 0, height = 120) => {
    uniforms.uGlow.value = strength
    uniforms.uGlowGround.value = ground
    uniforms.uGlowHeight.value = height
  }
  const byUuid = new Map<string, MeshStandardMaterial>()
  gltf.scene.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    for (const source of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (byUuid.has(source.uuid)) continue
      const material = (source as MeshStandardMaterial).clone()
      if (environment) {
        material.envMap = environment
        material.envMapIntensity = 0.45
      }
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms)
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vGlowY;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvGlowY = (modelMatrix * vec4(transformed, 1.0)).y;')
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform float uGlowGround;\nuniform float uGlowHeight;\nvarying float vGlowY;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${glowChunk}`)
      }
      material.customProgramCacheKey = () => 'saturn-v-glow'
      byUuid.set(source.uuid, material)
    }
  })
  return { byUuid, setGlow, list: [...byUuid.values()] }
}

/** A mesh's geometry in another frame, as plain float attributes so it can be merged. */
function baked(mesh: Mesh, matrix: Matrix4): BufferGeometry {
  const source = mesh.geometry
  const out = new BufferGeometry()
  const count = source.getAttribute('position').count
  for (const [name, size] of [
    ['position', 3],
    ['normal', 3],
    ['uv', 2],
  ] as const) {
    const attribute = source.getAttribute(name)
    const array = new Float32Array(count * size)
    if (attribute) {
      for (let i = 0; i < count; i++) {
        array[i * size] = attribute.getX(i)
        array[i * size + 1] = attribute.getY(i)
        if (size === 3) array[i * size + 2] = attribute.getZ(i)
      }
    }
    out.setAttribute(name, new BufferAttribute(array, size))
  }
  const index = new Uint32Array(source.index ? source.index.count : count)
  for (let i = 0; i < index.length; i++) index[i] = source.index ? source.index.getX(i) : i
  // A mirrored part (negative scale) would come out inside out once its transform is baked in.
  if (matrix.determinant() < 0) {
    for (let i = 0; i + 2 < index.length; i += 3) {
      const b = index[i + 1]!
      index[i + 1] = index[i + 2]!
      index[i + 2] = b
    }
  }
  out.setIndex(new BufferAttribute(index, 1))
  if (!source.getAttribute('normal')) out.computeVertexNormals()
  out.applyMatrix4(matrix)
  return out
}

/** The meshes under these nodes, leaving out the subtrees named in `except`. */
function meshesUnder(gltf: GLTF, names: string[], except: string[] = []): Mesh[] {
  const skip = new Set(except.map((name) => PropertyBinding.sanitizeNodeName(name)))
  const out: Mesh[] = []
  const walk = (object: Object3D) => {
    if ((object as Mesh).isMesh) out.push(object as Mesh)
    for (const child of object.children) if (!skip.has(child.name)) walk(child)
  }
  for (const name of names) {
    const node = gltf.scene.getObjectByName(PropertyBinding.sanitizeNodeName(name))
    if (!node) throw new Error(`The Saturn V model has no part "${name}"`)
    walk(node)
  }
  return out
}

/** The meshes merged by material into one group, each baked into the frame `inverse` takes them to. */
function mergedGroup(meshes: Mesh[], inverse: Matrix4, materials: Map<string, MeshStandardMaterial>, geometries: BufferGeometry[]): Group {
  const byMaterial = new Map<MeshStandardMaterial, BufferGeometry[]>()
  const matrix = new Matrix4()
  for (const mesh of meshes) {
    const material = materials.get((mesh.material as MeshStandardMaterial).uuid)
    if (!material) continue
    matrix.multiplyMatrices(inverse, mesh.matrixWorld)
    const list = byMaterial.get(material) ?? []
    list.push(baked(mesh, matrix))
    byMaterial.set(material, list)
  }
  const group = new Group()
  for (const [material, list] of byMaterial) {
    const geometry = mergeGeometries(list, false)
    for (const g of list) g.dispose()
    if (!geometry) continue
    geometries.push(geometry)
    group.add(new Mesh(geometry, material))
  }
  return group
}

export interface SaturnVStack {
  /** The whole rocket, nozzle exits at y = 0. */
  root: Group
  setGlow: SetGlow
  dispose(): void
}

export interface SaturnVPieces {
  /**
   * Each piece sits at (0, its centre, 0) when the stack is whole; move and
   * turn it to separate. The lunar module is already inside the third
   * stage (it moves with it), so it isn't placed on its own.
   */
  pieces: Record<PieceId, Group>
  /** The adapter's four panels (inside the third stage): set each one's rotation.x from 0 (closed) to SATURN_V.panelOpen. */
  panels: Group[]
  setGlow: SetGlow
  dispose(): void
}

export function buildSaturnVStack(gltf: GLTF, environment: Texture | null): SaturnVStack {
  gltf.scene.updateMatrixWorld(true)
  const { byUuid, setGlow, list } = rocketMaterials(gltf, environment)
  const geometries: BufferGeometry[] = []
  const meshes: Mesh[] = []
  gltf.scene.traverse((object) => {
    if ((object as Mesh).isMesh) meshes.push(object as Mesh)
  })
  const root = mergedGroup(meshes, new Matrix4(), byUuid, geometries)
  return {
    root,
    setGlow,
    dispose() {
      for (const g of geometries) g.dispose()
      for (const m of list) m.dispose()
    },
  }
}

export function buildSaturnVPieces(gltf: GLTF, environment: Texture | null): SaturnVPieces {
  gltf.scene.updateMatrixWorld(true)
  const { byUuid, setGlow, list } = rocketMaterials(gltf, environment)
  const geometries: BufferGeometry[] = []
  const inverse = new Matrix4()
  const pieces = {} as Record<PieceId, Group>
  for (const id of Object.keys(PIECES) as PieceId[]) {
    const centre = SATURN_V.centres[id]
    const group = mergedGroup(meshesUnder(gltf, PIECES[id].nodes, PIECES[id].except), inverse.makeTranslation(0, -centre, 0), byUuid, geometries)
    group.position.set(0, centre, 0)
    group.name = id
    pieces[id] = group
  }
  // Each panel turns about its own hinge, which sits at the panel's foot with its x axis along the hinge line.
  const panels = PANEL_NODES.map((name) => {
    const hinge = gltf.scene.getObjectByName(PropertyBinding.sanitizeNodeName(name))
    if (!hinge) throw new Error(`The Saturn V model has no part "${name}"`)
    const leaf = mergedGroup(meshesUnder(gltf, [name]), inverse.copy(hinge.matrixWorld).invert(), byUuid, geometries)
    const mount = new Group()
    const at = new Vector3()
    const turn = new Quaternion()
    hinge.matrixWorld.decompose(at, turn, new Vector3())
    mount.position.set(at.x, at.y - SATURN_V.centres.third, at.z)
    mount.quaternion.copy(turn)
    mount.add(leaf)
    pieces.third.add(mount)
    return leaf
  })
  // The lunar module rides inside the adapter on the third stage, and stays with it.
  pieces.lander.position.y -= SATURN_V.centres.third
  pieces.third.add(pieces.lander)
  return {
    pieces,
    panels,
    setGlow,
    dispose() {
      for (const g of geometries) g.dispose()
      for (const m of list) m.dispose()
    },
  }
}

const environments = new WeakMap<WebGLRenderer, Texture>()

/** A soft, neutral environment for the rocket's metal to reflect, made once per renderer. */
export function rocketEnvironment(gl: WebGLRenderer): Texture {
  const cached = environments.get(gl)
  if (cached) return cached
  const generator = new PMREMGenerator(gl)
  const room = new RoomEnvironment()
  const texture = generator.fromScene(room, 0.04).texture
  room.dispose()
  generator.dispose()
  environments.set(gl, texture)
  return texture
}
