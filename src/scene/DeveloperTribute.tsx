import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { CanvasTexture, DoubleSide, Frustum, Matrix4, PlaneGeometry, Quaternion, SRGBColorSpace, Sphere, Vector3, type Group } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import nameFont from '@fontsource/inter/files/inter-latin-700-normal.woff?url'
import plaqueFont from '@fontsource/inter/files/inter-latin-600-normal.woff?url'
import { Astronaut, loadAstronaut } from '../character/astronaut'
import type { BonePose } from '../character/floatPose'
import { cheerPose, flagPose, wavePose } from '../character/tributePoses'
import type { GameMap, Prop } from '../maps/types'
import type { AstronautLook } from '../state/astronaut'
import { useGame } from '../state/store'
import { groundHeight } from './kit/exterior'

/**
 * The developers' tribute on the ice crater's western rim (the `tribute` and
 * `developer` props in src/maps/outpost.ts): a plinth marked DEVELOPERS, the
 * flag of Nepal on a pole in the middle, and the three developers on the
 * plinth in Moon suits, each in their own pose (src/character/tributePoses.ts),
 * their names floating above their helmets.
 *
 * The props give it its place, collision and baked shadows; this draws it.
 * The bodies load only once the player comes within LOAD_WITHIN, and like
 * the crew they are skinned (never frustum culled, about 11 draw calls
 * each), so they are shown only outdoors, nearby and in view.
 */

/** The plinth's top above the ground at its centre; it reaches BURY down into the ground, so a slope never shows under it. */
const PLINTH_TOP = 0.35
const BURY = 0.5
/** The pole, from the plinth's top to its tip, and its radius (about an inch across, like the Apollo flagpoles). */
const POLE_HEIGHT = 4.8
const POLE_RADIUS = 0.022
/** The flag's hoist, its straight edge along the pole (metres); everything else keeps the official proportions. */
const FLAG_HOIST = 1.45
/** Where the names float, above the plinth's top (clear of raised hands and below the flag). */
const NAME_HEIGHT = 2.42
const LOAD_WITHIN = 260
const SHOW_WITHIN = 170
const ANIMATE_WITHIN = 70

/** Each developer's pose and look, left to right as seen from the front; the middle one holds the flag. */
const STYLES: { pose: (time: number) => BonePose; look: Partial<AstronautLook>; holdsFlag?: boolean }[] = [
  { pose: wavePose, look: { skinTone: 0.55, hair: 'short', hairColor: 'black', eyeColor: 'dark', patch: 'rocket' } },
  { pose: flagPose, look: { skinTone: 0.5, hair: 'short', hairColor: 'black', eyeColor: 'brown', patch: 'moon' }, holdsFlag: true },
  { pose: cheerPose, look: { skinTone: 0.6, hair: 'short', hairColor: 'black', eyeColor: 'dark', patch: 'stars' } },
]

/**
 * The flag of Nepal, from its official construction (Constitution of Nepal,
 * Schedule 1), in its own units with y down: the hoist runs from (-15, 0) at
 * the top to (-15, 80) at the bottom, the field is 60 wide, and the blue
 * border is a 5.165-unit stroke drawn under the crimson field, so half of it
 * shows. VIEW is the box round all of it, the border's pointed corners too.
 */
const FLAG = {
  outline: 'M -15,37.5735931288 h 60 L -15,0 v 80 h 60 L -15,20 z',
  crescent:
    'M -11.9502769431,23.4834957055 A 12.8400974233,12.8400974233 0 0,0 11.9502769431,23.4834957055 A 11.9502769431,11.9502769431 0 0,1 -11.9502769431,23.4834957055',
  border: 5.165,
  crimson: '#dc143c',
  blue: '#003893',
}
const VIEW = { x: -17.582, y: -4.664, w: 71.571, h: 87.246 }
/** Metres per flag unit. */
const UNIT = FLAG_HOIST / 80
/** The flag's top corner (the hoist's top, y = 0) sits this far below the pole's tip. */
const FLAG_BELOW_TIP = 0.1

/** A white disc with triangular rays round it (the moon's and the sun's), in flag units. */
function emblem(c: CanvasRenderingContext2D, cx: number, cy: number, radius: number, base: [number, number], tip: number, angles: number[]): void {
  c.save()
  c.translate(cx, cy)
  c.scale(radius, radius)
  c.beginPath()
  c.arc(0, 0, 1, 0, Math.PI * 2)
  c.fill()
  for (const angle of angles) {
    c.save()
    c.rotate((angle * Math.PI) / 180)
    c.beginPath()
    c.moveTo(base[0], base[1])
    c.lineTo(0, tip)
    c.lineTo(-base[0], base[1])
    c.closePath()
    c.fill()
    c.restore()
  }
  c.restore()
}

/** The flag drawn on a transparent canvas covering VIEW. */
function nepalFlagTexture(): CanvasTexture {
  const scale = 12
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(VIEW.w * scale)
  canvas.height = Math.ceil(VIEW.h * scale)
  const c = canvas.getContext('2d')!
  c.setTransform(scale, 0, 0, scale, -VIEW.x * scale, -VIEW.y * scale)
  const outline = new Path2D(FLAG.outline)
  c.lineJoin = 'miter'
  c.miterLimit = 10
  c.lineWidth = FLAG.border
  c.strokeStyle = FLAG.blue
  c.stroke(outline)
  c.fillStyle = FLAG.crimson
  c.fill(outline)
  c.fillStyle = '#ffffff'
  // The moon: a crescent, and above it a disc whose rays fan out ±11.25°, ±33.75° … ±123.75° from straight up.
  c.fill(new Path2D(FLAG.crescent))
  const moonRays = [0, 1, 2, 3, 4, 5].flatMap((k) => [11.25 + k * 22.5, -(11.25 + k * 22.5)])
  emblem(c, 0, 29.045, 5.56106, [0.195090322016, -0.980785280403], -1.38878410975, moonRays)
  // The sun: twelve rays, one every 30°.
  const sunRays = Array.from({ length: 12 }, (_, k) => k * 30)
  emblem(c, 0, 58.787, 8.1434, [0.258819045103, 0.965925826289], 1.576749285537, sunRays)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** The flag's top edge, from the hoist's top corner to the upper point, as a unit direction in flag units (y down). */
const TOP_EDGE = { x: 60 / Math.hypot(60, 37.5735931288), y: 37.5735931288 / Math.hypot(60, 37.5735931288) }

/**
 * The flag's cloth, its top-left corner at the origin, hanging in the x-y
 * plane toward +x. There's no air on the Moon, so it doesn't wave: it hangs
 * from a rod along its top edge (as on Apollo), with a few creases from
 * being folded for the trip, deeper toward the fly.
 */
function flagGeometry(): PlaneGeometry {
  const width = VIEW.w * UNIT
  const height = VIEW.h * UNIT
  const geometry = new PlaneGeometry(width, height, 30, 34)
  geometry.translate(width / 2, -height / 2, 0)
  const position = geometry.attributes.position!
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i) / width
    // Back to flag units, to measure how far below the top edge this point hangs.
    const fx = VIEW.x + position.getX(i) / UNIT
    const fy = VIEW.y - position.getY(i) / UNIT
    const below = -(fx + 15) * TOP_EDGE.y + fy * TOP_EDGE.x
    const hang = Math.min(1, Math.max(0, below / 14))
    position.setZ(i, 0.045 * hang * (0.35 + 0.65 * u) * Math.sin(u * Math.PI * 2.3 + 0.6 + fy * 0.03))
  }
  geometry.computeVertexNormals()
  return geometry
}

/** Where the rod along the flag's top edge runs, in the flag's local metres (from the pole to just past the upper point). */
function rodEnds(): [Vector3, Vector3] {
  const rodRadius = 0.009 / UNIT
  const offset = FLAG.border / 2 + rodRadius
  // Outward from the top edge (up and toward the fly), in flag units with y down.
  const out = { x: TOP_EDGE.y, y: -TOP_EDGE.x }
  const toMetres = (fx: number, fy: number) => new Vector3((fx - VIEW.x) * UNIT, -(fy - VIEW.y) * UNIT, 0)
  const startT = (VIEW.x - (-15 + out.x * offset)) / TOP_EDGE.x
  const start = toMetres(-15 + out.x * offset + TOP_EDGE.x * startT, out.y * offset + TOP_EDGE.y * startT)
  const end = toMetres(45 + out.x * offset + TOP_EDGE.x * 1.5, 37.5735931288 + out.y * offset + TOP_EDGE.y * 1.5)
  return [start, end]
}

/** A thin rod between two points (position, rotation and length for a y-up cylinder). */
function rodBetween(a: Vector3, b: Vector3): { position: Vector3; quaternion: Quaternion; length: number } {
  const along = b.clone().sub(a)
  return {
    position: a.clone().add(b).multiplyScalar(0.5),
    quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), along.clone().normalize()),
    length: along.length(),
  }
}

/** A point in the map turned into the tribute's own frame (+x to the right as seen from the front, +z toward the viewer). */
function toLocal(anchor: Prop, x: number, z: number): { x: number; z: number } {
  const yaw = anchor.yaw ?? 0
  const dx = x - anchor.position.x
  const dz = z - anchor.position.z
  return { x: dx * Math.cos(yaw) - dz * Math.sin(yaw), z: dx * Math.sin(yaw) + dz * Math.cos(yaw) }
}

const frustum = new Frustum()
const projection = new Matrix4()
const bounds = new Sphere()
const eye = new Vector3()
const hand = new Vector3()
const wrist = new Vector3()

export function DeveloperTribute({ map }: { map: GameMap }) {
  const anchor = useMemo(() => map.props.find((p) => p.kind === 'tribute'), [map])
  const base = useMemo(() => (anchor ? groundHeight(map)(anchor.position.x, anchor.position.z) : 0), [map, anchor])
  const people = useMemo(() => {
    if (!anchor) return []
    const list = map.props.filter((p) => p.kind === 'developer').map((p) => ({ id: p.id, name: p.label ?? '', ...toLocal(anchor, p.position.x, p.position.z) }))
    list.sort((a, b) => a.x - b.x)
    return list.map((person, i) => ({ ...person, ...STYLES[i % STYLES.length]! }))
  }, [map, anchor])
  const holder = people.find((p) => p.holdsFlag) ?? people[0]

  const tribute = useRef<Group>(null)
  const figures = useRef<Group>(null)
  const pole = useRef<Group>(null)
  const names = useRef<(Group | null)[]>([])
  const bodies = useRef<Astronaut[]>([])
  const time = useRef(0)
  const [wanted, setWanted] = useState(false)
  const [gltf, setGltf] = useState<GLTF | null>(null)

  const texture = useMemo(() => nepalFlagTexture(), [])
  const cloth = useMemo(() => flagGeometry(), [])
  const rod = useMemo(() => {
    const [a, b] = rodEnds()
    return rodBetween(a, b)
  }, [])
  useEffect(
    () => () => {
      texture.dispose()
      cloth.dispose()
    },
    [texture, cloth],
  )

  // The bodies (the same file as the crew's) load only once the player is on the way.
  useEffect(() => {
    if (!wanted) return
    let cancelled = false
    loadAstronaut('male')
      .then((loaded) => {
        if (!cancelled) setGltf(loaded)
      })
      .catch((error: unknown) => console.error('Could not load the developers for the tribute', error))
    return () => {
      cancelled = true
    }
  }, [wanted])

  useEffect(
    () => () => {
      for (const body of bodies.current) body.dispose()
      bodies.current = []
    },
    [gltf, people],
  )

  /** Stands the flagpole in the flag holder's left hand. */
  function placePole(body: Astronaut): void {
    const palm = body.bone('hand_l')
    const forearm = body.bone('lowerarm_l')
    if (!palm || !forearm || !tribute.current || !pole.current) return
    tribute.current.updateMatrixWorld(true)
    palm.getWorldPosition(hand)
    forearm.getWorldPosition(wrist)
    // The grip is a little past the wrist, in the palm.
    hand.add(hand.clone().sub(wrist).normalize().multiplyScalar(0.07))
    tribute.current.worldToLocal(hand)
    pole.current.position.set(hand.x, PLINTH_TOP, hand.z)
  }

  useFrame((state, dt) => {
    const group = figures.current
    if (!anchor || !group) return
    state.camera.getWorldPosition(eye)
    const distance = Math.hypot(eye.x - anchor.position.x, eye.z - anchor.position.z)
    if (!wanted && distance < LOAD_WITHIN) setWanted(true)

    // One body a frame once the model is in, so making them never hitches the drive.
    const made = bodies.current.length
    if (gltf && made < people.length) {
      const person = people[made]!
      const body = new Astronaut(gltf, { name: person.name, outfit: 'surface', look: person.look })
      body.setCastShadow(false)
      body.holdPose(person.pose(time.current), 0)
      body.root.position.set(person.x, PLINTH_TOP, person.z)
      // The body's own forward is -z; the tribute's front is +z.
      body.root.rotation.y = Math.PI
      group.add(body.root)
      bodies.current.push(body)
      if (person.holdsFlag) placePole(body)
    }

    projection.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projection)
    bounds.set(eye.set(anchor.position.x, base + 1.5, anchor.position.z), 4.5)
    group.visible = useGame.getState().outdoors && distance < SHOW_WITHIN && frustum.intersectsSphere(bounds)
    if (!group.visible || distance > ANIMATE_WITHIN) return

    const step = Math.min(dt, 0.1)
    time.current += step
    bodies.current.forEach((body, i) => body.holdPose(people[i]!.pose(time.current), step))
    // The names float, each a little out of step.
    names.current.forEach((name, i) => {
      if (name) name.position.y = PLINTH_TOP + NAME_HEIGHT + Math.sin(time.current * 1.3 + i * 2.1) * 0.035
    })
  })

  if (!anchor) return null
  const plinth = anchor.size
  return (
    <group ref={tribute} position={[anchor.position.x, base, anchor.position.z]} rotation-y={anchor.yaw ?? 0}>
      {/* The plinth, its cap and the plaque on its front. */}
      <mesh position={[0, (PLINTH_TOP - BURY) / 2, 0]} receiveShadow>
        <boxGeometry args={[plinth.w, PLINTH_TOP + BURY, plinth.d]} />
        <meshStandardMaterial color="#8d939c" roughness={0.75} metalness={0.15} />
      </mesh>
      <mesh position={[0, PLINTH_TOP - 0.025, 0]} receiveShadow>
        <boxGeometry args={[plinth.w + 0.08, 0.05, plinth.d + 0.08]} />
        <meshStandardMaterial color="#c3c8cf" roughness={0.45} metalness={0.4} />
      </mesh>
      <mesh position={[0, PLINTH_TOP / 2 - 0.01, plinth.d / 2 + 0.012]}>
        <boxGeometry args={[2.3, 0.2, 0.024]} />
        <meshStandardMaterial color="#1b2029" roughness={0.35} metalness={0.6} />
      </mesh>
      <Text
        font={plaqueFont}
        fontSize={0.13}
        letterSpacing={0.24}
        color="#f2c14e"
        anchorX="center"
        anchorY="middle"
        position={[0, PLINTH_TOP / 2 - 0.01, plinth.d / 2 + 0.026]}
      >
        DEVELOPERS
      </Text>

      {/* The flagpole (stood in the holder's hand once they load), its rod along the flag's top edge, and the flag. */}
      <group ref={pole} position={[(holder?.x ?? 0) + 0.42, PLINTH_TOP, (holder?.z ?? 0) + 0.3]}>
        <mesh position={[0, POLE_HEIGHT / 2 - 0.05, 0]}>
          <cylinderGeometry args={[POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT + 0.1, 12]} />
          <meshStandardMaterial color="#d9dde3" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[0, POLE_HEIGHT + 0.02, 0]}>
          <sphereGeometry args={[0.045, 14, 10]} />
          <meshStandardMaterial color="#e6b84a" roughness={0.3} metalness={0.9} />
        </mesh>
        <group position={[POLE_RADIUS, POLE_HEIGHT - FLAG_BELOW_TIP + -VIEW.y * UNIT, 0]}>
          <mesh geometry={cloth}>
            <meshStandardMaterial map={texture} alphaTest={0.5} side={DoubleSide} roughness={0.85} />
          </mesh>
          <mesh position={rod.position} quaternion={rod.quaternion}>
            <cylinderGeometry args={[0.009, 0.009, rod.length, 8]} />
            <meshStandardMaterial color="#d9dde3" roughness={0.3} metalness={0.8} />
          </mesh>
        </group>
      </group>

      {/* The developers (added as they load) and their names. */}
      <group ref={figures} visible={false}>
        {people.map((person, i) => (
          <Billboard
            key={person.id}
            ref={(node) => {
              names.current[i] = node
            }}
            position={[person.x, PLINTH_TOP + NAME_HEIGHT, person.z]}
          >
            <Text font={nameFont} fontSize={0.24} color="#ffffff" anchorX="center" anchorY="middle" outlineWidth={0.014} outlineColor="#0b0f16">
              {person.name}
              <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </Text>
          </Billboard>
        ))}
      </group>
    </group>
  )
}
