import { useEffect, useRef } from 'react'
import { renderStats } from '../scene/renderStats'
import './fps.css'

/**
 * Frame-rate and draw-call counter for dev builds. It writes straight to the
 * DOM twice a second, so it never re-renders React and costs almost nothing.
 */
export function FpsCounter() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let handle = requestAnimationFrame(tick)

    function tick(now: number) {
      frames += 1
      const elapsed = now - last
      if (elapsed >= 500) {
        const fps = Math.round((frames * 1000) / elapsed)
        if (ref.current) ref.current.textContent = `${fps} fps · ${renderStats.calls} draws`
        frames = 0
        last = now
      }
      handle = requestAnimationFrame(tick)
    }

    return () => cancelAnimationFrame(handle)
  }, [])

  return (
    <div ref={ref} className="fps" aria-hidden="true">
      -- fps
    </div>
  )
}
