import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  DynamicDrawUsage,
  type Group,
  InstancedMesh,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  type SpotLight,
  BufferGeometry as Geometry,
} from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { GameMap } from '../maps/types'
import { groundHeight } from './kit/exterior'
import { MOON_GRAVITY, roverState } from './rover'

/** Dust particles alive at once: small, so it stays cheap. */
const DUST = 260
/** Wheel marks kept on the ground. */
const TRACKS = 700
const TRACK_SPACING = 0.55

/** The four wheels as the model names them, front pair first. */
const WHEELS = ['fl', 'fr', 'rl', 'rr'] as const

/** The headlights, on the front of the chassis either side of the comms box (rover frame, -z forward). */
const LAMP_X = [-0.55, 0.55] as const
const LAMP_Y = 0.66
const LAMP_Z = -1.8

let model: Promise<GLTF> | null = null

/**
 * The rover model: "Lunar Rover" by Versal (CC BY 4.0), rebuilt for the
 * game by tools/build-rover.mjs (screws removed, thinned, coloured, scaled
 * to the map's wheel layout). A body and, per wheel, a steering node
 * ("wheel_fl") holding the spinning tyre and rim ("spin_fl") and the
 * fender, which turns with the wheel but doesn't spin. Its local -z is
 * forward, like the player's yaw. Loaded once.
 */
function loadRoverModel(): Promise<GLTF> {
  if (!model) {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    model = loader.loadAsync(`${import.meta.env.BASE_URL}models/rover.glb`)
  }
  return model
}

/** Two headlight housings and their lamp faces, which glow when the lights are on. */
function buildLamps(): { housing: BufferGeometry; lamp: BufferGeometry } {
  const housing = LAMP_X.map((x) => new BoxGeometry(0.2, 0.14, 0.12).translate(x, 0, 0))
  const lamp = LAMP_X.map((x) => new BoxGeometry(0.15, 0.09, 0.02).translate(x, 0, -0.07))
  const merged = { housing: mergeGeometries(housing)!, lamp: mergeGeometries(lamp)! }
  for (const geometry of [...housing, ...lamp]) geometry.dispose()
  return merged
}

/** The rover, its headlights, the dust its wheels throw up and the tracks it leaves. */
export function RoverView({ map }: { map: GameMap }) {
  const def = map.rover
  const body = useRef<Group>(null)
  /** The model's wheels: the node that steers, and inside it the part that spins. */
  const wheels = useRef<{ steer: Object3D; spin: Object3D; front: boolean }[]>([])
  const lights = useRef<(SpotLight | null)[]>([])
  const ground = useMemo(() => groundHeight(map), [map])

  const resources = useMemo(() => {
    if (!def) return null
    const lamps = buildLamps()
    const materials = {
      housing: new MeshStandardMaterial({ color: '#2b2f36', roughness: 0.6, metalness: 0.2 }),
      lamp: new MeshBasicMaterial({ color: '#ffffff' }),
    }

    // Dust: each particle flies in a clean arc and drops straight back, as there is no air.
    const dustPositions = new Float32Array(DUST * 3).fill(-1000)
    const dustGeometry = new Geometry()
    const attribute = new BufferAttribute(dustPositions, 3)
    attribute.setUsage(DynamicDrawUsage)
    dustGeometry.setAttribute('position', attribute)
    const dustMaterial = new PointsMaterial({ color: '#a39d92', size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false })
    const dust = new Points(dustGeometry, dustMaterial)
    dust.frustumCulled = false

    // Wheel tracks: thin dark marks pressed into the regolith.
    const trackGeometry = new PlaneGeometry(0.26, TRACK_SPACING)
    trackGeometry.rotateX(-Math.PI / 2)
    const trackMaterial = new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
    const tracks = new InstancedMesh(trackGeometry, trackMaterial, TRACKS)
    tracks.count = 0
    tracks.frustumCulled = false
    return { lamps, materials, dust, dustGeometry, dustMaterial, dustVelocity: new Float32Array(DUST * 3), tracks, trackGeometry, trackMaterial }
  }, [def])

  useEffect(
    () => () => {
      if (!resources) return
      resources.lamps.housing.dispose()
      resources.lamps.lamp.dispose()
      for (const m of Object.values(resources.materials)) m.dispose()
      resources.dustGeometry.dispose()
      resources.dustMaterial.dispose()
      resources.trackGeometry.dispose()
      resources.trackMaterial.dispose()
      resources.tracks.dispose()
    },
    [resources],
  )

  // The model, loaded once and shared; this rover gets its own copy of the nodes, and its wheels are found by name.
  useEffect(() => {
    if (!def) return
    let cancelled = false
    let copy: Group | null = null
    loadRoverModel()
      .then((gltf) => {
        if (cancelled || !body.current) return
        const scene = gltf.scene.clone(true)
        scene.traverse((object) => {
          if ((object as Mesh).isMesh) {
            object.castShadow = true
            object.receiveShadow = true
          }
        })
        wheels.current = WHEELS.flatMap((key) => {
          const steer = scene.getObjectByName(`wheel_${key}`)
          const spin = scene.getObjectByName(`spin_${key}`)
          return steer && spin ? [{ steer, spin, front: key.startsWith('f') }] : []
        })
        body.current.add(scene)
        copy = scene
      })
      .catch((error: unknown) => console.error('Could not load the rover model', error))
    return () => {
      cancelled = true
      // The geometry and materials stay with the loaded model, for the next time the map loads.
      copy?.removeFromParent()
      wheels.current = []
    }
  }, [def])

  const dustNext = useRef(0)
  const dustCarry = useRef(0)
  const trackNext = useRef(0)
  const lastTrack = useRef(0)
  const dummy = useMemo(() => new Object3D(), [])

  useFrame((_, delta) => {
    const s = roverState()
    if (!s || !resources || !body.current || !def) return
    const dt = Math.min(delta, 0.05)
    body.current.position.set(s.x, s.y, s.z)
    body.current.rotation.set(s.pitch, s.yaw, s.roll, 'YXZ')
    // The front wheels (and their fenders) turn with the steering; every wheel rolls with the distance driven.
    for (const wheel of wheels.current) {
      wheel.steer.rotation.y = wheel.front ? s.steer : 0
      wheel.spin.rotation.x = -s.wheelSpin
    }
    // Headlights: on in deep shadow, and they light the ground ahead.
    for (const light of lights.current) if (light) light.intensity = s.headlights ? 60 : 0
    resources.materials.lamp.color.setScalar(s.headlights ? 3 : 0.35)

    // ---- Dust from the rear wheels while driving on the ground ----
    const position = resources.dustGeometry.attributes.position as BufferAttribute
    const v = resources.dustVelocity
    const fast = Math.abs(s.speed)
    if (!s.airborne && fast > 0.8) {
      dustCarry.current += dt * Math.min(70, fast * 14)
      const fx = -Math.sin(s.yaw)
      const fz = -Math.cos(s.yaw)
      const rx = Math.cos(s.yaw)
      const rz = -Math.sin(s.yaw)
      while (dustCarry.current >= 1) {
        dustCarry.current -= 1
        const i = dustNext.current
        dustNext.current = (i + 1) % DUST
        const side = i % 2 ? 1 : -1
        const wx = s.x - fx * (def.wheels.base / 2) + rx * side * (def.wheels.track / 2)
        const wz = s.z - fz * (def.wheels.base / 2) + rz * side * (def.wheels.track / 2)
        position.setXYZ(i, wx, ground(wx, wz) + 0.1, wz)
        // Thrown up and back off the wheel, a little to the side.
        const back = -Math.sign(s.speed) * (0.5 + Math.random() * 0.8) * Math.min(1, fast / 4)
        v[i * 3] = fx * back + rx * side * (Math.random() * 0.6)
        v[i * 3 + 1] = 0.9 + Math.random() * 1.6
        v[i * 3 + 2] = fz * back + rz * side * (Math.random() * 0.6)
      }
    }
    for (let i = 0; i < DUST; i++) {
      const y = position.getY(i)
      if (y < -500) continue
      const x = position.getX(i) + v[i * 3]! * dt
      const z = position.getZ(i) + v[i * 3 + 2]! * dt
      v[i * 3 + 1]! -= MOON_GRAVITY * dt
      const ny = y + v[i * 3 + 1]! * dt
      // Falls straight back: gone the moment it touches the ground.
      if (ny < ground(x, z)) position.setXYZ(i, 0, -1000, 0)
      else position.setXYZ(i, x, ny, z)
    }
    position.needsUpdate = true

    // ---- Wheel tracks ----
    if (!s.airborne && s.odometer - lastTrack.current > TRACK_SPACING) {
      lastTrack.current = s.odometer
      const rx = Math.cos(s.yaw)
      const rz = -Math.sin(s.yaw)
      const fx = -Math.sin(s.yaw)
      const fz = -Math.cos(s.yaw)
      for (const side of [-1, 1]) {
        const wx = s.x - fx * (def.wheels.base / 2) + rx * side * (def.wheels.track / 2)
        const wz = s.z - fz * (def.wheels.base / 2) + rz * side * (def.wheels.track / 2)
        dummy.position.set(wx, ground(wx, wz) + 0.03, wz)
        dummy.rotation.set(0, s.yaw, 0)
        dummy.updateMatrix()
        const i = trackNext.current
        trackNext.current = (i + 1) % TRACKS
        resources.tracks.setMatrixAt(i, dummy.matrix)
        resources.tracks.count = Math.max(resources.tracks.count, i + 1)
      }
      resources.tracks.instanceMatrix.needsUpdate = true
    }
  })

  if (!def || !resources) return null
  const { lamps, materials } = resources
  return (
    <>
      <group ref={body}>
        <group position={[0, LAMP_Y, LAMP_Z]}>
          <mesh geometry={lamps.housing} material={materials.housing} castShadow />
          <mesh geometry={lamps.lamp} material={materials.lamp} />
        </group>
        {LAMP_X.map((x, i) => (
          <spotLight
            key={x}
            ref={(light) => {
              lights.current[i] = light
              if (light) {
                light.target.position.set(x * 2, -1.2, -14)
                light.add(light.target)
              }
            }}
            position={[x, LAMP_Y, LAMP_Z - 0.1]}
            color="#f4f1ff"
            intensity={0}
            distance={45}
            angle={0.55}
            penumbra={0.55}
            decay={1.2}
          />
        ))}
      </group>
      <primitive object={resources.dust} />
      <primitive object={resources.tracks} />
    </>
  )
}
