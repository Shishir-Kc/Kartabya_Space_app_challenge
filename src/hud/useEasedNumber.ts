import { useEffect, useRef, useState } from 'react'
import { reducedMotion } from '../state/settings'

/**
 * A number that eases toward `target` over `duration` ms instead of
 * jumping, so meter values count up and down smoothly. Jumps straight there
 * when reduced motion is on (Settings, or the device's own setting).
 */
export function useEasedNumber(target: number, duration = 600): number {
  const [value, setValue] = useState(target)
  const current = useRef(target)

  useEffect(() => {
    if (reducedMotion()) {
      current.current = target
      setValue(target)
      return
    }
    const origin = current.current
    const start = performance.now()
    let handle = requestAnimationFrame(step)
    function step(now: number) {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      current.current = origin + (target - origin) * eased
      setValue(current.current)
      if (t < 1) handle = requestAnimationFrame(step)
    }
    return () => cancelAnimationFrame(handle)
  }, [target, duration])

  return value
}
