import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import type { GraphicsPreset } from '../state/graphics'

/**
 * Post-processing for the low and high tiers. Low: FXAA instead of MSAA.
 * High: ambient occlusion, plus bloom with a threshold of 1 so only
 * emissive surfaces brighter than white (lights, the Moon) glow.
 * Medium uses none of this and renders straight to the canvas with MSAA.
 */
export function PostEffects({ preset }: { preset: GraphicsPreset }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  const composer = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: preset.msaa ? 4 : 0 })
    const effects = new EffectComposer(gl, target)
    effects.addPass(new RenderPass(scene, camera))
    if (preset.ambientOcclusion) effects.addPass(new GTAOPass(scene, camera, 1, 1))
    // A gentle glow on the brightest lights only, not a haze over the whole room.
    if (preset.bloom) effects.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.18, 0.3, 1.2))
    effects.addPass(new OutputPass())
    if (preset.fxaa) effects.addPass(new FXAAPass())
    return effects
  }, [gl, scene, camera, preset])

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio())
    composer.setSize(size.width, size.height)
  }, [composer, gl, size])

  useEffect(() => () => composer.dispose(), [composer])

  // Priority 1 takes over rendering from React Three Fiber.
  useFrame((_, delta) => composer.render(delta), 1)
  return null
}
