import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ENDINGS } from '../data/endings'
import { getReference } from '../data/sources'
import { doseToMsv, formatMsv, REAL } from '../data/science'
import { backToMenu, closingLine, tryAgain } from '../scene/run'
import { Speaker } from './ChallengePanel'
import type { Metric } from '../state/handbook'
import { betterPages, mainReason, meterPages, missionStory, realPages, summary } from '../state/handbookStory'
import { HAZARD_LABEL } from '../state/hazards'
import { CAST, DOSE_THRESHOLDS, type MissionState, type Snapshot, type SpeakerId, type StatId } from '../state/mission'
import { reducedMotion, useSettings } from '../state/settings'
import { useGame } from '../state/store'
import { Picture } from './art/Picture'
import { Portrait } from './art/Portrait'
import { NAMED_IN_HONOUR } from '../data/namedInHonour'
import { StatIcon } from './art/StatIcon'
import { HandbookGuide } from './HandbookGuide'
import { Callout, CardHead, ContinuedHeader, DayHeader, EventCard, LinkChip, PageFooter, PageHeader, Row, StatTile, Tag, VerdictBadge } from './HandbookParts'
import { LiveSpaceWeather } from './LiveSpaceWeather'
import { paginate } from './paginate'
import './handbook.css'

type SectionId = 'cover' | 'meters' | 'log' | 'better' | 'real' | 'summary'

const SECTIONS: readonly { id: Exclude<SectionId, 'cover'>; label: string; icon: StatId; title: string; intro: string }[] = [
  { id: 'meters', label: 'Meters over time', icon: 'power', title: 'How your meters changed', intro: 'Each meter, where it ended, and what moved it.' },
  { id: 'log', label: 'Mission log', icon: 'cargoBlocks', title: 'Your mission, day by day', intro: 'Every choice and every storm, in the order they happened.' },
  { id: 'better', label: 'Better choices', icon: 'crewHealth', title: 'Better choices', intro: 'We replayed your mission to test each choice.' },
  { id: 'real', label: 'Real life', icon: 'shielding', title: 'It really happens', intro: 'Your mission is based on real space science.' },
  { id: 'summary', label: 'Summary', icon: 'harvestDays', title: 'How your mission went', intro: 'The ending, the main reason, and one tip.' },
]

/** One piece of a page. Pages are filled with blocks until full; a block never splits. */
interface Block {
  key: string
  section: Exclude<SectionId, 'cover'>
  node: ReactNode
  /** Keep on the same page as the next block (a day header and its first card). */
  keepWithNext?: boolean
  /** Cards inside, for link chips to jump to. */
  anchors?: string[]
  /** Grows to fill what its page has left (a meter's chart gets taller). */
  grow?: boolean
  /** Gets a page of its own (a meter and its chart). */
  alone?: boolean
}

// ---------- Charts ----------

const CHARTS: Record<Metric, { color: string; zones: [number, number]; reverse?: boolean }> = {
  power: { color: 'var(--color-power)', zones: [15, 30] },
  lifeSupport: { color: 'var(--color-life-support)', zones: [15, 30] },
  shielding: { color: 'var(--color-shielding)', zones: [15, 30] },
  foodDays: { color: 'var(--color-food)', zones: [2, 4] },
  dose: { color: 'var(--color-critical)', zones: [doseToMsv(DOSE_THRESHOLDS.moderate), doseToMsv(DOSE_THRESHOLDS.high)], reverse: true },
}

const PAD = { left: 40, right: 12, top: 14, bottom: 26 }

/** A box's size in pixels, kept up to date. */
function useBoxSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 520, h: 170 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setSize((old) => {
      const w = Math.max(200, Math.round(el.clientWidth))
      const h = Math.max(120, Math.round(el.clientHeight))
      return old.w === w && old.h === h ? old : { w, h }
    })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size]
}

function value(s: Snapshot, metric: Metric): number {
  return metric === 'dose' ? doseToMsv(s.dose) : s[metric]
}

/**
 * One meter over the run: safe, warning and danger zones (and NASA's limits
 * on the dose chart), numbered dots for decisions, suns and rocks for luck.
 */
function Chart({ mission, metric, title }: { mission: MissionState; metric: Metric; title: string }) {
  const [box, { w: W, h: H }] = useBoxSize<HTMLDivElement>()
  return (
    <div ref={box} className="hb-chart">
      <ChartSvg mission={mission} metric={metric} title={title} W={W} H={H} />
    </div>
  )
}

function ChartSvg({ mission, metric, title, W, H }: { mission: MissionState; metric: Metric; title: string; W: number; H: number }) {
  const spec = CHARTS[metric]
  const log = mission.log
  const values = log.map((s) => value(s, metric))
  const max = metric === 'dose' ? Math.max(300, ...values.map((v) => v * 1.2)) : metric === 'foodDays' ? Math.max(20, ...values) : 100
  const x = (i: number) => PAD.left + (log.length < 2 ? 0 : (i / (log.length - 1)) * (W - PAD.left - PAD.right))
  const y = (v: number) => PAD.top + (1 - Math.min(v, max) / max) * (H - PAD.top - PAD.bottom)
  const [low, mid] = spec.zones
  const zone = (from: number, to: number, kind: string) => <rect className="chart__zone" data-zone={kind} x={PAD.left} width={W - PAD.left - PAD.right} y={y(to)} height={Math.max(0, y(from) - y(to))} />
  let decisionNo = 0
  return (
    <svg className="chart__plot" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} over the mission, from ${Math.round(values[0] ?? 0)} to ${Math.round(values.at(-1) ?? 0)}`}>
      {spec.reverse ? (
        <>
          {zone(0, low, 'safe')}
          {zone(low, mid, 'warning')}
          {zone(mid, max, 'danger')}
        </>
      ) : (
        <>
          {zone(0, low, 'danger')}
          {zone(low, mid, 'warning')}
          {zone(mid, max, 'safe')}
        </>
      )}
      {metric === 'dose' &&
        [REAL.solarEventLimitMsv]
          .filter((limit) => limit <= max)
          .map((limit) => (
            <g key={limit}>
              <line className="chart__limit" x1={PAD.left} x2={W - PAD.right} y1={y(limit)} y2={y(limit)} />
              <text className="chart__limit-label" x={W - PAD.right - 4} y={y(limit) - 4}>
                NASA limit for one storm: {limit} mSv
              </text>
            </g>
          ))}
      {[0, max / 2, max].map((tick) => (
        <text key={tick} className="chart__tick" x={PAD.left - 6} y={y(tick) + 4}>
          {Math.round(tick)}
        </text>
      ))}
      <polyline className="chart__line" style={{ stroke: spec.color }} points={values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
      {log.map((s, i) => {
        if (s.hazard) {
          return (
            <g key={i} className="chart__hazard" transform={`translate(${x(i)} ${H - 12})`}>
              <title>{HAZARD_LABEL[s.hazard]}</title>
              <circle r={9} />
              <text y={4}>{s.hazard === 'meteoroid' ? '☄' : '☀'}</text>
            </g>
          )
        }
        if (s.challenge) {
          decisionNo++
          return (
            <g key={i} className="chart__decision" transform={`translate(${x(i)} ${y(values[i] ?? 0)})`}>
              <title>{s.label}</title>
              <circle r={8} />
              <text y={3.5}>{decisionNo}</text>
            </g>
          )
        }
        return null
      })}
    </svg>
  )
}

// ---------- The blocks of each section ----------

const ICON: Record<Metric, StatId> = { power: 'power', lifeSupport: 'lifeSupport', shielding: 'shielding', foodDays: 'foodDays', dose: 'dose' }

function buildBlocks(mission: MissionState, player: string, go: (cardId: string) => void): Block[] {
  const story = missionStory(mission, player)
  const blocks: Block[] = []
  const header = (section: (typeof SECTIONS)[number]) => blocks.push({ key: `${section.id}-header`, section: section.id, node: <PageHeader icon={section.icon} title={section.title} intro={section.intro} section={section.id} />, keepWithNext: true })
  const [metersS, logS, betterS, realS, summaryS] = SECTIONS

  // Meters over time.
  header(metersS!)
  const rad = getReference('rad-brief')
  blocks.push({
    key: 'meters-key',
    section: 'meters',
    node: (
      <article className="hb-card hb-key">
        <h4 className="hb-card-title">How to read the charts</h4>
        <ul className="hb-key__list">
          <li className="hb-body">
            <span className="hb-key__swatch" data-zone="safe" /> Green means safe.
          </li>
          <li className="hb-body">
            <span className="hb-key__swatch" data-zone="warning" /> Orange means watch out.
          </li>
          <li className="hb-body">
            <span className="hb-key__swatch" data-zone="danger" /> Red means danger.
          </li>
          <li className="hb-body">
            <span className="hb-key__dot">1</span> A numbered dot is one of your choices.
          </li>
          <li className="hb-body">
            <span className="hb-key__dot" data-luck="true">☀</span> A sun or a rock is luck: a storm or a space rock.
          </li>
        </ul>
      </article>
    ),
  })
  blocks.push({
    key: 'meters-fact',
    section: 'meters',
    node: (
      <Callout kind="fact" source={rad ? { label: rad.publisher, url: rad.url } : undefined}>
        NASA keeps one storm’s dose under {REAL.solarEventLimitMsv} mSv. A whole career must stay under {REAL.careerLimitMsv} mSv.
      </Callout>
    ),
  })
  for (const page of meterPages(mission, story)) {
    blocks.push({
      key: `meter-${page.metric}`,
      section: 'meters',
      grow: true,
      alone: true,
      node: (
        <article className="hb-card hb-meter">
          <div className="hb-meter__head">
            <StatIcon stat={ICON[page.metric]} size={26} />
            <h3 className="hb-section">{page.title}</h3>
            <StatTile value={page.end} label={page.endLabel} icon={ICON[page.metric]} />
          </div>
          <Row label="What this meter means">{page.meaning}</Row>
          <Chart mission={mission} metric={page.metric} title={page.title} />
          <div className="hb-reasons">
            <span className="hb-label">What made it go up or down</span>
            {page.steady ? (
              <p className="hb-body">{page.steady}</p>
            ) : (
              <ul className="hb-reasons__list">
                {page.reasons.map((r) => (
                  <li key={r.when + r.what + r.change} className="hb-body" data-tone={r.tone}>
                    <strong>{r.when}:</strong> {r.what} <span className="num hb-reasons__change">{r.change}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      ),
    })
  }

  // Mission log, by day.
  header(logS!)
  for (const day of story) {
    blocks.push({ key: `day-${day.id}`, section: 'log', node: <DayHeader day={day} />, keepWithNext: true })
    for (const card of day.cards) {
      blocks.push({
        key: card.id,
        section: 'log',
        node: <EventCard card={card} onGo={go} compact={day.quiet} />,
        anchors: [card.id],
      })
    }
  }
  const sum = summary(mission, story)

  // Better choices.
  header(betterS!)
  const { better, great } = betterPages(mission, story)
  for (const [i, card] of better.entries()) {
    blocks.push({
      key: `better-${i}`,
      section: 'better',
      node: (
        <article className="hb-card hb-better">
          <CardHead picture={card.picture} tag={<Tag kind="choice">{card.when}</Tag>} title={card.title} />
          <div className="hb-event__main">
            <Row label="You chose">“{card.chose}”</Row>
            <Row label="A better choice">
              <strong>“{card.better}”</strong>
            </Row>
            <Row label="Why it’s better">{card.whyBetter.join(' ')}</Row>
            <div className="hb-links">
              {card.card && <LinkChip text={`See it in the log: ${card.when}`} direction="forward" onGo={() => go(card.card!)} />}
              {card.dependsOn && <LinkChip text={card.dependsOn.text} direction="back" onGo={() => go(card.dependsOn!.to)} />}
            </div>
          </div>
        </article>
      ),
    })
  }
  if (better.length === 0) {
    blocks.push({ key: 'better-none', section: 'better', node: <Callout kind="idea">No other choice would have ended better. Well done!</Callout> })
  }
  if (great.length > 0) {
    blocks.push({
      key: 'great',
      section: 'better',
      node: (
        <article className="hb-card hb-great">
          <h4 className="hb-card-title">Great calls</h4>
          <ul className="hb-great__list">
            {great.map((g) => (
              <li key={g.title + g.chose} className="hb-body">
                <strong>{g.title}:</strong> “{g.chose}”. {g.text}
              </li>
            ))}
          </ul>
        </article>
      ),
    })
  }

  // Real life.
  header(realS!)
  const real = realPages(mission, story)
  for (const [i, card] of real.cards.entries()) {
    blocks.push({
      key: `real-${i}`,
      section: 'real',
      node: (
        <article className="hb-card hb-real">
          <CardHead picture={card.picture} title={card.title} />
          <div className="hb-event__main">
            <Row label="In the game">{card.inGame.join(' ')}</Row>
            <Row label="In real life">{card.inRealLife.join(' ')}</Row>
            {card.source && (
              <a className="hb-source" href={card.source.url} target="_blank" rel="noreferrer">
                Source: {card.source.label}
              </a>
            )}
          </div>
        </article>
      ),
    })
  }
  // Named in honour of: who each crew member's name remembers (two real pioneers each).
  for (const id of ['commander', 'safety', 'science', 'comms', 'trainer'] as const) {
    const member = CAST[id]
    blocks.push({
      key: `real-honour-${id}`,
      section: 'real',
      node: <HonourCard id={id} />,
      anchors: [member.name],
    })
  }
  blocks.push({
    key: 'real-studies',
    section: 'real',
    node: (
      <article className="hb-card">
        <h4 className="hb-card-title">Read real NASA research</h4>
        <ul className="hb-studies">
          {real.studies.map((study) => (
            <li key={study.label} className="hb-body">
              {study.topic}:{' '}
              <a href={study.url} target="_blank" rel="noreferrer">
                {study.label}
              </a>
            </li>
          ))}
        </ul>
      </article>
    ),
  })
  blocks.push({ key: 'real-weather', section: 'real', node: <LiveSpaceWeather compact /> })

  // Summary.
  header(summaryS!)
  const total = sum.dose.choices + sum.dose.hazards + sum.dose.background || 1
  blocks.push({
    key: 'sum-ending',
    section: 'summary',
    node: (
      <div className="hb-sum-ending">
        <p className="hb-label">Your ending</p>
        <p className="hb-ending" data-good={sum.good ? 'true' : undefined}>
          {sum.title}
        </p>
        <VerdictBadge kind={sum.verdictKind}>{sum.verdict}</VerdictBadge>
      </div>
    ),
  })
  blocks.push({
    key: 'sum-reason',
    section: 'summary',
    node: (
      <article className="hb-card">
        <h4 className="hb-card-title">The main reason</h4>
        <p className="hb-body">{sum.reason.join(' ')}</p>
      </article>
    ),
  })
  blocks.push({
    key: 'sum-tiles',
    section: 'summary',
    node: (
      <div className="hb-tiles">
        {sum.tiles.map((t) => (
          <StatTile key={t.label} value={t.value} label={t.label} icon={t.icon} />
        ))}
      </div>
    ),
  })
  blocks.push({
    key: 'sum-points',
    section: 'summary',
    node: (
      <article className="hb-card">
        <h4 className="hb-card-title">3 key points</h4>
        <ol className="hb-points">
          {sum.points.map((p) => (
            <li key={p} className="hb-body">
              {p}
            </li>
          ))}
        </ol>
      </article>
    ),
  })
  blocks.push({
    key: 'sum-dose',
    section: 'summary',
    node: (
      <article className="hb-card">
        <h4 className="hb-card-title">Where the radiation came from</h4>
        <div className="dose-split" role="img" aria-label={`Radiation: ${formatMsv(sum.dose.choices)} from your choices, ${formatMsv(sum.dose.hazards)} from storms, ${formatMsv(sum.dose.background)} from the Moon`}>
          <span className="dose-split__part" data-part="choices" style={{ flexGrow: sum.dose.choices / total }} />
          <span className="dose-split__part" data-part="hazards" style={{ flexGrow: sum.dose.hazards / total }} />
          <span className="dose-split__part" data-part="background" style={{ flexGrow: sum.dose.background / total }} />
        </div>
        <ul className="dose-split__key hb-body">
          <li data-part="choices">Your choices: {formatMsv(sum.dose.choices)}</li>
          <li data-part="hazards">The storms: {formatMsv(sum.dose.hazards)}</li>
          <li data-part="background">The Moon itself: {formatMsv(sum.dose.background)}</li>
        </ul>
        <p className="hb-body">{sum.luck.join(' ')}</p>
      </article>
    ),
  })
  blocks.push({ key: 'sum-tip', section: 'summary', node: <Callout kind="idea" title="One tip for next time">{sum.tip}</Callout> })
  blocks.push({
    key: 'sum-crew',
    section: 'summary',
    node: (
      <div className="summary__crew">
        <Speaker line={closingLine(mission)} />
      </div>
    ),
  })
  blocks.push({
    key: 'sum-buttons',
    section: 'summary',
    node: (
      <div className="handbook__buttons">
        <button type="button" className="button button--primary" onClick={tryAgain}>
          Try again
        </button>
        <button type="button" className="button" onClick={backToMenu}>
          Back to menu
        </button>
      </div>
    ),
  })
  return blocks
}

/** One crew member, and the two pioneers their name honours, each with its NASA source. */
export function HonourCard({ id }: { id: SpeakerId }) {
  const member = CAST[id]
  return (
    <article className="hb-card hb-honour">
      <CardHead tag={<Tag kind="milestone">Named in honour of</Tag>} title={`${member.name}, ${member.shortRole.toLowerCase()}`} />
      <div className="hb-honour__body">
        <Portrait speaker={id} size={56} radio={member.radio} still />
        <ul className="hb-honour__list">
          {NAMED_IN_HONOUR[id].map((p) => (
            <li key={p.name} className="hb-body">
              {p.fact}{' '}
              <a className="hb-source" href={p.source.url} target="_blank" rel="noreferrer">
                Source: {p.source.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

// ---------- Pagination by measured content ----------

/**
 * The Mission Handbook, after the ending: a two-page book with bookmark
 * tabs. Every page is built from the handbook parts and filled by measuring
 * its content. Arrows turn the pages, 1 to 5 jump to a bookmark, Esc goes
 * to the cover; the first time, a short guide explains this.
 */
export function Handbook() {
  const afterword = useGame((state) => state.afterword)
  const mission = useGame((state) => state.mission)
  const player = useGame((state) => state.astronaut.name)
  const textSize = useSettings((s) => s.textSize)
  const guideSeen = useSettings((s) => s.handbookGuideSeen)
  const open = afterword === 'debrief' && !!mission.ending
  const [spread, setSpread] = useState(0)
  const [turn, setTurn] = useState<'next' | 'prev' | null>(null)
  const [guide, setGuide] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [layout, setLayout] = useState<number[][] | null>(null)
  const ref = useRef<HTMLElement>(null)
  const measure = useRef<HTMLDivElement>(null)
  const goCard = useRef<(id: string) => void>(() => {})

  const blocks = useMemo(() => (open ? buildBlocks(mission, player || 'You', (id) => goCard.current(id)) : []), [open, mission, player])

  // Measure every block at the page's real width, then fill the pages.
  const relayout = useCallback(() => {
    const box = measure.current
    if (!box) return
    const body = box.querySelector<HTMLElement>('.hb-measure__room')
    const items = Array.from(box.querySelectorAll<HTMLElement>('.hb-measure__block'))
    if (!body || items.length !== blocks.length) return
    const gap = parseFloat(getComputedStyle(box).getPropertyValue('--hb-gap')) || 16
    const heights = items.map((el) => el.getBoundingClientRect().height)
    // Room for the small "(continued)" header that later pages of a section carry.
    const continued = (box.querySelector<HTMLElement>('.hb-measure__continued')?.getBoundingClientRect().height ?? 40) + gap
    // A few pixels spare, so rounding never pushes the last line over.
    setLayout(paginate(blocks, heights, { room: body.getBoundingClientRect().height - continued - 4, firstExtra: continued, gap }))
  }, [blocks])

  useLayoutEffect(() => {
    if (!open) return
    setLayout(null)
    relayout()
  }, [open, relayout, textSize])

  useEffect(() => {
    if (!open || !measure.current) return
    const observer = new ResizeObserver(() => relayout())
    observer.observe(measure.current)
    measure.current.querySelectorAll('.hb-measure__block').forEach((el) => observer.observe(el))
    let live = true
    void document.fonts?.ready.then(() => live && relayout())
    return () => {
      live = false
      observer.disconnect()
    }
  }, [open, relayout])

  useEffect(() => {
    if (!open) return
    setSpread(0)
    setGuide(!guideSeen)
    ref.current?.focus({ preventScroll: true })
    // Only when the book opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Pages: the cover spread, then every section's pages; a section may start on either side.
  const pages = layout ?? []
  const total = 2 + pages.length + (pages.length % 2)
  const spreads = total / 2
  const sectionStart = (id: SectionId) => (id === 'cover' ? 0 : 2 + pages.findIndex((p) => blocks[p[0]!]?.section === id))

  const go = (to: number) => {
    const target = Math.max(0, Math.min(spreads - 1, to))
    if (target === spread) return
    setTurn(reducedMotion() ? null : target > spread ? 'next' : 'prev')
    setSpread(target)
  }
  goCard.current = (cardId: string) => {
    const at = pages.findIndex((p) => p.some((i) => blocks[i]?.anchors?.includes(cardId)))
    if (at < 0) return
    go(Math.floor((at + 2) / 2))
    setFlash(cardId)
  }

  const closeGuide = () => {
    setGuide(false)
    useSettings.getState().set({ handbookGuideSeen: true })
    ref.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!open || guide) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'ArrowRight') go(spread + 1)
      else if (event.code === 'ArrowLeft') go(spread - 1)
      else if (event.code === 'Escape') go(0)
      else {
        const n = Number(event.code.replace('Digit', '').replace('Numpad', ''))
        const section = SECTIONS[n - 1]
        if (section) go(Math.floor(sectionStart(section.id) / 2))
        else return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), 1600)
    return () => window.clearTimeout(timer)
  }, [flash])

  if (!open) return null
  const ending = ENDINGS[mission.ending!]
  const sum = summary(mission, missionStory(mission, player || 'You'))

  const pageAt = (index: number, side: 'left' | 'right'): ReactNode => {
    const footer = <PageFooter page={index + 1} total={total} side={side} canBack={spread > 0} canNext={spread < spreads - 1} onBack={() => go(spread - 1)} onNext={() => go(spread + 1)} />
    if (index === 0) {
      return (
        <>
          <div className="hb-room cover">
            <p className="hb-label">Mission Handbook</p>
            <h2 className="hb-title cover__title" data-good={ending.good ? 'true' : undefined}>
              {ending.title}
            </h2>
            <Picture id={ending.good ? 'c12-b' : 'c10'} className="cover__picture" />
            <p className="hb-body">
              Astronaut <strong>{player || 'You'}</strong> · <span className="num">{mission.day}</span> days on the Moon
            </p>
          </div>
          {footer}
        </>
      )
    }
    if (index === 1) {
      return (
        <>
          <div className="hb-room cover cover--right">
            <h3 className="hb-section">Why it ended this way</h3>
            <p className="hb-body">{mainReason(mission).join(' ')}</p>
            <VerdictBadge kind={sum.verdictKind}>{sum.verdict}</VerdictBadge>
            <button type="button" className="button button--primary hb-start" onClick={() => go(Math.floor(sectionStart('summary') / 2))}>
              Start here: the Summary →
            </button>
            <h3 className="hb-section">Inside this handbook</h3>
            <ol className="cover__contents">
              {SECTIONS.map((section, i) => (
                <li key={section.id} className="hb-body">
                  <button type="button" className="hb-contents-link" onClick={() => go(Math.floor(sectionStart(section.id) / 2))}>
                    <span className="keycap">{i + 1}</span> {section.label}
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className="hb-help" onClick={() => setGuide(true)} aria-label="How to use this handbook">
              <span className="hb-help__mark">?</span> How to use this handbook
            </button>
          </div>
          {footer}
        </>
      )
    }
    const page = pages[index - 2]
    if (!page) {
      return (
        <>
          <div className="hb-room hb-room--end">
            <Callout kind="idea" title="The end">
              Press <span className="keycap">Esc</span> for the cover, or try again.
            </Callout>
          </div>
          {footer}
        </>
      )
    }
    const first = blocks[page[0]!]!
    const section = SECTIONS.find((s) => s.id === first.section)!
    const continued = !first.key.endsWith('-header')
    return (
      <>
        <div className="hb-room">
          {continued && <ContinuedHeader title={section.title} section={section.id} />}
          {page.map((i) => (
            <div key={blocks[i]!.key} className="hb-block" data-grow={blocks[i]!.grow ? 'true' : undefined} data-flash={blocks[i]!.anchors?.includes(flash ?? '') ? 'true' : undefined}>
              {blocks[i]!.node}
            </div>
          ))}
        </div>
        {footer}
      </>
    )
  }

  const leftIndex = spread * 2
  const here = leftIndex < 2 ? 'cover' : (blocks[pages[leftIndex - 2]?.[0] ?? -1]?.section ?? blocks[pages[leftIndex - 1]?.[0] ?? -1]?.section)

  return (
    <div className="run-layer handbook-layer">
      <section ref={ref} tabIndex={-1} className="handbook" role="dialog" aria-modal="true" aria-label="Mission Handbook">
        {/* The measuring page: the same size as a real page, never seen. */}
        <div ref={measure} className="page hb-measure" aria-hidden="true">
          <div className="hb-measure__room" />
          <div className="hb-measure__blocks">
            <div className="hb-measure__continued">
              <ContinuedHeader title="Measure" section="log" />
            </div>
            {blocks.map((block) => (
              <div key={block.key} className="hb-measure__block hb-block">
                {block.node}
              </div>
            ))}
          </div>
          <div className="hb-footer" />
        </div>
        {layout && (
          <div key={spread} className="handbook__spread" data-turn={turn ?? undefined}>
            <div className="page page--left">{pageAt(leftIndex, 'left')}</div>
            <div className="page page--right">{pageAt(leftIndex + 1, 'right')}</div>
          </div>
        )}
        <nav className="handbook__tabs" aria-label="Bookmarks" data-guide={guide ? 'tabs' : undefined}>
          {SECTIONS.map((section, i) => (
            <button
              key={section.id}
              type="button"
              className="book-tab"
              data-section={section.id}
              data-active={here === section.id ? 'true' : undefined}
              onClick={() => go(Math.floor(sectionStart(section.id) / 2))}
            >
              <StatIcon stat={section.icon} size={18} />
              <span className="book-tab__label">{section.label}</span>
              <span className="book-tab__key">{i + 1}</span>
            </button>
          ))}
        </nav>
        {guide && <HandbookGuide onClose={closeGuide} />}
      </section>
    </div>
  )
}
