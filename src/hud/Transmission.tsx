import { useEffect, useState } from 'react'
import { emotionOf } from '../data/emotions'
import { finishTransmission, READ_SECONDS_PER_WORD, setTransmissionHost, useTransmissions, type Transmission as Message } from '../state/transmissions'
import { CAST } from '../state/mission'
import { useGame } from '../state/store'
import { Portrait } from './art/Portrait'
import './transmission.css'

/**
 * A message to the player outside a decision panel, big and hard to miss:
 * a large talking portrait beside the words, which appear one by one as they
 * are spoken. Four looks:
 *
 * - in person (the speaker is in the room): a plain panel;
 * - radio (Houston): signal bars, "Receiving… Signal delay 5.6 s" first;
 * - hologram (the rover, crew elsewhere): cyan, scanlines, a soft glow and a
 *   flicker as it opens;
 * - alert (a storm or a meteoroid): a red pulsing border and a big headline
 *   above the speaker.
 *
 * Upper part of the screen, clear of the crosshair and the interact prompt;
 * hidden while a panel is open. Enter closes it early.
 */
export function Transmission() {
  const current = useTransmissions((s) => s.current)
  const mode = useGame((s) => s.mode)
  const covered = useGame((s) => !!(s.challenge || s.night || s.afterword))

  useEffect(() => {
    setTransmissionHost(true)
    return () => setTransmissionHost(false)
  }, [])

  useEffect(() => {
    if (!current) return
    // Captures Enter first, so it closes the message before anything else (a story beat's Skip) sees it.
    const onKey = (event: KeyboardEvent) => {
      if ((event.code !== 'Enter' && event.code !== 'NumpadEnter') || useGame.getState().mode !== 'playing') return
      if (useGame.getState().card) return
      event.preventDefault()
      event.stopImmediatePropagation()
      finishTransmission()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [current])

  if (!current || covered || mode === 'paused') return null
  return <TransmissionPanel key={current.id} message={current} />
}

function TransmissionPanel({ message }: { message: Message }) {
  const { line, style, delay } = message
  const member = CAST[line.speakerId]
  const words = line.text.split(/\s+/).filter(Boolean)
  const wordsStart = message.shownAt + delay * 1000
  const [shown, setShown] = useState(0)
  const [arrived, setArrived] = useState(delay === 0)

  useEffect(() => {
    let frame = 0
    const step = () => {
      const now = performance.now()
      setArrived(now >= wordsStart)
      setShown(Math.max(0, Math.min(words.length, Math.floor((now - wordsStart) / (READ_SECONDS_PER_WORD * 1000)) + 1)))
      if (now < wordsStart + words.length * READ_SECONDS_PER_WORD * 1000) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [wordsStart, words.length])

  const emotion = emotionOf(line)
  return (
    <aside className="transmission" data-style={style} role="status" aria-live="assertive" aria-label={`${member.name}: ${line.text}`}>
      {style === 'alert' && message.headline && <p className="transmission__headline">{message.headline}</p>}
      <div className="transmission__body">
        <span className="transmission__portrait" aria-hidden="true">
          <Portrait speaker={line.speakerId} radio={member.radio} emotion={emotion} size={220} talk={arrived ? { text: line.text, since: wordsStart, lineId: line.lineId } : null} />
        </span>
        <div className="transmission__words">
          <p className="transmission__who">
            {style === 'radio' && <SignalBars />}
            <span className="transmission__name">{member.name}</span>
            <span className="transmission__role">{style === 'radio' ? `${member.shortRole} · radio from Earth` : style === 'hologram' ? `${member.shortRole} · hologram` : style === 'in-person' ? `${member.shortRole} · here with you` : member.shortRole}</span>
          </p>
          {!arrived ? (
            <p className="transmission__receiving">
              Receiving… <span className="transmission__delay">Signal delay {delay} s</span>
            </p>
          ) : (
            <p className="transmission__text">
              {words.map((word, i) => (
                <span key={i} className="transmission__word" data-shown={i < shown ? 'true' : undefined}>
                  {word}{' '}
                </span>
              ))}
            </p>
          )}
          <p className="transmission__hint">
            <span className="keycap">Enter</span> close
          </p>
        </div>
      </div>
    </aside>
  )
}

function SignalBars() {
  return (
    <span className="signal" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="signal__bar" style={{ height: `${6 + i * 4}px`, animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  )
}
