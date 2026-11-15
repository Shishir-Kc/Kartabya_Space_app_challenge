import { useEffect, useRef } from 'react'
import { skipSequence } from '../scene/sequences'
import { cinematic } from '../state/cinematic'
import { useGame } from '../state/store'
import './space.css'

/**
 * The live readout: a countdown, then the mission clock with each
 * milestone (and when it happens on a real flight); or, landing, the
 * altitude, descent rate and fuel. It stays on screen across every cut, so
 * the count visibly carries on from inside to outside. Its numbers change
 * every frame, so it writes them straight into the page instead of going
 * through the store.
 */
function Readout() {
  const title = useRef<HTMLParagraphElement>(null)
  const lines = useRef<HTMLDListElement>(null)
  const note = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    let frame = 0
    let shown = ''
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const r = cinematic.readout
      const key = `${r.title}|${r.lines.map((l) => l.join(':')).join('|')}|${r.note}`
      if (key === shown) return
      shown = key
      if (title.current) title.current.textContent = r.title
      if (note.current) {
        note.current.textContent = r.note
        note.current.hidden = !r.note
      }
      const list = lines.current
      if (!list) return
      while (list.children.length < r.lines.length * 2) {
        list.appendChild(document.createElement('dt'))
        list.appendChild(document.createElement('dd'))
      }
      while (list.children.length > r.lines.length * 2) list.lastChild?.remove()
      r.lines.forEach(([label, value], i) => {
        list.children[i * 2]!.textContent = label
        list.children[i * 2 + 1]!.textContent = value
      })
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <section className="cine-readout glass enter" aria-label="Flight readout">
      <p ref={title} className="cine-readout__title" />
      <dl ref={lines} className="cine-readout__lines num" />
      <p ref={note} className="cine-readout__note" hidden />
    </section>
  )
}

/**
 * During the launch and the landing: letterbox bars on outside shots, the
 * live readout, a small label naming each event as it happens ("Booster
 * separation"), the big title at liftoff and touchdown, a fade with a line
 * of text for a jump in time, and Skip (Enter works too, so it can be skipped with the
 * mouse captured). The HUD is hidden meanwhile (see Hud.tsx).
 */
export function SequenceOverlay() {
  const sequence = useGame((state) => state.sequence)
  const mode = useGame((state) => state.mode)
  const skippable = sequence !== null && sequence.step !== 'unbuckle'

  useEffect(() => {
    if (!skippable) return
    const onKey = (event: KeyboardEvent) => {
      // A teaching card takes Enter first; it never also skips the cinematic.
      const state = useGame.getState()
      if (event.code === 'Enter' && state.mode === 'playing' && !state.card && !event.defaultPrevented) {
        event.preventDefault()
        skipSequence()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [skippable])

  if (!sequence || mode === 'paused') return null

  return (
    <div className="sequence" data-outside={sequence.outside ? 'true' : 'false'}>
      <div className="sequence__bar sequence__bar--top" aria-hidden="true" />
      <div className="sequence__bar sequence__bar--bottom" aria-hidden="true" />
      {sequence.step !== 'unbuckle' && sequence.id !== 'ending' && <Readout />}
      {sequence.banner && (
        <p key={sequence.banner} className="sequence__banner" role="status">
          {sequence.banner}
        </p>
      )}
      {sequence.label && (
        <p key={sequence.label} className="sequence__label glass glass--pill enter" aria-live="polite">
          {sequence.label}
        </p>
      )}
      {sequence.fade && (
        <div key={sequence.fade} className="sequence__fade" role="status">
          <p className="sequence__fade-text">{sequence.fade}</p>
        </div>
      )}
      {skippable && mode === 'playing' && (
        <div className="sequence__skip">
          <button type="button" className="button" onClick={skipSequence}>
            Skip
          </button>
          <span className="sequence__skip-hint">
            or press <span className="keycap">Enter</span>
          </span>
        </div>
      )}
    </div>
  )
}
