import { useEffect, useState } from 'react'
import { EMOTIONS } from '../data/emotions'
import { CAST, type SpeakerId } from '../state/mission'
import { Portrait } from './art/Portrait'

const SPEAKERS: SpeakerId[] = ['commander', 'safety', 'science', 'comms', 'trainer']

/**
 * Dev builds only (`?portraits`): every speaker with every expression, all
 * talking, for checking the faces and taking screenshots.
 */
export function PortraitGallery() {
  const [since, setSince] = useState(() => performance.now())
  useEffect(() => {
    const timer = window.setInterval(() => setSince(performance.now()), 4000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto', padding: 24, background: '#0c111c', color: '#e8ecf6', fontFamily: 'Inter, sans-serif' }}>
      <table style={{ borderSpacing: 12 }}>
        <thead>
          <tr>
            <th />
            {EMOTIONS.map((e) => (
              <th key={e} style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SPEAKERS.map((id) => (
            <tr key={id}>
              <th style={{ textAlign: 'right', fontSize: 14 }}>{CAST[id].name}</th>
              {EMOTIONS.map((e) => (
                <td key={e}>
                  <Portrait speaker={id} emotion={e} size={120} radio={CAST[id].radio} talk={{ text: 'One two three four five six seven eight!', since }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
