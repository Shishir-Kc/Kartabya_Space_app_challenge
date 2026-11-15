import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, IcosahedronGeometry, InstancedMesh, type MeshStandardMaterial, Object3D, Points, PointsMaterial } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { scatterRocks } from '../maps/lunarScatter'
import type { GameMap } from '../maps/types'
import { lunarTerrain } from './kit/lunar'
import { hash2 } from './materials/noise'

/** A lumpy rock: an icosahedron with its corners pushed in and out, flattened a little. */
function rockShape(seed: number): BufferGeometry {
  const geometry = mergeVertices(new IcosahedronGeometry(0.5, 1))
  const position = geometry.attributes.position as BufferAttribute
  for (let i = 0; i < position.count; i++) {
    const s = 0.75 + hash2(i, seed, 401) * 0.5
    position.setXYZ(i, position.getX(i) * s, position.getY(i) * s * 0.62, position.getZ(i) * s)
  }
  geometry.computeVertexNormals()
  return geometry
}

/**
 * The rocks and boulders on the lunar surface: three rock shapes, each drawn
 * once as an instanced mesh, so a couple of thousand rocks cost three draw
 * calls. Positions come from the shared scatter (maps/lunarScatter.ts), the
 * same list collision uses. Also the faint frost glints on the ice crater's
 * shadowed floor.
 */
export function LunarRocks({ map, material, includeEdge = true }: { map: GameMap; material: MeshStandardMaterial; includeEdge?: boolean }) {
  const built = useMemo(() => {
    const terrain = lunarTerrain(map)
    // Seen from the air (the landing), the boundary ring of boulders is left out: it would read as a drawn circle.
    const rocks = scatterRocks(map).filter((rock) => includeEdge || !rock.edge)
    const shapes = [rockShape(1), rockShape(2), rockShape(3)]
    const meshes = shapes.map((geometry, shape) => {
      const mine = rocks.filter((rock) => rock.shape === shape)
      const mesh = new InstancedMesh(geometry, material, Math.max(1, mine.length))
      const dummy = new Object3D()
      mine.forEach((rock, i) => {
        const y = terrain ? terrain.height(rock.x, rock.z) : 0
        dummy.position.set(rock.x, y - rock.size * 0.12, rock.z)
        dummy.rotation.set(0, rock.yaw, 0)
        dummy.scale.setScalar(rock.size)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.count = mine.length
      mesh.instanceMatrix.needsUpdate = true
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      return mesh
    })

    // Frost glints on the floor of each ice crater: tiny, faint points that
    // only really show in a headlight beam.
    const glintPositions: number[] = []
    for (const crater of map.exterior?.scene === 'lunar-south-pole' ? (map.exterior.craters ?? []).filter((c) => c.ice) : []) {
      for (let i = 0; i < 320; i++) {
        const a = hash2(i, 1, 431) * Math.PI * 2
        const r = Math.sqrt(hash2(i, 2, 431)) * crater.radius * 0.55
        const x = crater.x + Math.cos(a) * r
        const z = crater.z + Math.sin(a) * r
        glintPositions.push(x, (terrain ? terrain.height(x, z) : 0) + 0.04, z)
      }
    }
    const glintGeometry = new BufferGeometry()
    glintGeometry.setAttribute('position', new BufferAttribute(new Float32Array(glintPositions), 3))
    const glintMaterial = new PointsMaterial({
      color: new Color('#cfe6ff'),
      size: 0.045,
      transparent: true,
      opacity: 0.22,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const glints = new Points(glintGeometry, glintMaterial)
    return { shapes, meshes, glints, glintGeometry, glintMaterial }
  }, [map, material, includeEdge])

  useEffect(
    () => () => {
      for (const geometry of built.shapes) geometry.dispose()
      for (const mesh of built.meshes) mesh.dispose()
      built.glintGeometry.dispose()
      built.glintMaterial.dispose()
    },
    [built],
  )

  return (
    <group>
      {built.meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
      <primitive object={built.glints} />
    </group>
  )
}

