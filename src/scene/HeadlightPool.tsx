import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, type Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three'
import type { GameMap } from '../maps/types'
import { LUNAR_CELL, lunarTerrain } from './kit/lunar'
import { roverState } from './rover'

/** Size of the lit patch around the rover, in terrain cells. */
const CELLS = 24

const vertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normal;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/** Two headlight cones: brightest along each beam, fading with angle and distance. */
const fragment = /* glsl */ `
  uniform vec3 uLeft;
  uniform vec3 uRight;
  uniform vec3 uDirection;
  uniform float uStrength;
  varying vec3 vWorld;
  varying vec3 vNormal;
  float beam(vec3 origin) {
    vec3 toPoint = vWorld - origin;
    float distance = length(toPoint);
    vec3 dir = toPoint / max(distance, 0.001);
    float cone = smoothstep(0.88, 0.985, dot(dir, uDirection));
    float falloff = 1.0 / (1.0 + distance * distance * 0.004);
    float facing = max(dot(normalize(vNormal), -dir), 0.0);
    return cone * falloff * (0.35 + 0.65 * facing);
  }
  void main() {
    float light = (beam(uLeft) + beam(uRight)) * uStrength;
    gl_FragColor = vec4(vec3(0.95, 0.94, 1.0) * light, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * The lunar terrain's light is baked, so the rover's real spotlights can't
 * light it. This patch of terrain round the rover adds the headlight beams
 * on top (additively), so the shadowed crater floor shows up ahead.
 */
export function HeadlightPool({ map }: { map: GameMap }) {
  const terrain = useMemo(() => lunarTerrain(map), [map])
  const mesh = useRef<Mesh>(null)
  const resources = useMemo(() => {
    const geometry = new PlaneGeometry(CELLS * LUNAR_CELL, CELLS * LUNAR_CELL, CELLS, CELLS)
    geometry.rotateX(-Math.PI / 2)
    const material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: {
        uLeft: { value: new Vector3() },
        uRight: { value: new Vector3() },
        uDirection: { value: new Vector3(0, 0, -1) },
        uStrength: { value: 0 },
      },
    })
    return { geometry, material }
  }, [])
  useEffect(
    () => () => {
      resources.geometry.dispose()
      resources.material.dispose()
    },
    [resources],
  )

  const centre = useRef<[number, number] | null>(null)
  useFrame(() => {
    const s = roverState()
    if (!terrain || !mesh.current || !s) return
    mesh.current.visible = s.headlights
    if (!s.headlights) return
    const u = resources.material.uniforms
    const fx = -Math.sin(s.yaw)
    const fz = -Math.cos(s.yaw)
    const rx = Math.cos(s.yaw)
    const rz = -Math.sin(s.yaw)
    const front = s.def.wheels.base / 2 + 0.6
    u.uLeft!.value.set(s.x + fx * front - rx * 0.6, s.y + 0.7, s.z + fz * front - rz * 0.6)
    u.uRight!.value.set(s.x + fx * front + rx * 0.6, s.y + 0.7, s.z + fz * front + rz * 0.6)
    u.uDirection!.value.set(fx, -0.07, fz).normalize()
    u.uStrength!.value = 1.6
    // Keep the patch centred a little ahead of the rover, snapped to the terrain grid.
    const ci = Math.round((s.x + fx * 12 - terrain.origin) / LUNAR_CELL)
    const ck = Math.round((s.z + fz * 12 - terrain.origin) / LUNAR_CELL)
    if (centre.current && centre.current[0] === ci && centre.current[1] === ck) return
    centre.current = [ci, ck]
    const position = resources.geometry.attributes.position as BufferAttribute
    const half = CELLS / 2
    for (let v = 0; v < position.count; v++) {
      const col = v % (CELLS + 1)
      const row = Math.floor(v / (CELLS + 1))
      const i = Math.min(terrain.count - 1, Math.max(0, ci - half + col))
      const k = Math.min(terrain.count - 1, Math.max(0, ck - half + row))
      position.setXYZ(v, terrain.origin + i * LUNAR_CELL, (terrain.grid[k * terrain.count + i] ?? 0) + 0.03, terrain.origin + k * LUNAR_CELL)
    }
    position.needsUpdate = true
    resources.geometry.computeVertexNormals()
  })

  if (!terrain) return null
  return <mesh ref={mesh} geometry={resources.geometry} material={resources.material} frustumCulled={false} renderOrder={2} visible={false} />
}
