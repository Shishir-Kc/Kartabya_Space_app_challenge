import { useEffect } from 'react'
import { answerBeat, BEATS, skipBeat, useBeat } from '../scene/beats'
import { useGame } from '../state/store'
import './beat.css'

/**
 * While a story beat plays: letterbox bars, the red alarm light for the first
 * storm, and Skip (Enter; the button only shows while the mouse is free).
 * Lines show as the usual captions. When a beat asks the player something
 * (Houston's cargo question), the mouse is freed and its answers show as
 * buttons, keys 1 and 2, and Skip goes until it's answered.
 */
export function BeatOverlay() {
  const id = useBeat((s) => s.id)
  const asking = useBeat((s) => s.asking)
  const mode = useGame((s) => s.mode)
  // The mouse stays captured through a scene (a button couldn't be clicked), so then only Enter is offered.
  const locked = useGame((s) => s.pointerLocked)

  useEffect(() => {
    if (!id) return
    const onKey = (event: KeyboardEvent) => {
      if (useGame.getState().mode !== 'playing' || event.defaultPrevented) return
      if (useBeat.getState().asking) {
        // 1 or 2 (top row or keypad) picks an answer.
        const index = ['Digit1', 'Digit2', 'Numpad1', 'Numpad2'].indexOf(event.code) % 2
        if (index < 0) return
        event.preventDefault()
        answerBeat(index)
        return
      }
      if (event.code !== 'Enter' && event.code !== 'NumpadEnter') return
      event.preventDefault()
      skipBeat()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id])

  const beat = id ? BEATS[id] : undefined
  if (!beat || mode === 'paused') return null
  if (asking && beat.ask) {
    return (
      <div className="sequence beat" data-outside="true">
        <div className="sequence__bar sequence__bar--top" aria-hidden="true" />
        <div className="sequence__bar sequence__bar--bottom" aria-hidden="true" />
        <div className="beat__answers" role="group" aria-label="Your answer">
          {beat.ask.map((option, i) => (
            <button key={option.then} type="button" className="button beat__answer" onClick={() => answerBeat(i)}>
              <span className="keycap">{i + 1}</span>
              {option.label}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="sequence beat" data-outside="true" data-alarm={beat.alarm ? 'true' : undefined}>
      <div className="sequence__bar sequence__bar--top" aria-hidden="true" />
      <div className="sequence__bar sequence__bar--bottom" aria-hidden="true" />
      {beat.alarm && <div className="beat__alarm" aria-hidden="true" />}
      <div className="sequence__skip">
        {locked ? (
          <span className="sequence__skip-hint">
            Press <span className="keycap">Enter</span> to skip
          </span>
        ) : (
          <>
            <button type="button" className="button" onClick={skipBeat}>
              Skip
            </button>
            <span className="sequence__skip-hint">
              or press <span className="keycap">Enter</span>
            </span>
          </>
        )}
      </div>
    </div>
  )
}
