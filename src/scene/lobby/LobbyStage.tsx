import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  CanvasTexture,
  CircleGeometry,
  type Group,
  MeshBasicMaterial,
  type PerspectiveCamera,
  RingGeometry,
  type SpotLight,
  TorusGeometry,
} from 'three'
import { Astronaut, loadAstronaut } from '../../character/astronaut'
import { LAUNCH_CENTER } from '../../maps/launchCenter'
import { setLobbyReady } from '../../state/loading'
import { lobby, settleLobby } from '../../state/lobby'
import { reducedMotion } from '../../state/settings'
import { useGame } from '../../state/store'
import { PAD, ROCKET_BASE } from '../cinematic/launchScript'
import { STAGE_LAYER } from '../cinematic/useCinematicCamera'
import { buildLaunchStage, groundHeight } from '../kit/exterior'
import { orient, Parts, type Tint } from '../kit/parts'
import { decalAtlas } from '../materials/canvasTextures'
import { createMaterialLibrary, tint } from '../materials/surfaces'
import { PALETTE } from '../palette'
import { SaturnVView } from '../SaturnVView'
import { Sky } from '../Sky'

/**
 * Where the astronaut stands: a round deck beside the road east of the
 * pad, near the shore, far enough for the whole Saturn V (117 m to the
 * escape tower's tip) to fit behind them.
 */
const SITE = { x: PAD[0] + 245, z: PAD[2] + 50 }
const DECK_HEIGHT = 0.5
const DECK_RADIUS = 5.5
const PODIUM_HEIGHT = 0.22
const PODIUM_RADIUS = 1.15

/**
 * The camera: this far from the astronaut, this high above the podium,
 * looking at their chest. Wide enough to take in the rocket, and close
 * enough that the astronaut stays as big as before.
 */
const CAMERA = { distance: 3.3, height: 1.0, lookAt: 0.98, fov: 46 }
/** Dev builds only (lobby.closeUp): in on the face, to check skin tones and eye colours. */
const CLOSE_UP = { distance: 1.25, height: 1.62, lookAt: 1.6, fov: 22 }
/**
 * The camera stands this way round from the astronaut (radians from north,
 * clockwise seen from above): a little north of east, looking west-south-west
 * into the last of the sunset, with the pad and the rocket to the right of
 * the astronaut.
 */
const CAMERA_BEARING = 1.44
/** It drifts this far either side (radians), this slowly (radians per second). */
const SWAY = 0.2
const SWAY_SPEED = 0.11
/** The horizon sits low on the screen, leaving the sky and the rocket above: the view is shifted up by this fraction of its height. */
const LENS_RISE = 0.08

/** The Saturn V is up (or failed to load): the menu's loading screen stops waiting for it. */
const rocketReady = () => setLobbyReady('rocket', true)

const DECK = tint('#8f8c85')
const PODIUM = tint('#20242c')
const PODIUM_EDGE = tint('#3a4150')
const RING_GLOW: Tint = [2.6, 0.82, 0.12]
const DECK_GLOW: Tint = [0.5, 1.5, 2.6]

/** A soft round shadow under the astronaut's feet. */
function shadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62)
    gradient.addColorStop(0, 'rgb(0 0 0 / 0.75)')
    gradient.addColorStop(0.55, 'rgb(0 0 0 / 0.35)')
    gradient.addColorStop(1, 'rgb(0 0 0 / 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
  }
  return new CanvasTexture(canvas)
}

/**
 * The menu lobby: the player's astronaut on a lit podium, idling, with the
 * launch complex at dusk and the floodlit rocket behind (the same exterior
 * kit as the launch center and the launch cinematic). The camera drifts
 * slowly from side to side; the menu turns the astronaut when the player
 * drags. Like the cinematic stages it draws on its own layer, so the
 * mission's map (which stays loaded behind it) and the lobby never mix.
 */
export function LobbyStage() {
  const root = useRef<Group>(null)
  const avatar = useRef<Group>(null)
  const body = useRef<Astronaut | null>(null)
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const size = useThree((state) => state.size)
  const profile = useGame((state) => state.astronaut)
  const base = useMemo(() => groundHeight(LAUNCH_CENTER)(SITE.x, SITE.z), [])
  const floor = base + DECK_HEIGHT + PODIUM_HEIGHT

  const built = useMemo(() => {
    const parts = new Parts()
    buildLaunchStage(LAUNCH_CENTER, parts)
    // The deck, the podium on it, and two glowing rings: orange round the podium, blue round the deck's edge.
    const top = base + DECK_HEIGHT
    parts.cylinder('concrete', DECK_RADIUS, DECK_RADIUS + 0.25, DECK_HEIGHT + 1, { x: SITE.x, y: top - (DECK_HEIGHT + 1) / 2, z: SITE.z }, DECK, 48)
    parts.cylinder('painted', PODIUM_RADIUS, PODIUM_RADIUS + 0.12, PODIUM_HEIGHT, { x: SITE.x, y: top + PODIUM_HEIGHT / 2, z: SITE.z }, PODIUM, 48)
    parts.cylinder('painted', PODIUM_RADIUS + 0.34, PODIUM_RADIUS + 0.4, 0.06, { x: SITE.x, y: top + 0.03, z: SITE.z }, PODIUM_EDGE, 48)
    parts.add('emissive', orient(new TorusGeometry(PODIUM_RADIUS + 0.02, 0.016, 8, 72), { rotX: Math.PI / 2, x: SITE.x, y: top + PODIUM_HEIGHT - 0.01, z: SITE.z }), RING_GLOW)
    parts.add('emissive', orient(new RingGeometry(DECK_RADIUS - 0.22, DECK_RADIUS - 0.12, 72), { rotX: -Math.PI / 2, x: SITE.x, y: top + 0.012, z: SITE.z }), DECK_GLOW)
    return parts.build()
  }, [base])
  const materials = useMemo(() => createMaterialLibrary(decalAtlas()), [])
  const shadow = useMemo(() => {
    const map = shadowTexture()
    return { map, geometry: new CircleGeometry(0.62, 32), material: new MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false }) }
  }, [])

  useEffect(
    () => () => {
      for (const part of built) part.geometry.dispose()
      for (const material of Object.values(materials)) material.dispose()
      shadow.map.dispose()
      shadow.geometry.dispose()
      shadow.material.dispose()
    },
    [built, materials, shadow],
  )

  // Everything here draws on the stage's own layer (lights too: they only light what the camera's layers see).
  const toStage = () => root.current?.traverse((object) => object.layers.set(STAGE_LAYER))
  useLayoutEffect(toStage)

  // The astronaut: one body per variant; everything else about them changes in place.
  // The menu's loading screen waits for the body (a new body type is a new download: a small "Loading" note shows meanwhile).
  const variant = profile.variant
  useEffect(() => {
    let cancelled = false
    let created: Astronaut | null = null
    setLobbyReady('astronaut', false)
    loadAstronaut(variant)
      .then((gltf) => {
        if (cancelled || !avatar.current) return
        const now = useGame.getState().astronaut
        created = new Astronaut(gltf, { name: now.name, outfit: lobby.outfit, look: now })
        avatar.current.add(created.root)
        body.current = created
        toStage()
        setLobbyReady('astronaut', true)
      })
      .catch((error: unknown) => {
        console.error('Could not load the astronaut model', error)
        // Don't keep the menu waiting for a body that won't come.
        if (!cancelled) setLobbyReady('astronaut', true)
      })
    return () => {
      cancelled = true
      created?.dispose()
      if (body.current === created) body.current = null
      setLobbyReady('astronaut', false)
    }
  }, [variant])

  // The rocket is gone again when the lobby is (it is built afresh on coming back).
  useEffect(() => () => setLobbyReady('rocket', false), [])

  useEffect(() => {
    body.current?.setName(profile.name)
    body.current?.applyLook(profile)
  }, [profile])

  // A spot light aims at its target object, which has to be placed by hand as it isn't in the scene.
  const key = useRef<SpotLight>(null)
  useEffect(() => {
    const target = key.current?.target
    if (!target) return
    target.position.set(SITE.x, floor + 1, SITE.z)
    target.updateMatrixWorld()
  }, [floor])

  const spot = useRef({ shift: lobby.shift, time: 0 })

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const still = reducedMotion()
    const s = spot.current
    if (!still) s.time += dt
    settleLobby(dt, still)

    const person = body.current
    if (person) {
      person.setOutfit(lobby.outfit)
      person.update(dt, 0)
    }
    // Facing the camera's middle position, plus however far the player has turned them.
    if (avatar.current) avatar.current.rotation.y = -CAMERA_BEARING + lobby.yaw

    // The camera: a slow drift from side to side, looking at the astronaut's chest.
    const shot = lobby.closeUp ? CLOSE_UP : CAMERA
    const bearing = CAMERA_BEARING + (still || lobby.closeUp ? 0 : Math.sin(s.time * SWAY_SPEED * Math.PI * 2) * SWAY * 0.5)
    camera.layers.set(STAGE_LAYER)
    camera.up.set(0, 1, 0)
    camera.position.set(SITE.x + Math.sin(bearing) * shot.distance, floor + shot.height, SITE.z - Math.cos(bearing) * shot.distance)
    camera.lookAt(SITE.x, floor + shot.lookAt, SITE.z)
    camera.fov = shot.fov
    camera.near = 0.1
    camera.far = 2000
    // The astronaut stands left of the middle, clear of the menu's panels: the lens is shifted, not the camera turned.
    s.shift += (lobby.shift - s.shift) * (still ? 1 : 1 - Math.exp(-dt * 9))
    if (lobby.closeUp) camera.setViewOffset(size.width, size.height, 0, 0, size.width, size.height)
    else camera.setViewOffset(size.width, size.height, s.shift * size.width, -LENS_RISE * size.height, size.width, size.height)
  })

  // Hand the camera back as the mission expects it.
  useEffect(
    () => () => {
      camera.layers.set(0)
      camera.clearViewOffset()
      camera.fov = 70
      camera.near = 0.05
      camera.far = 800
      camera.updateProjectionMatrix()
    },
    [camera],
  )

  return (
    <group ref={root}>
      <hemisphereLight args={[PALETTE.hemisphereSky, PALETTE.hemisphereGround, 1.15]} />
      <directionalLight color={PALETTE.keyLight} intensity={0.5} position={[-120, 160, 60]} />
      {/* On the astronaut: a soft white key from the camera's left, a cool fill, and a warm rim from the pad's floodlights behind. */}
      <spotLight ref={key} color="#fff3e2" intensity={105} distance={22} angle={0.42} penumbra={0.8} decay={2} position={[SITE.x + 5.2, floor + 4.4, SITE.z + 4.2]} />
      <pointLight color="#8fb4ff" intensity={14} distance={12} decay={2} position={[SITE.x + 2.4, floor + 1.6, SITE.z - 3.4]} />
      <pointLight color="#ffa24f" intensity={60} distance={14} decay={2} position={[SITE.x - 3.2, floor + 2.6, SITE.z - 1.6]} />
      <Sky follow />
      {built.map((part) => (
        <mesh key={part.key} geometry={part.geometry} material={materials[part.key]} renderOrder={part.key === 'lightCone' || part.key === 'glow' ? 2 : 0} />
      ))}
      {/* The rocket stands floodlit, as it does from the launch center's windows. */}
      <SaturnVView position={[PAD[0], ROCKET_BASE, PAD[2]]} glow={1} layer={STAGE_LAYER} onReady={rocketReady} />
      <mesh geometry={shadow.geometry} material={shadow.material} rotation-x={-Math.PI / 2} position={[SITE.x, floor + 0.004, SITE.z]} renderOrder={1} />
      <group ref={avatar} position={[SITE.x, floor, SITE.z]} />
    </group>
  )
}
