import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  type Group,
  type Mesh,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  SpriteMaterial,
  type Texture,
  TextureLoader,
  Vector3,
} from 'three'
import { flight } from '../state/flight'
import { hash2 } from './materials/noise'

/**
 * Space seen from the spacecraft: a fixed starfield, the Sun, Earth and the
 * Moon. Earth and the Moon use real NASA maps: Blue Marble Next Generation
 * for Earth, and the Lunar Reconnaissance Orbiter colour mosaic from NASA's
 * CGI Moon Kit for the Moon (see ASSETS.md).
 *
 * Everything sits far away and moves with the camera, so it looks infinitely
 * distant. Transit progress (state/flight.ts) sets how big Earth and the
 * Moon look: Earth shrinks behind us and the Moon grows ahead. During the
 * launch, `ascent` turns the sky from dusk to deep blue to black and swings
 * Earth from the ground below up into a curved horizon.
 *
 * Sizes are for the game, not to scale in time: the trip is squeezed so
 * both bodies change visibly between challenges.
 */

/** How far away the bodies are drawn. Closer than the camera's far plane, well beyond the hull. */
const DISTANCE = 600
const STAR_RADIUS = 700
const STAR_COUNT = 2600

/**
 * Directions from the spacecraft (x is forward). Earth is ahead, right and
 * below, and the Moon ahead and left, both in view of the cockpit windows.
 */
const EARTH_DIRECTION = new Vector3(0.88, -0.28, 0.38).normalize()
const MOON_DIRECTION = new Vector3(0.9, 0.1, -0.42).normalize()
/** The Sun is high, behind and left: Earth and the Moon both show a lit side and a dark edge. */
const SUN_DIRECTION = new Vector3(-0.4, 0.85, 0.35).normalize()
const DOWN = new Vector3(0, -1, 0)

/**
 * Distance to Earth in Earth radii: just above the ground at the start of
 * the trip, about 60 (the Moon's real distance) at the end. Exponential, so
 * Earth keeps shrinking visibly all the way.
 */
function earthDistance(transit: number): number {
  return 1.25 * Math.pow(48, transit)
}

/** Distance to the Moon in Moon radii: about 220 (60 Earth radii) at the start, close in orbit at the end. */
function moonDistance(transit: number): number {
  return Math.pow(220, 1 - transit) * Math.pow(2.9, transit)
}

export const bodyVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const earthFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSun;
  uniform vec3 uHaze;
  uniform float uClarity;
  uniform float uReady;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal);
    float sun = dot(n, uSun);
    vec3 day = mix(vec3(0.06, 0.16, 0.35), texture2D(uMap, vUv).rgb, uReady);
    float lit = smoothstep(-0.12, 0.3, sun);
    vec3 color = mix(vec3(0.004, 0.008, 0.016), day * (0.22 + 1.05 * max(sun, 0.0)), lit);
    // A warm band along the terminator, where it is sunrise or sunset.
    color += vec3(0.5, 0.22, 0.08) * exp(-sun * sun * 60.0) * 0.18;
    // Thin blue atmosphere toward the edge of the disc, brighter on the day side.
    float rim = pow(1.0 - max(dot(n, vView), 0.0), 2.6);
    color += vec3(0.25, 0.5, 1.0) * rim * (0.15 + 0.85 * smoothstep(-0.25, 0.4, sun));
    // Low in the climb, the ground is hidden by evening haze.
    color = mix(uHaze, color, uClarity);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export const haloFragment = /* glsl */ `
  uniform vec3 uSun;
  uniform float uStrength;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal);
    float facing = abs(dot(n, vView));
    float glow = pow(1.0 - facing, 3.0) * smoothstep(0.0, 0.25, facing);
    float day = smoothstep(-0.35, 0.5, dot(n, uSun));
    gl_FragColor = vec4(vec3(0.3, 0.55, 1.0) * glow * (0.25 + 0.75 * day) * uStrength, 1.0);
    #include <colorspace_fragment>
  }
`

const moonFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSun;
  uniform float uReady;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal);
    float sun = max(dot(n, uSun), 0.0);
    vec3 albedo = mix(vec3(0.55), texture2D(uMap, vUv).rgb, uReady);
    vec3 color = albedo * (0.015 + 1.15 * sun);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const skyVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** The sky during the climb: dusk at the bottom of the climb, deep blue, then black. */
const skyFragment = /* glsl */ `
  uniform float uAscent;
  varying vec3 vDirection;
  void main() {
    float h = normalize(vDirection).y;
    vec3 duskTop = vec3(0.03, 0.06, 0.16);
    vec3 duskHorizon = vec3(0.62, 0.32, 0.3);
    vec3 blueTop = vec3(0.005, 0.03, 0.12);
    vec3 blueHorizon = vec3(0.08, 0.25, 0.6);
    float t = smoothstep(0.0, 0.5, uAscent);
    vec3 top = mix(duskTop, blueTop, t);
    vec3 horizon = mix(duskHorizon, blueHorizon, t);
    vec3 color = mix(horizon, top, smoothstep(-0.05, 0.55, h));
    color *= 1.0 - smoothstep(0.45, 0.95, uAscent);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function loadTexture(file: string): Promise<Texture> {
  return new TextureLoader().loadAsync(`${import.meta.env.BASE_URL}textures/${file}`).then((texture) => {
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    return texture
  })
}

/** A soft round glow for the Sun. */
export function glowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.08, 'rgba(255,250,235,0.95)')
    gradient.addColorStop(0.25, 'rgba(255,230,190,0.25)')
    gradient.addColorStop(1, 'rgba(255,220,180,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/** A fixed starfield of `count` stars; `dim` scales their brightness (faint on the bright lunar surface). */
export function makeStars(count = STAR_COUNT, dim = 1): Points {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const tints = [new Color('#ffffff'), new Color('#cfdcff'), new Color('#fff1d6'), new Color('#ffd9b8')]
  for (let i = 0; i < count; i++) {
    const y = hash2(i, 1, 311) * 2 - 1
    const theta = hash2(i, 2, 311) * Math.PI * 2
    const ring = Math.sqrt(1 - y * y)
    positions[i * 3] = Math.cos(theta) * ring * STAR_RADIUS
    positions[i * 3 + 1] = y * STAR_RADIUS
    positions[i * 3 + 2] = Math.sin(theta) * ring * STAR_RADIUS
    // Most stars are faint; a few are bright.
    const b = hash2(i, 3, 311)
    const brightness = (0.25 + Math.pow(b, 6) * 1.6) * dim
    const tint = tints[Math.floor(hash2(i, 4, 311) * tints.length)] ?? tints[0]!
    colors[i * 3] = tint.r * brightness
    colors[i * 3 + 1] = tint.g * brightness
    colors[i * 3 + 2] = tint.b * brightness
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  const material = new PointsMaterial({
    vertexColors: true,
    size: 1.6,
    sizeAttenuation: false,
    fog: false,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const points = new Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = -1
  return points
}

const scratch = new Vector3()

export function Space() {
  const group = useRef<Group>(null)
  const earth = useRef<Mesh>(null)
  const halo = useRef<Mesh>(null)
  const moon = useRef<Mesh>(null)
  const sky = useRef<Mesh>(null)
  const [maps, setMaps] = useState<{ earth: Texture; moon: Texture } | null>(null)

  const resources = useMemo(() => {
    const sphere = new SphereGeometry(1, 96, 48)
    const lowSphere = new SphereGeometry(1, 48, 24)
    const earthMaterial = new ShaderMaterial({
      vertexShader: bodyVertex,
      fragmentShader: earthFragment,
      fog: false,
      uniforms: {
        uMap: { value: null },
        uSun: { value: SUN_DIRECTION },
        uHaze: { value: new Color(0.05, 0.05, 0.08) },
        uClarity: { value: 1 },
        uReady: { value: 0 },
      },
    })
    const haloMaterial = new ShaderMaterial({
      vertexShader: bodyVertex,
      fragmentShader: haloFragment,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
      uniforms: { uSun: { value: SUN_DIRECTION }, uStrength: { value: 1 } },
    })
    const moonMaterial = new ShaderMaterial({
      vertexShader: bodyVertex,
      fragmentShader: moonFragment,
      fog: false,
      uniforms: { uMap: { value: null }, uSun: { value: SUN_DIRECTION }, uReady: { value: 0 } },
    })
    const skyMaterial = new ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uAscent: { value: 1 } },
    })
    const sun = new SpriteMaterial({ map: glowTexture(), color: '#fff4e0', blending: AdditiveBlending, depthWrite: false, fog: false })
    const stars = makeStars()
    return { sphere, lowSphere, earthMaterial, haloMaterial, moonMaterial, skyMaterial, sun, stars }
  }, [])

  // Load the NASA maps; until then Earth and the Moon draw in flat colours.
  useEffect(() => {
    let cancelled = false
    let loaded: { earth: Texture; moon: Texture } | null = null
    Promise.all([loadTexture('earth-blue-marble.webp'), loadTexture('moon-lroc-color.webp')])
      .then(([earthMap, moonMap]) => {
        loaded = { earth: earthMap, moon: moonMap }
        if (cancelled) {
          earthMap.dispose()
          moonMap.dispose()
          return
        }
        setMaps(loaded)
      })
      .catch((error: unknown) => console.error('Could not load the Earth and Moon maps', error))
    return () => {
      cancelled = true
      loaded?.earth.dispose()
      loaded?.moon.dispose()
    }
  }, [])

  useEffect(() => {
    if (!maps) return
    resources.earthMaterial.uniforms.uMap!.value = maps.earth
    resources.earthMaterial.uniforms.uReady!.value = 1
    resources.moonMaterial.uniforms.uMap!.value = maps.moon
    resources.moonMaterial.uniforms.uReady!.value = 1
  }, [maps, resources])

  useEffect(
    () => () => {
      const r = resources
      r.sphere.dispose()
      r.lowSphere.dispose()
      r.earthMaterial.dispose()
      r.haloMaterial.dispose()
      r.moonMaterial.dispose()
      r.skyMaterial.dispose()
      r.sun.map?.dispose()
      r.sun.dispose()
      r.stars.geometry.dispose()
      ;(r.stars.material as PointsMaterial).dispose()
    },
    [resources],
  )

  useFrame(({ camera }) => {
    // Infinitely far: the whole view rides along with the camera.
    group.current?.position.copy(camera.position)

    const ascent = flight.ascent
    const climb = ascent * ascent * (3 - 2 * ascent)

    // Earth: from filling the ground below to the transit size and direction.
    let distance = earthDistance(flight.transit)
    let direction = EARTH_DIRECTION
    if (ascent < 1) {
      const start = Math.log(1 / Math.sin((80 * Math.PI) / 180))
      const end = Math.log(earthDistance(0.1))
      distance = Math.exp(start + (end - start) * climb)
      direction = scratch.copy(DOWN).lerp(EARTH_DIRECTION, climb).normalize()
    }
    const radius = DISTANCE / distance
    if (earth.current) {
      earth.current.position.copy(direction).multiplyScalar(DISTANCE)
      earth.current.scale.setScalar(radius)
    }
    if (halo.current) {
      halo.current.position.copy(direction).multiplyScalar(DISTANCE)
      halo.current.scale.setScalar(radius * 1.025)
    }
    resources.earthMaterial.uniforms.uClarity!.value = Math.min(1, 0.15 + climb * 1.2)
    resources.haloMaterial.uniforms.uStrength!.value = climb

    // The Moon grows as we get closer.
    if (moon.current) {
      const moonRadius = DISTANCE / moonDistance(flight.transit)
      moon.current.position.copy(MOON_DIRECTION).multiplyScalar(DISTANCE)
      moon.current.scale.setScalar(moonRadius)
      // Coming down to land, the surface itself fills the windows (the landing stage).
      moon.current.visible = ascent > 0.6 && !flight.descent
    }
    if (earth.current) earth.current.visible = !flight.descent
    if (halo.current) halo.current.visible = !flight.descent

    // The climbing sky fades out; stars and the Sun come out above the air.
    resources.skyMaterial.uniforms.uAscent!.value = ascent
    if (sky.current) sky.current.visible = ascent < 0.98
    ;(resources.stars.material as PointsMaterial).opacity = Math.max(0, (ascent - 0.55) / 0.45)
    resources.sun.opacity = Math.max(0, (ascent - 0.4) / 0.6)
  })

  return (
    <group ref={group}>
      <mesh ref={sky} material={resources.skyMaterial} renderOrder={-3} frustumCulled={false}>
        <sphereGeometry args={[DISTANCE + 120, 32, 16]} />
      </mesh>
      <primitive object={resources.stars} />
      <sprite
        material={resources.sun}
        position={SUN_DIRECTION.clone().multiplyScalar(DISTANCE)}
        scale={[90, 90, 1]}
        renderOrder={-1}
      />
      {/* Earth turned so Africa and the Atlantic face the spacecraft, with the day side toward the Sun. */}
      <mesh ref={earth} geometry={resources.sphere} material={resources.earthMaterial} rotation={[0.35, 2.2, 0]} />
      <mesh ref={halo} geometry={resources.lowSphere} material={resources.haloMaterial} renderOrder={1} />
      {/* The Moon's near side faces Earth, and so faces us on the way there. */}
      <mesh ref={moon} geometry={resources.lowSphere} material={resources.moonMaterial} rotation={[0, -2.6, 0]} />
    </group>
  )
}
