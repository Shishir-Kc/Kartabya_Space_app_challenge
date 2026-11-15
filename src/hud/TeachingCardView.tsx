import { useEffect, useMemo, useRef } from 'react'
import { TEACHING_CARD_LINES } from '../data/phase1Lines'
import { emitLine, stopVoice } from '../state/lines'
import { CAST } from '../state/mission'
import { Portrait } from './art/Portrait'
import { useGame } from '../state/store'
import './space.css'

/** A card goes away by itself after this long. */
const SHOW_MS = 16000

/**
 * The teaching card on screen: a small eyebrow, a title, one or two short
 * sentences and any keys. Not modal: play goes on underneath. The cards
 * are map data (see `cards` in src/maps/types.ts).
 */
export function TeachingCardView() {
  const card = useGame((state) => state.card)
  const mode = useGame((state) => state.mode)
  const hide = useGame((state) => state.hideCard)

  // The speaker says the card's title as it appears.
  const shownAt = useMemo(() => performance.now(), [card?.id])

  useEffect(() => {
    if (!card) return
    const timer = window.setTimeout(hide, SHOW_MS)
    return () => window.clearTimeout(timer)
  }, [card, hide])

  // A voiced card (the trainer's, in the launch center) is said once as it first shows; closing it stops the voice.
  const voiced = card ? TEACHING_CARD_LINES[card.id] : undefined
  const visible = !!card && mode === 'playing'
  const said = useRef<string | null>(null)
  useEffect(() => {
    if (!voiced || !visible || said.current === voiced.lineId) return
    said.current = voiced.lineId
    emitLine(voiced)
  }, [voiced, visible])
  useEffect(() => {
    if (!voiced) return
    const lineId = voiced.lineId
    return () => {
      stopVoice(lineId)
      said.current = null
    }
  }, [voiced])

  // Hidden under panels, night cards and the ending (it waits for play to resume).
  if (!card || mode !== 'playing') return null

  return (
    <aside key={card.id} className="float-card glass enter" aria-live="polite" aria-labelledby="teaching-card-title">
      <p className="float-card__eyebrow">
        {card.speakerId && (
          <span className="float-card__face" aria-hidden="true">
            <Portrait speaker={card.speakerId} size={32} emotion="calm" talk={{ text: voiced?.text ?? card.title, since: shownAt, lineId: voiced?.lineId }} />
          </span>
        )}
        {card.speakerId ? `${CAST[card.speakerId].name} · ${CAST[card.speakerId].shortRole}` : card.eyebrow}
      </p>
      <h2 id="teaching-card-title" className="float-card__title">
        {card.title}
      </h2>
      <p className="float-card__body">{card.body}</p>
      {card.keys && card.keys.length > 0 && (
        <p className="float-card__keys">
          {card.keys.map(([key, label]) => (
            <span key={key}>
              <span className="keycap">{key}</span> {label}
            </span>
          ))}
        </p>
      )}
      <button type="button" className="button button--quiet float-card__close" onClick={hide}>
        Got it <span className="keycap">Enter</span>
      </button>
    </aside>
  )
}
