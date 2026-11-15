import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BoxGeometry, Frustum, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Sphere, SphereGeometry, TorusGeometry, Vector3, type Object3D } from 'three'
import { Astronaut, loadAstronaut } from '../character/astronaut'
import type { OutfitId } from '../character/outfits'
import { CREW_FIGURES, levelY } from '../maps/collision'
import type { GameMap } from '../maps/types'
import type { AstronautLook, AstronautVariant } from '../state/astronaut'
import { crewPlaces, type CrewPlace } from '../state/crewPlaces'
import { onLine } from '../state/lines'
import { CAST, type SpeakerId } from '../state/mission'
import { player } from '../state/player'
import { useGame, useGraphicsPreset } from '../state/store'
import { crewShown } from './crewRuntime'
import { BEATS, beatCrew, sceneCrew } from './beats'
import { lunarGround } from './kit/lunar'

/**
 * How each crew member looks, matching their portraits (src/hud/art/Portrait.tsx):
 * the same CC0 bodies as the player, with skin and hair as drawn, their own
 * coverall colour indoors, and small attached gear.
 */
interface CrewStyle {
  variant: AstronautVariant
  look: Partial<AstronautLook>
  /** The indoor coverall's colour, and a trim stripe across the chest. */
  coverall: string
  stripe?: string
  beard?: string
  glasses?: boolean
  /** Hair up in a bun, in this colour. */
  bun?: string
  /** A small patch on the chest (the safety officer's red one). */
  chestPatch?: string
}

const STYLES: Partial<Record<SpeakerId, CrewStyle>> = {
  // Veteran commander: grey at the sides, a beard, a navy flight suit with a gold stripe.
  commander: { variant: 'male', look: { skinTone: 0.62, hair: 'short', hairColor: 'grey', eyeColor: 'dark', patch: 'moon' }, coverall: '#22324f', stripe: '#ffd166', beard: '#3b3b40' },
  // Safety and medical officer: glasses, a white flight suit with a red patch.
  safety: { variant: 'male', look: { skinTone: 0.18, hair: 'short', hairColor: 'black', eyeColor: 'brown', patch: 'stars' }, coverall: '#e4e8ee', glasses: true, chestPatch: '#d63a3a' },
  // Science officer and botanist (the best friend): hair in a bun, a green flight suit.
  science: { variant: 'female', look: { skinTone: 0.42, hair: 'short', hairColor: 'auburn', eyeColor: 'hazel', patch: 'earth' }, coverall: '#3f7d5a', stripe: '#4fd18b', bun: '#6b3a1f' },
  // Houston, the communications officer (met only at the launch center): a light blue mission-control polo, sandy hair.
  comms: { variant: 'male', look: { skinTone: 0.12, hair: 'short', hairColor: 'blonde', eyeColor: 'blue', patch: 'earth' }, coverall: '#5cc8ff', stripe: '#0f2c3d' },
  // Trainer: an orange ground-crew jacket with a hi-vis stripe.
  trainer: { variant: 'male', look: { skinTone: 0.86, hair: 'short', hairColor: 'black', eyeColor: 'dark', patch: 'rocket' }, coverall: '#ff8a2a', stripe: '#f4f6fb' },
}

/** Everyone moves slightly differently, so nobody idles in sync. */
const IDLE: Partial<Record<SpeakerId, { offset: number; speed: number }>> = {
  commander: { offset: 0.0, speed: 0.92 },
  safety: { offset: 1.3, speed: 1.06 },
  science: { offset: 2.1, speed: 0.98 },
  trainer: { offset: 0.7, speed: 1.1 },
  comms: { offset: 1.7, speed: 1.0 },
}

/** Height above the floor a floating crew member hovers at, and how much they bob. */
const FLOAT_HEIGHT = 0.25
const FLOAT_BOB = 0.05
/** Strapped into a cockpit seat: how high the hips are above the floor (the seat pan is about 0.47 m up). */
const SEATED_HIP = 0.56
/** From a lying body's feet to the middle of the bunk. */
const LYING_HALF_LENGTH = 0.85
/** From the back to the body's origin plane when lying down. */
const LYING_BACK = 0.12
/** Beyond this, the body isn't animated (it still stands there). */
const ANIMATE_WITHIN = 25
/** A crew member who speaks turns their head to the player within this distance. */
const LOOK_WITHIN = 8
/** How far the head turns, at most (radians), and how long a turn lasts after a line. */
const LOOK_MAX = 1.0
const LOOK_SECONDS = 4.5

const INDOOR: readonly OutfitId[] = ['flight', 'launch']

/**
 * The small attached gear that makes each crew member match their portrait,
 * placed in metres from the head and the upper chest bones.
 */
function dress(body: Astronaut, style: CrewStyle): void {
  if (style.glasses) {
    // Two rims and a bridge, merged into one mesh (one draw call).
    const rims = [-1, 1].map((side) => new TorusGeometry(0.019, 0.0028, 6, 16).translate(side * 0.032, 0, 0))
    const merged = mergeGeometries([...rims, new BoxGeometry(0.026, 0.004, 0.004)])!
    const glasses = new Mesh(merged, new MeshStandardMaterial({ color: '#1d2433', roughness: 0.4, metalness: 0.3 }))
    body.addAccessory('Head', glasses, LOOK_AT.glasses, INDOOR)
  }
  if (style.beard) {
    // The lower half of a squashed ball round the jaw: a short beard.
    const beard = new Mesh(new SphereGeometry(0.068, 16, 10, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44), new MeshStandardMaterial({ color: style.beard, roughness: 0.95 }))
    beard.scale.set(1, 0.95, 0.85)
    body.addAccessory('Head', beard, LOOK_AT.beard, INDOOR)
  }
  if (style.bun) {
    const bun = new Mesh(new SphereGeometry(0.045, 14, 10), new MeshStandardMaterial({ color: style.bun, roughness: 0.85 }))
    body.addAccessory('Head', bun, LOOK_AT.bun, INDOOR)
  }
  if (style.stripe) {
    const stripe = new Mesh(new BoxGeometry(0.26, 0.028, 0.012), new MeshStandardMaterial({ color: style.stripe, roughness: 0.6 }))
    body.addAccessory('spine_03', stripe, LOOK_AT.stripe, INDOOR)
  }
  if (style.chestPatch) {
    const patch = new Mesh(new BoxGeometry(0.06, 0.06, 0.012), new MeshStandardMaterial({ color: style.chestPatch, roughness: 0.6 }))
    body.addAccessory('spine_03', patch, LOOK_AT.patch, INDOOR)
  }
}

/** Where each piece of gear sits, from its bone at rest (metres: up, forward, to the left). */
const LOOK_AT = {
  glasses: { up: 0.095, forward: 0.095 },
  beard: { up: -0.005, forward: 0.06 },
  bun: { up: 0.16, forward: -0.1 },
  stripe: { up: 0.04, forward: 0.17 },
  patch: { up: 0.07, forward: 0.155, left: -0.08 },
}

const frustum = new Frustum()
const projection = new Matrix4()
const probe = new Vector3()
const bodySphere = new Sphere()

function inView(camera: { projectionMatrix: Matrix4; matrixWorldInverse: Matrix4 }, x: number, y: number, z: number): boolean {
  projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  frustum.setFromProjectionMatrix(projection)
  return frustum.containsPoint(probe.set(x, y + 1, z))
}

/** When each crew member last spoke (seconds, from the frame clock). */
const spokeAt = new Map<SpeakerId, number>()

function CrewMember({ map, speakerId }: { map: GameMap; speakerId: SpeakerId }) {
  const group = useRef<Group>(null)
  const body = useRef<Astronaut | null>(null)
  const shown = useRef<CrewPlace | null>(null)
  const look = useRef(0)
  /** The hips' height above the feet, standing (measured from the body once loaded), to sit them on a seat. */
  const hip = useRef(0.95)
  const preset = useGraphicsPreset()
  const camera = useThree((s) => s.camera)
  const style = STYLES[speakerId]!

  useEffect(() => {
    let cancelled = false
    let created: Astronaut | null = null
    loadAstronaut(style.variant)
      .then((gltf) => {
        if (cancelled || !group.current) return
        created = new Astronaut(gltf, { name: CAST[speakerId].name, outfit: map.outfit ?? 'flight', look: style.look })
        created.setSuitColors({ flight: style.coverall })
        dress(created, style)
        created.setCastShadow(preset.shadows && preset.crewShadows)
        const idle = IDLE[speakerId]
        if (idle) created.update(idle.offset, { speed: 0, airborne: false, crouching: false })
        group.current.add(created.root)
        const pelvis = created.bone('pelvis')
        if (pelvis) {
          group.current.updateMatrixWorld(true)
          hip.current = group.current.worldToLocal(pelvis.getWorldPosition(new Vector3())).y
        }
        body.current = created
      })
      .catch((error: unknown) => console.error('Could not load a crew member', error))
    return () => {
      cancelled = true
      created?.dispose()
      if (body.current === created) body.current = null
      crewShown.delete(speakerId)
    }
  }, [map, speakerId, style])

  useEffect(() => {
    body.current?.setCastShadow(preset.shadows && preset.crewShadows)
  }, [preset.shadows, preset.crewShadows])

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    // Strapped in for a launch or a landing (not the ending), the crew are in their seats too.
    const sequence = useGame.getState().sequence
    const strapped = !!sequence && sequence.id !== 'ending'
    // A scene's crew between its beats (walking to the briefing room, then waiting there); a beat's own staging wins.
    const staged = beatCrew()?.some((b) => b.speakerId === speakerId)
    const walker = staged ? undefined : sceneCrew(state.clock.elapsedTime, dt).find((w) => w.speakerId === speakerId)
    let target: CrewPlace | undefined = walker
      ? { speakerId, place: 'scene', x: walker.x, z: walker.z, yaw: walker.yaw, pose: 'walk', speed: walker.speed }
      : crewPlaces(map, useGame.getState().mission, beatCrew(), strapped).find((p) => p.speakerId === speakerId)
    if (!target) {
      // A scene's crew leave only while nobody can see it happen.
      const last = shown.current
      if (last?.place === 'scene' && g.visible && inView(camera, last.x, levelY(map, last.level), last.z)) target = { ...last, speed: 0 }
      else {
        g.visible = false
        crewShown.delete(speakerId)
        return
      }
    }
    // Move only while nobody can see it happen: neither the old spot nor the new one in view.
    const now = shown.current
    // A story beat places people at once (it's staged), and so does strapping in (the countdown starts with
    // everyone in their seats); otherwise only out of view, so after unbuckling they float off when not watched.
    // Walking with the player in a scene, they move every frame.
    if (!now || now.place === 'beat' || target.place === 'beat' || (target.place === 'seat' && now.place !== 'seat') || (target.place === 'scene' && now.place === 'scene')) shown.current = target
    else if (now.place !== target.place && !inView(camera, now.x, levelY(map, now.level), now.z) && !inView(camera, target.x, levelY(map, target.level), target.z)) {
      shown.current = target
    }
    const place = shown.current!
    crewShown.set(speakerId, place)
    // Nobody is seen through the outpost's outer walls: crew inside are hidden while the player is outside, and the
    // other way round (about 11 draw calls each). The lunar suit is how we know someone is outside.
    const crewOutside = place.outfit === 'surface'
    const playerOutside = map.exterior?.scene === 'lunar-south-pole' && useGame.getState().outdoors
    g.visible = map.exterior?.scene !== 'lunar-south-pole' || crewOutside === playerOutside
    // Outside (the Moon suit) they stand on the ground; inside, on their floor.
    const outdoors = place.outfit === 'surface'
    const floor = outdoors ? (lunarGround(map)?.(place.x, place.z) ?? 0) : levelY(map, place.level)
    // The bodies are never frustum culled (skinned), so a figure out of view still costs about 11 draw calls. Without crew
    // shadows (Medium, Low) nobody can see them, so they're skipped; on High their shadows may still fall into view.
    if (!(preset.shadows && preset.crewShadows)) {
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      frustum.setFromProjectionMatrix(projection)
      if (!frustum.intersectsSphere(bodySphere.set(probe.set(place.x, floor + 0.9, place.z), 1.3))) g.visible = false
    }
    body.current?.setOutfit(place.outfit ?? map.outfit ?? 'flight')
    const t = state.clock.elapsedTime
    g.rotation.order = 'YXZ'
    if (place.pose === 'lie') {
      // Lying on the bunk, head towards `yaw`, face up: asleep.
      g.position.set(place.x - Math.sin(place.yaw) * LYING_HALF_LENGTH, floor + (place.y ?? 0) + LYING_BACK, place.z - Math.cos(place.yaw) * LYING_HALF_LENGTH)
      g.rotation.set(Math.PI / 2, place.yaw, 0)
    } else if (place.pose === 'sit') {
      // Sitting in the seat: the hips on the seat pan, facing the way the seat faces.
      g.position.set(place.x, floor + SEATED_HIP - hip.current, place.z)
      g.rotation.set(0, place.yaw, 0)
    } else if (place.pose === 'float') {
      g.position.set(place.x, floor + FLOAT_HEIGHT + Math.sin(t * 0.8 + speakerId.length) * FLOAT_BOB, place.z)
      g.rotation.set(Math.sin(t * 0.5) * 0.03, place.yaw + Math.sin(t * 0.3) * 0.05, 0)
    } else {
      g.position.set(place.x, floor, place.z)
      g.rotation.set(0, place.yaw, 0)
    }

    const b = body.current
    if (!b) return
    const distance = Math.hypot(player.x - place.x, player.z - place.z)
    const visible = distance < ANIMATE_WITHIN && inView(camera, place.x, floor, place.z)
    if (!visible) return
    const step = Math.min(dt, 0.1) * (IDLE[speakerId]?.speed ?? 1)
    const pace = place.speed ?? 0
    if (place.pose === 'float') b.updateFloat(step, { glide: 0, rail: 0, caught: false, twist: 0, quick: false })
    else if (place.pose === 'sit') b.updateSeated(step)
    else if (place.pose === 'stand') b.update(step, { speed: 0, airborne: false, crouching: false })
    // Walking: the clip's stride matches the speed, so it runs at real time.
    else if (place.pose === 'walk') b.update(pace > 0.05 ? Math.min(dt, 0.1) : step, { speed: pace, airborne: false, crouching: false })

    // Turn the head toward the player while speaking (standing, or stopped on a walk), eased in and out, within limits.
    const still = place.pose === 'stand' || (place.pose === 'walk' && pace < 0.3)
    const talking = still && distance < LOOK_WITHIN && t - (spokeAt.get(speakerId) ?? -99) < LOOK_SECONDS
    let want = 0
    if (talking) {
      const toPlayer = Math.atan2(-(player.x - place.x), -(player.z - place.z))
      let delta = toPlayer - place.yaw
      delta = Math.atan2(Math.sin(delta), Math.cos(delta))
      want = Math.max(-LOOK_MAX, Math.min(LOOK_MAX, delta))
    }
    look.current += (want - look.current) * (1 - Math.exp(-dt / 0.25))
    if (Math.abs(look.current) > 0.002) turnHead(b.bone('Head'), look.current)
  })

  return <group ref={group} />
}

const turn = new Quaternion()
const world = new Quaternion()
const parent = new Quaternion()
const UP = new Vector3(0, 1, 0)

/** Turns a posed head about the world's vertical axis by `angle`. */
function turnHead(head: Object3D | undefined, angle: number): void {
  if (!head?.parent) return
  head.getWorldQuaternion(world)
  head.parent.getWorldQuaternion(parent)
  turn.setFromAxisAngle(UP, angle)
  head.quaternion.copy(parent.invert().multiply(turn.multiply(world)))
}

/**
 * The crew in the world (map data: `crew`, placed by src/state/crewPlaces.ts),
 * while CREW_FIGURES is on: matching their portraits, idling out of step,
 * turning to the player when they speak. At most three are on a map.
 */
export function CrewView({ map }: { map: GameMap }) {
  const clock = useThree((s) => s.clock)
  // Everyone with a place on this map, and anyone a story beat brings here.
  const people = useMemo(
    () =>
      [...new Set([...(map.crew ?? []).map((s) => s.speakerId), ...Object.values(BEATS).filter((b) => b.map === map.id).flatMap((b) => b.crew.map((c) => c.speakerId))])].filter(
        (id) => STYLES[id],
      ),
    [map],
  )
  useEffect(() => onLine((event) => spokeAt.set(event.speakerId, clock.elapsedTime)), [clock])
  if (!CREW_FIGURES) return null
  return (
    <>
      {people.map((id) => (
        <CrewMember key={`${map.id}-${id}`} map={map} speakerId={id} />
      ))}
    </>
  )
}
