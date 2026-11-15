import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import { cinematic } from '../../state/cinematic'
import type { ParticleField } from './particles'

/** Cinematic stages draw on their own layer, so the map (on layer 0) and the stage never mix by accident. */
export const STAGE_LAYER = 1

const COCKPIT = { fov: 70, near: 0.05, far: 800 }

/**
 * While an outside shot plays, the camera is the shot's: it sees only the
 * stage's layer, from the shot's position and field of view, with a far
 * plane long enough for a rocket kilometres away. Back in the cockpit it
 * sees the map again (and, if `cockpitSees`, the stage through the windows).
 * Particle sizes follow the field of view. Everything is put back when
 * the stage goes away.
 */
export function useCinematicCamera(options: { far: number; near?: number; cockpitSees?: boolean; particles?: ParticleField[] }): void {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const height = useThree((state) => state.size.height * state.viewport.dpr)

  // Compile the stage's shaders now, while the cockpit part plays, so the first cut doesn't stutter.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const probe = camera.clone()
      probe.layers.set(STAGE_LAYER)
      gl.compile(scene, probe)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [camera, gl, scene])

  useFrame(() => {
    if (cinematic.outside) {
      const c = cinematic.camera
      camera.layers.set(STAGE_LAYER)
      camera.position.set(c.position[0], c.position[1], c.position[2])
      camera.up.set(0, 1, 0)
      camera.lookAt(c.target[0], c.target[1], c.target[2])
      setLens(camera, c.fov, options.near ?? 0.5, cinematic.far ?? options.far)
    } else {
      camera.layers.set(0)
      if (options.cockpitSees) camera.layers.enable(STAGE_LAYER)
      setLens(camera, COCKPIT.fov, COCKPIT.near, COCKPIT.far)
    }
    for (const field of options.particles ?? []) field.setScale(height, camera.fov)
  })

  useEffect(
    () => () => {
      camera.layers.set(0)
      setLens(camera, COCKPIT.fov, COCKPIT.near, COCKPIT.far)
    },
    [camera],
  )
}

function setLens(camera: PerspectiveCamera, fov: number, near: number, far: number): void {
  if (camera.fov === fov && camera.near === near && camera.far === far) return
  camera.fov = fov
  camera.near = near
  camera.far = far
  camera.updateProjectionMatrix()
}
