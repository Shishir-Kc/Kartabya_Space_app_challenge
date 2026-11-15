/**
 * Collects every static piece of a map, grouped by material, then merges
 * each group into one geometry: one draw call per material, however much
 * detail there is.
 *
 * Every piece carries a vertex colour (its tint), so one material covers
 * many colours. Textured materials get world-space UVs at merge time, so a
 * texture keeps the same scale on every box and lines up across neighbours.
 */
import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { atlasCell } from '../materials/canvasTextures'
import { isTextured, TILE_METRES, type MaterialKey } from '../materials/surfaces'

export type Tint = readonly [number, number, number]
export const WHITE: Tint = [1, 1, 1]

/** Rotations (applied X, then Z, then Y) and a translation. */
export interface Placement {
  x?: number
  y?: number
  z?: number
  rotX?: number
  rotY?: number
  rotZ?: number
}

export function orient<T extends BufferGeometry>(geometry: T, at: Placement): T {
  if (at.rotX) geometry.rotateX(at.rotX)
  if (at.rotZ) geometry.rotateZ(at.rotZ)
  if (at.rotY) geometry.rotateY(at.rotY)
  geometry.translate(at.x ?? 0, at.y ?? 0, at.z ?? 0)
  return geometry
}

/** A plane showing one atlas cell. `uFraction` < 1 uses only the left part of the cell. */
export function atlasPlane(cell: string, w: number, h: number, uFraction = 1): PlaneGeometry | null {
  const rect = atlasCell(cell)
  if (!rect) return null
  const geometry = new PlaneGeometry(w, h)
  const uv = geometry.attributes.uv as BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    uv.setXY(i, rect.u0 + u * (rect.u1 - rect.u0) * uFraction, rect.v0 + v * (rect.v1 - rect.v0))
  }
  return geometry
}

/** Replaces UVs with world-space ones: metres divided by the tile size. */
function applyWorldUvs(geometry: BufferGeometry, tile: number): void {
  const position = geometry.attributes.position as BufferAttribute
  const normal = geometry.attributes.normal as BufferAttribute
  const uv = new Float32Array(position.count * 2)
  for (let i = 0; i < position.count; i++) {
    const ax = Math.abs(normal.getX(i))
    const ay = Math.abs(normal.getY(i))
    const az = Math.abs(normal.getZ(i))
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    let u: number
    let v: number
    if (ay >= ax && ay >= az) {
      u = x
      v = z
    } else if (ax >= az) {
      u = z
      v = y
    } else {
      u = x
      v = y
    }
    uv[i * 2] = u / tile
    uv[i * 2 + 1] = v / tile
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
}

export interface BuiltPart {
  key: MaterialKey
  geometry: BufferGeometry
}

/**
 * The surfaces of things you'd touch (furniture, racks, crates, consoles,
 * bags) get softly bevelled edges, so light catches them instead of meeting
 * a razor-sharp box. Walls, floors, the tower's steel and thin panels stay
 * plain.
 */
const BEVELLED = new Set<MaterialKey>(['painted', 'brushed', 'rubber', 'fabric', 'padded'])
/** Thinner than this on any side, a box stays plain (its bevel would be invisible). */
const BEVEL_MIN = 0.06

function boxFor(key: MaterialKey, w: number, h: number, d: number): BufferGeometry {
  const smallest = Math.min(w, h, d)
  if (!BEVELLED.has(key) || smallest < BEVEL_MIN) return new BoxGeometry(w, h, d)
  return new RoundedBoxGeometry(w, h, d, 1, Math.min(0.025, smallest * 0.18))
}

export class Parts {
  private readonly buckets = new Map<MaterialKey, BufferGeometry[]>()

  add(key: MaterialKey, geometry: BufferGeometry, tint: Tint = WHITE): void {
    const count = (geometry.attributes.position as BufferAttribute).count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tint[0]
      colors[i * 3 + 1] = tint[1]
      colors[i * 3 + 2] = tint[2]
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3))
    const list = this.buckets.get(key)
    if (list) list.push(geometry)
    else this.buckets.set(key, [geometry])
  }

  box(key: MaterialKey, w: number, h: number, d: number, at: Placement, tint?: Tint): void {
    this.add(key, orient(boxFor(key, w, h, d), at), tint)
  }

  cylinder(
    key: MaterialKey,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    at: Placement,
    tint?: Tint,
    segments = 12,
  ): void {
    this.add(key, orient(new CylinderGeometry(radiusTop, radiusBottom, height, segments), at), tint)
  }

  sphere(key: MaterialKey, radius: number, at: Placement, tint?: Tint, segments = 10): void {
    this.add(key, orient(new SphereGeometry(radius, segments, Math.max(6, segments / 2)), at), tint)
  }

  decal(cell: string, w: number, h: number, at: Placement, tint?: Tint, uFraction = 1): void {
    const plane = atlasPlane(cell, w, h, uFraction)
    if (plane) this.add('decal', orient(plane, at), tint)
  }

  build(): BuiltPart[] {
    const built: BuiltPart[] = []
    for (const [key, list] of this.buckets) {
      if (isTextured(key)) {
        for (const geometry of list) applyWorldUvs(geometry, TILE_METRES[key])
      }
      // Bevelled boxes have no index and plain ones do: a mixed bucket merges without.
      if (list.some((g) => g.index) && list.some((g) => !g.index)) {
        for (let i = 0; i < list.length; i++) {
          const g = list[i]!
          if (g.index) {
            list[i] = g.toNonIndexed()
            g.dispose()
          }
        }
      }
      const merged = mergeGeometries(list, false)
      for (const geometry of list) geometry.dispose()
      if (merged) {
        merged.computeBoundingSphere()
        built.push({ key, geometry: merged })
      }
    }
    this.buckets.clear()
    return built
  }
}

/**
 * A local frame for building one object: +z is its front, y = 0 its base.
 * Everything added is rotated by `yaw` and moved to (x, y0, z).
 */
export class Frame {
  readonly parts: Parts
  readonly x: number
  readonly z: number
  readonly yaw: number
  readonly y0: number

  constructor(parts: Parts, x: number, z: number, yaw = 0, y0 = 0) {
    this.parts = parts
    this.x = x
    this.z = z
    this.yaw = yaw
    this.y0 = y0
  }

  private place<T extends BufferGeometry>(geometry: T, at: Placement): T {
    orient(geometry, at)
    geometry.rotateY(this.yaw)
    geometry.translate(this.x, this.y0, this.z)
    return geometry
  }

  box(key: MaterialKey, w: number, h: number, d: number, at: Placement, tint?: Tint): void {
    this.parts.add(key, this.place(boxFor(key, w, h, d), at), tint)
  }

  cylinder(key: MaterialKey, radius: number, height: number, at: Placement, tint?: Tint, segments = 10): void {
    this.parts.add(key, this.place(new CylinderGeometry(radius, radius, height, segments), at), tint)
  }

  decal(cell: string, w: number, h: number, at: Placement, tint?: Tint): void {
    const plane = atlasPlane(cell, w, h)
    if (plane) this.parts.add('decal', this.place(plane, at), tint)
  }

  /** World position of a point given in this frame. */
  point(lx: number, ly: number, lz: number): [number, number, number] {
    const c = Math.cos(this.yaw)
    const s = Math.sin(this.yaw)
    return [this.x + lx * c + lz * s, this.y0 + ly, this.z - lx * s + lz * c]
  }
}
