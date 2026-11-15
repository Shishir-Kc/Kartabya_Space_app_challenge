/**
 * Real solar events from NASA's DONKI archive (./donki-archive.json, built
 * by tools/fetch-donki.mjs). Each run draws one; its strength sets how hard
 * the solar storm in challenge 10 hits. The event's values are real and
 * shown as archived data; the severity mapping is a game placeholder.
 */
import archive from './donki-archive.json'

export interface DonkiEvent {
  id: string
  kind: 'FLR'
  /** The flare's class as DONKI gives it, e.g. "X2.3". */
  classType: string
  classLetter: 'C' | 'M' | 'X'
  beginTime: string
  peakTime: string
  sourceLocation: string | null
  activeRegion: number | null
  link: string | null
  /** The Solar Energetic Particle event that followed, if any. */
  sep: { id: string; eventTime: string; link: string | null } | null
}

export const DONKI = {
  source: archive.source,
  sourceUrl: archive.sourceUrl,
  retrieved: archive.retrieved,
  events: archive.events as DonkiEvent[],
}

export function getStormEvent(id: string): DonkiEvent {
  return DONKI.events.find((event) => event.id === id) ?? DONKI.events[0]!
}

/** Draws one archived event for a run. */
export function drawStormEvent(random: () => number = Math.random): string {
  const events = DONKI.events
  return events[Math.min(events.length - 1, Math.floor(random() * events.length))]!.id
}

/** Any archived event other than `id` (the next one in the archive). */
export function otherStormEvent(id: string): string {
  const events = DONKI.events
  const at = events.findIndex((event) => event.id === id)
  return events[(at + 1) % events.length]!.id
}

export type StormSize = 'small' | 'medium' | 'large' | 'very large'

/**
 * How hard the storm hits, as a multiplier on its dose. Real basis: each
 * flare class letter is about ten times stronger than the one before
 * [flares], and the dose astronauts worry about comes from the energetic
 * particles a flare can send out [artemis-sun], which DONKI records as a
 * linked SEP event. Game scale: the real range is squeezed into 0.6 to 2
 * (C small, M medium, X large, one size bigger with an SEP), so every storm
 * can be survived by sheltering.
 */
export function stormSeverity(event: DonkiEvent): { factor: number; size: StormSize } {
  const base = event.classLetter === 'X' ? 1.5 : event.classLetter === 'M' ? 1 : 0.6
  const factor = base + (event.sep ? 0.5 : 0)
  const size: StormSize = factor >= 2 ? 'very large' : factor >= 1.5 ? 'large' : factor >= 1 ? 'medium' : 'small'
  return { factor, size }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "14 May 2024", from a DONKI time ("2024-05-14T16:51Z"). */
export function formatDonkiDate(time: string): string {
  const [date] = time.split('T')
  const [year, month, day] = (date ?? '').split('-').map(Number)
  return `${day} ${MONTHS[(month ?? 1) - 1]} ${year}`
}

/** The line shown on the storm panel: "Solar flare, class X2.3, recorded 6 November 2024." */
export function describeStorm(event: DonkiEvent): string {
  const particles = event.sep ? ' Energetic particles followed it.' : ''
  return `Solar flare, class ${event.classType}, recorded ${formatDonkiDate(event.peakTime)}.${particles}`
}
