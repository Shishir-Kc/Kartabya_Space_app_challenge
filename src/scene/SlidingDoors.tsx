import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { type Group, MeshStandardMaterial } from 'three'
import { listDoors, type Door } from '../maps/collision'
import type { GameMap } from '../maps/types'
import { player } from '../state/player'

/** The doors start opening when the player is this close. */
const OPEN_DISTANCE = 3.2
const LEAF_DEPTH = 0.05
const FRAME = 0.05

function Leaf({ width, height, frame, glass }: { width: number; height: number; frame: MeshStandardMaterial; glass: MeshStandardMaterial }) {
  return (
    <>
      <mesh material={glass} position={[0, height / 2, 0]}>
        <boxGeometry args={[width - FRAME * 2, height - FRAME * 2, 0.02]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`v${side}`} material={frame} position={[side * (width / 2 - FRAME / 2), height / 2, 0]}>
          <boxGeometry args={[FRAME, height, LEAF_DEPTH]} />
        </mesh>
      ))}
      {[FRAME / 2, height - FRAME / 2, 1.0].map((y) => (
        <mesh key={`h${y}`} material={frame} position={[0, y, 0]}>
          <boxGeometry args={[width, FRAME, LEAF_DEPTH]} />
        </mesh>
      ))}
    </>
  )
}

function SlidingDoor({ door, frame, glass }: { door: Door; frame: MeshStandardMaterial; glass: MeshStandardMaterial }) {
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  const open = useRef(0)
  const leaf = door.width / 2

  useFrame((_, delta) => {
    const near = Math.hypot(player.x - door.center.x, player.z - door.center.z) < OPEN_DISTANCE
    open.current += ((near ? 1 : 0) - open.current) * Math.min(1, 6 * delta)
    const slide = open.current * (leaf - 0.06)
    if (left.current) left.current.position.x = -leaf / 2 - slide
    if (right.current) right.current.position.x = leaf / 2 + slide
  })

  return (
    <group position={[door.center.x, 0, door.center.z]} rotation-y={door.runs === 'x' ? 0 : Math.PI / 2}>
      <group ref={left} position-x={-leaf / 2}>
        <Leaf width={leaf} height={door.height} frame={frame} glass={glass} />
      </group>
      <group ref={right} position-x={leaf / 2}>
        <Leaf width={leaf} height={door.height} frame={frame} glass={glass} />
      </group>
    </group>
  )
}

/**
 * Glass sliding doors (the main exit). They open as the player comes near
 * and slide into the wall, so the doorway never needs to block movement.
 */
export function SlidingDoors({ map }: { map: GameMap }) {
  const doors = useMemo(() => listDoors(map).filter((door) => door.sliding), [map])
  const materials = useMemo(
    () => ({
      frame: new MeshStandardMaterial({ color: '#9aa1aa', metalness: 0.55, roughness: 0.5 }),
      glass: new MeshStandardMaterial({
        color: '#a8c8dc',
        transparent: true,
        opacity: 0.22,
        roughness: 0.15,
        metalness: 0,
        envMapIntensity: 0.3,
        depthWrite: false,
      }),
    }),
    [],
  )
  useEffect(
    () => () => {
      materials.frame.dispose()
      materials.glass.dispose()
    },
    [materials],
  )

  return (
    <>
      {doors.map((door) => (
        <SlidingDoor key={`${door.center.x},${door.center.z}`} door={door} frame={materials.frame} glass={materials.glass} />
      ))}
    </>
  )
}
