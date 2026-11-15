import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, DirectionalLight, type HemisphereLight, type PointLight } from 'three'
import { levelById, levelOf, levelY } from '../maps/collision'
import type { GameMap } from '../maps/types'
import { flight } from '../state/flight'
import { player } from '../state/player'
import { useGame } from '../state/store'
import { bearingVector } from './kit/lunar'
import { carWithPlayer, elevatorStates } from './elevatorLogic'
import type { LightSpec } from './kit/specs'
import { PALETTE } from './palette'

/** Sky fill and sun strength underground, as a fraction of normal. */
const UNDERGROUND = 0.07
/** Below this height the player counts as underground (a car on its way down, too). */
const UNDERGROUND_Y = -1.5
const ENVIRONMENT_INTENSITY = 0.28

const CRITICAL_RED = new Color('#ff5a4a')

/** Light colours and strengths for each interior style. */
const STYLES = {
  // Warm amber lamps, a dusk sky fill and a soft key light from above.
  'launch-center': {
    room: PALETTE.roomLight,
    sky: PALETTE.hemisphereSky,
    ground: PALETTE.hemisphereGround,
    key: PALETTE.keyLight,
    keyIntensity: 1.5,
    fill: 1,
  },
  // Spacecraft: cool white LEDs, slightly blue, and a bright even fill off the padded walls.
  station: {
    room: '#e3ecff',
    sky: '#dde5f4',
    ground: '#8c95a4',
    key: '#eef3ff',
    keyIntensity: 0.5,
    fill: 0.85,
  },
} as const

/** The Moon's Sun: hard white light, very strong, from just above the horizon. */
const LUNAR_SUN = { color: '#fff4e6', intensity: 3.4 }
/** Shadows on the Moon are drawn only near the player (the terrain's own are baked). */
const LUNAR_SHADOW_HALF = 40
/** How far back toward the Sun the shadow camera sits. */
const LUNAR_SHADOW_DISTANCE = 90

/**
 * How bright the room lights are for a given Power meter value: full
 * above 40, dimming down to about a third at 0. Below 15 (critical) they
 * also turn red.
 */
export function powerLight(power: number): { level: number; critical: boolean } {
  return { level: 0.35 + 0.65 * Math.min(1, Math.max(0, power / 40)), critical: power < 15 }
}

/** One key light from above, covering the ground-level building, for static shadows. */
function makeKeyLight(map: GameMap): DirectionalLight {
  if (map.exterior?.scene === 'lunar-south-pole') {
    const sun = new DirectionalLight(LUNAR_SUN.color, LUNAR_SUN.intensity)
    sun.shadow.mapSize.set(2048, 2048)
    const camera = sun.shadow.camera
    camera.left = -LUNAR_SHADOW_HALF
    camera.right = LUNAR_SHADOW_HALF
    camera.top = LUNAR_SHADOW_HALF
    camera.bottom = -LUNAR_SHADOW_HALF
    camera.near = 1
    camera.far = LUNAR_SHADOW_DISTANCE * 2
    camera.updateProjectionMatrix()
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.04
    return sun
  }
  const rooms = map.rooms.filter((room) => levelOf(room) === 'ground')
  const xs = rooms.flatMap((room) => [room.rect.x0, room.rect.x1])
  const zs = rooms.flatMap((room) => [room.rect.z0, room.rect.z1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2 + 3
  const style = STYLES[map.style ?? 'launch-center']
  const key = new DirectionalLight(style.key, style.keyIntensity)
  key.position.set(cx + 8, 30, cz + 5)
  key.target.position.set(cx, 0, cz)
  key.shadow.mapSize.set(2048, 2048)
  const camera = key.shadow.camera
  camera.left = -half
  camera.right = half
  camera.top = half
  camera.bottom = -half
  camera.near = 1
  camera.far = 80
  camera.updateProjectionMatrix()
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.03
  return key
}

/**
 * All the scene's lights. Room lights come from a fixed pool that is moved
 * to whichever level the player is on: the number of lights never changes,
 * so no shader recompiles when riding between levels. One more light follows
 * the elevator car the player is in. Underground, the sun, sky fill and
 * reflections fade almost to nothing, since no daylight reaches the tunnel.
 */
export function LightingRig({
  map,
  lights,
  shadows,
  environment,
}: {
  map: GameMap
  lights: LightSpec[]
  shadows: boolean
  environment: boolean
}) {
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)
  const key = useMemo(() => makeKeyLight(map), [map])
  // Leaving the Moon: shadows update every frame again.
  useEffect(() => () => void (gl.shadowMap.autoUpdate = true), [gl, map])
  useEffect(() => {
    key.castShadow = shadows
  }, [key, shadows])
  useEffect(() => () => key.dispose(), [key])

  const poolSize = useMemo(() => {
    const counts = new Map<string, number>()
    for (const light of lights) counts.set(light.level, (counts.get(light.level) ?? 0) + 1)
    return Math.max(1, ...counts.values())
  }, [lights])

  const hemisphere = useRef<HemisphereLight>(null)
  const pool = useRef<(PointLight | null)[]>([])
  const carLight = useRef<PointLight>(null)
  const shownLevel = useRef<string | null>(null)
  const daylight = useRef(1)
  const style = STYLES[map.style ?? 'launch-center']
  const hemisphereBase = (environment ? 1.2 : 2.1) * style.fill
  const shownCabin = useRef(1)
  const lunar = map.exterior?.scene === 'lunar-south-pole' ? map.exterior : null
  const sunDirection = useMemo(() => (lunar ? bearingVector(lunar.sun.bearing, lunar.sun.elevation) : null), [lunar])
  /** 1 outdoors on the Moon, 0 indoors, eased. */
  const outside = useRef(1)
  // Room lights follow the Power meter on maps that run on the outpost's power.
  const power = useGame((state) => state.mission.meters.power)
  const powered = lunar !== null
  const shownPower = useRef(-1)

  useFrame((_, delta) => {
    // Room lights for the player's level, dimmed during a countdown or when power runs low.
    const supply = powered ? powerLight(power) : { level: 1, critical: false }
    const powerKey = supply.level * (supply.critical ? -1 : 1)
    if (shownLevel.current !== player.level || shownCabin.current !== flight.cabinLight || shownPower.current !== powerKey) {
      shownLevel.current = player.level
      shownCabin.current = flight.cabinLight
      shownPower.current = powerKey
      const here = lights.filter((light) => light.level === player.level)
      pool.current.forEach((light, i) => {
        if (!light) return
        const spec = here[i]
        if (spec) {
          light.position.set(...spec.position)
          light.intensity = spec.intensity * flight.cabinLight * supply.level
          light.color.set(supply.critical ? CRITICAL_RED : (spec.color ?? style.room))
        } else {
          light.intensity = 0
        }
      })
    }

    // The car light: in the car the player is in, or the nearest car stopped on their level.
    const riding = carWithPlayer()
    let car = riding
    if (!car) {
      let best = Infinity
      for (const state of elevatorStates()) {
        const cx = (state.def.car.x0 + state.def.car.x1) / 2
        const cz = (state.def.car.z0 + state.def.car.z1) / 2
        const d = Math.hypot(cx - player.x, cz - player.z) + Math.abs(state.y - levelY(map, player.level)) * 4
        if (d < best) {
          best = d
          car = state
        }
      }
    }
    if (carLight.current && car) {
      carLight.current.position.set(
        (car.def.car.x0 + car.def.car.x1) / 2,
        car.y + car.def.height - 0.2,
        (car.def.car.z0 + car.def.car.z1) / 2,
      )
    }

    // Daylight fades underground.
    const y = riding ? riding.y : levelY(map, player.level)
    const underground = riding ? y < UNDERGROUND_Y : levelById(map, player.level).underground === true
    const target = underground ? UNDERGROUND : 1
    daylight.current += (target - daylight.current) * Math.min(1, delta * 2)
    const f = daylight.current
    if (lunar && sunDirection) {
      // The Sun on the Moon: full strength outdoors, faded out indoors so it
      // never lights rooms through their walls. The shadow box follows the player.
      const target = useGame.getState().outdoors ? 1 : 0
      outside.current += (target - outside.current) * Math.min(1, delta * 3)
      const o = outside.current
      key.intensity = LUNAR_SUN.intensity * o
      // Indoors the Sun is off, so its shadow map needn't be redrawn every frame (about 45 draw calls at the outpost).
      // The light keeps casting, so no shaders recompile at the airlock.
      gl.shadowMap.autoUpdate = o > 0.01
      key.position.set(player.x + sunDirection.x * LUNAR_SHADOW_DISTANCE, player.y + sunDirection.y * LUNAR_SHADOW_DISTANCE, player.z + sunDirection.z * LUNAR_SHADOW_DISTANCE)
      key.target.position.set(player.x, 0, player.z)
      key.target.updateMatrixWorld()
      // No sky to fill shadows outside, only a faint bounce off the ground; indoors, the rooms' fill.
      if (hemisphere.current) hemisphere.current.intensity = hemisphereBase * supply.level * (1 - o) + 0.18 * o
      scene.environmentIntensity = ENVIRONMENT_INTENSITY * (1 - o * 0.7)
      return
    }
    if (hemisphere.current) hemisphere.current.intensity = hemisphereBase * f * flight.cabinLight
    key.intensity = style.keyIntensity * f * flight.cabinLight
    scene.environmentIntensity = ENVIRONMENT_INTENSITY * f
  })

  return (
    <>
      <hemisphereLight ref={hemisphere} args={[style.sky, style.ground, hemisphereBase]} />
      <primitive object={key} />
      <primitive object={key.target} />
      {Array.from({ length: poolSize }, (_, i) => (
        <pointLight
          key={i}
          ref={(light) => {
            pool.current[i] = light
          }}
          color={style.room}
          intensity={0}
          decay={2}
        />
      ))}
      {(map.elevators?.length ?? 0) > 0 && (
        <pointLight ref={carLight} color={style.room} intensity={1.8} distance={4} decay={2} />
      )}
    </>
  )
}
