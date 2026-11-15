/**
 * The crew's recorded voices: the audio side of `onLine` (src/state/lines.ts).
 *
 * - Each spoken line plays `public/audio/voice/<lineId>.mp3` if it has one
 *   (listed in src/data/voiceManifest.ts); a line without one stays silent.
 * - Lines play one at a time, in the order they are said: the two crew lines
 *   of a decision panel follow each other instead of talking over each other.
 *   A line still waiting after 12 s is dropped, so old talk never piles up.
 * - Houston (`comms`) sounds like a radio: a narrow telephone band, a little
 *   grit, and a short crackle as the channel opens and closes. Away from
 *   Earth, his voice starts `delaySeconds` late (the real signal delay).
 * - While a line plays, its loudness drives the speaking portrait's mouth
 *   (`attachVoiceAnalyser`).
 * - The voices volume (master × voices, in SETTINGS) applies at once.
 * - A message closed early with Enter stops its voice; Try again, the menu
 *   and a skipped scene stop them all (`stopVoice`).
 */
import { VOICE_SECONDS } from '../data/voiceManifest'
import { attachVoiceAnalyser, onLine, onStopVoice, type LineEvent } from '../state/lines'
import { CAST } from '../state/mission'
import { audioLevels, onAudioLevels } from '../state/settings'

/** A line waiting longer than this is dropped. */
const STALE_MS = 12000

interface Entry {
  event: LineEvent
  queuedAt: number
}

interface Playing {
  lineId: string
  source: AudioBufferSourceNode
  stopCrackle?: () => void
}

let ctx: AudioContext | null = null
let out: GainNode | null = null
let noise: AudioBuffer | null = null
const buffers = new Map<string, Promise<AudioBuffer | null>>()
let queue: Entry[] = []
/** The line being started (its file loading, or its radio delay running). */
let starting: Entry | null = null
let delayTimer: ReturnType<typeof setTimeout> | null = null
let playing: Playing | null = null
/** Bumped by every stop, so a start that was loading when it came is dropped. */
let generation = 0

function context(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  out = ctx.createGain()
  out.gain.value = audioLevels().voices
  out.connect(ctx.destination)
  return ctx
}

function load(lineId: string): Promise<AudioBuffer | null> {
  let buffer = buffers.get(lineId)
  if (!buffer) {
    buffer = fetch(`${import.meta.env.BASE_URL}audio/voice/${lineId}.mp3`)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`))))
      .then((data) => context()?.decodeAudioData(data) ?? null)
      .catch(() => null)
    buffers.set(lineId, buffer)
  }
  return buffer
}

/** A soft hiss, made once: the radio's crackle. */
function noiseBuffer(audio: AudioContext): AudioBuffer {
  if (noise) return noise
  const length = Math.floor(audio.sampleRate * 0.25)
  noise = audio.createBuffer(1, length, audio.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.08 ? 1 : 0.35)
  return noise
}

/** A short burst of static at `when`, through the radio band. */
function crackle(audio: AudioContext, into: AudioNode, when: number): AudioBufferSourceNode {
  const source = audio.createBufferSource()
  source.buffer = noiseBuffer(audio)
  const band = audio.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 2400
  band.Q.value = 0.8
  const gain = audio.createGain()
  gain.gain.setValueAtTime(0.22, when)
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.22)
  source.connect(band).connect(gain).connect(into)
  source.start(when)
  return source
}

/** Houston's radio: a telephone band with a little grit. Returns the node the voice goes into. */
function radioChain(audio: AudioContext, into: AudioNode): AudioNode {
  const low = audio.createBiquadFilter()
  low.type = 'highpass'
  low.frequency.value = 320
  const high = audio.createBiquadFilter()
  high.type = 'lowpass'
  high.frequency.value = 3200
  const grit = audio.createWaveShaper()
  const curve = new Float32Array(256)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2)
  }
  grit.curve = curve
  low.connect(high).connect(grit).connect(into)
  return low
}

function play(entry: Entry, buffer: AudioBuffer): void {
  const audio = context()
  if (!audio || !out) return
  const { lineId, speakerId } = entry.event
  const analyser = audio.createAnalyser()
  analyser.fftSize = 512
  analyser.connect(out)
  const source = audio.createBufferSource()
  source.buffer = buffer
  const radio = CAST[speakerId].radio && !entry.event.inPerson
  const now = audio.currentTime
  let stopCrackle: (() => void) | undefined
  if (radio) {
    source.connect(radioChain(audio, analyser))
    const open = crackle(audio, analyser, now)
    const close = crackle(audio, analyser, now + 0.12 + buffer.duration)
    stopCrackle = () => {
      open.stop()
      close.stop()
    }
    source.start(now + 0.12)
  } else {
    source.connect(analyser)
    source.start(now)
  }
  attachVoiceAnalyser(lineId, analyser)
  const current: Playing = { lineId, source, stopCrackle }
  playing = current
  source.onended = () => {
    attachVoiceAnalyser(lineId, null)
    analyser.disconnect()
    if (playing === current) playing = null
    next()
  }
}

/** Starts the next waiting line, if nothing is playing or starting. */
function next(): void {
  if (playing || starting) return
  const now = Date.now()
  queue = queue.filter((entry) => now - entry.queuedAt < STALE_MS)
  const entry = queue.shift()
  if (!entry) return
  starting = entry
  const token = generation
  const delay = Math.max(0, entry.event.delaySeconds ?? 0)
  const begin = () => {
    delayTimer = null
    void load(entry.event.lineId).then((buffer) => {
      if (token !== generation || starting !== entry) return
      starting = null
      if (buffer) {
        if (ctx?.state === 'suspended') void ctx.resume()
        play(entry, buffer)
      } else next()
    })
  }
  if (delay > 0) delayTimer = setTimeout(begin, delay * 1000)
  else begin()
}

function say(event: LineEvent): void {
  if (!(event.lineId in VOICE_SECONDS) || !context()) return
  void load(event.lineId)
  queue.push({ event, queuedAt: Date.now() })
  next()
}

function stop(lineId?: string): void {
  if (lineId === undefined) {
    generation++
    queue = []
    if (delayTimer) clearTimeout(delayTimer)
    delayTimer = null
    starting = null
  } else {
    queue = queue.filter((entry) => entry.event.lineId !== lineId)
    if (starting?.event.lineId === lineId) {
      generation++
      if (delayTimer) clearTimeout(delayTimer)
      delayTimer = null
      starting = null
    }
  }
  if (playing && (lineId === undefined || playing.lineId === lineId)) {
    const { source, stopCrackle, lineId: id } = playing
    playing = null
    source.onended = null
    try {
      source.stop()
      stopCrackle?.()
    } catch {
      // Already stopped.
    }
    attachVoiceAnalyser(id, null)
  }
  next()
}

/** Starts the voices (once, from src/main.tsx). Returns a function that stops them. */
export function startVoices(): () => void {
  if (typeof window === 'undefined') return () => {}
  const offLine = onLine(say)
  const offStop = onStopVoice(stop)
  const offLevels = onAudioLevels((levels) => {
    if (out) out.gain.value = levels.voices
  })
  return () => {
    stop()
    offLine()
    offStop()
    offLevels()
  }
}
