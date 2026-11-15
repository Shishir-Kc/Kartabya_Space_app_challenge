import { useEffect, useState, type CSSProperties } from 'react'
import { QUICK_FACTS } from '../../data/quickFacts'
import { useLoading } from '../../state/loading'

/** The headline, each word blurring in after the one before. */
const WORDS = ['Preparing', 'for', 'launch']
/** The columns the screen leaves in, each rising off the top a moment after the one to its left. */
const STAIRS = 10
/** The screen stays at least this long, so the first fact can be read. */
const MIN_MS = 4000
/** Each fact stays this long before the next (menu.css's fact timer bar matches). */
const FACT_MS = 7000
/** Leaving: everything blurs out, then the stairs rise, the last one ending about here (menu.css matches). */
const LEAVE_MS = 1200

/** The full loading screen shows once a page load; coming back to the menu later only shows the small note. */
let loadedOnce = false

/** The go/no-go poll: each part of the lobby, what it is doing while it loads, and GO once it is in place. */
const POLL = [
  { part: 'astronaut', label: 'Astronaut', busy: 'Suiting up' },
  { part: 'rocket', label: 'Saturn V', busy: 'Fuelling' },
] as const

/**
 * The main menu's loading screen, in the game's colours: deep space with
 * stars and a sunset glow, "Preparing for launch" coming in word by word,
 * a go/no-go poll like a launch's (ASTRONAUT: SUITING UP, SATURN V:
 * FUELLING, each turning to GO once it has loaded), and a quick fact about the Moon, the Sun, NASA or life in space, a new
 * one every 7 seconds (src/data/quickFacts.ts). Once the astronaut is on
 * the podium and the rocket on the pad (and at least 4 s have passed),
 * it fades and rises away in ten stair-step columns from the left,
 * showing the title. Afterwards, while a new body type downloads (the
 * ASTRONAUT tab), a small note shows by the podium instead.
 */
export function LobbyLoading() {
  const astronaut = useLoading((state) => state.astronaut)
  const rocket = useLoading((state) => state.rocket)
  const ready = astronaut && rocket
  const [phase, setPhase] = useState<'loading' | 'leaving' | 'gone'>(() => (loadedOnce ? 'gone' : 'loading'))
  const [shownLongEnough, setShownLongEnough] = useState(false)
  // A different fact each time the game opens, then the next ones in turn.
  const [fact, setFact] = useState(() => Math.floor(Math.random() * QUICK_FACTS.length))

  useEffect(() => {
    if (phase !== 'loading') return
    const timer = window.setTimeout(() => setShownLongEnough(true), MIN_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'loading') return
    const timer = window.setInterval(() => setFact((i) => (i + 1) % QUICK_FACTS.length), FACT_MS)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'loading' || !ready || !shownLongEnough) return
    loadedOnce = true
    setPhase('leaving')
  }, [phase, ready, shownLongEnough])

  useEffect(() => {
    if (phase !== 'leaving') return
    const timer = window.setTimeout(() => setPhase('gone'), LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (phase === 'gone') {
    if (astronaut) return null
    return (
      <p className="loading-note" role="status">
        <span className="loading-note__spinner" aria-hidden="true" />
        Loading your astronaut…
      </p>
    )
  }

  const shown = QUICK_FACTS[fact]!
  return (
    <div className="preloader" data-leaving={phase === 'leaving' ? 'true' : undefined} aria-busy={!ready} style={{ '--n': STAIRS } as CSSProperties}>
      <div className="preloader__stairs" aria-hidden="true">
        {Array.from({ length: STAIRS }, (_, i) => (
          <span key={i} className="preloader__stair" style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="preloader__content">
        <p className="preloader__eyebrow">Lunar Outpost</p>
        <h2 className="preloader__title">
          {WORDS.map((word, i) => (
            <span key={word} className="preloader__word" style={{ '--i': i } as CSSProperties}>
              {word}
            </span>
          ))}
        </h2>
        <ul className="preloader__poll" role="status" aria-live="polite" aria-label="Launch poll">
          {POLL.map(({ part, label, busy }) => {
            const go = part === 'astronaut' ? astronaut : rocket
            return (
              <li key={part} className="preloader__poll-item" data-go={go ? 'true' : undefined}>
                <span className="preloader__poll-label">{label}</span>
                <span className="preloader__poll-state">{go ? 'Go' : busy}</span>
              </li>
            )
          })}
        </ul>
        <figure key={fact} className="preloader__fact">
          <p className="preloader__fact-topic">
            Did you know? <span aria-hidden="true">·</span> {shown.topic}
          </p>
          <p className="preloader__fact-text">{shown.text}</p>
          <figcaption className="preloader__fact-source">Source: {shown.source.label}</figcaption>
          <span className="preloader__fact-timer" aria-hidden="true" />
        </figure>
      </div>
    </div>
  )
}
