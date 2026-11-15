import { useEffect, useState } from 'react'
import { useGame } from '../state/store'
import './transition.css'

/** A quick dip to black and back, e.g. while changing suits in the airlock. */
export function Fade() {
  const fade = useGame((state) => state.fade)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (fade === 0) return
    setOn(true)
    const timer = window.setTimeout(() => setOn(false), 420)
    return () => window.clearTimeout(timer)
  }, [fade])
  return <div className="quick-fade" data-on={on ? 'true' : 'false'} aria-hidden="true" />
}
