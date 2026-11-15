import { useEffect, useMemo, useRef } from 'react'
import { ENDINGS } from '../data/endings'
import { formatChange } from '../state/decisions'
import { CAST } from '../state/mission'
import { useGame } from '../state/store'
import { closeNight, closingLine, openDebrief, stormTick } from '../scene/run'
import { Speaker } from './ChallengePanel'
import { nightLine } from '../scene/story'
import { emitLine } from '../state/lines'
import './run.css'

/** The morning card after a night at the outpost: what changed overnight, and why. */
export function NightCard() {
  const night = useGame((state) => state.night)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // A crew member says one line about the day (in turn), voiced like any other.
  const crewLine = useMemo(() => (night ? nightLine(night.day) : null), [night])
  useEffect(() => {
    if (night) buttonRef.current?.focus()
  }, [night])
  useEffect(() => {
    if (crewLine) emitLine(crewLine)
  }, [crewLine])
  if (!night) return null
  return (
    <div className="run-layer">
      <section className="run-card glass enter" role="dialog" aria-modal="true" aria-labelledby="night-title">
        <p className="dialog__eyebrow">{night.lunarNight ? 'The long lunar night' : 'Night falls…'}</p>
        <h2 id="night-title" className="run-card__title">
          Day <span className="num">{night.day}</span>
        </h2>
        {night.changes.length > 0 && (
          <ul className="changes" aria-label="What changed overnight">
            {night.changes.map((change) => (
              <li key={change.stat} className="change" data-tone={change.tone}>
                {formatChange(change)}
              </li>
            ))}
          </ul>
        )}
        <div className="result__text">
          {night.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
        <div className="lines">
          {night.lines.map((line) => (
            <Speaker key={line.lineId} line={line} />
          ))}
          {crewLine && <Speaker key={crewLine.lineId} line={crewLine} />}
        </div>
        <div className="challenge__actions">
          <button ref={buttonRef} type="button" className="button button--primary" onClick={closeNight}>
            Continue
          </button>
          <span className="dialog__hint">
            or press <span className="keycap">Enter</span>
          </span>
        </div>
      </section>
    </div>
  )
}

/** The ending: one of four, closing with a line from whoever's advice was followed most. */
export function EndingCard() {
  const afterword = useGame((state) => state.afterword)
  const mission = useGame((state) => state.mission)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (afterword === 'ending') buttonRef.current?.focus()
  }, [afterword])
  if (afterword !== 'ending' || !mission.ending) return null
  const ending = ENDINGS[mission.ending]
  const line = closingLine(mission)
  return (
    <div className="run-layer run-layer--ending" data-good={ending.good ? 'true' : undefined}>
      <section className="run-card run-card--ending glass enter" role="dialog" aria-modal="true" aria-labelledby="ending-title">
        <p className="dialog__eyebrow">
          Mission over · Day <span className="num">{mission.day}</span>
        </p>
        <h2 id="ending-title" className="run-card__title run-card__title--big">
          {ending.title}
        </h2>
        <p className="run-card__text">{ending.text}</p>
        <p className="run-card__followed">You followed {CAST[line.speakerId].name}’s advice most.</p>
        <Speaker line={line} />
        <div className="challenge__actions">
          <button ref={buttonRef} type="button" className="button button--primary" onClick={openDebrief}>
            Open your Mission Handbook
          </button>
          <span className="dialog__hint">
            or press <span className="keycap">Enter</span>
          </span>
        </div>
      </section>
    </div>
  )
}

/** The storm alarm: the screen pulses red until the storm's panel is closed. */
export function AlarmOverlay() {
  const alarm = useGame((state) => state.alarm)
  return alarm ? <div className="alarm" aria-hidden="true" /> : null
}

/** Runs the storm clock four times a second (no rendering). */
export function StormDirector() {
  useEffect(() => {
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      stormTick((now - last) / 1000, now)
      last = now
    }, 250)
    return () => window.clearInterval(timer)
  }, [])
  return null
}
