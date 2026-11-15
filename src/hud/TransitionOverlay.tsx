import { useEffect, useState } from 'react'
import { finishTransition, runTransition } from '../scene/session'
import { useGame } from '../state/store'
import './transition.css'

const FADE_MS = 600
const HOLD_MS = 2000

type Step = 'in' | 'hold' | 'out'

/**
 * Fades to black, shows a message, does the move (load a map or put the
 * player somewhere) while the screen is dark, then fades back in.
 */
export function TransitionOverlay() {
  const transition = useGame((state) => state.transition)
  const [step, setStep] = useState<Step>('in')

  useEffect(() => {
    if (!transition) return
    setStep('in')
    const timers = [
      window.setTimeout(() => setStep('hold'), FADE_MS),
      window.setTimeout(() => {
        runTransition(transition.after)
        setStep('out')
      }, FADE_MS + HOLD_MS),
      window.setTimeout(() => finishTransition(transition.after), FADE_MS * 2 + HOLD_MS),
    ]
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [transition])

  if (!transition) return null

  return (
    <div className="transition" data-step={step} role="status" aria-live="polite">
      <p className="transition__message">{transition.message}</p>
    </div>
  )
}
