import { useEffect, useMemo, useRef } from 'react'
import { challengeCleared } from '../data/challenges'
import { Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { type MeshBasicMaterial, type MeshStandardMaterial, PMREMGenerator, type Texture, type WebGLRenderer } from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import interFont from '@fontsource/inter/files/inter-latin-600-normal.woff?url'
import monoFont from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff?url'
import { launchPad, type GameMap } from '../maps/types'
import { useGame, useGraphicsPreset } from '../state/store'
import { buildMap } from './kit/buildMap'
import type { ScreenSpec } from './kit/specs'
import { ConsoleView } from './ConsoleView'
import { MarkerRing } from './MarkerRing'
import { decalAtlas, missionBriefingTexture } from './materials/canvasTextures'
import { createMaterialLibrary, cutTerrainHoles, type MaterialKey } from './materials/surfaces'
import { levelOf, levelY, rectCenter, roomAt, shaftRect } from '../maps/collision'
import { groundHeight, ROCKET_BASE } from './kit/exterior'
import { lightTexture, siteLight } from './kit/lunarLight'
import { LunarRocks } from './LunarRocks'
import { RoverView } from './RoverView'
import { SaturnVView } from './SaturnVView'
import { LunarModuleView } from './LunarModuleView'
import { HeadlightPool } from './HeadlightPool'
import { Elevators } from './Elevators'
import { LightingRig } from './LightingRig'
import { Sky } from './Sky'
import { Space } from './Space'
import { LunarSky } from './LunarSky'
import { AirlockView } from './AirlockView'
import { powerLight } from './LightingRig'
import { SlidingDoors } from './SlidingDoors'
import { CrewView } from './CrewView'
import { DeveloperTribute } from './DeveloperTribute'

/** Materials whose meshes block the key light. The ceiling must not, or every room goes dark. */
const CASTS_SHADOW = new Set<MaterialKey>(['wall', 'brushed', 'painted', 'rubber', 'fabric'])
const RECEIVES_SHADOW = new Set<MaterialKey>(['wall', 'floor', 'ceiling', 'brushed', 'painted', 'rubber', 'fabric', 'decal'])

/**
 * Soft fill light and reflections from a real, CC0 HDR panorama (Poly Haven,
 * credited in ASSETS.md): a twilight sky over the sea at the launch center,
 * a dark studio indoors and in space. A generated studio stands in until it
 * loads, or if it can't. Each panorama is prefiltered once and kept, so
 * changing maps costs nothing more.
 */
const HDRI = { dusk: 'the_sky_is_on_fire-1k.hdr', studio: 'studio_small_09-1k.hdr' } as const
const prefiltered = new Map<string, Promise<Texture | null>>()

function hdriEnvironment(gl: WebGLRenderer, file: string): Promise<Texture | null> {
  let pending = prefiltered.get(file)
  if (!pending) {
    pending = new HDRLoader()
      .loadAsync(`${import.meta.env.BASE_URL}hdri/${file}`)
      .then((hdr) => {
        const generator = new PMREMGenerator(gl)
        const target = generator.fromEquirectangular(hdr)
        hdr.dispose()
        generator.dispose()
        return target.texture
      })
      .catch((error: unknown) => {
        console.warn('HDR environment not loaded; the generated one stays', error)
        return null
      })
    prefiltered.set(file, pending)
  }
  return pending
}

function EnvironmentMap({ outdoorsDusk }: { outdoorsDusk: boolean }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  useEffect(() => {
    const generator = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = generator.fromScene(room, 0.04)
    scene.environment = target.texture
    room.dispose()
    let live = true
    // At the launch center, the dusk sky outdoors and the studio inside; elsewhere the studio.
    let loaded: { dusk: Texture | null; studio: Texture | null } = { dusk: null, studio: null }
    const apply = () => {
      const outside = outdoorsDusk && useGame.getState().outdoors
      const texture = outside ? (loaded.dusk ?? loaded.studio) : loaded.studio
      if (live && texture && scene.environment !== texture) scene.environment = texture
    }
    void Promise.all([outdoorsDusk ? hdriEnvironment(gl, HDRI.dusk) : Promise.resolve(null), hdriEnvironment(gl, HDRI.studio)]).then(([dusk, studio]) => {
      loaded = { dusk, studio }
      apply()
    })
    const unsubscribe = useGame.subscribe((state, before) => {
      if (state.outdoors !== before.outdoors) apply()
    })
    return () => {
      live = false
      unsubscribe()
      scene.environment = null
      target.dispose()
      generator.dispose()
    }
  }, [gl, scene, outdoorsDusk])
  return null
}

/** The briefing room's mission graphic, drawn to a canvas. */
function WallScreen({ spec }: { spec: ScreenSpec }) {
  const texture = useMemo(() => missionBriefingTexture(), [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh position={spec.position} rotation-y={spec.rotationY}>
      <planeGeometry args={[spec.width, spec.height]} />
      <meshBasicMaterial map={texture} toneMapped={false} color="#d8dde6" />
    </mesh>
  )
}

/** Aviation warning lights on tall structures blink together. */
function AviationBlink({ material }: { material: MeshBasicMaterial }) {
  const on = useRef<boolean | null>(null)
  useFrame(({ clock }) => {
    const lit = clock.elapsedTime % 1.6 < 0.5
    if (lit === on.current) return
    on.current = lit
    if (lit) material.color.setRGB(4, 0.25, 0.18)
    else material.color.setRGB(0.25, 0.02, 0.02)
  })
  return null
}

/**
 * Draws one map: merged geometry (one mesh per material), the lights, signs,
 * screens, consoles, markers, doors, elevators and the outside world.
 */
export function MapView({ map }: { map: GameMap }) {
  const preset = useGraphicsPreset()
  const ground = useMemo(() => groundHeight(map), [map])
  // Markers outdoors stand on the terrain; indoors, on their level's floor.
  const markerY = (marker: GameMap['markers'][number]) => {
    const level = levelY(map, levelOf(marker))
    if (map.exterior?.scene !== 'lunar-south-pole') return level
    const c = rectCenter(marker.rect)
    return roomAt(map, c.x, c.z, levelOf(marker)) ? level : ground(c.x, c.z)
  }
  const usedConsoles = useGame((state) => state.usedConsoles)
  // On the Moon, static things' shadows are baked into the terrain; only moving things cast in real time.
  const lunar = map.exterior?.scene === 'lunar-south-pole' ? map.exterior : null
  const power = useGame((state) => state.mission.meters.power)
  const built = useMemo(() => buildMap(map), [map])
  const rocketPad = map.exterior?.scene === 'launch-complex' ? launchPad(map) : null
  // Landers stand on the ground where their props are (the props give them collision and a baked shadow).
  const landers = useMemo(() => {
    const ground = groundHeight(map)
    return map.props.filter((prop) => prop.kind === 'lander').map((prop) => ({ id: prop.id, position: [prop.position.x, ground(prop.position.x, prop.position.z), prop.position.z] as [number, number, number], yaw: prop.yaw ?? 0 }))
  }, [map])
  useEffect(
    () => () => {
      for (const part of built.parts) part.geometry.dispose()
    },
    [built],
  )

  const materials = useMemo(() => createMaterialLibrary(decalAtlas()), [])
  // On the Moon, the ground's sunlight and shadows are a baked light map.
  useMemo(() => {
    const light = siteLight(map)
    if (!light) return
    const material = materials.lunarTerrain as MeshBasicMaterial
    material.lightMap = lightTexture(light)
    material.needsUpdate = true
  }, [materials, map])
  // Elevator shafts go down through the ground: open the terrain over them.
  useMemo(() => {
    if (map.exterior?.scene === 'launch-complex') {
      cutTerrainHoles(materials.terrain as MeshStandardMaterial, (map.elevators ?? []).map(shaftRect))
    }
  }, [materials, map])
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose()
    },
    [materials],
  )

  // Light panels and screens glow less when the outpost's power runs low, and turn red when it's critical.
  useEffect(() => {
    const emissive = materials.emissive as MeshBasicMaterial
    if (!lunar) {
      emissive.color.setRGB(1, 1, 1)
      return
    }
    const { level, critical } = powerLight(power)
    if (critical) emissive.color.setRGB(level * 1.2, level * 0.35, level * 0.3)
    else emissive.color.setRGB(level, level, level)
  }, [materials, lunar, power])

  return (
    <group>
      <LightingRig map={map} lights={built.extras.lights} shadows={preset.shadows} environment={preset.environment} />

      {built.parts.map((part) => (
        <mesh
          key={part.key}
          geometry={part.geometry}
          material={materials[part.key]}
          castShadow={!lunar && CASTS_SHADOW.has(part.key)}
          receiveShadow={RECEIVES_SHADOW.has(part.key)}
          matrixAutoUpdate={false}
          renderOrder={part.key === 'lightCone' || part.key === 'glow' ? 2 : part.key === 'glass' ? 1 : 0}
        />
      ))}

      {built.extras.texts.map((text) => (
        <Text
          key={text.id}
          font={text.font === 'mono' ? monoFont : interFont}
          fontSize={text.fontSize}
          color={text.color}
          letterSpacing={0.06}
          anchorX="center"
          anchorY="middle"
          textAlign="center"
          position={text.position}
          rotation-y={text.rotationY}
        >
          {text.text}
          {text.glow && <meshBasicMaterial color={text.color} toneMapped={false} />}
        </Text>
      ))}

      {built.extras.screens.map((spec) => (
        <WallScreen key={spec.id} spec={spec} />
      ))}
      {map.consoles.map((item) => (
        <ConsoleView key={item.id} item={item} y={levelY(map, levelOf(item))} />
      ))}
      {map.markers
        // "Prepare for landing" appears only once the landing site is picked.
        .filter((marker) => marker.kind !== 'sequence' || !marker.requires || challengeCleared(marker.requires, usedConsoles))
        .map((marker) => (
          <MarkerRing key={marker.id} marker={marker} y={markerY(marker)} />
        ))}

      <SlidingDoors map={map} />
      <CrewView map={map} />
      <Elevators map={map} />
      {map.exterior?.scene === 'launch-complex' && <Sky />}
      {rocketPad && <SaturnVView position={[rocketPad.x, ROCKET_BASE, rocketPad.z]} />}
      {landers.map((lander) => (
        <LunarModuleView key={lander.id} position={lander.position} yaw={lander.yaw} />
      ))}
      {map.exterior?.scene === 'space' && <Space />}
      {lunar && <LunarSky exterior={lunar} />}
      {lunar && <LunarRocks map={map} material={materials.regolith as MeshStandardMaterial} />}
      {lunar && <DeveloperTribute map={map} />}
      {map.airlock && <AirlockView map={map} />}
      {map.rover && <RoverView map={map} />}
      {map.rover && lunar && <HeadlightPool map={map} />}
      <AviationBlink material={materials.aviation as MeshBasicMaterial} />
      {preset.environment && <EnvironmentMap outdoorsDusk={map.exterior?.scene === 'launch-complex'} />}
    </group>
  )
}
