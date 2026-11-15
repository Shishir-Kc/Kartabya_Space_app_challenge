import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { AdditiveBlending, BackSide, Color, ShaderMaterial, Vector3 } from 'three'
import { hash2 } from './materials/noise'
import { PALETTE } from './palette'

const DOME_RADIUS = 700
const STAR_RADIUS = 650
const STAR_COUNT = 900

/** The sun has just set in the west; the crescent Moon hangs low in the north-west. */
const SUN_DIRECTION = new Vector3(-1, -0.1, 0.15).normalize()
const MOON_DIRECTION = new Vector3(-0.45, 0.14, -0.88).normalize()

const skyVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uMoon;
  uniform vec3 uSunDirection;
  uniform vec3 uMoonDirection;
  uniform vec3 uShadowDirection;
  varying vec3 vDirection;

  void main() {
    vec3 dir = normalize(vDirection);
    float h = dir.y;
    vec3 color = mix(uMid, uTop, smoothstep(0.0, 0.6, h));

    // Warm band at the horizon, strongest toward the sunset.
    vec2 flatDir = normalize(dir.xz + vec2(1e-5));
    vec2 sunFlat = normalize(uSunDirection.xz);
    float sunSide = pow(max(dot(flatDir, sunFlat), 0.0), 3.0);
    float band = exp(-max(h, 0.0) * 9.0);
    color = mix(color, uHorizon, band * (0.5 + 0.5 * sunSide));
    color += uGlow * pow(band, 2.5) * sunSide * 0.9;
    if (h < 0.0) color = mix(uHorizon * 0.55, uMid * 0.4, clamp(-h * 5.0, 0.0, 1.0));

    // Crescent Moon: a disc with an offset disc cutting away its dark side.
    float d = acos(clamp(dot(dir, uMoonDirection), -1.0, 1.0));
    float disc = 1.0 - smoothstep(0.024, 0.0258, d);
    float dShadow = acos(clamp(dot(dir, uShadowDirection), -1.0, 1.0));
    float lit = smoothstep(0.0225, 0.0245, dShadow);
    color = mix(color, color * 0.4 + vec3(0.03, 0.035, 0.05), disc * (1.0 - lit));
    color += disc * lit * uMoon * 2.2;
    color += uMoon * exp(-d * 45.0) * 0.12;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const oceanVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const oceanFragment = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  varying vec3 vWorld;
  void main() {
    vec3 view = normalize(vWorld - cameraPosition);
    float fresnel = pow(1.0 - max(dot(vec3(0.0, 1.0, 0.0), -view), 0.0), 4.0);
    vec3 color = mix(uDeep, uHorizon * 0.85 + uGlow * 0.08, fresnel);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * The dusk sky (gradient, sunset glow, crescent Moon), the stars, and the
 * ocean on the eastern horizon. Three draw calls; none of it is lit or fogged.
 * With `follow`, the dome and stars stay centred on the camera (for the
 * launch cinematic's far shots); the ocean stays put.
 */
export function Sky({ follow = false }: { follow?: boolean }) {
  const dome = useRef<Group>(null)
  useFrame(({ camera }) => {
    if (follow && dome.current) dome.current.position.set(camera.position.x, 0, camera.position.z)
  })
  const skyMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new Color(PALETTE.skyTop) },
          uMid: { value: new Color(PALETTE.skyMid) },
          uHorizon: { value: new Color(PALETTE.skyHorizon) },
          uGlow: { value: new Color(PALETTE.skyGlow) },
          uMoon: { value: new Color(PALETTE.moon) },
          uSunDirection: { value: SUN_DIRECTION },
          uMoonDirection: { value: MOON_DIRECTION },
          // Shift the shadow disc away from the sun, leaving a thin lit crescent.
          uShadowDirection: { value: MOON_DIRECTION.clone().addScaledVector(SUN_DIRECTION, -0.014).normalize() },
        },
      }),
    [],
  )

  const oceanMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: oceanVertex,
        fragmentShader: oceanFragment,
        fog: false,
        uniforms: {
          uDeep: { value: new Color(PALETTE.oceanDeep) },
          uHorizon: { value: new Color(PALETTE.skyHorizon) },
          uGlow: { value: new Color(PALETTE.skyGlow) },
        },
      }),
    [],
  )

  // Shader materials passed as props are not disposed by React Three Fiber.
  useEffect(
    () => () => {
      skyMaterial.dispose()
      oceanMaterial.dispose()
    },
    [skyMaterial, oceanMaterial],
  )

  // Stars fade in toward the zenith; additive, so dim ones vanish into the glow.
  const stars = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3)
    const colors = new Float32Array(STAR_COUNT * 3)
    const base = new Color(PALETTE.stars)
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = hash2(i, 1, 77) * Math.PI * 2
      const y = 0.04 + hash2(i, 2, 77) * 0.96
      const ring = Math.sqrt(1 - y * y)
      positions[i * 3] = Math.cos(theta) * ring * STAR_RADIUS
      positions[i * 3 + 1] = y * STAR_RADIUS
      positions[i * 3 + 2] = Math.sin(theta) * ring * STAR_RADIUS
      const altitude = Math.min(1, Math.max(0, (y - 0.1) / 0.5))
      const brightness = altitude * altitude * (0.4 + hash2(i, 3, 77) * 0.9)
      colors[i * 3] = base.r * brightness
      colors[i * 3 + 1] = base.g * brightness
      colors[i * 3 + 2] = base.b * brightness
    }
    return { positions, colors }
  }, [])

  return (
    <>
      <group ref={dome}>
        <mesh material={skyMaterial} renderOrder={-2} frustumCulled={false}>
          <sphereGeometry args={[DOME_RADIUS, 48, 24]} />
        </mesh>
        <points renderOrder={-1} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[stars.positions, 3]} />
            <bufferAttribute attach="attributes-color" args={[stars.colors, 3]} />
          </bufferGeometry>
          <pointsMaterial
            vertexColors
            size={1.7}
            sizeAttenuation={false}
            fog={false}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </points>
      </group>
      <mesh material={oceanMaterial} position={[1780, -0.8, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3000, 3000]} />
      </mesh>
    </>
  )
}
