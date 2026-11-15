import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { buildSaturnVStack, loadSaturnV, rocketEnvironment, type SaturnVStack } from './saturnV'

/** How far up the pad's floodlights light the rocket, metres above the ground. */
export const GLOW_HEIGHT = 120

/**
 * The whole Saturn V standing with its nozzle exits at `position`,
 * floodlit from the ground (`glow`: about 0.75 seen from the launch
 * center, 1 in the menu lobby). Draws nothing until the model has loaded.
 * `layer` puts it on a stage's own layer (the cinematic stages and the lobby).
 * `onReady` is called once it is built, or once it has failed to load (the
 * main menu's loading screen waits for it).
 */
export function SaturnVView({
  position,
  glow = 0.75,
  ground = 0,
  layer,
  onReady,
}: {
  position: [number, number, number]
  glow?: number
  ground?: number
  layer?: number
  onReady?: () => void
}) {
  const gl = useThree((state) => state.gl)
  const [stack, setStack] = useState<SaturnVStack | null>(null)
  const ready = useRef(onReady)
  ready.current = onReady

  useEffect(() => {
    let cancelled = false
    let built: SaturnVStack | null = null
    loadSaturnV()
      .then((gltf) => {
        if (cancelled) return
        built = buildSaturnVStack(gltf, rocketEnvironment(gl))
        setStack(built)
        ready.current?.()
      })
      .catch((error: unknown) => {
        console.error('Could not load the Saturn V model', error)
        if (!cancelled) ready.current?.()
      })
    return () => {
      cancelled = true
      built?.dispose()
    }
  }, [gl])

  useEffect(() => stack?.setGlow(glow, ground, GLOW_HEIGHT), [stack, glow, ground])

  useLayoutEffect(() => {
    if (stack && layer !== undefined) stack.root.traverse((object) => object.layers.set(layer))
  }, [stack, layer])

  return stack ? <primitive object={stack.root} position={position} /> : null
}
