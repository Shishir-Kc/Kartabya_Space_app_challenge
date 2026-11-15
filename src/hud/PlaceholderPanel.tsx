import { useEffect, useRef } from 'react'
import { closePanel } from '../scene/session'
import { useGame } from '../state/store'
import './dialog.css'

/**
 * Opens on E at a console or marker. For now it only names the challenge
 * or scene and says which phase builds it. Closes with Esc or the button.
 * It uses the same glass card as the start screen, so the Phase 4 decision
 * panel inherits the look.
 */
export function PlaceholderPanel() {
  const panel = useGame((state) => state.panel)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (panel) closeRef.current?.focus()
  }, [panel])

  if (!panel) return null

  return (
    <div className="dialog-backdrop">
      <section className="dialog glass enter" role="dialog" aria-modal="true" aria-labelledby="panel-title">
        <p className="dialog__eyebrow">{panel.eyebrow}</p>
        <h2 id="panel-title" className="dialog__title">
          {panel.title}
        </h2>
        <p className="dialog__body">{panel.note}</p>
        <div className="dialog__actions">
          <button ref={closeRef} type="button" className="button button--primary" onClick={closePanel}>
            Close
          </button>
          <span className="dialog__hint">
            or press <span className="keycap">Esc</span>
          </span>
        </div>
      </section>
    </div>
  )
}
