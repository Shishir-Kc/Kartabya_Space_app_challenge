/**
 * Every message that comes to the player outside a decision panel (Houston on
 * the radio, a crew member's reminder or hologram, the hazard alerts, the
 * story beats' lines) goes through this queue and shows as one big
 * Transmission (src/hud/Transmission.tsx):
 *
 * - one at a time, in order; the same line is never queued twice;
 * - held while a decision panel, a night card or the ending is open;
 * - up while it's read (about 0.3 s a word, plus Houston's signal delay),
 *   or longer if asked; Enter closes it early;
 * - each fires onLine when it appears, so Shishir's voices play with it.
 *
 * The current line also sits in the store's `caption`, as before.
 */
import { create } from 'zustand'
import type { CrewLine } from '../data/challenges'
import { VOICE_SECONDS } from '../data/voiceManifest'
import { currentRadioDelay, emitLine, stopVoice } from './lines'
import { CAST } from './mission'
import { useGame } from './store'

/** How a message comes: said in person (the speaker is in the room), over Houston's radio, as a hologram from elsewhere, or as an alert. */
export type TransmissionStyle = 'in-person' | 'radio' | 'hologram' | 'alert'

export interface Transmission {
  id: number
  style: TransmissionStyle
  line: CrewLine
  /** The alert's big headline ("SOLAR STORM WARNING"). */
  headline?: string
  /** Houston's signal delay before the words arrive, in seconds. */
  delay: number
  /** How long it stays up, in ms (from when it appears). */
  holdMs: number
  /** When it appeared (performance.now()). */
  shownAt: number
}

interface Queued extends Omit<Transmission, 'shownAt'> {
  then?: () => void
}

interface TransmissionState {
  current: Transmission | null
  queue: Queued[]
}

export const useTransmissions = create<TransmissionState>()(() => ({ current: null, queue: [] }))

/** Seconds a word takes to read and to appear. */
export const READ_SECONDS_PER_WORD = 0.3

/**
 * How long a line stays up: its reading time, at least 3.5 s, plus a pause;
 * then any signal delay on top. A line with a recorded voice is heard as
 * well as read, so it stays up while it's spoken plus a short pause (and
 * until its last word has appeared), not the longer reading time.
 */
export function holdFor(line: CrewLine, delay: number, atLeastMs = 0): number {
  const words = line.text.split(/\s+/).filter(Boolean).length
  const voice = VOICE_SECONDS[line.lineId]
  const shown = voice
    ? Math.max(3000, (voice + 1.0) * 1000, (words * READ_SECONDS_PER_WORD + 0.6) * 1000)
    : Math.max(3500, (words * READ_SECONDS_PER_WORD + 2.2) * 1000)
  return Math.max(atLeastMs, shown) + delay * 1000
}

let nextId = 1
let timer: ReturnType<typeof setTimeout> | null = null
let currentThen: (() => void) | undefined
/** The screen shows transmissions (Transmission is mounted); without it, alerts don't hold up a hazard's panel. */
let host = false

export function setTransmissionHost(on: boolean): void {
  host = on
}

export function transmissionHost(): boolean {
  return host
}

/** The style for a line: in person when the speaker is there, else Houston on the radio and everyone else as a hologram. */
export function styleFor(line: CrewLine): TransmissionStyle {
  if (line.inPerson) return 'in-person'
  return CAST[line.speakerId].radio ? 'radio' : 'hologram'
}

function blocked(): boolean {
  const s = useGame.getState()
  return !!(s.challenge || s.night || s.afterword)
}

function showNext(): void {
  const state = useTransmissions.getState()
  if (state.current || blocked()) return
  const [next, ...rest] = state.queue
  if (!next) return
  const shown: Transmission = { id: next.id, style: next.style, line: next.line, headline: next.headline, delay: next.delay, holdMs: next.holdMs, shownAt: now() }
  currentThen = next.then
  useTransmissions.setState({ current: shown, queue: rest })
  useGame.setState({ caption: next.line })
  emitLine(next.line)
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => finishTransmission(), next.holdMs)
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/**
 * Queues a message. Returns false if the same line is already showing or
 * waiting (a reminder asked for twice).
 */
export function transmit(
  line: CrewLine,
  options: { style?: TransmissionStyle; headline?: string; ms?: number; exactMs?: number; then?: () => void } = {},
): boolean {
  const state = useTransmissions.getState()
  if (state.current?.line.lineId === line.lineId || state.queue.some((q) => q.line.lineId === line.lineId)) return false
  const delay = CAST[line.speakerId].radio && !line.inPerson ? currentRadioDelay() : 0
  const style = options.style ?? styleFor(line)
  // A scene that times its own lines (src/scene/beats.ts) holds each exactly until the next.
  const holdMs = options.exactMs !== undefined ? options.exactMs + delay * 1000 : holdFor(line, delay, options.ms)
  useTransmissions.setState({
    queue: [...state.queue, { id: nextId++, style, line, headline: options.headline, delay, holdMs, then: options.then }],
  })
  showNext()
  return true
}

/** The current message is over (its time is up, or Enter): the next one, if any. */
export function finishTransmission(): void {
  if (timer) clearTimeout(timer)
  timer = null
  const current = useTransmissions.getState().current
  if (!current) return
  // Closed early with Enter: its voice stops too (one that has finished already is no matter).
  stopVoice(current.line.lineId)
  useTransmissions.setState({ current: null })
  if (useGame.getState().caption === current.line) useGame.setState({ caption: null })
  const then = currentThen
  currentThen = undefined
  then?.()
  showNext()
}

/** Everything goes (Try again, back to the menu). */
export function clearTransmissions(): void {
  if (timer) clearTimeout(timer)
  timer = null
  currentThen = undefined
  useTransmissions.setState({ current: null, queue: [] })
  stopVoice()
}

// A panel closing lets the waiting messages through.
let wasBlocked = false
useGame.subscribe(() => {
  const now = blocked()
  if (wasBlocked && !now) showNext()
  wasBlocked = now
})
