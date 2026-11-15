/**
 * The audio hook for spoken lines. The decision panel calls `emitLine` when
 * a crew line shows; Shishir's audio code subscribes with `onLine` and plays
 * the voice file for that `lineId` (with the radio filter when the speaker
 * is `comms`). Nothing is played here: this file only passes the event on.
 */
import type { SpeakerId } from './mission'

export interface LineEvent {
  lineId: string
  speakerId: SpeakerId
  /** The written line, for captions. */
  text: string
  /**
   * Houston over the radio, away from Earth: play the line this many
   * seconds late (the real one-way signal delay, src/data/science.ts).
   * The screen shows "Receiving…" for the same time. 0 otherwise.
   */
  delaySeconds?: number
  /** Said face to face, even by Houston: no radio sound, no signal delay. */
  inPerson?: boolean
}

type Listener = (event: LineEvent) => void

const listeners = new Set<Listener>()

/** Subscribes to spoken lines. Returns the unsubscribe function. */
export function onLine(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The radio delay where the crew is now (set when the map changes, src/scene/run.ts). */
let radioDelay = 0

export function setRadioDelay(seconds: number): void {
  radioDelay = seconds
}

/** How late Houston's voice reaches the crew right now, in seconds (0 on Earth). */
export function currentRadioDelay(): number {
  return radioDelay
}

export function emitLine(event: LineEvent): void {
  const delaySeconds = event.speakerId === 'comms' && !event.inPerson ? radioDelay : 0
  const out: LineEvent = { lineId: event.lineId, speakerId: event.speakerId, text: event.text, delaySeconds, ...(event.inPerson ? { inPerson: true } : {}) }
  for (const listener of listeners) listener(out)
}

/** How many listeners are attached (for the memory checks). */
export function lineListenerCount(): number {
  return listeners.size
}

// ---------- Stopping a voice early ----------

const stopListeners = new Set<(lineId?: string) => void>()

/** Subscribes to "stop that voice now". Returns the unsubscribe function. */
export function onStopVoice(listener: (lineId?: string) => void): () => void {
  stopListeners.add(listener)
  return () => {
    stopListeners.delete(listener)
  }
}

/**
 * A line's voice should stop now (its message was closed early with Enter),
 * or every voice should (no `lineId`: Try again, back to the menu, a skipped
 * scene).
 */
export function stopVoice(lineId?: string): void {
  for (const listener of stopListeners) listener(lineId)
}

/**
 * Sound cues for the SFX (no voice): 'storm-alarm' when a storm's alarm
 * starts, 'meteoroid-hit' when a meteoroid strikes a panel, 'ending-good'
 * and 'ending-early' on the ending card.
 */
export type Cue =
  | 'storm-alarm'
  | 'meteoroid-hit'
  | 'ending-good'
  | 'ending-early'
  // A story beat starts (src/scene/beats.ts).
  | 'beat-night-before'
  | 'beat-arrival'
  | 'beat-first-storm'
  | 'beat-lunar-night'
  // Shishir's Phase 1 scenes: the briefing, and the trainer's goodbye at the elevator.
  | 'beat-briefing'
  | 'beat-comms-visit'
  | 'beat-farewell'

const cueListeners = new Set<(cue: Cue) => void>()

/** Subscribes to sound cues. Returns the unsubscribe function. */
export function onCue(listener: (cue: Cue) => void): () => void {
  cueListeners.add(listener)
  return () => {
    cueListeners.delete(listener)
  }
}

export function emitCue(cue: Cue): void {
  for (const listener of cueListeners) listener(cue)
}

// ---------- The voice's loudness, for the talking portraits ----------

const analysers = new Map<string, { node: AnalyserNode; data: Uint8Array<ArrayBuffer> }>()

/**
 * For Shishir's audio: while a line's voice plays, hand its Web Audio
 * AnalyserNode here (and call again with null when it ends). The speaking
 * portrait then opens its mouth with the voice's loudness; without one, it
 * moves its mouth while the words appear.
 */
export function attachVoiceAnalyser(lineId: string, node: AnalyserNode | null): void {
  if (!node) {
    analysers.delete(lineId)
    return
  }
  analysers.set(lineId, { node, data: new Uint8Array(new ArrayBuffer(node.fftSize)) })
}

/** True while any crew voice is playing (the sound effects duck under it). */
export function voicePlaying(): boolean {
  return analysers.size > 0
}

/** How loud a line's voice is right now (0 to 1), or null when no voice is playing for it. */
export function voiceLevel(lineId: string): number | null {
  const entry = analysers.get(lineId)
  if (!entry) return null
  entry.node.getByteTimeDomainData(entry.data)
  let sum = 0
  for (const v of entry.data) sum += ((v - 128) / 128) ** 2
  return Math.min(1, Math.sqrt(sum / entry.data.length) * 4)
}
