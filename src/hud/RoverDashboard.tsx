import { useEffect, useState } from 'react'
import { homeLine, roverState } from '../scene/rover'
import { useGame } from '../state/store'
import './rover.css'

interface Reading {
  speed: number
  battery: number
  home: number
  headlights: boolean
  boost: number
  boosting: boolean
}

/**
 * The rover's dashboard while driving: speed, the battery with a home line
 * (the charge needed to drive straight back to the outpost from here), the
 * headlights and the boost. Read from the rover ten times a second, outside
 * the store. (The safety officer's warning at the home line is a hologram transmission, src/hud/Transmission.tsx.)
 */
export function RoverDashboard() {
  const driving = useGame((state) => state.driving)
  const mode = useGame((state) => state.mode)
  const view = useGame((state) => state.roverView)
  const [reading, setReading] = useState<Reading | null>(null)

  useEffect(() => {
    if (!driving) return
    const tick = () => {
      const s = roverState()
      if (!s) return
      setReading({
        speed: Math.abs(s.speed),
        battery: s.battery,
        home: Math.min(100, homeLine(s)),
        headlights: s.headlights,
        boost: s.boostLeft / s.def.boost.seconds,
        boosting: s.boosting,
      })
    }
    tick()
    const timer = window.setInterval(tick, 100)
    return () => window.clearInterval(timer)
  }, [driving])

  if (!driving || mode === 'paused' || !reading) return null
  const low = reading.battery <= reading.home

  return (
    <div className="rover-hud">
      <section className="dashboard glass" aria-label="Rover dashboard">
        <div className="dashboard__speed">
          <span className="dashboard__value">{(reading.speed * 3.6).toFixed(0)}</span>
          <span className="dashboard__unit">km/h</span>
        </div>
        <div className="dashboard__battery" data-low={low ? 'true' : 'false'}>
          <div className="dashboard__row">
            <span className="dashboard__label">Battery</span>
            <span className="dashboard__percent">{Math.round(reading.battery)}%</span>
          </div>
          <div className="dashboard__bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(reading.battery)} aria-label="Battery">
            <div className="dashboard__fill" style={{ width: `${reading.battery}%` }} />
            <div className="dashboard__home" style={{ left: `${reading.home}%` }} title="Charge needed to get home" />
          </div>
          <span className="dashboard__hint">{low ? 'Past the home line: head back' : 'Home line: charge to get back'}</span>
        </div>
        <div className="dashboard__status">
          <span className="dashboard__lamp" data-on={reading.headlights ? 'true' : 'false'}>
            Lights
          </span>
          <span className="dashboard__boost" data-on={reading.boosting ? 'true' : 'false'}>
            Boost <span className="dashboard__boost-bar" style={{ width: `${Math.round(reading.boost * 100)}%` }} />
          </span>
        </div>
        <span className="dashboard__keys">
          <span className="keycap">V</span> {view === 'seat' ? 'Chase view' : 'Seat view'}
        </span>
      </section>
    </div>
  )
}
