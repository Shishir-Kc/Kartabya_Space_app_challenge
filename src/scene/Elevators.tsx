import { useEffect, useMemo, useRef } from 'react'
import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, type BufferGeometry, CylinderGeometry, type Group, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import interFont from '@fontsource/inter/files/inter-latin-600-normal.woff?url'
import { carDoorCenter, levelY } from '../maps/collision'
import type { Elevator, GameMap, Side } from '../maps/types'
import { carWithPlayer, elevatorState } from './elevatorLogic'
import { player } from '../state/player'

const WALL = 0.06
const LEAF = 0.04

interface CarMaterials {
  metal: MeshStandardMaterial
  dark: MeshStandardMaterial
  glass: MeshStandardMaterial
  light: MeshBasicMaterial
  button: MeshBasicMaterial
}

/** The two halves of a sliding door, opening along local x. */
function DoorLeaves({
  width,
  height,
  material,
  frame,
  leftRef,
  rightRef,
}: {
  width: number
  height: number
  material: MeshStandardMaterial
  frame?: MeshStandardMaterial
  leftRef: React.RefObject<Group | null>
  rightRef: React.RefObject<Group | null>
}) {
  const leaf = width / 2
  // A door leaf with softly rounded edges.
  const leafGeometry = useMemo(() => new RoundedBoxGeometry(leaf - 0.01, height, LEAF, 2, 0.01), [leaf, height])
  useEffect(() => () => leafGeometry.dispose(), [leafGeometry])
  return (
    <>
      {[leftRef, rightRef].map((ref, i) => (
        <group key={i} ref={ref} position-x={(i === 0 ? -1 : 1) * (leaf / 2)}>
          <mesh material={material} geometry={leafGeometry} position={[0, height / 2, 0]} />
          {frame && (
            <mesh material={frame} position={[(i === 0 ? 1 : -1) * (leaf / 2 - 0.02), height / 2, 0]}>
              <boxGeometry args={[0.04, height, LEAF + 0.01]} />
            </mesh>
          )}
        </group>
      ))}
    </>
  )
}

type PartKey = 'metal' | 'dark' | 'glass' | 'light' | 'button'

/** A box with softly rounded edges (light catches them), or a plain one for very thin parts. */
function softBox(w: number, h: number, d: number): BufferGeometry {
  const r = Math.min(0.012, w / 4, h / 4, d / 4)
  return r < 0.004 ? new BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r)
}

/**
 * Everything of the car that moves with it but never on its own (walls,
 * piers, glass, floor, roof, light, handrail, button panel), merged into one
 * geometry per material in the car's own coordinates: a handful of draw
 * calls instead of about twenty.
 */
function carGeometry(elevator: Elevator, doorSides: Set<Side>): Partial<Record<PartKey, BufferGeometry>> {
  const parts: Record<PartKey, BufferGeometry[]> = { metal: [], dark: [], glass: [], light: [], button: [] }
  const add = (key: PartKey, geometry: BufferGeometry, x: number, y: number, z: number, yaw = 0) => {
    geometry.rotateY(yaw)
    geometry.translate(x, y, z)
    // RoundedBoxGeometry has no index; plain boxes do. Merge them all without one.
    parts[key].push(geometry.index ? geometry.toNonIndexed() : geometry)
  }
  const w = elevator.car.x1 - elevator.car.x0
  const d = elevator.car.z1 - elevator.car.z0
  const h = elevator.height
  const door = elevator.doorWidth
  add('dark', softBox(w + WALL * 2, 0.08, d + WALL * 2), 0, -0.04, 0)
  add('metal', softBox(w + WALL * 2, 0.08, d + WALL * 2), 0, h + 0.04, 0)
  add('light', new BoxGeometry(w * 0.6, 0.01, d * 0.6), 0, h - 0.005, 0)
  for (const side of ['north', 'south', 'east', 'west'] as Side[]) {
    const alongX = side === 'north' || side === 'south'
    const length = (alongX ? w : d) + WALL * 2
    const offset = (alongX ? d : w) / 2 + WALL / 2
    const yaw = side === 'north' ? Math.PI : side === 'south' ? 0 : side === 'east' ? Math.PI / 2 : -Math.PI / 2
    const [ox, oz] = side === 'north' ? [0, -offset] : side === 'south' ? [0, offset] : side === 'east' ? [offset, 0] : [-offset, 0]
    // A point on this wall, `along` metres sideways and `out` metres toward the car's inside.
    const at = (along: number, out: number): [number, number] => [ox + Math.cos(yaw) * along - Math.sin(yaw) * out, oz - Math.sin(yaw) * along - Math.cos(yaw) * out]
    const glass = elevator.glass?.includes(side) ?? false
    const panelKey: PartKey = glass ? 'glass' : 'metal'
    const thick = glass ? 0.02 : WALL
    if (!doorSides.has(side)) {
      add(panelKey, glass ? new BoxGeometry(length, h, thick) : softBox(length, h, thick), ...xyz(at(0, 0), h / 2), yaw)
      if (glass) {
        for (const sx of [-1, 1]) add('metal', softBox(0.06, h, WALL), ...xyz(at(sx * (length / 2 - 0.03), 0), h / 2), yaw)
        add('metal', softBox(length, 0.04, 0.04), ...xyz(at(0, 0.03), 1.0), yaw)
      } else {
        // A handrail along the solid walls, on two stand-offs.
        add('metal', new CylinderGeometry(0.018, 0.018, length - 0.3, 10).rotateZ(Math.PI / 2), ...xyz(at(0, 0.07), 0.95), yaw)
        for (const sx of [-1, 1]) add('metal', new CylinderGeometry(0.012, 0.012, 0.06, 8).rotateX(Math.PI / 2), ...xyz(at(sx * (length / 2 - 0.25), 0.04), 0.95), yaw)
      }
      continue
    }
    const pier = (length - door) / 2
    for (const sx of [-1, 1]) add(panelKey, glass ? new BoxGeometry(pier, h, thick) : softBox(pier, h, thick), ...xyz(at(sx * (door / 2 + pier / 2), 0), h / 2), yaw)
    add(panelKey, glass ? new BoxGeometry(door, h - elevator.doorHeight, thick) : softBox(door, h - elevator.doorHeight, thick), ...xyz(at(0, 0), (h + elevator.doorHeight) / 2), yaw)
    // The door frame: two posts and a head, on every door opening.
    for (const sx of [-1, 1]) add('metal', softBox(0.05, elevator.doorHeight, WALL + 0.02), ...xyz(at(sx * (door / 2 + 0.025), 0), elevator.doorHeight / 2), yaw)
    add('metal', softBox(door + 0.1, 0.05, WALL + 0.02), ...xyz(at(0, 0), elevator.doorHeight + 0.025), yaw)
  }
  // The button panel, with a bezel and a button per stop.
  const cx = (elevator.car.x0 + elevator.car.x1) / 2
  const cz = (elevator.car.z0 + elevator.car.z1) / 2
  const panel = elevator.panel
  const toCar = (lx: number, lz: number): [number, number] => [panel.x - cx + Math.cos(panel.yaw) * lx + Math.sin(panel.yaw) * lz, panel.z - cz - Math.sin(panel.yaw) * lx + Math.cos(panel.yaw) * lz]
  add('metal', softBox(0.34, 0.54, 0.02), ...xyz(toCar(0, 0.006), 1.25), panel.yaw)
  add('dark', softBox(0.3, 0.5, 0.02), ...xyz(toCar(0, 0.014), 1.25), panel.yaw)
  elevator.stops.forEach((_, i) => add('button', new CylinderGeometry(0.024, 0.024, 0.012, 16).rotateX(Math.PI / 2), ...xyz(toCar(-0.08, 0.028), 1.4 - i * 0.2), panel.yaw))
  const out: Partial<Record<PartKey, BufferGeometry>> = {}
  for (const key of Object.keys(parts) as PartKey[]) {
    const list = parts[key]
    if (!list.length) continue
    const merged = mergeGeometries(list, false)
    for (const g of list) g.dispose()
    if (merged) out[key] = merged
  }
  return out
}

const xyz = ([x, z]: [number, number], y: number): [number, number, number] => [x, y, z]

/** The door leaves of one side of the car, in their opening. */
function CarDoor({ elevator, side, materials, leafRefs }: { elevator: Elevator; side: Side; materials: CarMaterials; leafRefs: { left: React.RefObject<Group | null>; right: React.RefObject<Group | null> } }) {
  const w = elevator.car.x1 - elevator.car.x0
  const d = elevator.car.z1 - elevator.car.z0
  const alongX = side === 'north' || side === 'south'
  const offset = (alongX ? d : w) / 2 + WALL / 2
  const yaw = side === 'north' ? Math.PI : side === 'south' ? 0 : side === 'east' ? Math.PI / 2 : -Math.PI / 2
  const position: [number, number, number] =
    side === 'north' ? [0, 0, -offset] : side === 'south' ? [0, 0, offset] : side === 'east' ? [offset, 0, 0] : [-offset, 0, 0]
  const glass = elevator.glass?.includes(side) ?? false
  return (
    <group position={position} rotation-y={yaw}>
      <group position-z={-0.03}>
        <DoorLeaves width={elevator.doorWidth} height={elevator.doorHeight} material={glass ? materials.glass : materials.metal} leftRef={leafRefs.left} rightRef={leafRefs.right} />
      </group>
    </group>
  )
}

function Car({ elevator, materials }: { elevator: Elevator; materials: CarMaterials }) {
  const group = useRef<Group>(null)
  const doorSides = useMemo(() => new Set(elevator.stops.map((stop) => stop.door)), [elevator])
  const refs = useMemo(
    () =>
      Object.fromEntries(
        (['north', 'south', 'east', 'west'] as Side[]).map((side) => [side, { left: { current: null as Group | null }, right: { current: null as Group | null } }]),
      ) as Record<Side, { left: React.RefObject<Group | null>; right: React.RefObject<Group | null> }>,
    [],
  )
  const geometry = useMemo(() => carGeometry(elevator, doorSides), [elevator, doorSides])
  useEffect(() => () => Object.values(geometry).forEach((g) => g?.dispose()), [geometry])
  const cx = (elevator.car.x0 + elevator.car.x1) / 2
  const cz = (elevator.car.z0 + elevator.car.z1) / 2
  const leaf = elevator.doorWidth / 2

  useFrame(() => {
    const state = elevatorState(elevator.id)
    if (!state || !group.current) return
    group.current.position.y = state.y
    const openSide = state.phase === 'moving' ? null : elevator.stops[state.stop]?.door
    for (const side of doorSides) {
      const open = side === openSide ? state.door : 0
      const slide = open * (leaf - 0.05)
      const pair = refs[side]
      if (pair.left.current) pair.left.current.position.x = -leaf / 2 - slide
      if (pair.right.current) pair.right.current.position.x = leaf / 2 + slide
    }
  })

  // The button labels, in the car's own coordinates.
  const panel = elevator.panel
  const px = panel.x - cx
  const pz = panel.z - cz

  return (
    <group ref={group} position={[cx, 0, cz]}>
      {(Object.keys(geometry) as PartKey[]).map((key) => (
        <mesh key={key} geometry={geometry[key]} material={materials[key]} />
      ))}
      {[...doorSides].map((side) => (
        <CarDoor key={side} elevator={elevator} side={side} materials={materials} leafRefs={refs[side]} />
      ))}
      <group position={[px, 0, pz]} rotation-y={panel.yaw}>
        {elevator.stops.map((stop, i) => (
          <Text key={stop.level} font={interFont} fontSize={0.045} color="#e8ecf2" anchorX="left" anchorY="middle" position={[-0.04, 1.4 - i * 0.2, 0.026]}>
            {stop.label}
          </Text>
        ))}
      </group>
    </group>
  )
}

/** Landing doors at one stop: they open only while the car is standing there. */
function LandingDoors({
  map,
  elevator,
  index,
  material,
}: {
  map: GameMap
  elevator: Elevator
  index: number
  material: MeshStandardMaterial
}) {
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  const stop = elevator.stops[index]
  const leaf = elevator.doorWidth / 2

  useFrame(() => {
    const state = elevatorState(elevator.id)
    if (!state) return
    const open = state.phase !== 'moving' && state.stop === index ? state.door : 0
    const slide = open * (leaf - 0.05)
    if (left.current) left.current.position.x = -leaf / 2 - slide
    if (right.current) right.current.position.x = leaf / 2 + slide
  })

  if (!stop) return null
  const center = carDoorCenter(elevator, stop.door)
  const alongX = stop.door === 'north' || stop.door === 'south'
  return (
    <group position={[center.x, levelY(map, stop.level), center.z]} rotation-y={alongX ? 0 : Math.PI / 2}>
      <DoorLeaves width={elevator.doorWidth} height={elevator.doorHeight} material={material} leftRef={left} rightRef={right} />
    </group>
  )
}

/** How far away an elevator is still drawn (unless the player is riding it): beyond this it's behind walls anyway. */
const DRAW_WITHIN = 30

/** One elevator and its landing doors, hidden when far from the player. */
function ElevatorGroup({ elevator, children }: { elevator: Elevator; children: React.ReactNode }) {
  const group = useRef<Group>(null)
  const cx = (elevator.car.x0 + elevator.car.x1) / 2
  const cz = (elevator.car.z0 + elevator.car.z1) / 2
  useFrame(() => {
    if (!group.current) return
    const riding = carWithPlayer()?.def.id === elevator.id
    group.current.visible = riding || Math.hypot(player.x - cx, player.z - cz) < DRAW_WITHIN
  })
  return <group ref={group}>{children}</group>
}

/** Every elevator car and landing door in the map. These are the only moving parts of the route. */
export function Elevators({ map }: { map: GameMap }) {
  const materials = useMemo<CarMaterials>(() => {
    const light = new MeshBasicMaterial({ color: '#ffffff' })
    light.color.setRGB(2.4, 2.3, 2.1)
    const button = new MeshBasicMaterial({ color: '#ffffff' })
    button.color.setRGB(2.6, 1.6, 0.3)
    return {
      metal: new MeshStandardMaterial({ color: '#a7adb5', metalness: 0.6, roughness: 0.48 }),
      dark: new MeshStandardMaterial({ color: '#2b2f36', metalness: 0.3, roughness: 0.7 }),
      glass: new MeshStandardMaterial({
        color: '#bcd6e6',
        transparent: true,
        opacity: 0.16,
        roughness: 0.08,
        metalness: 0,
        envMapIntensity: 0.3,
        depthWrite: false,
      }),
      light,
      button,
    }
  }, [])
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose()
    },
    [materials],
  )

  return (
    <>
      {(map.elevators ?? []).map((elevator) => (
        <ElevatorGroup key={elevator.id} elevator={elevator}>
          <Car elevator={elevator} materials={materials} />
          {elevator.stops.map((stop, index) => (
            <LandingDoors key={stop.level} map={map} elevator={elevator} index={index} material={materials.metal} />
          ))}
        </ElevatorGroup>
      ))}
    </>
  )
}
