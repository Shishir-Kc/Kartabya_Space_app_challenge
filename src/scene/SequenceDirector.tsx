import { useEffect, useMemo, useRef, useState } from 'react'
import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, DoubleSide, type Group, type Mesh, MeshStandardMaterial, SRGBColorSpace } from 'three'
import monoFont from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff?url'
import type { GameMap } from '../maps/types'
import { cinematic } from '../state/cinematic'
import { flight } from '../state/flight'
import { useGame } from '../state/store'

/** How often the cockpit screen's text changes, seconds (re-laying out 3D text every frame would be slow). */
const SCREEN_EVERY = 0.4

/** A small checklist card, drawn once. */
function checklistTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 160
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#f4f1e8'
    context.fillRect(0, 0, 128, 160)
    context.fillStyle = '#c94f3a'
    context.fillRect(0, 0, 128, 22)
    context.fillStyle = '#ffffff'
    context.font = '600 13px sans-serif'
    context.fillText('CHECKLIST', 10, 16)
    context.fillStyle = '#3a3f47'
    for (let i = 0; i < 8; i++) {
      context.strokeStyle = '#3a3f47'
      context.strokeRect(10, 34 + i * 15, 8, 8)
      context.fillRect(24, 37 + i * 15, 60 + ((i * 29) % 34), 3)
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

interface Floater {
  rest: [number, number, number]
  velocity: [number, number, number]
  spin: [number, number, number]
}

/**
 * The launch's cockpit props: the countdown screen between the forward
 * windows, and a pen and a checklist card resting on the dashboard that
 * drift up into the cabin once the engines cut off. They keep drifting,
 * bouncing gently off the cabin walls, for the rest of the trip.
 */
export function SequenceDirector({ map }: { map: GameMap }) {
  const sequence = useGame((state) => state.sequence)
  const screen = map.countdown
  const [text, setText] = useState(() => (useGame.getState().sequence ? cinematic.screen || 'GO FOR LAUNCH' : 'COAST TO MOON'))
  const sinceText = useRef(0)
  const shroud = useRef<Group>(null)
  const caughtUp = useRef(false)
  const pen = useRef<Mesh>(null)
  const card = useRef<Mesh>(null)
  const cockpit = map.rooms.find((room) => room.id === 'cockpit')

  const resources = useMemo(() => {
    const texture = checklistTexture()
    return {
      texture,
      card: new MeshStandardMaterial({ map: texture, roughness: 0.8, side: DoubleSide }),
      pen: new MeshStandardMaterial({ color: '#d9692a', roughness: 0.5 }),
      shroud: new MeshStandardMaterial({ color: '#d9dcdf', roughness: 0.75 }),
      rib: new MeshStandardMaterial({ color: '#8a9099', roughness: 0.6 }),
    }
  }, [])
  useEffect(
    () => () => {
      resources.texture.dispose()
      resources.card.dispose()
      resources.pen.dispose()
      resources.shroud.dispose()
      resources.rib.dispose()
    },
    [resources],
  )

  // Resting on the left dashboard, in front of the player's seat.
  const floaters = useMemo<Floater[]>(
    () => [
      { rest: [12.66, 1.09, -0.92], velocity: [-0.05, 0.11, 0.03], spin: [0.6, 1.3, 0.2] },
      { rest: [12.7, 1.085, -1.18], velocity: [-0.035, 0.08, 0.045], spin: [0.3, 0.5, 0.9] },
    ],
    [],
  )
  const state = useRef(floaters.map((f) => ({ position: [...f.rest] as [number, number, number], velocity: [...f.velocity] as [number, number, number] })))

  useFrame((_, delta) => {
    // The cockpit screen: the sequence's text, a few times a second.
    sinceText.current += delta
    if (sinceText.current >= SCREEN_EVERY) {
      sinceText.current = 0
      const next = sequence ? cinematic.screen || text : 'COAST TO MOON'
      if (next !== text) setText(next)
    }
    // The escape tower's shroud: over the windows until it is jettisoned, then flying off forward and up, tumbling.
    if (shroud.current) {
      const s = flight.shroud
      shroud.current.visible = s > 0
      const gone = 1 - s
      shroud.current.position.set(gone * gone * 14, gone * gone * 5, 0)
      shroud.current.rotation.set(gone * 0.6, 0, -gone * 1.4)
    }
    if (useGame.getState().mode !== 'playing') return
    const dt = Math.min(delta, 0.05)
    const meshes = [pen.current, card.current]
    const free = flight.sinceCutoff >= 0
    // Cutting in on a cabin that has been weightless a while: things have already drifted.
    let catchUp = 0
    if (free && !caughtUp.current) {
      caughtUp.current = true
      catchUp = Math.min(8, flight.sinceCutoff)
    }
    if (!free) caughtUp.current = false
    meshes.forEach((mesh, i) => {
      const s = state.current[i]
      const f = floaters[i]
      if (!mesh || !s || !f) return
      if (!free) {
        mesh.position.set(...f.rest)
        return
      }
      for (let left = catchUp + dt; left > 1e-6; left -= 1 / 30) {
        const step = Math.min(1 / 30, left)
        for (let axis = 0; axis < 3; axis++) s.position[axis]! += s.velocity[axis]! * step
        // Bounce softly off the cabin's walls, floor and ceiling.
        if (cockpit) {
          const limits: [number, number][] = [
            [cockpit.rect.x0 + 0.3, cockpit.rect.x1 - 0.45],
            [0.3, cockpit.ceiling - 0.15],
            [cockpit.rect.z0 + 0.3, cockpit.rect.z1 - 0.3],
          ]
          limits.forEach(([lo, hi], axis) => {
            const p = s.position[axis]!
            if (p < lo || p > hi) {
              s.position[axis] = Math.max(lo, Math.min(hi, p))
              s.velocity[axis] = -s.velocity[axis]! * 0.6
            }
          })
        }
      }
      mesh.position.set(...s.position)
      mesh.rotation.x += f.spin[0] * (dt + catchUp)
      mesh.rotation.y += f.spin[1] * (dt + catchUp)
      mesh.rotation.z += f.spin[2] * (dt + catchUp)
    })
  })

  return (
    <group>
      {screen && (
        <group position={[screen.x, screen.y, screen.z]} rotation-y={screen.yaw}>
          <mesh position={[0, 0, -0.02]}>
            <boxGeometry args={[screen.width + 0.06, screen.height + 0.06, 0.04]} />
            <meshStandardMaterial color="#1c2129" roughness={0.6} />
          </mesh>
          <Text
            font={monoFont}
            fontSize={Math.min(screen.height * 0.5, (screen.width * 0.92) / (text.length * 0.62))}
            color="#ffb547"
            anchorX="center"
            anchorY="middle"
            position={[0, 0, 0.002]}
            maxWidth={screen.width}
          >
            {text}
            <meshBasicMaterial color="#ffb547" toneMapped={false} />
          </Text>
        </group>
      )}
      {/*
        The escape tower's shroud, just outside the forward windows: on real
        crew capsules a cover over the capsule hides the windows until the
        escape tower is jettisoned. TODO: source.
      */}
      {cockpit && (
        <group ref={shroud} visible={false}>
          <group position={[cockpit.rect.x1 + 0.22, 1.55, 0]}>
            <mesh material={resources.shroud}>
              <boxGeometry args={[0.06, 1.3, 2.6]} />
            </mesh>
            {[-0.9, -0.3, 0.3, 0.9].map((z) => (
              <mesh key={z} material={resources.rib} position={[-0.035, 0, z]}>
                <boxGeometry args={[0.01, 1.2, 0.05]} />
              </mesh>
            ))}
          </group>
        </group>
      )}
      <mesh ref={pen} material={resources.pen} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.006, 0.006, 0.14, 8]} />
      </mesh>
      <mesh ref={card} material={resources.card} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.15, 0.19]} />
      </mesh>
    </group>
  )
}
