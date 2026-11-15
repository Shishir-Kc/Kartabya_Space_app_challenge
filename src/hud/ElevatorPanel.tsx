import { useEffect, useState } from 'react'
import { elevatorState } from '../scene/elevatorLogic'
import { useGame } from '../state/store'
import './elevator.css'

/** What the panel shows, read from the car's state a few times a second. */
interface Reading {
  stop: number
  target: number | null
  moving: boolean
  /** Going up (true) or down (false) while moving. */
  up: boolean
  doors: 'open' | 'opening' | 'closing' | 'closed'
}

function read(id: string): Reading | null {
  const state = elevatorState(id)
  if (!state) return null
  const moving = state.phase === 'moving'
  return {
    stop: state.stop,
    target: state.target,
    moving,
    up: moving && state.toY > state.fromY,
    doors: moving ? 'closed' : (state.phase as Reading['doors']),
  }
}

const same = (a: Reading | null, b: Reading | null) =>
  a === b || (!!a && !!b && a.stop === b.stop && a.target === b.target && a.moving === b.moving && a.up === b.up && a.doors === b.doors)

/**
 * The panel of the elevator car the player is standing in, on screen while
 * they are inside: the floor indicator, one round light per stop with its
 * number key, and the door keys. It is a display only: it takes no clicks
 * and never takes focus, so the mouse stays captured for looking round and
 * every key reaches the game (1 and 2 pick a floor, O and C work the doors).
 */
export function ElevatorPanel() {
  const id = useGame((state) => state.elevatorPanel)
  const playing = useGame((state) => state.mode === 'playing')
  const [reading, setReading] = useState<Reading | null>(null)

  useEffect(() => {
    if (!id) return
    setReading(read(id))
    const timer = window.setInterval(() => setReading((previous) => {
      const next = read(id)
      return same(previous, next) ? previous : next
    }), 100)
    return () => window.clearInterval(timer)
  }, [id])

  const state = id ? elevatorState(id) : undefined
  if (!id || !playing || !state || !reading) return null
  const stops = state.def.stops
  const here = stops[reading.stop]
  const going = reading.target !== null ? stops[reading.target] : null
  const name = state.def.label.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

  return (
    <section className="lift glass enter" aria-label={`${name} panel`}>
      <p className="lift__name">{name}</p>
      <div className="lift__display" role="status" aria-live="polite">
        <span className="lift__arrow" data-dir={reading.moving ? (reading.up ? 'up' : 'down') : 'none'} aria-hidden="true">
          {reading.moving ? (reading.up ? '▲' : '▼') : '◆'}
        </span>
        <span className="lift__floor num">{reading.stop + 1}</span>
        <span className="lift__where">
          {reading.moving && going ? `Going to ${going.label}` : here?.label}
        </span>
      </div>

      <div className="lift__buttons">
        {stops.map((stop, index) => {
          const current = !reading.moving && index === reading.stop
          const lit = current || index === reading.target
          return (
            <div key={stop.level} className="lift__button" data-lit={lit ? 'true' : undefined} data-current={current ? 'true' : undefined}>
              <span className="lift__key num">{index + 1}</span>
              <span className="lift__label">{stop.label}</span>
              {current && <span className="lift__here">You are here</span>}
            </div>
          )
        })}
      </div>

      <div className="lift__doors">
        <div className="lift__door" data-on={reading.doors === 'open' || reading.doors === 'opening' ? 'true' : undefined}>
          <span className="keycap">O</span>
          <span>
            <span className="lift__door-icon" aria-hidden="true">
              {'\u25C0\u2002\u25B6'}
            </span>
            Open doors
          </span>
        </div>
        <div className="lift__door" data-on={reading.doors === 'closed' || reading.doors === 'closing' ? 'true' : undefined}>
          <span className="keycap">C</span>
          <span>
            <span className="lift__door-icon" aria-hidden="true">
              {'\u25B6\u2002\u25C0'}
            </span>
            Close doors
          </span>
        </div>
      </div>

      <p className="lift__hint">Press 1 or 2 to choose a floor. O open doors, C close doors.</p>
    </section>
  )
}
