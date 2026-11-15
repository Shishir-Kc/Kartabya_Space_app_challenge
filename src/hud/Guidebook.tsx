import { useEffect, useMemo, useRef, useState } from 'react'
import { CONTROLS } from '../data/controls'
import { GUIDE_WORDS } from '../data/guideWords'
import { HAZARD_ROWS, MAP_LABEL, MAP_ORDER, taskRows, type TaskRow } from '../state/guide'
import { useGame } from '../state/store'
import { Picture } from './art/Picture'
import { Portrait } from './art/Portrait'
import { PageHeader, Tag } from './HandbookParts'
import { HonourCard } from './Handbook'
import './handbook.css'
import './guidebook.css'

type Tab = 'words' | 'tasks' | 'controls' | 'names'

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'words', label: 'Words to know' },
  { id: 'tasks', label: 'Where are my tasks?' },
  { id: 'controls', label: 'Controls' },
  { id: 'names', label: 'Who are they named after?' },
]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * The guidebook: open any time while playing with G (not during a scene),
 * in the Mission Handbook's style. The game pauses under it; G or Esc
 * closes it. Four tabs: every technical word, A to Z; where every task is
 * and whether it's open (from the game's real gates, src/state/guide.ts);
 * every key; and the real pioneers the crew are named after.
 */
export function Guidebook() {
  const open = useGame((s) => s.guide)
  const [tab, setTab] = useState<Tab>('words')
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    ref.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'KeyG' || event.code === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        useGame.getState().closeGuide()
        return
      }
      if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
        event.preventDefault()
        setTab((current) => {
          const i = TABS.findIndex((t) => t.id === current)
          return TABS[(i + (event.code === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.id
        })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  return (
    <div className="run-layer handbook-layer guidebook-layer">
      <section ref={ref} tabIndex={-1} className="handbook guidebook" role="dialog" aria-modal="true" aria-label="Guidebook">
        <div className="guidebook__page page">
          {tab === 'words' && <Words />}
          {tab === 'tasks' && <Tasks />}
          {tab === 'controls' && <Controls />}
          {tab === 'names' && <Names />}
          <p className="hb-label guidebook__keys">
            <span className="keycap">G</span> or <span className="keycap">Esc</span> close · <span className="keycap">←</span> <span className="keycap">→</span> change tab
          </p>
        </div>
        <nav className="handbook__tabs" aria-label="Guidebook tabs">
          {TABS.map((t) => (
            <button key={t.id} type="button" className="book-tab" data-section={t.id === 'words' ? 'real' : t.id === 'tasks' ? 'log' : t.id === 'names' ? 'summary' : 'meters'} data-active={tab === t.id ? 'true' : undefined} onClick={() => setTab(t.id)}>
              <span className="book-tab__label">{t.label}</span>
            </button>
          ))}
        </nav>
      </section>
    </div>
  )
}

function Words() {
  const seenTerms = useGame((s) => s.seenTerms)
  const mapId = useGame((s) => s.mapId)
  const reached = MAP_ORDER.indexOf(mapId as (typeof MAP_ORDER)[number])
  const words = useMemo(() => [...GUIDE_WORDS].sort((a, b) => a.word.localeCompare(b.word)), [])
  const list = useRef<HTMLDivElement>(null)
  const firsts = new Set(words.map((w) => w.word[0]!.toUpperCase()))
  const jump = (letter: string) => list.current?.querySelector<HTMLElement>(`[data-letter="${letter}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  return (
    <>
      <PageHeader icon="shielding" title="Words to know" intro="Every space word in the game, in plain words." section="real" />
      <nav className="guidebook__letters" aria-label="Jump to a letter">
        {LETTERS.map((letter) => (
          <button key={letter} type="button" className="guidebook__letter" disabled={!firsts.has(letter)} onClick={() => jump(letter)}>
            {letter}
          </button>
        ))}
      </nav>
      <div ref={list} className="guidebook__scroll">
        {words.map((w, i) => {
          const letter = w.word[0]!.toUpperCase()
          const first = i === 0 || words[i - 1]!.word[0]!.toUpperCase() !== letter
          const seen = (w.term && seenTerms.includes(w.term)) || MAP_ORDER.indexOf(w.map) <= reached
          return (
            <article key={w.id} className="hb-card guidebook__word" data-letter={first ? letter : undefined}>
              <Picture id={w.picture} className="hb-event__picture" />
              <div>
                <h4 className="hb-card-title">
                  {w.word} {seen && <Tag kind="milestone">Seen</Tag>}
                </h4>
                <p className="hb-body">{w.meaning}</p>
                <p className="hb-label">Where: {w.where}</p>
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}

function Tasks() {
  const mission = useGame((s) => s.mission)
  const mapId = useGame((s) => s.mapId)
  const rows = taskRows(mission, mapId)
  const show = (row: TaskRow) => {
    const state = useGame.getState()
    if (row.map !== mapId) {
      state.showToast(`Task ${row.number} is on the ${MAP_LABEL[row.map]?.toLowerCase() ?? row.map}.`)
      return
    }
    state.closeGuide()
    state.showOnMap({ mapId: row.map, x: row.at.x, z: row.at.z, label: `${row.number}. ${row.place}` })
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const n = Number(event.code.replace('Digit', '').replace('Numpad', ''))
      const row = rows.find((r) => r.number === n)
      if (row) {
        event.preventDefault()
        show(row)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <>
      <PageHeader icon="cargoBlocks" title="Where are my tasks?" intro="Every task, where it is, and whether you can do it now." section="log" />
      <div className="guidebook__scroll">
        <table className="guidebook__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Task</th>
              <th>Where</th>
              <th>Who asks you</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-status={row.status} onClick={() => show(row)} title="Show it on the big map">
                <td className="num">{row.number}</td>
                <td>{row.title}</td>
                <td>
                  {MAP_LABEL[row.map]} → {row.place}
                </td>
                <td className="guidebook__who">
                  <Portrait speaker={row.asker} size={28} still /> {row.askerName}
                </td>
                <td>
                  {row.status === 'done' ? (
                    <Tag kind="milestone">Done ✓</Tag>
                  ) : row.status === 'go' ? (
                    <Tag kind="luck">Go here now</Tag>
                  ) : (
                    <>
                      <Tag kind="night">Locked</Tag> <span className="guidebook__unlock">{row.unlock}</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hb-label">Click a task, or press its number, to see it on the big map.</p>
        <h3 className="hb-section">Things that can happen any time</h3>
        <table className="guidebook__table">
          <thead>
            <tr>
              <th>What</th>
              <th>Where</th>
              <th>What it is</th>
              <th>What to do</th>
            </tr>
          </thead>
          <tbody>
            {HAZARD_ROWS.map((h) => (
              <tr key={h.name + h.where}>
                <td>{h.name}</td>
                <td>{h.where}</td>
                <td>{h.what}</td>
                <td>{h.todo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Controls() {
  return (
    <>
      <PageHeader icon="power" title="Controls" intro="Every key, and what it does." section="meters" />
      <div className="guidebook__scroll">
        <ul className="guidebook__controls">
          {CONTROLS.map(([keys, action]) => (
            <li key={keys} className="hb-body">
              <span className="guidebook__caps">
                {keys.split(/[ +]/).map((k, i) => (
                  <span key={k + i} className="keycap">
                    {k}
                  </span>
                ))}
              </span>
              {action}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function Names() {
  return (
    <>
      <PageHeader icon="crewHealth" title="Who are they named after?" intro="Each crew name joins two real space pioneers. Nobody here is a real person." section="summary" />
      <div className="guidebook__scroll">
        {(['commander', 'safety', 'science', 'comms', 'trainer'] as const).map((id) => (
          <HonourCard key={id} id={id} />
        ))}
      </div>
    </>
  )
}
