import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  type BufferGeometry,
  Color,
  type DirectionalLight,
  type Group,
  type HemisphereLight,
  type Mesh,
  type PointLight,
  type Points,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  type Sprite,
  SpriteMaterial,
  type Texture,
  Vector3,
} from 'three'
import { LAUNCH_CENTER } from '../../maps/launchCenter'
import { cinematic } from '../../state/cinematic'
import { buildLaunchStage } from '../kit/exterior'
import { Parts } from '../kit/parts'
import { decalAtlas } from '../materials/canvasTextures'
import { createMaterialLibrary } from '../materials/surfaces'
import { PALETTE } from '../palette'
import { buildSaturnVPieces, loadSaturnV, rocketEnvironment, type SaturnVPieces } from '../saturnV'
import { SATURN_V } from '../saturnLayout'
import { GLOW_HEIGHT } from '../SaturnVView'
import { Sky } from '../Sky'
import { bodyVertex, earthFragment, glowTexture, haloFragment, loadTexture, makeStars } from '../Space'
import { flameGeometry, flameMaterial, vacuumPlumeGeometry } from './flames'
import {
  altitudeKm,
  LAUNCH_TIMES,
  launchEffects,
  PAD,
  partMotion,
  type PartMotion,
  ROCKET_BASE,
  rocketPose,
  skyBlackness,
  SPACE_BASE,
  SPACE_PITCH,
} from './launchScript'
import { ParticleField } from './particles'
import { STAGE_LAYER, useCinematicCamera } from './useCinematicCamera'

const T = LAUNCH_TIMES
const Z = new Vector3(0, 0, 1)
const Y = new Vector3(0, 1, 0)

/** Linear colours for steam, vapour and smoke. */
const VAPOUR: [number, number, number] = [0.82, 0.86, 0.95]
const STEAM_LIT: [number, number, number] = [1.05, 0.88, 0.72]
const STEAM_SHADE: [number, number, number] = [0.62, 0.62, 0.7]
const SMOKE_DUSK: [number, number, number] = [0.5, 0.48, 0.52]
const SMOKE_FIRE: [number, number, number] = [1.1, 0.72, 0.45]
/** High up, the plume is still in sunlight after sunset on the ground. TODO: source. */
const SMOKE_SUNLIT: [number, number, number] = [1.5, 1.08, 0.78]
const PUFF: [number, number, number] = [1.3, 1.3, 1.35]

/** High up: the Sun lights everything hard from one side. */
const SUN = new Vector3(-0.25, 0.32, 0.91).normalize()
/** Earth in the space set: drawn this big (not to scale), far below, its curve set by the height. */
const EARTH_RADIUS = 220000
const REAL_EARTH_KM = 6371

const spaceSkyVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** High-altitude sky: a thin blue band along the horizon, the rest deep blue fading to black as we climb. */
const spaceSkyFragment = /* glsl */ `
  uniform float uBlack;
  uniform float uDip;
  varying vec3 vDirection;
  void main() {
    float h = normalize(vDirection).y + uDip;
    vec3 deep = vec3(0.01, 0.04, 0.16);
    vec3 band = vec3(0.18, 0.42, 0.95);
    vec3 color = deep * (1.0 - uBlack) * (1.0 - smoothstep(0.0, 0.6, h));
    color += band * exp(-max(h, 0.0) * 40.0) * (1.0 - 0.75 * uBlack);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** A part's transform: where it sits on the stack (its middle), plus how it has separated. */
function placePart(group: Group | undefined, centre: number, motion: PartMotion): void {
  if (!group) return
  group.position.set(motion.offset[0], centre + motion.offset[1], motion.offset[2])
  group.rotation.set(motion.spin[0], motion.spin[1], motion.spin[2])
  group.visible = motion.visible
}

/** Points round the rocket's axis at a height (stack frame: y up the rocket from its nozzle exits). */
function ring(y: number, radius: number, count: number, start = 0): [number, number, number][] {
  return Array.from({ length: count }, (_, i) => {
    const a = start + (i * Math.PI * 2) / count
    return [Math.cos(a) * radius, y, Math.sin(a) * radius] as [number, number, number]
  })
}

const C = SATURN_V.centres

/**
 * The launch cinematic's stage: the launch pad (a light scene from the
 * exterior kit, with steam, vapour and smoke) and, high up, a space set
 * with Earth's curve below, where the Saturn V comes apart: the first
 * stage, the interstage ring, the escape tower, the second stage, then
 * the spacecraft leaving the third stage as the adapter's panels open on
 * the lunar module. Built when the launch starts (during the cockpit
 * countdown) and disposed when it ends.
 */
export function LaunchStage() {
  const gl = useThree((state) => state.gl)
  const root = useRef<Group>(null)
  const padSet = useRef<Group>(null)
  const spaceSet = useRef<Group>(null)
  const rocket = useRef<Group>(null)
  const [model, setModel] = useState<SaturnVPieces | null>(null)
  const firstFlame = useRef<Mesh>(null)
  const secondPlume = useRef<Mesh>(null)
  const thirdPlume = useRef<Mesh>(null)
  const towerFlame = useRef<Mesh>(null)
  const light = useRef<PointLight>(null)
  const hemisphere = useRef<HemisphereLight>(null)
  const key = useRef<DirectionalLight>(null)
  const baseGlow = useRef<Sprite>(null)
  const padGlow = useRef<Sprite>(null)
  const earth = useRef<Mesh>(null)
  const halo = useRef<Mesh>(null)
  const stars = useRef<Points>(null)
  const sunSprite = useRef<Sprite>(null)
  const [earthMap, setEarthMap] = useState<Texture | null>(null)

  const built = useMemo(() => {
    const parts = new Parts()
    buildLaunchStage(LAUNCH_CENTER, parts)
    return { parts: parts.build() }
  }, [])
  // The rocket, in its separating pieces (the model is usually loaded already: it stands on the pad in the map).
  useEffect(() => {
    let cancelled = false
    let pieces: SaturnVPieces | null = null
    loadSaturnV()
      .then((gltf) => {
        if (cancelled) return
        pieces = buildSaturnVPieces(gltf, rocketEnvironment(gl))
        setModel(pieces)
      })
      .catch((error: unknown) => console.error('Could not load the Saturn V model', error))
    return () => {
      cancelled = true
      pieces?.dispose()
    }
  }, [gl])
  const materials = useMemo(() => createMaterialLibrary(decalAtlas()), [])
  const fx = useMemo(() => {
    const glow = glowTexture()
    const starPoints = makeStars(1600)
    return {
      // The five F-1s, each flame starting at its nozzle exit, in the first stage's own frame.
      firstGeometry: flameGeometry(SATURN_V.f1.at.map(([x, z]) => ({ x, y: SATURN_V.f1.y - C.first, z, radius: 1.7, length: 64 }))),
      towerGeometry: flameGeometry(
        ring(SATURN_V.towerNozzles.y - C.tower, SATURN_V.towerNozzles.radius, 4).map(([x, y, z]) => ({ x, y, z, radius: 0.24, length: 6 })),
      ),
      // The second stage's five J-2s spread into one wide plume in the near vacuum up there; the third stage has one.
      secondPlumeGeometry: vacuumPlumeGeometry(3.2, 26, 56),
      thirdPlumeGeometry: vacuumPlumeGeometry(1.0, 18, 36),
      firstMaterial: flameMaterial({ hot: '#ffffff', warm: '#ffd27a', tip: '#ff5a1e' }),
      towerMaterial: flameMaterial({ hot: '#ffffff', warm: '#ffc070', tip: '#ff6a2a' }),
      // Faint blue-white and see-through: a vacuum plume. TODO: source.
      plumeMaterial: flameMaterial({ hot: '#eaf2ff', warm: '#9ab8ff', tip: '#3a4f9a' }),
      thirdPlumeMaterial: flameMaterial({ hot: '#eaf2ff', warm: '#9ab8ff', tip: '#3a4f9a' }),
      glow,
      baseGlow: new SpriteMaterial({ map: glow, color: '#ffb066', blending: AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }),
      padGlow: new SpriteMaterial({ map: glow, color: '#ff9a4a', blending: AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }),
      sunMaterial: new SpriteMaterial({ map: glow, color: '#fff4e0', blending: AdditiveBlending, depthWrite: false, fog: false }),
      sphere: new SphereGeometry(1, 96, 64),
      skyGeometry: new SphereGeometry(80000, 32, 16),
      earthMaterial: new ShaderMaterial({
        vertexShader: bodyVertex,
        fragmentShader: earthFragment,
        fog: false,
        uniforms: {
          uMap: { value: null },
          uSun: { value: SUN },
          uHaze: { value: new Color(0, 0, 0) },
          uClarity: { value: 1 },
          uReady: { value: 0 },
        },
      }),
      haloMaterial: new ShaderMaterial({
        vertexShader: bodyVertex,
        fragmentShader: haloFragment,
        side: BackSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
        uniforms: { uSun: { value: SUN }, uStrength: { value: 1 } },
      }),
      skyMaterial: new ShaderMaterial({
        vertexShader: spaceSkyVertex,
        fragmentShader: spaceSkyFragment,
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uBlack: { value: 0 }, uDip: { value: 0.1 } },
      }),
      starPoints,
      vapour: new ParticleField(160),
      steam: new ParticleField(520, { maxPixels: 420 }),
      smoke: new ParticleField(560, { maxPixels: 420 }),
      puffs: new ParticleField(220, { maxPixels: 260 }),
    }
  }, [])

  // The Blue Marble map for Earth below.
  useEffect(() => {
    let cancelled = false
    let loaded: Texture | null = null
    loadTexture('earth-blue-marble.webp')
      .then((texture) => {
        loaded = texture
        if (cancelled) texture.dispose()
        else setEarthMap(texture)
      })
      .catch((error: unknown) => console.error('Could not load the Earth map', error))
    return () => {
      cancelled = true
      loaded?.dispose()
    }
  }, [])
  useEffect(() => {
    if (!earthMap) return
    fx.earthMaterial.uniforms.uMap!.value = earthMap
    fx.earthMaterial.uniforms.uReady!.value = 1
  }, [earthMap, fx])

  useEffect(
    () => () => {
      for (const part of built.parts) part.geometry.dispose()
      for (const material of Object.values(materials)) material.dispose()
      const geometries: BufferGeometry[] = [fx.firstGeometry, fx.towerGeometry, fx.secondPlumeGeometry, fx.thirdPlumeGeometry, fx.sphere, fx.skyGeometry, fx.starPoints.geometry]
      for (const g of geometries) g.dispose()
      for (const m of [fx.firstMaterial, fx.towerMaterial, fx.plumeMaterial, fx.thirdPlumeMaterial, fx.earthMaterial, fx.haloMaterial, fx.skyMaterial]) m.dispose()
      ;(fx.starPoints.material as { dispose: () => void }).dispose()
      fx.glow.dispose()
      fx.baseGlow.dispose()
      fx.padGlow.dispose()
      fx.sunMaterial.dispose()
      for (const field of [fx.vapour, fx.steam, fx.smoke, fx.puffs]) field.dispose()
    },
    [built, materials, fx],
  )

  // Everything here draws on the stage's own layer (lights too: they only light what the camera's layers see).
  useLayoutEffect(() => {
    root.current?.traverse((object) => object.layers.set(STAGE_LAYER))
  })

  useCinematicCamera({ far: 9000, particles: [fx.vapour, fx.steam, fx.smoke, fx.puffs] })

  const scratch = useMemo(() => ({ roll: new Quaternion(), tilt: new Quaternion(), v: new Vector3(), w: new Vector3() }), [])
  const last = useRef(cinematic.time)

  useFrame(({ camera }) => {
    const t = cinematic.time
    // Run the effects on the script's clock (so a pause freezes them), a frame at a time.
    const dt = Math.max(0, Math.min(0.05, t - last.current))
    const before = last.current
    last.current = t
    const inSpace = t >= T.space
    const e = launchEffects(t)
    if (padSet.current) padSet.current.visible = !inSpace
    if (spaceSet.current) spaceSet.current.visible = inSpace
    // Floodlit on the pad; lit only by the Sun up there.
    model?.setGlow(inSpace ? 0 : 1, 0, GLOW_HEIGHT)

    const r = rocket.current
    if (r) {
      if (!inSpace) {
        const pose = rocketPose(t)
        r.position.set(pose.base[0], pose.base[1], pose.base[2])
        scratch.tilt.setFromAxisAngle(Z, -pose.tilt)
        scratch.roll.setFromAxisAngle(Y, pose.roll)
        r.quaternion.copy(scratch.tilt).multiply(scratch.roll)
      } else {
        r.position.set(SPACE_BASE[0], SPACE_BASE[1], SPACE_BASE[2])
        r.quaternion.setFromAxisAngle(Z, -(Math.PI / 2 - SPACE_PITCH))
      }
    }
    // The pieces coming apart.
    const motion = partMotion(t)
    const p = model?.pieces
    placePart(p?.first, C.first, motion.first)
    placePart(p?.interstage, C.interstage, motion.interstage)
    placePart(p?.second, C.second, motion.second)
    placePart(p?.third, C.third, motion.third)
    placePart(p?.spacecraft, C.spacecraft, motion.spacecraft)
    placePart(p?.tower, C.tower, motion.tower)
    // The adapter's four panels swing open from their foot, like petals, showing the lunar module.
    for (const panel of model?.panels ?? []) panel.rotation.x = e.panels * SATURN_V.panelOpen

    // Flames.
    const height = inSpace ? altitudeKm(t) * 1000 : rocketPose(t).base[1] - ROCKET_BASE
    const stretch = 1 + Math.min(0.6, height / 900)
    for (const [material, strength] of [
      // High up the flames thin out and fade.
      [fx.firstMaterial, e.first * (inSpace ? 0.5 : 1.05)],
      [fx.towerMaterial, e.towerMotor * 1.2],
      [fx.plumeMaterial, e.second * 0.06],
      [fx.thirdPlumeMaterial, e.third * 0.11],
    ] as const) {
      material.uniforms.uStrength!.value = strength
      material.uniforms.uTime!.value = t
    }
    // Before liftoff the flames are short, growing as the engines build to full thrust.
    if (firstFlame.current) firstFlame.current.scale.set(1, Math.max(0.01, e.first * e.first) * stretch, 1)
    if (towerFlame.current) towerFlame.current.scale.set(1, Math.max(0.01, e.towerMotor), 1)
    if (secondPlume.current) secondPlume.current.scale.set(0.6 + 0.4 * e.second, Math.max(0.01, e.second), 0.6 + 0.4 * e.second)
    if (thirdPlume.current) thirdPlume.current.scale.set(0.6 + 0.4 * e.third, Math.max(0.01, e.third), 0.6 + 0.4 * e.third)
    const thrust = e.first
    fx.baseGlow.opacity = inSpace ? 0 : Math.min(1, thrust * 1.1)
    baseGlow.current?.scale.setScalar(50 + 60 * thrust)
    // The orange glow under the pad, fading as the rocket climbs away.
    fx.padGlow.opacity = inSpace ? 0 : Math.min(1, thrust) * Math.max(0, 1 - height / 250)
    if (light.current) light.current.intensity = inSpace ? 0 : 7000 * thrust * Math.max(0.15, 1 - height / 600)
    // Dusk on the pad; high up, the hard Sun from one side and a little earthshine.
    if (hemisphere.current) {
      hemisphere.current.intensity = inSpace ? 0.18 : 1.25
      hemisphere.current.color.set(inSpace ? '#1a2a50' : PALETTE.hemisphereSky)
      hemisphere.current.groundColor.set(inSpace ? '#3a5a9a' : PALETTE.hemisphereGround)
    }
    if (key.current) {
      key.current.intensity = inSpace ? 3.2 : 0.55
      if (inSpace) key.current.position.copy(SUN).multiplyScalar(500)
      else key.current.position.set(-120, 160, 60)
    }

    // The space set: Earth below (its curve set by the height), the sky, stars and the Sun round the camera.
    if (inSpace) {
      const km = altitudeKm(t)
      const below = (EARTH_RADIUS * km) / REAL_EARTH_KM
      earth.current?.position.set(0, -EARTH_RADIUS - below, 0)
      halo.current?.position.set(0, -EARTH_RADIUS - below, 0)
      // Turning slowly beneath us: we're flying over it.
      earth.current?.rotation.set(0.35, 2.2, -t * 0.006)
      fx.skyMaterial.uniforms.uBlack!.value = skyBlackness(t)
      fx.skyMaterial.uniforms.uDip!.value = Math.acos(REAL_EARTH_KM / (REAL_EARTH_KM + km))
      stars.current?.position.copy(camera.position)
      sunSprite.current?.position.copy(scratch.v.copy(SUN).multiplyScalar(60000).add(camera.position))
      ;(fx.starPoints.material as { opacity: number }).opacity = skyBlackness(t)
    }

    if (dt <= 0) return
    const rand = (field: ParticleField, n: number, k: number) => field.random(n, k)
    if (!inSpace) {
      const pose = rocketPose(t)
      // Vapour: super-cold propellant boiling off, streaming down the rocket's sides from its three stages' tanks.
      fx.vapour.emitRate(70 * e.vent, dt, (n) => {
        const angle = rand(fx.vapour, n, 1) * Math.PI * 2
        const y = 10 + rand(fx.vapour, n, 2) * 80
        const radius = (y < SATURN_V.secondTop ? SATURN_V.radius : 3.4) + 0.2
        return {
          position: [PAD[0] + Math.cos(angle) * radius, ROCKET_BASE + y, PAD[2] + Math.sin(angle) * radius],
          velocity: [Math.cos(angle) * 1.6, -1.6 - rand(fx.vapour, n, 3), Math.sin(angle) * 1.6],
          life: 2.6 + rand(fx.vapour, n, 4),
          size: [2, 9],
          alpha: 0.32,
          drag: 0.7,
          gravity: 0.5,
          tint: VAPOUR,
        }
      })
      // Steam from the deluge, rolling out of the flame trench (east) and from under the mount.
      fx.steam.emitRate(80 * e.steam, dt, (n) => {
        const pick = rand(fx.steam, n, 1)
        const speed = 15 + rand(fx.steam, n, 2) * 16
        const spread = (rand(fx.steam, n, 3) - 0.5) * 2
        let position: [number, number, number]
        let velocity: [number, number, number]
        if (pick < 0.5) {
          position = [PAD[0] + 13 + rand(fx.steam, n, 4) * 5, 1, PAD[2] + spread * 5]
          velocity = [speed, 1.5 + rand(fx.steam, n, 5) * 2, spread * 7]
        } else if (pick < 0.75) {
          position = [PAD[0] - 9, 2, PAD[2] + spread * 5]
          velocity = [-speed * 0.8, 1.5, spread * 9]
        } else {
          const side = spread > 0 ? 1 : -1
          position = [PAD[0] + spread * 7, 2, PAD[2] + side * 8]
          velocity = [spread * 5, 1.5, side * speed * 0.85]
        }
        const lit = rand(fx.steam, n, 6)
        return {
          position,
          velocity,
          life: 9 + rand(fx.steam, n, 7) * 5,
          size: [8, 44 + rand(fx.steam, n, 8) * 16],
          alpha: 0.55,
          drag: 0.5,
          gravity: -0.9,
          tint: [
            STEAM_SHADE[0] + (STEAM_LIT[0] - STEAM_SHADE[0]) * lit,
            STEAM_SHADE[1] + (STEAM_LIT[1] - STEAM_SHADE[1]) * lit,
            STEAM_SHADE[2] + (STEAM_LIT[2] - STEAM_SHADE[2]) * lit,
          ],
          fadeIn: 0.06,
        }
      })
      // The smoke column left behind, lit by the flame near the ground and by the Sun high up.
      if (t >= T.liftoff && e.first > 0 && r) {
        const tail = scratch.w.set(0, -8, 0).applyQuaternion(r.quaternion)
        fx.smoke.emitRate(56, dt, (n) => {
          const y = pose.base[1] + tail.y
          const tint = y > 320 ? SMOKE_SUNLIT : y < 120 ? SMOKE_FIRE : SMOKE_DUSK
          return {
            position: [pose.base[0] + tail.x + (rand(fx.smoke, n, 1) - 0.5) * 7, y, pose.base[2] + (rand(fx.smoke, n, 2) - 0.5) * 7],
            velocity: [(rand(fx.smoke, n, 3) - 0.5) * 4, -2 - rand(fx.smoke, n, 4) * 3, (rand(fx.smoke, n, 5) - 0.5) * 4],
            life: 14 + rand(fx.smoke, n, 6) * 6,
            size: [10, 44 + (pose.base[1] - ROCKET_BASE) / 30],
            alpha: 0.45,
            drag: 0.25,
            tint,
            fadeIn: 0.03,
          }
        })
      }
      fx.vapour.update(dt)
      fx.steam.update(dt)
      fx.smoke.update(dt)
    } else if (r) {
      // Separation motors: quick white puffs where each piece comes free.
      const burst = (at: number, points: [number, number, number][], count: number, speed: number) => {
        if (!(before < at && t >= at)) return
        r.updateMatrixWorld()
        for (const [x, y, z] of points) {
          const p = scratch.v.set(x, y, z).applyMatrix4(r.matrixWorld)
          for (let i = 0; i < count; i++) {
            const a = fx.puffs.random(i + x * 7 + y, 1) * Math.PI * 2
            const b = fx.puffs.random(i + z * 3 + y, 2) - 0.5
            fx.puffs.emit({
              position: [p.x, p.y, p.z],
              velocity: [Math.cos(a) * speed, b * speed, Math.sin(a) * speed],
              life: 0.9 + fx.puffs.random(i, 3) * 0.6,
              size: [1.2, 8],
              alpha: 0.6,
              tint: PUFF,
              fadeIn: 0.02,
            })
          }
        }
      }
      // The first stage's retro-rockets in its engine fairings, and the second stage's ullage motors.
      burst(T.firstSeparation, [...ring(SATURN_V.firstRetros.y, SATURN_V.firstRetros.radius, 4, Math.PI / 4), ...ring(SATURN_V.ullage.y, SATURN_V.ullage.radius, 8)], 10, 8)
      burst(T.interstageJettison, ring(SATURN_V.firstTop, SATURN_V.radius + 0.4, 6), 6, 3)
      // The retro-rockets on the interstage that goes with the second stage.
      burst(T.secondSeparation, ring(SATURN_V.secondRetros.y, SATURN_V.secondRetros.radius, 4), 12, 5)
      burst(T.spacecraftSeparation, ring(SATURN_V.adapterBase + 4, 2.4, 4, Math.PI / 4), 6, 2)
      fx.puffs.update(dt)
    }
  })

  const pieces = model?.pieces

  return (
    <group ref={root}>
      <hemisphereLight ref={hemisphere} args={[PALETTE.hemisphereSky, PALETTE.hemisphereGround, 1.25]} />
      <directionalLight ref={key} color={PALETTE.keyLight} intensity={0.55} position={[-120, 160, 60]} />
      <group ref={padSet}>
        <Sky follow />
        {built.parts.map((part) => (
          <mesh key={part.key} geometry={part.geometry} material={materials[part.key]} />
        ))}
        <sprite ref={padGlow} material={fx.padGlow} position={[PAD[0] + 8, 4, PAD[2]]} scale={[100, 36, 1]} renderOrder={4} />
        <primitive object={fx.vapour.points} renderOrder={5} />
        <primitive object={fx.steam.points} renderOrder={5} />
        <primitive object={fx.smoke.points} renderOrder={5} />
      </group>
      <group ref={spaceSet} visible={false}>
        <mesh geometry={fx.skyGeometry} material={fx.skyMaterial} renderOrder={-3} frustumCulled={false} />
        <primitive ref={stars} object={fx.starPoints} />
        <sprite ref={sunSprite} material={fx.sunMaterial} scale={[9000, 9000, 1]} renderOrder={-1} />
        <mesh ref={earth} geometry={fx.sphere} material={fx.earthMaterial} scale={EARTH_RADIUS} frustumCulled={false} />
        <mesh ref={halo} geometry={fx.sphere} material={fx.haloMaterial} scale={EARTH_RADIUS * 1.012} renderOrder={1} frustumCulled={false} />
        <primitive object={fx.puffs.points} renderOrder={5} />
      </group>
      <group ref={rocket}>
        {pieces && (
          <>
            <primitive object={pieces.first}>
              <mesh ref={firstFlame} geometry={fx.firstGeometry} material={fx.firstMaterial} frustumCulled={false} renderOrder={3} />
            </primitive>
            <primitive object={pieces.interstage} />
            <primitive object={pieces.second}>
              <mesh ref={secondPlume} position-y={SATURN_V.j2Second.y - C.second} geometry={fx.secondPlumeGeometry} material={fx.plumeMaterial} frustumCulled={false} renderOrder={3} />
            </primitive>
            <primitive object={pieces.third}>
              <mesh ref={thirdPlume} position-y={SATURN_V.j2Third.y - C.third} geometry={fx.thirdPlumeGeometry} material={fx.thirdPlumeMaterial} frustumCulled={false} renderOrder={3} />
            </primitive>
            <primitive object={pieces.spacecraft} />
            <primitive object={pieces.tower}>
              <mesh ref={towerFlame} geometry={fx.towerGeometry} material={fx.towerMaterial} frustumCulled={false} renderOrder={3} />
            </primitive>
          </>
        )}
        <sprite ref={baseGlow} material={fx.baseGlow} position={[0, -6, 0]} renderOrder={4} />
        <pointLight ref={light} color="#ffa451" intensity={0} distance={900} decay={2} position={[0, -12, 0]} />
      </group>
    </group>
  )
}
