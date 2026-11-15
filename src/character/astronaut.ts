/**
 * The astronaut character: one skinned body (male or female) built from CC0
 * Quaternius assets by tools/build-astronauts.mjs, with idle, walk, jog and
 * sprint animations, an outfit material, a chest name tag and a mission patch,
 * and a look the player picks: skin tone, hairstyle, hair and eye colour.
 *
 * The same class serves the player now and the crew later (Phase 7): it is
 * general about name, body and outfit.
 */
import {
  AnimationMixer,
  type AnimationAction,
  type Bone,
  Color,
  type Material,
  Group,
  Matrix4,
  BoxGeometry,
  type BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Skeleton,
  SkinnedMesh,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector3,
} from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import {
  EYE_COLORS,
  HAIR_COLORS,
  skinToneLinear,
  swatchColor,
  type AstronautLook,
  type AstronautVariant,
  type HairStyle,
  type PatchId,
} from '../state/astronaut'
import { surfaceTextures } from '../scene/materials/surfaces'
import { createNameTag, missionPatchTexture, type NameTag } from './insignia'
import { OUTFITS, type OutfitId } from './outfits'
import { blendPoses, catchArms, glidePose, neutralPose, railArms, seatedPose, twistToward, type BonePose } from './floatPose'
import { buildGear, fittedSuit, gloveGeometry, measureBody, restToModel, splitSkin, suitSeams } from './gear'

interface Anchor {
  bone: string
  position: [number, number, number]
  normal: [number, number, number]
  /** Which way the decal's top points (when an anchor says; otherwise the shortest turn from facing forward). */
  up?: [number, number, number]
  /** The decal's width in metres, when the spot needs a smaller one than usual. */
  width?: number
}

/** What the build tool stores in the model's scene extras. */
interface AstronautInfo {
  variant: AstronautVariant
  forward: [number, number, number]
  height: number
  clipSpeeds: { walk: number; jog: number; sprint: number; sneak: number }
  anchors: { nameTag: Anchor; patch: Anchor }
  /** The file holding the body's light skin texture: the base every skin tone is made from. */
  lightSkin: string
}

type ClipName = 'idle' | 'walk' | 'jog' | 'sprint' | 'jump' | 'crouch' | 'sneak'

/** How the body is moving, for picking its animation. */
export interface Motion {
  /** Ground speed in m/s. */
  speed: number
  airborne: boolean
  crouching: boolean
  /** In microgravity. */
  floating?: boolean
}

const skinTextures = new Map<string, Promise<Texture>>()

/** Loads (once) a body's light skin texture. */
function loadSkin(file: string): Promise<Texture> {
  let promise = skinTextures.get(file)
  if (!promise) {
    promise = new TextureLoader().loadAsync(`${import.meta.env.BASE_URL}models/${file}`).then((texture) => {
      // glTF textures are not flipped; match the model's own.
      texture.flipY = false
      texture.colorSpace = SRGBColorSpace
      texture.anisotropy = 4
      return texture
    })
    skinTextures.set(file, promise)
  }
  return promise
}

const cache = new Map<AstronautVariant, Promise<GLTF>>()

/** Loads (once) the model for a body, together with its light skin texture. */
export function loadAstronaut(variant: AstronautVariant): Promise<GLTF> {
  let promise = cache.get(variant)
  if (!promise) {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    promise = loader.loadAsync(`${import.meta.env.BASE_URL}models/astronaut-${variant}.glb`).then(async (gltf) => {
      const info = gltf.scene.userData.astronaut as AstronautInfo
      gltf.scene.userData.skinBase = await loadSkin(info.lightSkin)
      return gltf
    })
    cache.set(variant, promise)
  }
  return promise
}

/** What tools/build-nasa-suit.mjs stores in a Moon suit file's scene extras. */
interface MoonSuitInfo {
  variant: AstronautVariant
  triangles: number
  anchors: { nameTag: Anchor; patch: Anchor }
}

const suits = new Map<AstronautVariant, Promise<GLTF>>()

/** The Moon suit model in public/models: `<file>-<body>.glb`. */
export const MOON_SUIT_FILE = 'suit-artemis'

/**
 * Loads (once) the Moon suit for a body: an Artemis-style suit ("astronaut"
 * by omarkamel140, Sketchfab, CC BY 4.0), rigged to that body's skeleton by
 * tools/build-nasa-suit.mjs so it plays the body's own clips. The astronaut
 * wears it on the lunar surface, in place of the whole body.
 */
export function loadMoonSuit(variant: AstronautVariant): Promise<GLTF> {
  let promise = suits.get(variant)
  if (!promise) {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    promise = loader.loadAsync(`${import.meta.env.BASE_URL}models/${MOON_SUIT_FILE}-${variant}.glb`)
    promise.catch(() => suits.delete(variant))
    suits.set(variant, promise)
  }
  return promise
}

/** Each body's own hairstyle, and which body's file carries each style. */
const OWN_HAIR: Record<AstronautVariant, HairStyle> = { male: 'short', female: 'long' }
const HAIR_FILE: Record<Exclude<HairStyle, 'none'>, AstronautVariant> = { short: 'male', long: 'female' }

/** The look an astronaut gets unless the caller gives one (the crew, later). */
const DEFAULT_LOOK: Record<AstronautVariant, AstronautLook> = {
  male: { skinTone: 0.5, hair: 'short', hairColor: 'dark-brown', eyeColor: 'brown', patch: 'moon' },
  female: { skinTone: 0.5, hair: 'long', hairColor: 'brown', eyeColor: 'brown', patch: 'moon' },
}

/**
 * The average colour of the pack's light skin texture, in linear light.
 * Dividing the texture by it leaves only the detail (pores, lips, the
 * shading round the eyes), which is then multiplied by the chosen tone.
 */
const SKIN_MEAN: [number, number, number] = [0.3915, 0.1878, 0.0976]

/** Where the iris is on the pack's eye texture (UV), and how wide. */
const IRIS = { u: 0.504, v: 0.504, inner: 0.092, outer: 0.108 }

/** Seconds to cross-fade between clips. */
const FADE = 0.22

/**
 * In the Moon suit, the hips and the upper chest are eased back toward
 * standing straight every frame. A suit's hard upper torso doesn't slouch,
 * and the clips' relaxed slouch (about 26 degrees at the upper chest in
 * idle) would tip the rigid helmet and backpack forward. The children in
 * `keep` are turned back by the same amount, so the arms, head and legs
 * keep exactly the pose the clip gave them.
 */
const SUIT_POSTURE: readonly { bone: string; amount: number; keep: readonly string[] }[] = [
  { bone: 'pelvis', amount: 0.6, keep: ['thigh_l', 'thigh_r'] },
  { bone: 'spine_03', amount: 0.85, keep: ['clavicle_l', 'clavicle_r', 'neck_01'] },
]
/** In the Moon suit the arms are held this far out from the body (radians), so the bulky gloves clear the thigh pockets. */
const SUIT_ARMS_OUT = (10 * Math.PI) / 180
/** How far the name tag and patch sit off the suit, so they never sink into it. */
const DECAL_OFFSET = 0.008

export class Astronaut {
  /** Add this to the scene. Its local -z is forward, like the camera's. */
  readonly root = new Group()
  private readonly model: Group
  private readonly mixer: AnimationMixer
  private readonly actions = new Map<ClipName, AnimationAction>()
  private readonly info: AstronautInfo
  private readonly outfitMaterial: MeshStandardMaterial
  private readonly nameTag: NameTag
  private readonly owned: { dispose: () => void }[] = []
  private current: ClipName = 'idle'
  private skin: MeshStandardMaterial | null = null
  /** The skin shader's inputs: the tone's base colour, and how much of the texture's own colour variation to keep. */
  private readonly skinUniforms = {
    uSkinTone: { value: new Color(...skinToneLinear(0.5)) },
    uSkinMean: { value: new Color(...SKIN_MEAN) },
    uSkinChroma: { value: 1 },
  }
  /** The eye shader's inputs: the iris colour, and 0 to keep the texture's own brown. */
  private readonly eyeUniforms = { uIris: { value: new Color('#6b4423') }, uIrisMix: { value: 0 } }
  /** Hair: the body's own style, the other style (loaded when first picked) and their tinted materials. */
  private ownHair: SkinnedMesh | null = null
  private otherHair: SkinnedMesh | null = null
  private readonly hairMaterials: MeshStandardMaterial[] = []
  private browMaterial: MeshStandardMaterial | null = null
  private hairStyle: HairStyle
  private hairColor = new Color()
  private patchMaterial: MeshStandardMaterial | null = null
  private disposed = false
  private outfit: OutfitId | null = null
  /** The surface suit's helmet, shown only with that suit. */
  private readonly surfaceGear: Object3D[] = []
  /** The suit body, its loosened shape per outfit, the gloves and the gear per outfit. */
  private outfitMesh: SkinnedMesh | null = null
  private readonly suitShapes = new Map<OutfitId, BufferGeometry>()
  private gloves: SkinnedMesh | null = null
  private readonly gloveShapes = new Map<OutfitId, BufferGeometry>()
  private readonly gloveMaterial = new MeshStandardMaterial({ roughness: 0.75 })
  private readonly gearMeshes = new Map<OutfitId, SkinnedMesh>()
  /** Rest pose: each bone's local and model-space rotation, in parent-first order. */
  private readonly rest: { bone: Bone; parent: string | null; local: Quaternion; world: Quaternion }[] = []
  /** The pose currently shown while floating (model-space rotations per bone), eased toward the target. */
  private readonly floatShown = new Map<string, Quaternion>()
  private floatTime = 0
  /** The name tag and patch, pushed out to sit on the suit's surface. */
  private readonly decals: { mesh: Mesh; base: Vector3; normal: Vector3 }[] = []
  /**
   * The Moon suit, once loaded: its skinned parts on this skeleton, and
   * its own name tag and patch. Shown in place of the whole body (and the
   * built-in surface suit) while the surface suit is on.
   */
  private readonly moonSuit: Object3D[] = []
  private moonPatch: MeshStandardMaterial | null = null
  /** The bones the Moon suit posture changed last frame, with the rotations they had, put back before the next frame. */
  private readonly postureChanged: { bone: Bone; quaternion: Quaternion }[] = []
  /** The body's own meshes and decals, hidden while the Moon suit is on. */
  private readonly bodyParts: Object3D[] = []
  /** Rest-pose world matrices of the bones decals hang on, for fitting decals that arrive later. */
  private readonly restBones = new Map<string, Matrix4>()
  private castsShadow = false
  /** Suit colours that replace an outfit's own (a crew member's coverall), by outfit. */
  private suitColors: Partial<Record<OutfitId, string>> = {}
  /** Small attached things (glasses, a beard, a stripe), shown only in some outfits and never inside the Moon suit. */
  private readonly accessories: { object: Object3D; outfits: readonly OutfitId[] }[] = []

  constructor(gltf: GLTF, options: { name: string; outfit: OutfitId; look?: Partial<AstronautLook> }) {
    this.info = gltf.scene.userData.astronaut as AstronautInfo
    this.model = cloneSkinned(gltf.scene) as Group
    const look: AstronautLook = { ...DEFAULT_LOOK[this.info.variant], ...options.look }
    this.hairStyle = look.hair
    const skinBase = gltf.scene.userData.skinBase as Texture | undefined

    // Outfit material: suit colour, a woven normal map, boots darkened by vertex colour.
    const fabric = surfaceTextures('fabric').normalMap.clone()
    fabric.wrapS = RepeatWrapping
    fabric.wrapT = RepeatWrapping
    fabric.repeat.set(18, 18)
    fabric.needsUpdate = true
    this.outfitMaterial = new MeshStandardMaterial({
      vertexColors: true,
      normalMap: fabric,
      metalness: 0,
    })
    this.owned.push(this.outfitMaterial, fabric)

    // The pack's hair textures are grey, meant to be tinted: the hair and the eyebrows each get a tinted copy.
    let skinMesh: SkinnedMesh | null = null
    let eyes: MeshStandardMaterial | null = null
    this.model.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      mesh.frustumCulled = false
      mesh.castShadow = false
      const material = mesh.material as Material
      if (material.name === 'Outfit') {
        mesh.material = this.outfitMaterial
        this.outfitMesh = mesh as SkinnedMesh
      } else if (material.name === 'Skin') {
        // A copy per astronaut, so each has their own skin tone.
        if (!this.skin) {
          this.skin = (material as MeshStandardMaterial).clone()
          if (skinBase) this.skin.map = skinBase
          // Skin isn't plastic: matte, never metallic, with a faint warm glow in the shadows (light scattering under skin).
          this.skin.roughness = 0.62
          this.skin.metalness = 0
          this.skin.emissive.set('#5a2416')
          this.skin.emissiveIntensity = 0.07
          this.tintSkin(this.skin)
          this.owned.push(this.skin)
        }
        mesh.material = this.skin
        // Our own copy of the skin's shape: the hands are cut out of it for gloves.
        if ((mesh as SkinnedMesh).isSkinnedMesh && !skinMesh) {
          mesh.geometry = mesh.geometry.clone()
          this.owned.push(mesh.geometry)
          skinMesh = mesh as SkinnedMesh
        }
      } else if (material.name.startsWith('MI_Hair')) {
        const copy = (material as MeshStandardMaterial).clone()
        this.owned.push(copy)
        mesh.material = copy
        if (mesh.name === 'Hair') {
          this.ownHair = mesh as SkinnedMesh
          this.hairMaterials.push(copy)
        } else {
          this.browMaterial = copy
        }
      } else if (material.name === 'MI_Eyes') {
        if (!eyes) {
          eyes = (material as MeshStandardMaterial).clone()
          this.tintEyes(eyes)
          this.owned.push(eyes)
        }
        mesh.material = eyes
      }
    })

    // Name tag and patch, fixed to the chest and shoulder bones.
    this.model.updateMatrixWorld(true)
    this.nameTag = createNameTag(options.name)
    this.owned.push(this.nameTag.texture)
    const tagWidth = this.info.anchors.nameTag.width ?? 0.12
    const patchWidth = this.info.anchors.patch.width ?? 0.075
    for (const name of ['spine_03', 'upperarm_l']) {
      const bone = this.model.getObjectByName(name)
      if (bone) this.restBones.set(name, bone.matrixWorld.clone())
    }
    this.attach(this.info.anchors.nameTag, tagWidth, tagWidth / 3.2, this.nameTag.texture)
    this.patchMaterial = this.attach(this.info.anchors.patch, patchWidth, patchWidth, missionPatchTexture(look.patch))
    this.buildSurfaceGear()
    this.buildSuits(skinMesh)
    // Everything of the body that the Moon suit covers: every mesh so far, and the decals.
    this.model.traverse((object) => {
      if ((object as Mesh).isMesh && !this.surfaceGear.some((gear) => gear === object || gear.getObjectById(object.id))) {
        if (![...this.gearMeshes.values()].includes(object as SkinnedMesh)) this.bodyParts.push(object)
      }
    })
    this.recordRest()
    this.setOutfit(options.outfit)
    void loadMoonSuit(this.info.variant)
      .then((suit) => this.wearMoonSuit(suit, skinMesh))
      .catch((error: unknown) => console.error('Could not load the Moon suit; the built-in one stays', error))

    // Face the root's -z, matching the player's yaw convention.
    if (this.info.forward[2] > 0) this.model.rotation.y = Math.PI
    this.root.add(this.model)

    this.mixer = new AnimationMixer(this.model)
    for (const clip of gltf.animations) {
      this.actions.set(clip.name as ClipName, this.mixer.clipAction(clip))
    }
    this.actions.get('idle')?.play()

    this.applyLook(look)
  }

  /**
   * Skin tone in the shader: the texture divided by its average colour is
   * the detail (pores, lips, shading), and the tone's base colour is
   * multiplied by it, all in linear light. So every point on the slider
   * keeps the face's detail, and lips and shading darken with the skin.
   */
  private tintSkin(material: MeshStandardMaterial): void {
    material.color.setRGB(1, 1, 1)
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.skinUniforms)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSkinTone;\nuniform vec3 uSkinMean;\nuniform float uSkinChroma;')
        .replace(
          '#include <map_fragment>',
          /* glsl */ `#include <map_fragment>
          {
            vec3 detail = clamp(diffuseColor.rgb / uSkinMean, 0.2, 2.4);
            float level = dot(detail, vec3(0.3333));
            detail = mix(vec3(level), detail, uSkinChroma);
            diffuseColor.rgb = uSkinTone * detail;
          }`,
        )
    }
    material.customProgramCacheKey = () => 'astronaut-skin'
  }

  /** Eye colour in the shader: only the iris is recoloured, keeping its shading, the pupil and the highlight. */
  private tintEyes(material: MeshStandardMaterial): void {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.eyeUniforms)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uIris;\nuniform float uIrisMix;')
        .replace(
          '#include <map_fragment>',
          /* glsl */ `#include <map_fragment>
          {
            float ring = distance(vMapUv, vec2(${IRIS.u}, ${IRIS.v}));
            float iris = 1.0 - smoothstep(${IRIS.inner}, ${IRIS.outer}, ring);
            float light = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            vec3 tinted = uIris * min(light * 9.0, 1.6);
            float highlight = smoothstep(0.3, 0.6, light);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(tinted, diffuseColor.rgb, highlight), iris * uIrisMix);
          }`,
        )
    }
    material.customProgramCacheKey = () => 'astronaut-eyes'
  }

  /** Sets everything about how the astronaut looks at once. */
  applyLook(look: AstronautLook): void {
    this.setSkinTone(look.skinTone)
    this.setHairColor(look.hairColor)
    this.setHair(look.hair)
    this.setEyeColor(look.eyeColor)
    this.setPatch(look.patch)
  }

  /** Skin tone from 0 (lightest) to 1 (darkest). */
  setSkinTone(tone: number): void {
    const [r, g, b] = skinToneLinear(tone)
    this.skinUniforms.uSkinTone.value.setRGB(r, g, b)
    // The eyebrows follow the hair, a little deeper on darker skin.
    this.tintBrows(tone)
  }

  private browTone = 0.5

  private tintBrows(tone = this.browTone): void {
    this.browTone = tone
    this.browMaterial?.color.copy(this.hairColor).multiplyScalar(0.9 - 0.3 * tone)
  }

  /** A hair colour id from HAIR_COLORS. */
  setHairColor(id: string): void {
    this.hairColor.set(swatchColor(HAIR_COLORS, id))
    for (const material of this.hairMaterials) material.color.copy(this.hairColor)
    this.tintBrows()
  }

  /** An eye colour id from EYE_COLORS. Brown is the texture's own iris. */
  setEyeColor(id: string): void {
    this.eyeUniforms.uIris.value.set(swatchColor(EYE_COLORS, id))
    this.eyeUniforms.uIrisMix.value = id === 'brown' ? 0 : 1
  }

  setPatch(id: PatchId): void {
    if (this.patchMaterial) this.patchMaterial.map = missionPatchTexture(id)
    if (this.moonPatch) this.moonPatch.map = missionPatchTexture(id)
  }

  /**
   * The hairstyle: the body's own, the other body's (its mesh is borrowed
   * from that body's model, loaded the first time it is picked, and bound
   * to this skeleton), or none.
   */
  setHair(style: HairStyle): void {
    this.hairStyle = style
    this.showHair()
    const own = OWN_HAIR[this.info.variant]
    if (style === 'none' || style === own || this.otherHair) return
    void loadAstronaut(HAIR_FILE[style])
      .then((gltf) => {
        if (this.disposed || this.otherHair) return
        this.borrowHair(gltf)
        this.showHair()
      })
      .catch(() => undefined)
  }

  private showHair(): void {
    // Under the surface suit's helmet there is no hair to see, and long hair would poke out of it.
    const helmet = this.outfit === 'surface'
    const own = OWN_HAIR[this.info.variant]
    if (this.ownHair) this.ownHair.visible = !helmet && this.hairStyle === own
    if (this.otherHair) this.otherHair.visible = !helmet && this.hairStyle !== own && this.hairStyle !== 'none'
  }

  /** Puts the other body's hair mesh on this skeleton. The geometry stays the model's; the material is our own copy. */
  private borrowHair(gltf: GLTF): void {
    const anchor = this.ownHair
    if (!anchor?.parent) return
    let source: SkinnedMesh | null = null
    gltf.scene.traverse((object) => {
      if ((object as SkinnedMesh).isSkinnedMesh && object.name === 'Hair') source = object as SkinnedMesh
    })
    const from = source as SkinnedMesh | null
    if (!from) return
    // Same rig in both bodies: match the bones by name.
    const byName = new Map(anchor.skeleton.bones.map((bone) => [bone.name, bone]))
    const bones = from.skeleton.bones.map((bone) => byName.get(bone.name))
    if (bones.some((bone) => !bone)) return
    const skeleton = new Skeleton(bones as Bone[], from.skeleton.boneInverses)
    const material = (from.material as MeshStandardMaterial).clone()
    material.color.copy(this.hairColor)
    const mesh = new SkinnedMesh(from.geometry, material)
    mesh.name = 'HairOther'
    mesh.position.copy(from.position)
    mesh.quaternion.copy(from.quaternion)
    mesh.scale.copy(from.scale)
    mesh.bind(skeleton, from.bindMatrix)
    mesh.frustumCulled = false
    mesh.castShadow = anchor.castShadow
    mesh.layers.mask = anchor.layers.mask
    anchor.parent.add(mesh)
    this.otherHair = mesh
    this.hairMaterials.push(material)
    this.owned.push(material, skeleton)
  }

  /** Remembers the rest (T) pose of the body's main bones, for the floating poses. */
  private recordRest(): void {
    const names = /^(pelvis|spine_0[123]|neck_01|Head|clavicle_[lr]|upperarm_[lr]|lowerarm_[lr]|hand_[lr]|thigh_[lr]|calf_[lr]|foot_[lr])$/
    const rootInverse = new Matrix4().copy(this.model.matrixWorld).invert()
    const visit = (object: Object3D) => {
      const bone = object as Bone
      if (bone.isBone && names.test(bone.name)) {
        const world = new Quaternion()
        new Matrix4().multiplyMatrices(rootInverse, bone.matrixWorld).decompose(new Vector3(), world, new Vector3())
        const parent = bone.parent && names.test(bone.parent.name) ? bone.parent.name : null
        this.rest.push({ bone, parent, local: bone.quaternion.clone(), world })
      }
      for (const child of object.children) visit(child)
    }
    visit(this.model)
  }

  /**
   * Floating in microgravity: poses built from bone rotations instead of a
   * clip. `glide` 0 is the relaxed neutral posture, 1 a streamlined glide;
   * `rail` is the side of a handrail being pulled along (+1 left, -1 right,
   * 0 none); `caught` shows both hands out after bumping into a wall;
   * `twist` turns the torso and head toward a turn. Eased, so changes blend
   * over about a third of a second.
   */
  updateFloat(dt: number, motion: { glide: number; rail: number; caught: boolean; twist: number; quick: boolean }): void {
    this.floatTime += dt
    const t = this.floatTime
    let target: BonePose = blendPoses(neutralPose(t), glidePose(t), Math.max(0, Math.min(1, motion.glide)))
    if (motion.rail !== 0) railArms(target, motion.rail, t * 3.2)
    if (motion.caught) catchArms(target)
    if (motion.twist) twistToward(target, motion.twist)
    this.applyPose(target, dt, motion.quick ? 0.08 : 0.14)
  }

  /** Sitting strapped into a seat (launch and landing): a pose built from bone rotations, as when floating. */
  updateSeated(dt: number): void {
    this.floatTime += dt
    this.applyPose(seatedPose(this.floatTime), dt, 0.14)
  }

  /** Eases the main bones toward `target` (over about `ease` seconds) and poses the skeleton with it. */
  private applyPose(target: BonePose, dt: number, ease: number): void {
    const k = 1 - Math.exp(-dt / ease)
    for (const [name, q] of target) {
      const shown = this.floatShown.get(name)
      if (shown) shown.slerp(q, k)
      else this.floatShown.set(name, q.clone())
    }
    target = this.floatShown
    // Apply: each bone's model-space rotation is its pose rotation (on top of its parent's) times its rest rotation.
    const delta = new Map<string, Quaternion>()
    const world = new Map<string, Quaternion>()
    for (const entry of this.rest) {
      const parentDelta = entry.parent ? (delta.get(entry.parent) ?? new Quaternion()) : new Quaternion()
      const own = target.get(entry.bone.name) ?? new Quaternion()
      const d = own.clone().multiply(parentDelta)
      delta.set(entry.bone.name, d)
      const desired = d.clone().multiply(entry.world)
      world.set(entry.bone.name, desired)
      if (entry.parent) {
        const parentWorld = world.get(entry.parent)!
        entry.bone.quaternion.copy(parentWorld.clone().invert().multiply(desired))
      } else {
        entry.bone.quaternion.copy(entry.local)
      }
    }
  }

  /** Fixes an object to a bone, given where it should sit in the model's bind pose. */
  private fix(boneName: string, object: Object3D, position: Vector3): boolean {
    const bone = this.model.getObjectByName(boneName) as Bone | undefined
    if (!bone) return false
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), this.info.forward[2] > 0 ? 0 : Math.PI)
    const world = new Matrix4().compose(position, turn, new Vector3(1, 1, 1))
    const local = new Matrix4().copy(bone.matrixWorld).invert().multiply(world)
    local.decompose(object.position, object.quaternion, object.scale)
    bone.add(object)
    return true
  }

  /**
   * The surface suit's gear: a white helmet with a gold sun visor and a neck
   * ring, on the head bone, and a life-support backpack on the upper back.
   * Built once, shown only while wearing the surface suit.
   */
  private buildSurfaceGear(): void {
    const forward = this.info.forward[2] > 0 ? 1 : -1
    const head = this.model.getObjectByName('Head') as Bone | undefined
    const chest = this.model.getObjectByName('spine_03') as Bone | undefined
    if (!head || !chest) return
    const headPos = new Vector3().setFromMatrixPosition(head.matrixWorld)
    const chestPos = new Vector3().setFromMatrixPosition(chest.matrixWorld)

    const white = new MeshStandardMaterial({ color: '#eef0f2', roughness: 0.45, metalness: 0.05 })
    const gold = new MeshStandardMaterial({ color: '#c9962e', roughness: 0.18, metalness: 0.9 })
    const grey = new MeshStandardMaterial({ color: '#9aa0a8', roughness: 0.5, metalness: 0.4 })
    // A large helmet: a white shell, a big gold visor, a neck ring, and a light on each side.
    const shell = new SphereGeometry(0.205, 32, 22)
    // The visor covers the front of the helmet: a band of the sphere facing +z.
    const visor = new SphereGeometry(0.211, 32, 16, Math.PI / 2 - 1.05, 2.1, 0.62, 1.2)
    const ring = new TorusGeometry(0.15, 0.03, 8, 28)
    const lamp = new BoxGeometry(0.05, 0.07, 0.09)
    const lens = new BoxGeometry(0.035, 0.04, 0.01)
    const glow = new MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d8', emissiveIntensity: 1.6 })
    this.owned.push(white, gold, grey, shell, visor, ring, lamp, lens, glow)
    void chestPos

    const helmet = new Group()
    const shellMesh = new Mesh(shell, white)
    const visorMesh = new Mesh(visor, gold)
    const ringMesh = new Mesh(ring, grey)
    ringMesh.rotation.x = Math.PI / 2
    ringMesh.position.y = -0.17
    helmet.add(shellMesh, visorMesh, ringMesh)
    for (const side of [-1, 1]) {
      const lampMesh = new Mesh(lamp, grey)
      lampMesh.position.set(side * 0.2, 0.03, 0.04)
      const lensMesh = new Mesh(lens, glow)
      lensMesh.position.set(side * 0.2, 0.03, 0.09)
      helmet.add(lampMesh, lensMesh)
    }
    helmet.traverse((object) => {
      object.frustumCulled = false
    })
    if (this.fix('Head', helmet, headPos.clone().add(new Vector3(0, 0.085, 0.02 * forward)))) this.surfaceGear.push(helmet)
    for (const item of this.surfaceGear) item.visible = false
  }

  /**
   * Puts the Moon suit on this skeleton: each of its skinned parts is
   * bound to this body's bones by name (the suit was fitted to the same
   * skeleton, so its bind matrices are the body's), plus its own name tag
   * and patch. Then the outfit is applied again, to show it if it's on.
   */
  private wearMoonSuit(suit: GLTF, anchor: SkinnedMesh | null): void {
    if (this.disposed || !anchor?.parent || this.moonSuit.length > 0) return
    const bones = new Map(anchor.skeleton.bones.map((bone) => [bone.name, bone]))
    const info = suit.scene.userData.moonSuit as MoonSuitInfo | undefined
    suit.scene.traverse((object) => {
      const source = object as SkinnedMesh
      if (!source.isSkinnedMesh) return
      const list = source.skeleton.bones.map((bone) => bones.get(bone.name))
      if (list.some((bone) => !bone)) return
      const skeleton = new Skeleton(list as Bone[], source.skeleton.boneInverses)
      const material = source.material as MeshStandardMaterial
      if (material.name === 'MoonSuit') material.vertexColors = true
      const mesh = new SkinnedMesh(source.geometry, material)
      mesh.name = `MoonSuit:${material.name}`
      mesh.position.copy(source.position)
      mesh.quaternion.copy(source.quaternion)
      mesh.scale.copy(source.scale)
      mesh.bind(skeleton, source.bindMatrix)
      mesh.frustumCulled = false
      mesh.castShadow = this.castsShadow
      mesh.layers.mask = anchor.layers.mask
      anchor.parent!.add(mesh)
      this.moonSuit.push(mesh)
      // The geometry and material are shared by every astronaut in this suit (cached with the file); the skeleton is ours.
      this.owned.push(skeleton)
    })
    if (info) {
      const tag = info.anchors.nameTag
      const patch = info.anchors.patch
      const tagWidth = tag.width ?? 0.12
      const patchWidth = patch.width ?? 0.085
      const tagMaterial = this.attach(tag, tagWidth, tagWidth / 3.2, this.nameTag.texture, this.moonSuit)
      this.moonPatch = this.attach(patch, patchWidth, patchWidth, this.patchMaterial?.map ?? missionPatchTexture(), this.moonSuit)
      void tagMaterial
    }
    for (const part of this.moonSuit) part.layers.mask = anchor.layers.mask
    const outfit = this.outfit
    this.outfit = null
    if (outfit) this.setOutfit(outfit)
  }

  /** True while the Moon suit is what shows. */
  private get inMoonSuit(): boolean {
    return this.outfit === 'surface' && this.moonSuit.length > 0
  }

  /**
   * A decal (name tag or patch) on a bone. Body decals are placed from the
   * bone where it is now (the constructor runs in the rest pose); the Moon
   * suit's (`into`), which can arrive mid-animation, from the rest pose
   * recorded then.
   */
  private attach(anchor: Anchor, width: number, height: number, map: Texture, into?: Object3D[]): MeshStandardMaterial | null {
    const bone = this.model.getObjectByName(anchor.bone) as Bone | undefined
    if (!bone) return null
    const boneWorld = into ? (this.restBones.get(anchor.bone) ?? bone.matrixWorld) : bone.matrixWorld
    const normal = new Vector3(...anchor.normal).normalize()
    const position = new Vector3(...anchor.position).addScaledVector(normal, DECAL_OFFSET)
    const rotation = new Quaternion()
    if (anchor.up) {
      // Face out along the normal with the top toward `up`.
      const right = new Vector3().crossVectors(new Vector3(...anchor.up), normal).normalize()
      const top = new Vector3().crossVectors(normal, right)
      rotation.setFromRotationMatrix(new Matrix4().makeBasis(right, top, normal))
    } else {
      rotation.setFromUnitVectors(new Vector3(0, 0, 1), normal)
    }
    const world = new Matrix4().compose(position, rotation, new Vector3(1, 1, 1))
    const local = new Matrix4().copy(boneWorld).invert().multiply(world)
    const geometry = new PlaneGeometry(width, height)
    const material = new MeshStandardMaterial({ map, transparent: true, alphaTest: 0.3, roughness: 0.7 })
    const mesh = new Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.castShadow = this.castsShadow
    local.decompose(mesh.position, mesh.quaternion, mesh.scale)
    bone.add(mesh)
    this.owned.push(geometry, material)
    if (into) {
      into.push(mesh)
      return material
    }
    // Remember where it sits and which way is out, to move it with the suit's fit.
    const localNormal = normal.clone().transformDirection(new Matrix4().copy(boneWorld).invert())
    this.decals.push({ mesh, base: mesh.position.clone(), normal: localNormal })
    return material
  }

  /** Whether the body casts real-time shadows (on the Moon, its long shadow from the low Sun). */
  setCastShadow(on: boolean): void {
    this.castsShadow = on
    this.root.traverse((object) => {
      if ((object as Mesh).isMesh) object.castShadow = on && !object.userData.noShadow
    })
  }

  /** Colours that replace the outfits' own (each crew member's coverall), then reapplies the current outfit. */
  setSuitColors(colors: Partial<Record<OutfitId, string>>): void {
    this.suitColors = colors
    const current = this.outfit
    this.outfit = null
    if (current) this.setOutfit(current)
  }

  /**
   * Fixes a small object to a bone so it moves with the body. It goes
   * `offset` metres from the bone at rest (up, forward the way the body
   * faces, and to the body's left), upright and facing forward. Shown only in
   * `outfits`, never inside the Moon suit. Call before the first update.
   */
  addAccessory(boneName: string, object: Object3D, offset: { up: number; forward: number; left?: number }, outfits: readonly OutfitId[]): void {
    const bone = this.bone(boneName)
    if (!bone) return
    // At rest, with the root at the origin facing −z.
    this.root.updateMatrixWorld(true)
    const rootInverse = new Matrix4().copy(this.root.matrixWorld).invert()
    const boneInRoot = new Matrix4().multiplyMatrices(rootInverse, bone.matrixWorld)
    const at = new Vector3().setFromMatrixPosition(boneInRoot).add(new Vector3(-(offset.left ?? 0), offset.up, -offset.forward))
    const local = boneInRoot.invert().multiply(new Matrix4().makeTranslation(at.x, at.y, at.z))
    local.decompose(object.position, object.quaternion, object.scale)
    bone.add(object)
    object.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      mesh.frustumCulled = false
      // Too small to throw a shadow worth its draw call.
      mesh.castShadow = false
      mesh.userData.noShadow = true
      this.owned.push(mesh.geometry)
      const material = mesh.material as Material
      if (!this.owned.includes(material)) this.owned.push(material)
    })
    this.accessories.push({ object, outfits })
    object.visible = this.outfit !== null && outfits.includes(this.outfit) && !this.inMoonSuit
  }

  /** A bone, e.g. 'Head', for turning it toward someone after the animation has posed it. */
  bone(name: string): Object3D | undefined {
    let found: Object3D | undefined
    this.model.traverse((object) => {
      if (!found && (object as Bone).isBone && object.name === name) found = object
    })
    return found
  }

  setName(name: string): void {
    this.nameTag.setName(name)
  }

  setOutfit(id: OutfitId): void {
    if (id === this.outfit) return
    this.outfit = id
    // On the Moon: the NASA suit in place of the whole body, once it has loaded (the built-in surface suit until then).
    const nasa = this.inMoonSuit
    for (const part of this.moonSuit) part.visible = id === 'surface'
    for (const part of this.bodyParts) part.visible = !nasa
    if (this.gloves) this.gloves.visible = !nasa
    for (const decal of this.decals) decal.mesh.visible = !nasa
    for (const item of this.surfaceGear) item.visible = id === 'surface' && !nasa
    this.showHair()
    const outfit = OUTFITS[id]
    this.outfitMaterial.color.set(this.suitColors[id] ?? outfit.color)
    for (const item of this.accessories) item.object.visible = item.outfits.includes(id) && !nasa
    this.outfitMaterial.roughness = outfit.roughness
    const suit = this.suitShapes.get(id)
    if (this.outfitMesh && suit) this.outfitMesh.geometry = suit
    const glove = this.gloveShapes.get(id)
    if (this.gloves && glove) this.gloves.geometry = glove
    this.gloveMaterial.color.set(outfit.gear.glove)
    for (const [gearId, mesh] of this.gearMeshes) mesh.visible = gearId === id && !nasa
    // The name tag and patch sit on the suit's (looser) surface.
    const push = id === 'surface' ? 0.052 : id === 'launch' ? 0.015 : 0.012
    for (const decal of this.decals) decal.mesh.position.copy(decal.base).addScaledVector(decal.normal, push)
  }

  /**
   * Suits that read as clothing, never as a bare body: a loosened suit shape
   * per outfit, gloves cut from the hands, and the gear (collar, harness,
   * pockets, pads, closed boots round the cut-out feet; the surface suit's
   * rings and backpack).
   */
  private buildSuits(skinMesh: SkinnedMesh | null): void {
    const outfit = this.outfitMesh
    if (!outfit) return
    this.model.updateMatrixWorld(true)
    const rootInverse = new Matrix4().copy(this.model.matrixWorld).invert()
    const rest = restToModel(outfit, rootInverse)
    suitSeams(this.outfitMaterial, rest)
    const measure = measureBody(outfit, rootInverse, rest)
    const gearMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.08 })
    this.owned.push(gearMaterial, this.gloveMaterial)
    const original = outfit.geometry
    // Bare hands and feet never show: they become gloves and boots.
    const split = skinMesh ? splitSkin(skinMesh, restToModel(skinMesh, rootInverse)) : null
    const hands = split?.hands ?? null
    if (split?.feet) measure.feet = split.feet
    for (const id of Object.keys(OUTFITS) as OutfitId[]) {
      const suit = fittedSuit(outfit, rest, id)
      this.suitShapes.set(id, suit)
      this.owned.push(suit)
      const gear = buildGear(outfit, measure, rest, id, OUTFITS[id].gear, gearMaterial)
      gear.visible = false
      outfit.parent?.add(gear)
      this.gearMeshes.set(id, gear)
      this.owned.push(gear.geometry)
      if (skinMesh && hands) {
        const glove = gloveGeometry(skinMesh, restToModel(skinMesh, rootInverse), hands, id)
        this.gloveShapes.set(id, glove)
        this.owned.push(glove)
      }
    }
    void original
    if (skinMesh && hands) {
      const first = this.gloveShapes.values().next().value as BufferGeometry
      const gloves = new SkinnedMesh(first, this.gloveMaterial)
      gloves.position.copy(skinMesh.position)
      gloves.quaternion.copy(skinMesh.quaternion)
      gloves.scale.copy(skinMesh.scale)
      gloves.bind(skinMesh.skeleton, skinMesh.bindMatrix)
      gloves.frustumCulled = false
      skinMesh.parent?.add(gloves)
      this.gloves = gloves
    }
  }

  /** The clip and playback rate for how the body moves, matched to each clip's own stride. */
  private pick({ speed, airborne, crouching, floating }: Motion): [ClipName, number] {
    const speeds = this.info.clipSpeeds
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
    // Floating: a relaxed, slowed-down idle; the body drifts and bobs around it.
    if (floating) return ['idle', 0.35]
    if (airborne && this.actions.has('jump')) return ['jump', 1.4]
    if (crouching && this.actions.has('sneak')) {
      return speed < 0.15 ? ['crouch', 1] : ['sneak', clamp(speed / (speeds.sneak ?? 0.75), 0.6, 2)]
    }
    if (speed < 0.15) return ['idle', 1]
    if (speed < 1.7) return ['walk', clamp(speed / speeds.walk, 0.6, 1.7)]
    if (speed < 4.3) return ['jog', clamp(speed / speeds.jog, 0.45, 1.1)]
    return ['sprint', clamp(speed / speeds.sprint, 0.5, 1.1)]
  }

  /** Advances the animation, given how fast the body moves and whether it is jumping or crouching. */
  update(dt: number, motion: Motion | number): void {
    const [name, rate] = this.pick(typeof motion === 'number' ? { speed: motion, airborne: false, crouching: false } : motion)
    if (name !== this.current) {
      const next = this.actions.get(name)
      const previous = this.actions.get(this.current)
      if (next) {
        next.reset().setEffectiveWeight(1).fadeIn(FADE).play()
        previous?.fadeOut(FADE)
        this.current = name
      }
    }
    const action = this.actions.get(this.current)
    if (action) action.timeScale = rate
    this.undoSuitPosture()
    this.mixer.update(dt)
    if (this.inMoonSuit) this.suitPosture()
  }

  /** Puts back what suitPosture changed (a bone the clip doesn't move would otherwise keep turning). */
  private undoSuitPosture(): void {
    for (const { bone, quaternion } of this.postureChanged) bone.quaternion.copy(quaternion)
    this.postureChanged.length = 0
  }

  /** Straightens the hips and upper chest toward rest, keeping the limbs' pose (see SUIT_POSTURE). */
  private suitPosture(): void {
    const rest = (name: string) => this.rest.find((entry) => entry.bone.name === name)
    const remember = (bone: Bone) => {
      if (!this.postureChanged.some((entry) => entry.bone === bone)) this.postureChanged.push({ bone, quaternion: bone.quaternion.clone() })
    }
    for (const { bone: name, amount, keep } of SUIT_POSTURE) {
      const entry = rest(name)
      if (!entry) continue
      const bone = entry.bone
      remember(bone)
      const before = bone.quaternion.clone()
      bone.quaternion.slerp(entry.local, amount)
      const undo = bone.quaternion.clone().invert().multiply(before)
      for (const child of keep) {
        const kept = rest(child)?.bone
        if (!kept) continue
        remember(kept)
        kept.quaternion.premultiply(undo)
      }
    }
    // Hold the arms a little out to the sides: each upper arm turns about the body's forward axis, away from the chest.
    const chest = rest('spine_03')?.bone
    if (!chest) return
    this.model.updateMatrixWorld(true)
    const axis = new Vector3(...this.info.forward).applyQuaternion(this.model.getWorldQuaternion(new Quaternion())).normalize()
    const down = new Vector3(0, -1, 0)
    const chestAt = chest.getWorldPosition(new Vector3())
    for (const side of ['l', 'r']) {
      const bone = rest(`upperarm_${side}`)?.bone
      if (!bone?.parent) continue
      remember(bone)
      const outward = bone.getWorldPosition(new Vector3()).sub(chestAt)
      const sign = Math.sign(axis.clone().cross(down).dot(outward)) || 1
      const turn = new Quaternion().setFromAxisAngle(axis, sign * SUIT_ARMS_OUT)
      const world = bone.getWorldQuaternion(new Quaternion())
      const parent = bone.parent.getWorldQuaternion(new Quaternion())
      bone.quaternion.copy(parent.invert().multiply(turn.multiply(world)))
    }
  }

  dispose(): void {
    this.disposed = true
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.model)
    this.root.removeFromParent()
    // Each skinned mesh's skeleton keeps a texture of bone matrices on the GPU; this copy's skeletons are its own.
    this.model.traverse((object) => {
      const mesh = object as SkinnedMesh
      if (mesh.isSkinnedMesh) mesh.skeleton.dispose()
    })
    for (const item of this.owned) item.dispose()
  }
}
