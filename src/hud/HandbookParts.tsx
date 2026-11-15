/**
 * The Mission Handbook's building blocks. Every page is made only from
 * these, so every page looks the same: one type scale (page title, section
 * heading, card title, body, label) and spacing in 8 px steps
 * (src/hud/handbook.css).
 */
import type { ReactNode } from 'react'
import type { StatId } from '../state/mission'
import { TAG_LABEL, type ChangeRow, type StoryCard, type StoryDay } from '../state/handbookStory'
import { Picture } from './art/Picture'
import { StatIcon } from './art/StatIcon'

/** A page's title, with its bookmark icon and one sentence saying what the page is for. */
export function PageHeader({ icon, title, intro, section }: { icon: StatId; title: string; intro: string; section: string }) {
  return (
    <header className="hb-page-header" data-section={section}>
      <span className="hb-page-header__icon">
        <StatIcon stat={icon} size={28} />
      </span>
      <div>
        <h2 className="hb-title">{title}</h2>
        <p className="hb-body hb-page-header__intro">{intro}</p>
      </div>
    </header>
  )
}

/** The small header on a section's later pages. */
export function ContinuedHeader({ title, section }: { title: string; section: string }) {
  return (
    <p className="hb-label hb-continued" data-section={section}>
      {title} (continued)
    </p>
  )
}

/** A coloured band: the day, and where it happened. */
export function DayHeader({ day }: { day: StoryDay }) {
  return (
    <div className="hb-day" data-day={day.id === 'launch' || day.id === 'trip' || day.id === 'last' ? day.id : 'outpost'}>
      <h3 className="hb-section">{day.title}</h3>
      <span className="hb-label hb-day__place">{day.place}</span>
    </div>
  )
}

export function Tag({ kind, children }: { kind: string; children: ReactNode }) {
  return (
    <span className="hb-tag hb-label" data-kind={kind}>
      {children}
    </span>
  )
}

const ROW_ICON: Record<ChangeRow['stat'], StatId> = {
  power: 'power',
  lifeSupport: 'lifeSupport',
  shielding: 'shielding',
  foodDays: 'foodDays',
  dose: 'dose',
  spares: 'spares',
  harvestDays: 'harvestDays',
  crew: 'crewHealth',
}

/** "What it changed": each stat with its icon and exact numbers. */
export function ChangeList({ rows }: { rows: readonly ChangeRow[] }) {
  return (
    <ul className="hb-changes">
      {rows.map((row) => (
        <li key={row.text} className="hb-change" data-tone={row.tone}>
          <StatIcon stat={ROW_ICON[row.stat]} size={18} />
          <span className="num">{row.text}</span>
        </li>
      ))}
    </ul>
  )
}

/** A labelled row of a card: "What happened", "Why", "What it changed". */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="hb-row hb-body">
      <span className="hb-label hb-row__label">{label}</span> {children}
    </div>
  )
}

/** "This caused something on Day 4 →": jumps to that card. */
export function LinkChip({ text, direction, onGo }: { text: string; direction: 'back' | 'forward'; onGo: () => void }) {
  return (
    <button type="button" className="hb-link" data-direction={direction} onClick={onGo}>
      {direction === 'back' ? '← ' : ''}
      {text}
      {direction === 'forward' ? ' →' : ''}
    </button>
  )
}

/** One event of the mission log. */
export function EventCard({ card, onGo, compact = false }: { card: StoryCard; onGo: (cardId: string) => void; compact?: boolean }) {
  return (
    <article className="hb-card hb-event" data-tag={card.tag} data-compact={compact ? 'true' : undefined} data-card={card.id}>
      <CardHead picture={compact ? undefined : card.picture} tag={<Tag kind={card.tag}>{TAG_LABEL[card.tag]}</Tag>} title={card.title} />
      <div className="hb-event__main">
        <Row label="What happened">{card.happened.join(' ')}</Row>
        {card.why.length > 0 && <Row label="Why">{card.why.join(' ')}</Row>}
        {card.changed.length > 0 && (
          <Row label="What it changed">
            <ChangeList rows={card.changed} />
          </Row>
        )}
        {card.word && !compact && (
          <p className="hb-word hb-body">
            <span className="hb-label">New word</span> <strong>{card.word.word}:</strong> {card.word.meaning}
          </p>
        )}
        {card.links.length > 0 && (
          <div className="hb-links">
            {card.links.map((link) => (
              <LinkChip key={link.to + link.text} text={link.text} direction={link.direction} onGo={() => onGo(link.to)} />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

/** A card's top: a small picture beside its tag and title; the rows below use the full width. */
export function CardHead({ picture, tag, title }: { picture?: string; tag?: ReactNode; title: string }) {
  return (
    <div className="hb-card-head" data-picture={picture ? 'true' : undefined}>
      {picture && <Picture id={picture} className="hb-event__picture" />}
      <div className="hb-card-head__text">
        {tag}
        <h4 className="hb-card-title">{title}</h4>
      </div>
    </div>
  )
}

/** "Big idea" (the lesson) or "Did you know?" (a real fact with its source). */
export function Callout({ kind, title, children, source }: { kind: 'idea' | 'fact'; title?: string; children: ReactNode; source?: { label: string; url: string } }) {
  return (
    <aside className="hb-callout" data-kind={kind}>
      <span className="hb-label">{title ?? (kind === 'idea' ? 'Big idea' : 'Did you know?')}</span>
      <div className="hb-body">{children}</div>
      {source && (
        <a className="hb-source" href={source.url} target="_blank" rel="noreferrer">
          Source: {source.label}
        </a>
      )}
    </aside>
  )
}

/** A big number with a label and an icon. */
export function StatTile({ value, label, icon }: { value: string; label: string; icon: StatId }) {
  return (
    <div className="hb-tile">
      <StatIcon stat={icon} size={26} />
      <span className="hb-tile__value num">{value}</span>
      <span className="hb-label hb-tile__label">{label}</span>
    </div>
  )
}

export function VerdictBadge({ kind, children }: { kind: 'good' | 'bad' | 'luck'; children: ReactNode }) {
  return (
    <p className="hb-verdict" data-kind={kind}>
      <span className="hb-label">Verdict</span>
      <span className="hb-verdict__text">{children}</span>
    </p>
  )
}

/** Page number and Back or Next, at the bottom of each page. */
export function PageFooter({ page, total, side, canBack, canNext, onBack, onNext }: { page: number; total: number; side: 'left' | 'right'; canBack: boolean; canNext: boolean; onBack: () => void; onNext: () => void }) {
  return (
    <footer className="hb-footer" data-side={side}>
      {side === 'left' ? (
        <button type="button" className="hb-turn" disabled={!canBack} onClick={onBack}>
          ← Back
        </button>
      ) : null}
      <span className="hb-label hb-footer__count">
        Page {page} of {total}
      </span>
      {side === 'right' ? (
        <button type="button" className="hb-turn" disabled={!canNext} onClick={onNext}>
          Next →
        </button>
      ) : null}
    </footer>
  )
}
