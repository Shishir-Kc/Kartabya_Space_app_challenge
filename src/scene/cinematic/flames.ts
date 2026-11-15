/**
 * Engine flames for the cinematics: soft additive cones, white-hot at the
 * nozzle, through yellow and orange to a faint tip, flickering. Each flame
 * points down its local -y from the nozzle at y = 0; scale y to make it
 * longer. Several nozzles merge into one mesh (one draw call).
 */
import { AdditiveBlending, BufferAttribute, type BufferGeometry, Color, CylinderGeometry, DoubleSide, ShaderMaterial } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const vertex = /* glsl */ `
  attribute float aAlong;
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vAlong = aAlong;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragment = /* glsl */ `
  uniform float uStrength;
  uniform float uTime;
  uniform vec3 uHot;
  uniform vec3 uWarm;
  uniform vec3 uTip;
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float a = clamp(vAlong, 0.0, 1.0);
    // Brightest facing the camera (the flame's core), soft at its edges.
    float core = pow(abs(dot(normalize(vNormal), vView)), 1.6);
    float flicker = 0.85 + 0.15 * sin(uTime * 37.0 + a * 23.0) * sin(uTime * 23.0 - a * 11.0);
    vec3 color = mix(uHot, uWarm, smoothstep(0.0, 0.35, a));
    color = mix(color, uTip, smoothstep(0.35, 1.0, a));
    float fade = (1.0 - smoothstep(0.55, 1.0, a)) * smoothstep(0.0, 0.04, a + 0.02);
    gl_FragColor = vec4(color * core * fade * flicker * uStrength, 1.0);
    #include <colorspace_fragment>
  }
`

export interface Nozzle {
  x: number
  y: number
  z: number
  /** Radius at the nozzle. */
  radius: number
  /** Length at full scale. */
  length: number
}

/** One mesh's geometry for several flames, each pointing down from its nozzle. */
export function flameGeometry(nozzles: Nozzle[]): BufferGeometry {
  const parts = nozzles.map((n) => {
    // Wider a little way out, then narrowing to the tip.
    const g = new CylinderGeometry(n.radius * 1.2, n.radius * 0.35, n.length, 16, 6, true)
    g.translate(0, -n.length / 2, 0)
    const position = g.attributes.position as BufferAttribute
    const along = new Float32Array(position.count)
    for (let v = 0; v < position.count; v++) {
      const t = -position.getY(v) / n.length
      along[v] = t
      // Bulge just after the nozzle, like an exhaust plume.
      const bulge = 1 + 0.5 * Math.sin(Math.min(1, t * 2.2) * Math.PI) * (1 - t)
      position.setX(v, position.getX(v) * bulge)
      position.setZ(v, position.getZ(v) * bulge)
    }
    g.setAttribute('aAlong', new BufferAttribute(along, 1))
    g.deleteAttribute('uv')
    g.translate(n.x, n.y, n.z)
    return g
  })
  const merged = mergeGeometries(parts, false)!
  for (const g of parts) g.dispose()
  merged.computeVertexNormals()
  return merged
}

export function flameMaterial(colors: { hot: string; warm: string; tip: string } = { hot: '#fff6dc', warm: '#ffb347', tip: '#ff4a1c' }): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
    uniforms: {
      uStrength: { value: 0 },
      uTime: { value: 0 },
      uHot: { value: new Color(colors.hot) },
      uWarm: { value: new Color(colors.warm) },
      uTip: { value: new Color(colors.tip) },
    },
  })
}

/**
 * A vacuum plume: in space nothing presses the exhaust together, so it
 * spreads out very wide in a faint cone, unlike a flame at sea level.
 * Points down from y = 0. TODO: source.
 */
export function vacuumPlumeGeometry(nozzleRadius: number, endRadius: number, length: number): BufferGeometry {
  const g = new CylinderGeometry(nozzleRadius, endRadius, length, 28, 10, true)
  g.translate(0, -length / 2, 0)
  const position = g.attributes.position as BufferAttribute
  const along = new Float32Array(position.count)
  for (let v = 0; v < position.count; v++) {
    const t = -position.getY(v) / length
    along[v] = t
    // Bell-shaped: opening out fast near the nozzle, then more slowly.
    const r = nozzleRadius + (endRadius - nozzleRadius) * Math.sqrt(t)
    const k = r / Math.max(1e-3, Math.hypot(position.getX(v), position.getZ(v)))
    position.setX(v, position.getX(v) * k)
    position.setZ(v, position.getZ(v) * k)
  }
  g.setAttribute('aAlong', new BufferAttribute(along, 1))
  g.deleteAttribute('uv')
  g.computeVertexNormals()
  return g
}
