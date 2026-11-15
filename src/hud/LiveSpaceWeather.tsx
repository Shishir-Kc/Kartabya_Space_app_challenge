import { useEffect, useState } from 'react'
import { describeSpaceWeather, getSpaceWeather, type SpaceWeather } from '../data/spaceWeather'
import './live.css'

type Status = { kind: 'loading' } | { kind: 'live'; weather: SpaceWeather } | { kind: 'offline' }

function when(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * The real Sun right now, from NASA DONKI (live), so a player can link the
 * storm in the game to real space weather. Says plainly when it's live and
 * when it can't be reached; the game never depends on it.
 */
export function LiveSpaceWeather({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  useEffect(() => {
    let cancelled = false
    void getSpaceWeather().then((weather) => {
      if (!cancelled) setStatus(weather ? { kind: 'live', weather } : { kind: 'offline' })
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (status.kind === 'loading') return <p className="live-weather live-weather--quiet">Asking NASA about the Sun right now…</p>
  if (status.kind === 'offline') {
    return compact ? null : (
      <p className="live-weather live-weather--quiet">
        Can’t reach NASA right now, so there’s no live space weather. The storms in the game are real archived events either way.
      </p>
    )
  }
  const { weather } = status
  return (
    <div className="live-weather" aria-live="polite">
      <p className="live-weather__label">
        <span className="live-weather__dot" aria-hidden="true" /> Live: the real Sun, {weather.from} to {weather.to}
      </p>
      {describeSpaceWeather(weather).map((sentence) => (
        <p key={sentence} className="live-weather__text">
          {sentence}
        </p>
      ))}
      {!compact && weather.maxKp !== null && (
        <p className="live-weather__text">
          The strongest storm at Earth reached Kp {weather.maxKp} on a scale from 0 to 9.
        </p>
      )}
      <p className="live-weather__source">
        Source:{' '}
        <a href="https://ccmc.gsfc.nasa.gov/tools/DONKI/" target="_blank" rel="noreferrer">
          NASA DONKI
        </a>{' '}
        through api.nasa.gov, fetched {when(weather.fetchedAt)}.
      </p>
    </div>
  )
}
