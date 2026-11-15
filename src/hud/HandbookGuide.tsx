import { useEffect, useRef, useState } from 'react'

/** The steps, and which part of the book each one points at. */
export const GUIDE_STEPS: readonly { text: string; points?: 'tabs' | 'summary' | 'keys' }[] = [
  { text: 'These tabs are bookmarks. Click one to jump to a topic.', points: 'tabs' },
  { text: 'Use the ← and → keys to turn pages.', points: 'keys' },
  { text: 'Press 1 to 5 to jump to a bookmark. Press Esc for the cover.', points: 'keys' },
  { text: 'Start with the Summary to see how your mission went.', points: 'summary' },
]

/**
 * "How to use this handbook": the first time the book opens (and from the
 * "?" on the cover), four short steps, with an arrow at the part each one
 * means. Next and Back move between steps; Got it (or Enter) closes it.
 */
export function HandbookGuide({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const button = useRef<HTMLButtonElement>(null)
  const last = step === GUIDE_STEPS.length - 1
  const current = GUIDE_STEPS[step]!

  useEffect(() => {
    button.current?.focus({ preventScroll: true })
  }, [step])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Enter' || event.code === 'NumpadEnter') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      } else if (event.code === 'ArrowRight') {
        event.preventDefault()
        setStep((s) => Math.min(GUIDE_STEPS.length - 1, s + 1))
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault()
        setStep((s) => Math.max(0, s - 1))
      } else if (event.code === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="hb-guide" role="dialog" aria-modal="true" aria-labelledby="hb-guide-title" data-points={current.points}>
      {current.points === 'tabs' && <span className="hb-guide__arrow hb-guide__arrow--tabs" aria-hidden="true">→</span>}
      {current.points === 'summary' && <span className="hb-guide__arrow hb-guide__arrow--summary" aria-hidden="true">→</span>}
      <div className="hb-guide__card">
        <p className="hb-label">How to use this handbook</p>
        <h2 id="hb-guide-title" className="hb-section">
          Step {step + 1} of {GUIDE_STEPS.length}
        </h2>
        <ol className="hb-guide__steps">
          {GUIDE_STEPS.map((s, i) => (
            <li key={s.text} className="hb-body" data-current={i === step ? 'true' : undefined}>
              {s.text}
            </li>
          ))}
        </ol>
        <div className="hb-guide__buttons">
          <button type="button" className="button button--quiet" disabled={step === 0} onClick={() => setStep(step - 1)}>
            ← Back
          </button>
          {!last && (
            <button type="button" className="button" onClick={() => setStep(step + 1)}>
              Next →
            </button>
          )}
          <button ref={button} type="button" className="button button--primary" onClick={onClose}>
            Got it <span className="keycap">Enter</span>
          </button>
        </div>
      </div>
    </div>
  )
}
