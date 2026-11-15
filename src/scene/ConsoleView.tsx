import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshBasicMaterial } from 'three'
import { getChallenge } from '../data/challenges'
import type { Console } from '../maps/types'
import { useGame } from '../state/store'
import { launchConsoleTitle } from './cinematic/launchScript'
import { consoleScreen } from './materials/canvasTextures'

/** Screen brightness when the player is out of range, and in range. */
const DIM = 0.62
const BRIGHT = 1

/**
 * A console's screen: a canvas UI (title, status bars, blinking cursor)
 * that glows brighter when the player is in range. The console body is
 * part of the merged map geometry (kit/props.ts).
 */
export function ConsoleView({ item, y = 0 }: { item: Console; y?: number }) {
  const focused = useGame((state) => state.focus?.id === item.id)
  // Green once its challenge is done on this run.
  const done = useGame((state) => state.usedConsoles.includes(item.challengeId))
  // During the launch, "Preparing for launch", then "Launching", in place of the task.
  const launch = useGame((state) => launchConsoleTitle(state.sequence))
  const screen = useMemo(
    () => consoleScreen(getChallenge(item.challengeId)?.title ?? `Challenge ${item.challengeId}`, item.challengeId),
    [item],
  )
  const material = useMemo(() => new MeshBasicMaterial({ map: screen.texture, toneMapped: false }), [screen])
  useEffect(
    () => () => {
      screen.texture.dispose()
      material.dispose()
    },
    [screen, material],
  )

  useEffect(() => {
    material.color.setScalar(focused ? BRIGHT : DIM)
  }, [focused, material])

  // Blink the cursor twice a second; only redraw when it changes.
  const cursor = useRef(true)
  const doneRef = useRef(done)
  const launchRef = useRef(launch)
  useEffect(() => {
    doneRef.current = done
    launchRef.current = launch
    screen.draw(cursor.current, done, launch)
    screen.texture.needsUpdate = true
  }, [done, launch, screen])
  useFrame(({ clock }) => {
    const on = Math.floor(clock.elapsedTime * 2) % 2 === 0
    if (on === cursor.current) return
    cursor.current = on
    screen.draw(on, doneRef.current, launchRef.current)
    screen.texture.needsUpdate = true
  })

  const rotation = Math.atan2(item.facing.x, item.facing.z)
  return (
    <group position={[item.position.x, y, item.position.z]} rotation-y={rotation}>
      <mesh position={[0, 1.24, -0.168]} rotation-x={-0.3} material={material}>
        <planeGeometry args={[0.96, 0.6]} />
      </mesh>
    </group>
  )
}
