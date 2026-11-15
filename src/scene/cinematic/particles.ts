/**
 * Soft billboard particles for the cinematics: vapour, steam clouds, smoke
 * and lunar dust. One field is one draw call (points), with a fixed cap on
 * how many particles it holds; when full, the oldest is reused.
 *
 * Each particle flies on its own: a velocity, drag (air slows it), gravity,
 * and a size and opacity that change over its life. With no drag and lunar
 * gravity, dust flies in straight lines and drops straight back, as it
 * does on the Moon. Particles can die on touching the ground.
 *
 * Point sizes are in metres, turned into pixels in the shader, and capped
 * in pixels so nothing near the camera floods the screen with overdraw.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  NormalBlending,
  Points,
  ShaderMaterial,
  SRGBColorSpace,
  type Texture,
} from 'three'
import type { Vec3 } from '../../state/cinematic'
import { hash2 } from '../materials/noise'

const vertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSpin;
  attribute vec3 aTint;
  uniform float uScale;
  uniform float uMaxPixels;
  varying float vAlpha;
  varying float vSpin;
  varying vec3 vTint;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float pixels = aSize * uScale / max(-mv.z, 0.1);
    gl_PointSize = aAlpha > 0.001 ? min(pixels, uMaxPixels) : 0.0;
    // A particle bigger than the cap fades, so the near ones don't become flat discs.
    vAlpha = aAlpha * clamp(uMaxPixels / max(pixels, 1.0), 0.35, 1.0);
    vSpin = aSpin;
    vTint = aTint;
  }
`

const fragment = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying float vSpin;
  varying vec3 vTint;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vSpin);
    float s = sin(vSpin);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    float a = texture2D(uMap, p).a * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vTint, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

let puffTexture: CanvasTexture | null = null

/** A soft, lumpy puff (made once and shared by every field). */
export function puff(): CanvasTexture {
  if (puffTexture) return puffTexture
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    // A few overlapping soft blobs, so clouds look billowy rather than round.
    for (let i = 0; i < 9; i++) {
      const r = size * (0.16 + hash2(i, 1, 41) * 0.16)
      const angle = hash2(i, 2, 41) * Math.PI * 2
      const reach = i === 0 ? 0 : size * 0.16 * hash2(i, 3, 41)
      const x = size / 2 + Math.cos(angle) * reach
      const y = size / 2 + Math.sin(angle) * reach
      const gradient = context.createRadialGradient(x, y, 0, x, y, r)
      gradient.addColorStop(0, 'rgba(255,255,255,0.55)')
      gradient.addColorStop(0.6, 'rgba(255,255,255,0.22)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = gradient
      context.fillRect(0, 0, size, size)
    }
  }
  puffTexture = new CanvasTexture(canvas)
  puffTexture.colorSpace = SRGBColorSpace
  return puffTexture
}

export interface Emit {
  position: Vec3
  velocity: Vec3
  /** Seconds. */
  life: number
  /** Diameter in metres at birth and at death. */
  size: [number, number]
  /** Peak opacity. */
  alpha: number
  /** How quickly air slows it, per second (0 in a vacuum). */
  drag?: number
  /** Metres per second per second, downward. */
  gravity?: number
  /** Linear colour. */
  tint: Vec3
  /** Dies on reaching this height (for dust on the ground). */
  floor?: number
  /** How much of its life it takes to fade in (0 to 1). */
  fadeIn?: number
}

export class ParticleField {
  readonly points: Points
  readonly material: ShaderMaterial
  private readonly max: number
  private readonly position: Float32Array
  private readonly size: Float32Array
  private readonly alpha: Float32Array
  private readonly spin: Float32Array
  private readonly tint: Float32Array
  private readonly velocity: Float32Array
  private readonly age: Float32Array
  private readonly life: Float32Array
  private readonly grow: Float32Array
  private readonly peak: Float32Array
  private readonly drag: Float32Array
  private readonly gravity: Float32Array
  private readonly floor: Float32Array
  private readonly fadeIn: Float32Array
  private next = 0
  private seed = 0
  /** Fractional particles carried between frames by `emitRate`. */
  private carry = 0

  constructor(max: number, options: { additive?: boolean; texture?: Texture; maxPixels?: number } = {}) {
    this.max = max
    this.position = new Float32Array(max * 3)
    this.size = new Float32Array(max)
    this.alpha = new Float32Array(max)
    this.spin = new Float32Array(max)
    this.tint = new Float32Array(max * 3)
    this.velocity = new Float32Array(max * 3)
    this.age = new Float32Array(max).fill(1)
    this.life = new Float32Array(max).fill(1)
    this.grow = new Float32Array(max * 2)
    this.peak = new Float32Array(max)
    this.drag = new Float32Array(max)
    this.gravity = new Float32Array(max)
    this.floor = new Float32Array(max).fill(-Infinity)
    this.fadeIn = new Float32Array(max)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(this.position, 3))
    geometry.setAttribute('aSize', new BufferAttribute(this.size, 1))
    geometry.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1))
    geometry.setAttribute('aSpin', new BufferAttribute(this.spin, 1))
    geometry.setAttribute('aTint', new BufferAttribute(this.tint, 3))
    this.material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: options.additive ? AdditiveBlending : NormalBlending,
      fog: false,
      uniforms: {
        uMap: { value: options.texture ?? puff() },
        uScale: { value: 600 },
        uMaxPixels: { value: options.maxPixels ?? 360 },
      },
    })
    this.points = new Points(geometry, this.material)
    this.points.frustumCulled = false
  }

  /** Pixels per metre at one metre away: the viewport height over 2 tan(fov / 2). */
  setScale(viewportHeight: number, fovDegrees: number): void {
    this.material.uniforms.uScale!.value = viewportHeight / (2 * Math.tan((fovDegrees * Math.PI) / 360))
  }

  emit(e: Emit): void {
    const i = this.next
    this.next = (this.next + 1) % this.max
    this.position.set(e.position, i * 3)
    this.velocity.set(e.velocity, i * 3)
    this.tint.set(e.tint, i * 3)
    this.age[i] = 0
    this.life[i] = e.life
    this.grow[i * 2] = e.size[0]
    this.grow[i * 2 + 1] = e.size[1]
    this.peak[i] = e.alpha
    this.drag[i] = e.drag ?? 0
    this.gravity[i] = e.gravity ?? 0
    this.floor[i] = e.floor ?? -Infinity
    this.fadeIn[i] = e.fadeIn ?? 0.12
    this.spin[i] = hash2(this.seed++, 7, 13) * Math.PI * 2
    this.size[i] = e.size[0]
    this.alpha[i] = 0
  }

  /** Emits `rate` particles a second over `dt`, calling `make` for each. */
  emitRate(rate: number, dt: number, make: (n: number) => Emit): void {
    this.carry += rate * dt
    while (this.carry >= 1) {
      this.carry -= 1
      this.emit(make(this.seed))
    }
  }

  /** A repeatable random number in 0..1 for the `n`th particle. */
  random(n: number, k: number): number {
    return hash2(n, k, 977)
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.age[i]! >= this.life[i]!) {
        this.alpha[i] = 0
        continue
      }
      this.age[i] = this.age[i]! + dt
      const u = Math.min(1, this.age[i]! / this.life[i]!)
      const slow = Math.exp(-this.drag[i]! * dt)
      const k = i * 3
      this.velocity[k] = this.velocity[k]! * slow
      this.velocity[k + 1] = this.velocity[k + 1]! * slow - this.gravity[i]! * dt
      this.velocity[k + 2] = this.velocity[k + 2]! * slow
      this.position[k] = this.position[k]! + this.velocity[k]! * dt
      this.position[k + 1] = this.position[k + 1]! + this.velocity[k + 1]! * dt
      this.position[k + 2] = this.position[k + 2]! + this.velocity[k + 2]! * dt
      if (this.position[k + 1]! < this.floor[i]!) {
        // Landed: gone at once (no air to hold it up).
        this.age[i] = this.life[i]!
        this.alpha[i] = 0
        continue
      }
      this.size[i] = this.grow[i * 2]! + (this.grow[i * 2 + 1]! - this.grow[i * 2]!) * Math.sqrt(u)
      const fade = this.fadeIn[i]! > 0 ? Math.min(1, u / this.fadeIn[i]!) : 1
      this.alpha[i] = this.peak[i]! * fade * Math.pow(1 - u, 1.3)
    }
    const geometry = this.points.geometry
    for (const name of ['position', 'aSize', 'aAlpha']) (geometry.attributes[name] as BufferAttribute).needsUpdate = true
    ;(geometry.attributes.aTint as BufferAttribute).needsUpdate = true
    ;(geometry.attributes.aSpin as BufferAttribute).needsUpdate = true
  }

  /** How many particles are alive (for the checks). */
  alive(): number {
    let n = 0
    for (let i = 0; i < this.max; i++) if (this.age[i]! < this.life[i]!) n++
    return n
  }

  /** Heights of the living particles (for the checks). */
  heights(): number[] {
    const out: number[] = []
    for (let i = 0; i < this.max; i++) if (this.age[i]! < this.life[i]!) out.push(this.position[i * 3 + 1]!)
    return out
  }

  clear(): void {
    this.age.fill(1)
    this.life.fill(1)
    this.alpha.fill(0)
  }

  dispose(): void {
    this.points.geometry.dispose()
    this.material.dispose()
  }
}
