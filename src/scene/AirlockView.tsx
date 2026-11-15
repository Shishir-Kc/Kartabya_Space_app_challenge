import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, type Group, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three'
import { listDoors, type Door } from '../maps/collision'
import type { GameMap } from '../maps/types'
import { airlockState } from './airlock'

const GAUGE_SIZE = 256

/** Draws the chamber pressure gauge: a dial from 0 to 110 kPa with a needle and the reading. */
function drawGauge(context: CanvasRenderingContext2D, kpa: number, max: number, cycling: boolean): void {
  const s = GAUGE_SIZE
  context.fillStyle = '#1b2029'
  context.fillRect(0, 0, s, s)
  context.fillStyle = '#0b0f15'
  context.beginPath()
  context.arc(s / 2, s / 2 + 8, 104, 0, Math.PI * 2)
  context.fill()
  // Scale: 0 at lower left round to 110 at lower right.
  const start = Math.PI * 0.75
  const sweep = Math.PI * 1.5
  const full = 110
  context.lineWidth = 10
  context.strokeStyle = '#2b3442'
  context.beginPath()
  context.arc(s / 2, s / 2 + 8, 88, start, start + sweep)
  context.stroke()
  context.strokeStyle = '#4fd18b'
  context.beginPath()
  context.arc(s / 2, s / 2 + 8, 88, start, start + sweep * (kpa / full))
  context.stroke()
  // Tick marks every 10 kPa, labels every 50.
  context.fillStyle = '#9fb3c8'
  context.font = '600 15px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  for (let v = 0; v <= full; v += 10) {
    const a = start + sweep * (v / full)
    const r0 = v % 50 === 0 ? 66 : 72
    context.strokeStyle = '#9fb3c8'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(s / 2 + Math.cos(a) * r0, s / 2 + 8 + Math.sin(a) * r0)
    context.lineTo(s / 2 + Math.cos(a) * 78, s / 2 + 8 + Math.sin(a) * 78)
    context.stroke()
    if (v % 50 === 0) context.fillText(String(v), s / 2 + Math.cos(a) * 52, s / 2 + 8 + Math.sin(a) * 52)
  }
  // Needle.
  const a = start + sweep * (kpa / full)
  context.strokeStyle = '#ffb547'
  context.lineWidth = 4
  context.beginPath()
  context.moveTo(s / 2, s / 2 + 8)
  context.lineTo(s / 2 + Math.cos(a) * 80, s / 2 + 8 + Math.sin(a) * 80)
  context.stroke()
  // Reading.
  context.fillStyle = '#e8eef6'
  context.font = '700 30px monospace'
  context.fillText(`${Math.round(kpa)}`, s / 2, s / 2 + 52)
  context.font = '600 14px sans-serif'
  context.fillStyle = '#9fb3c8'
  context.fillText('kPa', s / 2, s / 2 + 76)
  context.fillText('CHAMBER PRESSURE', s / 2, 18)
  if (cycling) {
    context.fillStyle = '#ffb547'
    context.fillText(kpa < max / 2 ? 'DEPRESSURIZING' : 'PRESSURIZING', s / 2, s - 14)
  }
}

/** One airlock door: a solid leaf with a small window, sliding into the wall beside the opening. */
function AirlockDoor({ door, which, leaf, glass }: { door: Door; which: 'inner' | 'outer'; leaf: MeshStandardMaterial; glass: MeshStandardMaterial }) {
  const group = useRef<Group>(null)
  useFrame(() => {
    const s = airlockState()
    const open = s ? (which === 'inner' ? s.inner : s.outer) : 0
    if (group.current) group.current.position.x = open * (door.width + 0.05)
  })
  const height = door.height
  return (
    <group position={[door.center.x, 0, door.center.z]} rotation-y={door.runs === 'x' ? 0 : Math.PI / 2}>
      <group ref={group}>
        <mesh material={leaf} position={[0, height / 2, 0]}>
          <boxGeometry args={[door.width, height, 0.08]} />
        </mesh>
        <mesh material={glass} position={[0, height * 0.72, 0]}>
          <boxGeometry args={[0.3, 0.3, 0.1]} />
        </mesh>
      </group>
    </group>
  )
}

/** The airlock's two doors and its pressure gauge, driven by the airlock state (scene/airlock.ts). */
export function AirlockView({ map }: { map: GameMap }) {
  const def = map.airlock
  const resources = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = GAUGE_SIZE
    canvas.height = GAUGE_SIZE
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return {
      canvas,
      context: canvas.getContext('2d'),
      texture,
      gauge: new MeshBasicMaterial({ map: texture, toneMapped: false }),
      leaf: new MeshStandardMaterial({ color: '#b9bec6', roughness: 0.5, metalness: 0.3 }),
      glass: new MeshStandardMaterial({ color: '#1d2a38', roughness: 0.1, metalness: 0.2 }),
    }
  }, [])
  useEffect(
    () => () => {
      resources.texture.dispose()
      resources.gauge.dispose()
      resources.leaf.dispose()
      resources.glass.dispose()
    },
    [resources],
  )

  const shown = useRef(-1)
  useFrame(() => {
    const s = airlockState()
    if (!s || !resources.context) return
    const cycling = s.phase === 'to-inside' || s.phase === 'to-outside'
    const key = Math.round(s.pressure) * 2 + (cycling ? 1 : 0)
    if (key === shown.current) return
    shown.current = key
    drawGauge(resources.context, s.pressure, s.def.pressure, cycling)
    resources.texture.needsUpdate = true
  })

  const doors = useMemo(() => listDoors(map), [map])
  const inner = doors.find((door) => door.airlock === 'inner')
  const outer = doors.find((door) => door.airlock === 'outer')
  if (!def || !inner || !outer) return null
  return (
    <group>
      <AirlockDoor door={inner} which="inner" leaf={resources.leaf} glass={resources.glass} />
      <AirlockDoor door={outer} which="outer" leaf={resources.leaf} glass={resources.glass} />
      <group position={[def.gauge.x, def.gauge.y, def.gauge.z]} rotation-y={def.gauge.yaw}>
        <mesh position={[0, 0, -0.02]}>
          <boxGeometry args={[0.38, 0.38, 0.04]} />
          <meshStandardMaterial color="#3a4250" roughness={0.6} />
        </mesh>
        <mesh material={resources.gauge} position-z={0.006}>
          <planeGeometry args={[0.32, 0.32]} />
        </mesh>
      </group>
    </group>
  )
}
