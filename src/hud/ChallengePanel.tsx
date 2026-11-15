import { useEffect, useMemo, useRef, useState } from 'react'
import { CHALLENGES, getChallenge, type Challenge, type ChoiceChallenge, type CrewLine, type SplitChallenge } from '../data/challenges'
import { newTerms, type Term } from '../data/glossary'
import { referencesFor } from '../data/sources'
import { describeStorm } from '../data/donki'
import { LiveSpaceWeather } from './LiveSpaceWeather'
import { requireMap } from '../maps/registry'
import {
  backOut,
  canCommit,
  changeUnits,
  commitDecision,
  continueChallenge,
  hoverOption,
  pickBucket,
  previewEffects,
  secondsLeft,
  selectOption,
  tickChallenge,
} from '../scene/challenges'
import {
  effectiveEffects,
  ghostMeters,
  lockOf,
  panelLines,
  panelNotes,
  placed,
  splitEffects,
  stormEventOf,
  visibleArrows,
  type Arrow,
  type Change,
} from '../state/decisions'
import { CAST, METER_IDS, METER_LABELS, STATS, type MeterId, type MissionState, type StatId } from '../state/mission'
import { useGame, type ChallengeSession } from '../state/store'
import { currentRadioDelay } from '../state/lines'
import { Picture, SplitItem } from './art/Picture'
import { StatIcon } from './art/StatIcon'
import { Portrait, type Talk } from './art/Portrait'
import { emotionOf } from '../data/emotions'
import './challenge.css'

const SIZE_WORDS = ['', 'a little', 'some', 'a lot'] as const

/** The planned mission's tasks in order (hazards are luck, not tasks). */
function plannedTasks(): number[] {
  return CHALLENGES.filter((item) => item.ready && !item.hazard).map((item) => item.id)
}

/**
 * What an option does, as big meter icons with one to three arrows (green
 * helps, orange hurts, red hurts a lot). No numbers before committing. A "?"
 * shows while the medic rests and can't judge the risk.
 */
function Effects({ arrows }: { arrows: Arrow[] }) {
  if (arrows.length === 0) return <p className="effects effects--none">No change</p>
  return (
    <ul className="effects" aria-label="What this changes">
      {arrows.map((arrow) =>
        arrow.hidden ? (
          <li key={arrow.stat} className="effect" data-hidden="true" aria-label={`${arrow.label}: unknown, the medic is resting`}>
            <StatIcon stat={arrow.stat} />
            <span className="effect__marks" aria-hidden="true">
              ?
            </span>
          </li>
        ) : (
          <li
            key={arrow.stat}
            className="effect"
            data-tone={arrow.tone}
            title={arrow.label}
            aria-label={`${arrow.label} goes ${arrow.direction} ${SIZE_WORDS[arrow.size]}`}
          >
            <StatIcon stat={arrow.stat} />
            <span className="effect__marks" aria-hidden="true">
              {(arrow.direction === 'up' ? '▲' : '▼').repeat(arrow.size)}
            </span>
          </li>
        ),
      )}
    </ul>
  )
}

/**
 * Houston's words arrive after the real signal delay once the crew has left
 * Earth: until then the line shows "Receiving…". Returns the delay (0 for
 * everyone else) and whether the words have arrived.
 */
function useRadioArrival(line: CrewLine): { delay: number; arrived: boolean } {
  const delay = CAST[line.speakerId].radio ? currentRadioDelay() : 0
  const [arrived, setArrived] = useState(delay === 0)
  useEffect(() => {
    if (delay === 0) return
    setArrived(false)
    const timer = window.setTimeout(() => setArrived(true), delay * 1000)
    return () => window.clearTimeout(timer)
  }, [line.lineId, delay])
  return { delay, arrived }
}

/** The line being said, from when its words arrive: drives the portrait's mouth. */
function useTalk(line: CrewLine, arrived: boolean): Talk | null {
  const [since, setSince] = useState<number | null>(null)
  useEffect(() => {
    if (arrived) setSince(performance.now())
    else setSince(null)
  }, [arrived, line.lineId])
  return since === null ? null : { text: line.text, since, lineId: line.lineId }
}

/** The "Signal delay 5.6 s" tag on a radio line from Earth. */
function DelayTag({ delay }: { delay: number }) {
  if (delay === 0) return null
  return <span className="delay-tag">Signal delay {delay} s</span>
}

/** A crew line in the old card style (night cards, the ending, captions use it). */
export function Speaker({ line, compact = false }: { line: CrewLine; compact?: boolean }) {
  const member = CAST[line.speakerId]
  const { delay, arrived } = useRadioArrival(line)
  const talk = useTalk(line, arrived)
  return (
    <figure className="line" data-radio={member.radio ? 'true' : undefined} data-compact={compact ? 'true' : undefined}>
      <span className="line__portrait" aria-hidden="true">
        <Portrait speaker={line.speakerId} radio={member.radio} emotion={emotionOf(line)} talk={talk} />
      </span>
      <figcaption className="line__who">
        <span className="line__name">{member.name}</span>
        <span className="line__role">{member.radio ? `${member.shortRole} · radio from Earth` : member.shortRole}</span>
        <DelayTag delay={delay} />
      </figcaption>
      {arrived ? <blockquote className="line__text">{line.text}</blockquote> : <p className="line__receiving">Receiving…</p>}
    </figure>
  )
}

/** A crew line as a speech bubble from the speaker's portrait, on the left or the right. */
function Bubble({ line, side }: { line: CrewLine; side: 'left' | 'right' | 'center' }) {
  const member = CAST[line.speakerId]
  const { delay, arrived } = useRadioArrival(line)
  const talk = useTalk(line, arrived)
  return (
    <figure className="bubble" data-side={side} data-radio={member.radio ? 'true' : undefined}>
      <span className="bubble__portrait" aria-hidden="true">
        <Portrait speaker={line.speakerId} radio={member.radio} emotion={emotionOf(line)} talk={talk} />
      </span>
      <div className="bubble__body">
        <figcaption className="bubble__who">
          {member.name} <span className="bubble__role">{member.radio ? `${member.shortRole} · radio` : member.shortRole}</span> <DelayTag delay={delay} />
        </figcaption>
        {arrived ? <blockquote className="bubble__text">{line.text}</blockquote> : <p className="bubble__receiving">Receiving…</p>}
      </div>
    </figure>
  )
}

/** The countdown ring of a timed challenge. When it empties, the commander decides. */
function TimerRing({ session, total }: { session: ChallengeSession; total: number }) {
  const [left, setLeft] = useState(() => secondsLeft(session) ?? total)
  useEffect(() => {
    let handle = requestAnimationFrame(function step() {
      setLeft(secondsLeft(useGame.getState().challenge) ?? 0)
      tickChallenge()
      handle = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(handle)
  }, [])
  const fraction = Math.max(0, Math.min(1, left / total))
  const circumference = 2 * Math.PI * 22
  return (
    <div className="timer" data-urgent={left <= 3 ? 'true' : undefined} role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle className="timer__track" cx="26" cy="26" r="22" />
        <circle className="timer__fill" cx="26" cy="26" r="22" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)} />
      </svg>
      <span className="timer__count num">{Math.ceil(left)}</span>
    </div>
  )
}

/** "?" that shows more text on hover, focus, or the ? key. */
function More({ text, open }: { text?: string; open: boolean }) {
  if (!text) return null
  return (
    <span className="more" data-open={open ? 'true' : undefined}>
      <span className="more__button" tabIndex={0} aria-label="More">
        ?
      </span>
      <span className="more__text" role="tooltip">
        {text}
      </span>
    </span>
  )
}

/** The meters inside the panel, with ghost bars showing where the previewed choice takes them. */
function PanelMeters({ mission, session }: { mission: MissionState; session: ChallengeSession }) {
  const preview = useMemo(() => previewEffects(session, mission), [session, mission])
  const ghosts = preview ? ghostMeters(mission, preview) : null
  const food = preview ? Math.max(0, mission.foodDays + (preview.foodDays ?? 0)) : mission.foodDays
  return (
    <div className="panel-meters" aria-label="Meters">
      {METER_IDS.map((id: MeterId) => {
        const value = mission.meters[id]
        const ghost = ghosts ? ghosts[id] : value
        const low = Math.min(value, ghost)
        return (
          <div key={id} className="panel-meter" data-meter={id}>
            <StatIcon stat={id} size={20} />
            <span className="panel-meter__label">{METER_LABELS[id]}</span>
            <span className="panel-meter__track">
              <span className="panel-meter__fill" style={{ width: `${low}%` }} />
              {ghost > value && <span className="panel-meter__ghost panel-meter__ghost--up" style={{ left: `${value}%`, width: `${ghost - value}%` }} />}
              {ghost < value && <span className="panel-meter__ghost panel-meter__ghost--down" style={{ left: `${ghost}%`, width: `${value - ghost}%` }} />}
            </span>
            <span className="panel-meter__value num">{Math.round(value)}</span>
          </div>
        )
      })}
      <div className="panel-meter panel-meter--food" data-meter="foodDays">
        <StatIcon stat="foodDays" size={20} />
        <span className="panel-meter__label">Food</span>
        <span className="panel-meter__value num">
          {mission.foodDays}
          {food !== mission.foodDays && <span className="panel-meter__to"> → {food > mission.foodDays ? '▲' : '▼'}</span>} days
        </span>
      </div>
    </div>
  )
}

function Options({ challenge, session, mission, details }: { challenge: ChoiceChallenge; session: ChallengeSession; mission: MissionState; details: boolean }) {
  return (
    <div className="options" role="radiogroup" aria-label="Options" onMouseLeave={() => hoverOption(null)}>
      {challenge.options.map((option, i) => {
        const selected = session.selected === i
        // A ruled-out option looks like the others until it's picked; then the crew says why not.
        const ruledOut = option.ruledOut !== undefined
        const lock = ruledOut && !selected ? null : lockOf(option, mission)
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={lock ? true : undefined}
            className="option"
            data-selected={selected ? 'true' : undefined}
            data-locked={lock ? 'true' : undefined}
            onMouseEnter={() => hoverOption(i)}
            onFocus={() => hoverOption(i)}
            onClick={() => selectOption(i)}
          >
            <Picture id={option.id} className="option__picture" />
            <span className="option__head">
              <span className="keycap">{i + 1}</span>
              <span className="option__label">{option.label}</span>
              {lock && !ruledOut && (
                <svg className="option__lock" viewBox="0 0 20 20" aria-hidden="true">
                  <rect x="4" y="9" width="12" height="9" rx="2" />
                  <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
                </svg>
              )}
            </span>
            <span className="option__description">
              {option.description} <More text={option.detail} open={details} />
            </span>
            {lock ? (
              <span className="option__locked">
                <span className="option__reason">{ruledOut ? lock.reason : `Locked: ${lock.reason}`}</span>
                {lock.line && selected && <Bubble line={lock.line} side="center" />}
              </span>
            ) : (
              <Effects arrows={visibleArrows(effectiveEffects(challenge, option, mission).effects, mission)} />
            )}
          </button>
        )
      })}
    </div>
  )
}

/** A split as real items: crates loaded on a pallet, power cells plugged into slots. */
function Split({ challenge, session, mission, details }: { challenge: SplitChallenge; session: ChallengeSession; mission: MissionState; details: boolean }) {
  const total = session.total
  const count = placed(session.allocation)
  const effects = splitEffects(challenge, session.allocation)
  const cargo = challenge.unitsFrom === 'cargoBlocks'
  return (
    <div className="split" data-kind={cargo ? 'cargo' : 'power'}>
      <div className="buckets">
        {challenge.buckets.map((bucket, i) => {
          const units = session.allocation[i] ?? 0
          const picked = session.bucket === i
          return (
            <section
              key={bucket.id}
              className="bucket"
              data-picked={picked ? 'true' : undefined}
              aria-label={`${bucket.label}: ${units} of at most ${bucket.max}`}
              onClick={() => pickBucket(i)}
            >
              <Picture id={bucket.id} className="bucket__picture" contain />
              <header className="bucket__head">
                <span className="keycap">{i + 1}</span>
                <span className="bucket__label">{bucket.label}</span>
              </header>
              <p className="bucket__description">
                {bucket.description} <More text={bucket.detail} open={details} />
              </p>
              <div className="bucket__slots" aria-hidden="true">
                {Array.from({ length: bucket.max }, (_, n) => (
                  <SplitItem key={n} bucketId={bucket.id} filled={n < units} />
                ))}
              </div>
              <div className="bucket__controls">
                <button
                  type="button"
                  className="bucket__button"
                  aria-label={`One less ${bucket.label}`}
                  disabled={units <= bucket.min}
                  onClick={(event) => {
                    event.stopPropagation()
                    changeUnits(-1, i)
                  }}
                >
                  −
                </button>
                <span className="bucket__count num">{units}</span>
                <button
                  type="button"
                  className="bucket__button"
                  aria-label={`One more ${bucket.label}`}
                  disabled={units >= bucket.max || count >= total}
                  onClick={(event) => {
                    event.stopPropagation()
                    changeUnits(1, i)
                  }}
                >
                  +
                </button>
              </div>
            </section>
          )
        })}
      </div>
      <div className="split__summary">
        <p className="split__count" data-complete={count === total ? 'true' : undefined} aria-live="polite">
          <span className="num">{count}</span> of <span className="num">{total}</span> {challenge.unitLabel} {cargo ? 'loaded' : 'plugged in'}
        </p>
        <Effects arrows={visibleArrows(effects, mission)} />
      </div>
    </div>
  )
}

/** Science words met for the first time on this run, explained in one sentence each. */
function NewWords({ terms }: { terms: Term[] }) {
  if (terms.length === 0) return null
  return (
    <aside className="new-words" aria-label="New words">
      {terms.map((term) => (
        <p key={term.id} className="new-words__item">
          <strong>{term.word}:</strong> {term.explain}
        </p>
      ))}
    </aside>
  )
}

/** Every text on the panel a new word could be in. */
function panelTexts(challenge: Challenge, mission: MissionState): string[] {
  const options =
    challenge.kind === 'choice'
      ? challenge.options.flatMap((option) => [option.label, option.description])
      : challenge.buckets.flatMap((bucket) => [bucket.label, bucket.description])
  const lines = panelLines(challenge, mission)
  // A radio line from Earth with a delay brings up "signal delay" the first time.
  const delayed = currentRadioDelay() > 0 && lines.some((line) => CAST[line.speakerId].radio) ? ['signal delay'] : []
  return [challenge.situation, ...lines.map((line) => line.text), ...options, ...delayed]
}

/** One exact change as a big tile: the meter's icon and "−10". */
function ChangeTile({ change }: { change: Change }) {
  const stat = change.stat.startsWith('health:') ? 'crewHealth' : (change.stat as StatId)
  const amount = typeof change.amount === 'number' ? `${change.amount > 0 ? '+' : '−'}${Math.abs(change.amount)}` : change.amount
  const label = typeof change.amount === 'string' ? change.label : STATS[stat]?.label ?? change.label
  return (
    <li className="change-tile" data-tone={change.tone}>
      <StatIcon stat={stat} size={28} />
      <span className="change-tile__amount num">{amount}</span>
      <span className="change-tile__label">{label}</span>
    </li>
  )
}

function Result({ session, challenge }: { session: ChallengeSession; challenge: Challenge }) {
  const continueRef = useRef<HTMLButtonElement>(null)
  useEffect(() => continueRef.current?.focus({ preventScroll: true }), [])
  const outcome = session.outcome
  if (!outcome) return null
  const reference = referencesFor(outcome.sourceIds)[0]
  const pictureId = challenge.kind === 'choice' ? outcome.outcomeId : `c${String(challenge.id).padStart(2, '0')}`
  const label = challenge.kind === 'choice' ? challenge.options.find((option) => option.id === outcome.outcomeId)?.label : 'Your split'
  return (
    <div className="result">
      <div className="result__hero">
        <Picture id={pictureId} className="result__picture" />
        <div className="result__summary">
          <p className="result__choice">{label}</p>
          <ul className="change-tiles" aria-label="What changed">
            {outcome.changes.length === 0 && <li className="change-tile">Nothing on the meters changed</li>}
            {outcome.changes.map((change) => (
              <ChangeTile key={change.stat} change={change} />
            ))}
          </ul>
          <div className="result__text">
            {outcome.result.map((sentence, i) => (
              <p key={i} data-timeout={outcome.timedOut && i === 0 ? 'true' : undefined}>
                {sentence}
              </p>
            ))}
          </div>
        </div>
      </div>
      {outcome.lines.length > 0 && (
        <div className="bubbles">
          {outcome.lines.map((line, i) => (
            <Bubble key={line.lineId} line={line} side={i % 2 === 0 ? 'left' : 'right'} />
          ))}
        </div>
      )}
      {challenge.storm && <LiveSpaceWeather compact />}
      {reference ? (
        <p className="result__real">
          <span className="result__real-label">In real life</span> {reference.fact}{' '}
          <a href={reference.url} target="_blank" rel="noreferrer">
            {reference.publisher}
          </a>
        </p>
      ) : (
        <p className="result__real">Source: coming soon</p>
      )}
      <div className="challenge__actions">
        <button ref={continueRef} type="button" className="button button--primary button--big" onClick={continueChallenge}>
          Continue <span className="keycap">Enter</span>
        </button>
      </div>
    </div>
  )
}

/**
 * The decision panel: a big visual screen over the dimmed game. A header
 * picture, the situation in one sentence, the two crew lines as speech
 * bubbles from either side, three option cards each with its own picture
 * and meter icons (or a split of real items), and the meters with ghost
 * bars. Works with the mouse or the keyboard alone: 1 2 3, Enter, Esc, and
 * ? for more text; in a split, the arrows or numbers and + and −. The keys
 * are handled in src/scene/challenges.ts.
 */
export function ChallengePanel() {
  const session = useGame((state) => state.challenge)
  const mission = useGame((state) => state.mission)
  const seenTerms = useGame((state) => state.seenTerms)
  const dialogRef = useRef<HTMLElement>(null)
  const [details, setDetails] = useState(false)
  const id = session?.id ?? null
  useEffect(() => {
    if (id !== null) dialogRef.current?.focus({ preventScroll: true })
    setDetails(false)
  }, [id])
  // ? (Shift + /) shows every "more" text at once.
  useEffect(() => {
    if (id === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Slash') setDetails((open) => !open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id])

  const challenge = session ? getChallenge(session.id) : undefined
  const terms = challenge && session?.stage === 'choose' ? newTerms(panelTexts(challenge, mission), seenTerms) : []
  const termIds = terms.map((term) => term.id).join(',')
  // Once the player has decided, the words shown count as explained.
  const stage = session?.stage
  const shownTerms = useRef<string[]>([])
  useEffect(() => {
    if (stage === 'choose' && termIds) shownTerms.current = termIds.split(',')
    if (stage !== 'choose' && shownTerms.current.length) {
      useGame.getState().markTerms(shownTerms.current)
      shownTerms.current = []
    }
  }, [stage, termIds])

  if (!session || !challenge) return null
  const timed = challenge.timerSeconds !== undefined
  const choosing = session.stage === 'choose'
  const ready = canCommit(session, mission)
  const lines = panelLines(challenge, mission)
  // The radio (Houston's extra line) goes across the top; the two that argue face each other.
  const main = lines.slice(-2)
  const extra = lines.slice(0, -2)

  return (
    <div className="challenge-layer">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="challenge glass enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="challenge-title"
        data-stage={session.stage}
      >
        <header className="challenge__head">
          <Picture id={`c${String(challenge.id).padStart(2, '0')}`} className="challenge__picture" />
          <div className="challenge__heading">
            <p className="dialog__eyebrow">
              {challenge.hazard ? (
                <>Luck · a hazard nobody planned · {requireMap(challenge.map).name}</>
              ) : (
                <>
                  Task <span className="num">{plannedTasks().indexOf(challenge.id) + 1}</span> of <span className="num">{plannedTasks().length}</span> ·{' '}
                  {requireMap(challenge.map).name}
                </>
              )}
            </p>
            <h2 id="challenge-title" className="challenge__title">
              {challenge.title}
            </h2>
            <p className="challenge__situation">
              {challenge.situation} <More text={challenge.detail} open={details} />
            </p>
            {challenge.storm && (
              <p className="challenge__event">
                {describeStorm(stormEventOf(challenge, mission))}{' '}
                <span className="challenge__event-source">Source: NASA DONKI (archived data)</span>
              </p>
            )}
            {choosing &&
              panelNotes(challenge, mission).map((note) => (
                <p key={note} className="challenge__note">
                  {note}
                </p>
              ))}
          </div>
          {choosing && timed && session.deadline !== null && <TimerRing session={session} total={challenge.timerSeconds ?? 10} />}
        </header>

        {choosing ? (
          <>
            {extra.length > 0 && (
              <div className="bubbles bubbles--radio">
                {extra.map((line) => (
                  <Bubble key={line.lineId} line={line} side="center" />
                ))}
              </div>
            )}
            <div className="bubbles">
              {main.map((line, i) => (
                <Bubble key={line.lineId} line={line} side={i === 0 ? 'left' : 'right'} />
              ))}
            </div>
            <NewWords terms={terms} />
            {challenge.kind === 'choice' ? (
              <Options challenge={challenge} session={session} mission={mission} details={details} />
            ) : (
              <Split challenge={challenge} session={session} mission={mission} details={details} />
            )}
            <div className="challenge__footer">
              <PanelMeters mission={mission} session={session} />
              <div className="challenge__actions">
                {timed || challenge.hazard ? (
                  <span className="dialog__hint challenge__no-escape">{timed ? 'No going back: time is running' : 'It already happened: decide what to do'}</span>
                ) : (
                  <button type="button" className="button button--quiet" onClick={backOut}>
                    Not yet <span className="keycap">Esc</span>
                  </button>
                )}
                <button type="button" className="button button--primary button--big" disabled={!ready} onClick={commitDecision}>
                  Commit <span className="keycap">Enter</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <Result session={session} challenge={challenge} />
        )}
      </section>
    </div>
  )
}
