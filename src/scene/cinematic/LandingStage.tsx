import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  type Group,
  Matrix4,
  type Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from 'three'
import { OUTPOST } from '../../maps/outpost'
import { SPACECRAFT } from '../../maps/spacecraft'
import { cinematic } from '../../state/cinematic'
import { bearingVector, buildLunarSurface, lunarGround, lunarTerrain, terrainTone } from '../kit/lunar'
import { FAR_LIGHT, type LightMap, lightTexture, lightUv, MID_LIGHT, siteLight, wideLight } from '../kit/lunarLight'
import { Parts } from '../kit/parts'
import { buildProp } from '../kit/props'
import type { MapExtras } from '../kit/specs'
import { decalAtlas } from '../materials/canvasTextures'
import { createMaterialLibrary, lunarTerrainMaterial } from '../materials/surfaces'
import { loadLunarModule, lunarModuleCopy } from '../lunarModule'
import { LUNAR_MODULE } from '../lunarModuleLayout'
import { LunarRocks } from '../LunarRocks'
import { LunarSky } from '../LunarSky'
import { flameGeometry, flameMaterial } from './flames'
import { engineThrust, LANDER_YAW, LANDING_TIMES, landerAltitude, landerMotion, landerPitch, landerPose } from './landingScript'
import { keyframes } from './timeline'
import { ParticleField } from './particles'
import { STAGE_LAYER, useCinematicCamera } from './useCinematicCamera'

/** Seen through the cockpit windows, the world is drawn this much smaller round the eye: same view, but 15 km fits the far plane. */
const WINDOW_SCALE = 1 / 50
/** The eyes at the lander's cabin windows, above its footpads. */
const CABIN_EYE = LUNAR_MODULE.cabinEye
const MOON_RADIUS = 1737400
const DUST: [number, number, number] = [0.5, 0.49, 0.47]

/** Half the size of the detailed lunar terrain (lunar.ts: 800 m, centred on the outpost). */
const SITE_HALF = 400
/** Where the near landscape (finer light map) gives way to the far one. */
const MID_HALF = MID_LIGHT.extent / 2

/**
 * The landscape round the site: rings of squares, each a little bigger than
 * the last, from `from` to `to` metres out. Heights from the terrain's own
 * height function, the same colour variation, UVs for the regolith texture
 * and the light map, so it looks just like the site. The first ring tucks
 * just under the site's edge; the far rings curve away with the Moon.
 */
function landscapeRings(surface: (x: number, z: number) => number, light: LightMap, from: number, to: number, rings: number, perSide: number, tuckUnder: boolean): BufferGeometry {
  const around = perSide * 4
  const growth = Math.pow(to / from, 1 / (rings - 1))
  const positions: number[] = []
  const uvs: number[] = []
  const lightUvs: number[] = []
  const colors: number[] = []
  const index: number[] = []
  const onSquare = (half: number, i: number): [number, number] => {
    const side = Math.floor(i / perSide) % 4
    const t = (i % perSide) / perSide
    const a = -half + 2 * half * t
    return side === 0 ? [a, -half] : side === 1 ? [half, a] : side === 2 ? [-a, half] : [-half, -a]
  }
  for (let k = 0; k < rings; k++) {
    const half = k === 0 && tuckUnder ? from - 0.5 : from * Math.pow(growth, k)
    for (let i = 0; i < around; i++) {
      const [x, z] = onSquare(half, i)
      const r = Math.hypot(x, z)
      const y = surface(x, z) - (k === 0 && tuckUnder ? 0.3 : 0) - (r * r) / (2 * MOON_RADIUS)
      positions.push(x, y, z)
      uvs.push(x / 2.4, z / 2.4)
      lightUvs.push(...lightUv(light, x, z))
      const tone = terrainTone(x, z)
      colors.push(tone, tone * 0.985, tone * 0.96)
    }
  }
  for (let k = 0; k < rings - 1; k++) {
    for (let i = 0; i < around; i++) {
      const a = k * around + i
      const b = k * around + ((i + 1) % around)
      const c = (k + 1) * around + i
      const d = (k + 1) * around + ((i + 1) % around)
      index.push(a, b, c, b, d, c)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setAttribute('uv1', new BufferAttribute(new Float32Array(lightUvs), 2))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

/** A soft dark streak, for the lander's long shadow. */
function shadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    const across = context.createLinearGradient(0, 0, 32, 0)
    across.addColorStop(0, 'rgba(0,0,0,0)')
    across.addColorStop(0.3, 'rgba(0,0,0,1)')
    across.addColorStop(0.7, 'rgba(0,0,0,1)')
    across.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = across
    context.fillRect(0, 0, 32, 128)
    // Fading out toward the far end.
    context.globalCompositeOperation = 'destination-in'
    const along = context.createLinearGradient(0, 0, 0, 128)
    along.addColorStop(0, 'rgba(0,0,0,0.15)')
    along.addColorStop(0.2, 'rgba(0,0,0,1)')
    along.addColorStop(1, 'rgba(0,0,0,1)')
    context.fillStyle = along
    context.fillRect(0, 0, 32, 128)
  }
  return new CanvasTexture(canvas)
}

/**
 * The landing site for the landing cinematic: the outpost's surface from
 * the lunar kit (terrain, modules, solar field, antenna, rocks, sky), the
 * wide surface around it, the lunar module (the same model that stands on
 * the pad afterwards) with its plume, its long shadow, and the dust its
 * engine blows out. Built when the landing starts and
 * disposed when it ends.
 *
 * In the cockpit the same stage is seen through the windows, placed so it
 * lies where the vehicle is: below and ahead, tipped with the vehicle.
 */
export function LandingStage() {
  const root = useRef<Group>(null)
  const sky = useRef<Group>(null)
  const landerGroup = useRef<Group>(null)
  const landerBody = useRef<Group>(null)
  const plume = useRef<Mesh>(null)
  const shadow = useRef<Mesh>(null)
  const [lander, setLander] = useState<Group | null>(null)
  const ground = useMemo(() => lunarGround(OUTPOST) ?? (() => 0), [])
  const sun = useMemo(() => bearingVector(OUTPOST.exterior?.scene === 'lunar-south-pole' ? OUTPOST.exterior.sun.bearing : 200, 3), [])

  const built = useMemo(() => {
    const parts = new Parts()
    const extras: MapExtras = { texts: [], screens: [], lights: [] }
    buildLunarSurface(OUTPOST, parts, extras)
    // Things standing on the ground (the parked lander is a model, and the one landing now takes its place).
    for (const prop of OUTPOST.props) if (prop.ground && prop.kind !== 'lander') buildProp(OUTPOST, prop, parts, extras)
    return { parts: parts.build() }
  }, [])
  // The lunar module (usually loaded already: the landing starts long after the spacecraft map has).
  useEffect(() => {
    let cancelled = false
    loadLunarModule()
      .then((gltf) => {
        if (!cancelled) setLander(lunarModuleCopy(gltf))
      })
      .catch((error: unknown) => console.error('Could not load the lunar module model', error))
    return () => {
      cancelled = true
    }
  }, [])
  const materials = useMemo(() => {
    const library = createMaterialLibrary(decalAtlas())
    const site = siteLight(OUTPOST)
    if (site) (library.lunarTerrain as MeshBasicMaterial).lightMap = lightTexture(site)
    return library
  }, [])

  const fx = useMemo(() => {
    const terrain = lunarTerrain(OUTPOST)!
    // The light maps: from the background bake if it's done, otherwise worked out now.
    const midLight = wideLight(OUTPOST, MID_LIGHT.extent, MID_LIGHT.size)!
    const farLight = wideLight(OUTPOST, FAR_LIGHT.extent, FAR_LIGHT.size)!
    const near = landscapeRings(terrain.surface, midLight, SITE_HALF, MID_HALF, 30, 72, true)
    const far = landscapeRings(terrain.surface, farLight, MID_HALF, 30000, 26, 48, false)
    const strip = new PlaneGeometry(1, 1, 1, 24)
    const shadowMap = shadowTexture()
    return {
      near,
      far,
      nearMaterial: lunarTerrainMaterial(lightTexture(midLight)),
      farMaterial: lunarTerrainMaterial(lightTexture(farLight)),
      // In a vacuum this kind of engine's exhaust is nearly see-through: a faint, short glow. TODO: source.
      plumeGeometry: flameGeometry([{ x: 0, y: LUNAR_MODULE.engine.y, z: 0, radius: LUNAR_MODULE.engine.radius, length: 5.5 }]),
      plumeMaterial: flameMaterial({ hot: '#ffffff', warm: '#c8d8ff', tip: '#7a8cff' }),
      strip,
      shadowMap,
      shadowMaterial: new MeshBasicMaterial({ map: shadowMap, color: '#000000', transparent: true, opacity: 0.6, depthWrite: false }),
      dust: new ParticleField(900, { maxPixels: 48 }),
    }
  }, [sun, ground])

  useEffect(
    () => () => {
      for (const part of built.parts) part.geometry.dispose()
      for (const material of Object.values(materials)) material.dispose()
      fx.near.dispose()
      fx.far.dispose()
      fx.nearMaterial.dispose()
      fx.farMaterial.dispose()
      fx.plumeGeometry.dispose()
      fx.plumeMaterial.dispose()
      fx.strip.dispose()
      fx.shadowMap.dispose()
      fx.shadowMaterial.dispose()
      fx.dust.dispose()
    },
    [built, materials, fx],
  )

  useLayoutEffect(() => {
    root.current?.traverse((object) => object.layers.set(STAGE_LAYER))
  })

  useCinematicCamera({ far: 40000, near: 0.3, cockpitSees: true, particles: [fx.dust] })

  const scratch = useMemo(() => ({ m: new Matrix4(), r: new Matrix4(), s: new Matrix4(), t: new Matrix4(), v: new Vector3() }), [])
  const last = useRef(cinematic.time)
  const seat = SPACECRAFT.seat!

  useFrame(() => {
    const t = cinematic.time
    const dt = Math.max(0, Math.min(0.05, t - last.current))
    last.current = t
    const pose = landerPose(t)
    const group = root.current
    if (group) {
      group.matrixAutoUpdate = false
      if (cinematic.outside) {
        group.matrix.identity()
      } else {
        // The cockpit's eye stands in for the lander's cabin: the world is put
        // where it would be, tipped by the vehicle's pitch, scaled round the eye.
        const { m, r, s, t: move } = scratch
        m.makeTranslation(seat.x, seat.eye, seat.z)
        m.multiply(s.makeScale(WINDOW_SCALE, WINDOW_SCALE, WINDOW_SCALE))
        m.multiply(r.makeRotationZ(landerPitch(t)))
        m.multiply(move.makeTranslation(-pose.base[0], -(pose.base[1] + CABIN_EYE), -pose.base[2]))
        group.matrix.copy(m)
      }
      group.matrixWorldNeedsUpdate = true
    }
    // Only outside is there a sky of the Moon's own (in the cockpit, the spacecraft's stars show).
    if (sky.current) sky.current.visible = cinematic.outside
    const altitude = landerAltitude(t)
    if (landerGroup.current) {
      landerGroup.current.visible = cinematic.outside
      landerGroup.current.position.set(pose.base[0], pose.base[1], pose.base[2])
      // In the final approach the lander leans back a little, braking, then stands upright.
      const lean = landerMotion.override ? 0 : keyframes(t, [
        [LANDING_TIMES.cutOut, 0.25],
        [22, 0.08],
        [26, 0],
      ])
      landerGroup.current.rotation.set(0, 0, lean)
    }
    if (landerBody.current) {
      // Touchdown: the legs give a little, then settle.
      const since = landerMotion.override ? -1 : t - LANDING_TIMES.touchdown
      const squash = since < 0 ? 0 : since < 0.25 ? since / 0.25 : Math.max(0.5, 1 - (since - 0.25) * 2)
      landerBody.current.scale.set(1, 1 - 0.035 * squash, 1)
    }
    const thrust = engineThrust(t)
    fx.plumeMaterial.uniforms.uStrength!.value = thrust * 0.4
    fx.plumeMaterial.uniforms.uTime!.value = t
    if (plume.current) plume.current.scale.set(1, 0.5 + thrust * 0.7, 1)

    // The long shadow (the Sun is 3 degrees up): it lies far off while the lander is high, and slides in to meet it.
    if (shadow.current) {
      const away = new Vector3(-sun.x, 0, -sun.z).normalize()
      const reach = 1 / Math.tan((3 * Math.PI) / 180)
      const from = altitude * reach
      const length = LUNAR_MODULE.height * reach
      const geometry = shadow.current.geometry
      const position = geometry.attributes.position as BufferAttribute
      for (let v = 0; v < position.count; v++) {
        const along = (position.getY(v) + 0.5) * length + from
        const across = position.getX(v) * LUNAR_MODULE.bodyHalf * 2
        const x = pose.base[0] + away.x * along - away.z * across
        const z = pose.base[2] + away.z * along + away.x * across
        position.setXYZ(v, x, ground(x, z) + 0.06, z)
      }
      position.needsUpdate = true
      geometry.computeBoundingSphere()
      shadow.current.visible = cinematic.outside && from < 600
    }

    // Dust: blown out flat and fast, in straight lines, and dropping straight back (no air).
    if (dt > 0) {
      const rate = altitude < 15 && thrust > 0 ? 800 * (1 - altitude / 15) * thrust : 0
      const g0 = ground(pose.base[0], pose.base[2])
      fx.dust.emitRate(rate, dt, (n) => {
        const angle = fx.dust.random(n, 1) * Math.PI * 2
        const start = 0.6 + fx.dust.random(n, 2) * 2
        const speed = 24 + fx.dust.random(n, 3) * 24
        return {
          position: [pose.base[0] + Math.cos(angle) * start, g0 + 0.08, pose.base[2] + Math.sin(angle) * start],
          velocity: [Math.cos(angle) * speed, 0.4 + fx.dust.random(n, 4) * 1.8, Math.sin(angle) * speed],
          life: 5,
          size: [0.22, 0.32],
          alpha: 0.55,
          gravity: 1.62,
          tint: DUST,
          floor: g0 - 0.05,
          fadeIn: 0.01,
        }
      })
      fx.dust.update(dt)
    }
  })

  return (
    <group ref={root}>
      <group ref={sky}>
        {OUTPOST.exterior?.scene === 'lunar-south-pole' && <LunarSky exterior={OUTPOST.exterior} />}
      </group>
      <directionalLight color="#fff4e6" intensity={3.4} position={[sun.x * 500, sun.y * 500, sun.z * 500]} />
      <hemisphereLight args={['#2a2d33', '#3a3836', 0.25]} />
      <mesh geometry={fx.near} material={fx.nearMaterial} frustumCulled={false} />
      <mesh geometry={fx.far} material={fx.farMaterial} frustumCulled={false} />
      {built.parts.map((part) => (
        <mesh key={part.key} geometry={part.geometry} material={materials[part.key]} />
      ))}
      <LunarRocks map={OUTPOST} material={materials.regolith as MeshStandardMaterial} includeEdge={false} />
      <mesh ref={shadow} geometry={fx.strip} material={fx.shadowMaterial} frustumCulled={false} renderOrder={1} />
      <group ref={landerGroup} rotation-y={0}>
        <group rotation-y={LANDER_YAW}>
          <group ref={landerBody}>{lander && <primitive object={lander} />}</group>
          <mesh ref={plume} geometry={fx.plumeGeometry} material={fx.plumeMaterial} frustumCulled={false} renderOrder={3} />
        </group>
      </group>
      <primitive object={fx.dust.points} renderOrder={4} />
    </group>
  )
}
