import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGame } from '../state/store'

/** Seconds to ignore after a (re)start, while shaders compile. */
const WARMUP_SECONDS = 4
const MIN_FPS = 40
/** How long the frame rate must stay low before stepping down. */
const SLOW_SECONDS = 3

/** Dev builds only: ?fixedGraphics keeps the chosen tier, for screenshots on slow machines. */
const disabledForScreenshots =
  import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fixedGraphics')

/**
 * Watches the frame rate while playing. If it averages under 40 for three
 * seconds, the game drops one graphics tier and shows a short toast.
 */
export function PerformanceGuard() {
  const sample = useRef({ warmup: 0, time: 0, frames: 0, slow: 0 })

  useFrame((_, delta) => {
    if (disabledForScreenshots) return
    const s = sample.current
    if (document.hidden || useGame.getState().mode !== 'playing') {
      s.time = 0
      s.frames = 0
      s.slow = 0
      return
    }
    if (s.warmup < WARMUP_SECONDS) {
      s.warmup += delta
      return
    }
    s.time += delta
    s.frames += 1
    if (s.time < 1) return

    const fps = s.frames / s.time
    s.slow = fps < MIN_FPS ? s.slow + s.time : 0
    s.time = 0
    s.frames = 0
    if (s.slow >= SLOW_SECONDS) {
      s.slow = 0
      s.warmup = 0
      useGame.getState().lowerGraphics()
    }
  })
  return null
}
