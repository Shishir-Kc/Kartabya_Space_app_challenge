/**
 * The game's sound effects, all made in code with Web Audio: no files, so
 * nothing to download, license or credit. What makes a sound:
 *
 * - The launch and the landing (and the ending scenes): their timed events
 *   (state/cinematic.ts cue ids like 'engines-ignite', 'first-stage-separation',
 *   'touchdown') start, change and stop an engine and play one-off bangs and
 *   puffs (CINEMATIC_SFX below). The Saturn V's five F-1s rumble and crackle,
 *   muffled in the cockpit until the cut outside at liftoff; the upper
 *   stages' J-2s are thinner; the lunar module's descent engine is a steady
 *   hiss. Staging is a pyro bang and the puff of small rockets; the escape
 *   tower's motor is a whoosh; thrusters are short puffs.
 * - The launch countdown: a beep on each number from T-10 to T-1, higher
 *   for the last three, in step with the cockpit screen.
 * - The storm timers (challenges 4 and 10): a tick every second, a double
 *   blip in the last five, and a low two-note tone if time runs out.
 * - The elevators: the door motor opening and closing, a clunk as the car
 *   sets off and stops, its hum while it rides and a chime on arrival,
 *   quieter the farther the player is from the car.
 *
 * Volume is the settings' effects level (times master). The loops (engines,
 * the lift's hum) go silent whenever the game is frozen (paused, a panel
 * open, the menu, a hidden tab), because what they belong to stops too, and
 * they duck under the crew's voices. A limiter keeps the sum from clipping.
 *
 * Nothing here runs on import: `startSfx()` (src/main.tsx) wires it up, and
 * the AudioContext is made with the first sound.
 */
import { DOOR_SECONDS, onElevatorEvent, type ElevatorEvent, type ElevatorState } from '../scene/elevatorLogic'
import { onCue as onCinematicCue } from '../state/cinematic'
import { voicePlaying } from '../state/lines'
import { player } from '../state/player'
import { audioLevels, onAudioLevels } from '../state/settings'
import { useGame } from '../state/store'

// ---------- What plays when ----------

/** A rocket engine (or the lift's motor): a loop that starts, changes and stops. */
export type EngineKind = 'saturn' | 'j2' | 'lander' | 'ascent' | 'lift'

/** A sound that plays once. */
export type OneShot =
  | 'beep'
  | 'beep-high'
  | 'tick'
  | 'tick-urgent'
  | 'timer-end'
  | 'clang'
  | 'pyro'
  | 'puff'
  | 'whoosh'
  | 'thrusters'
  | 'clunk'
  | 'touchdown'
  | 'ding'
  | 'door-open'
  | 'door-close'

export const ONE_SHOTS: readonly OneShot[] = [
  'beep',
  'beep-high',
  'tick',
  'tick-urgent',
  'timer-end',
  'clang',
  'pyro',
  'puff',
  'whoosh',
  'thrusters',
  'clunk',
  'touchdown',
  'ding',
  'door-open',
  'door-close',
]

/**
 * What a cinematic event does to the sound. `engine` starts one (replacing
 * the last), `level` changes its loudness (0 to 1) and tone (a low-pass in
 * Hz: low is muffled, as heard through the cabin), `off` fades it out.
 */
export type SfxAction =
  | { do: 'engine'; kind: EngineKind; level: number; ramp: number; tone: number }
  | { do: 'level'; level: number; ramp: number; tone?: number }
  | { do: 'off'; ramp: number }
  | { do: 'play'; sound: OneShot; gain?: number }

/** Muffled, as heard strapped in the cockpit; open, as heard outside. */
const CABIN = 420
const OUTSIDE = 5000

/**
 * The cinematic events that make a sound, by cue id (the launch, landing
 * and ending scripts in src/scene/cinematic). tools/checks/cinematic.mts
 * checks every id here is one the scripts fire.
 */
export const CINEMATIC_SFX: Readonly<Record<string, readonly SfxAction[]>> = {
  // The launch. About T-6 the F-1s start, felt more than heard in the cabin.
  'engines-ignite': [{ do: 'engine', kind: 'saturn', level: 0.6, ramp: 4, tone: CABIN }],
  // T-0, cut outside: full thrust, and the hold-down arms let go with a clang.
  liftoff: [{ do: 'level', level: 1, ramp: 0.6, tone: OUTSIDE }],
  'hold-downs-release': [{ do: 'play', sound: 'clang' }],
  // High up, the air thins: quieter and duller.
  'cut-to-space': [{ do: 'level', level: 0.7, ramp: 2, tone: 1600 }],
  'first-cutoff': [{ do: 'off', ramp: 0.35 }],
  // Staging: pyros cut the stage free, its retro-rockets and the ullage motors puff.
  'first-stage-separation': [
    { do: 'play', sound: 'pyro' },
    { do: 'play', sound: 'puff' },
  ],
  'second-ignition': [{ do: 'engine', kind: 'j2', level: 0.6, ramp: 0.6, tone: 2400 }],
  'interstage-jettison': [{ do: 'play', sound: 'pyro', gain: 0.45 }],
  'tower-jettison': [{ do: 'play', sound: 'whoosh' }],
  'second-cutoff': [{ do: 'off', ramp: 0.3 }],
  'second-stage-separation': [
    { do: 'play', sound: 'pyro' },
    { do: 'play', sound: 'puff', gain: 0.7 },
  ],
  'third-ignition': [{ do: 'engine', kind: 'j2', level: 0.45, ramp: 0.8, tone: 2000 }],
  // The fade to "Later, in Earth orbit".
  orbit: [{ do: 'off', ramp: 1.8 }],
  'tli-start': [{ do: 'engine', kind: 'j2', level: 0.45, ramp: 1, tone: 2000 }],
  'tli-end': [{ do: 'off', ramp: 0.6 }],
  'spacecraft-separation': [
    { do: 'play', sound: 'pyro', gain: 0.6 },
    { do: 'play', sound: 'thrusters' },
  ],
  'adapter-panels-open': [{ do: 'play', sound: 'clunk', gain: 0.6 }],
  'cut-to-cockpit': [{ do: 'off', ramp: 0.2 }],

  // The landing: the descent engine all the way down, thrusters at the pitch-over.
  'powered-descent': [{ do: 'engine', kind: 'lander', level: 0.75, ramp: 1.2, tone: 1100 }],
  braking: [{ do: 'level', level: 0.85, ramp: 1 }],
  'pitch-over': [{ do: 'play', sound: 'thrusters', gain: 0.7 }],
  'cut-to-chase': [{ do: 'level', level: 0.8, ramp: 0.5, tone: 3200 }],
  // Throttled back for the last metres.
  dust: [{ do: 'level', level: 0.6, ramp: 1.2 }],
  touchdown: [{ do: 'play', sound: 'touchdown' }],
  'engine-stop': [{ do: 'off', ramp: 0.5 }],

  // The ending scenes: the next crew landing, or the ascent stage leaving early.
  'second-crew': [{ do: 'engine', kind: 'lander', level: 0.65, ramp: 1.5, tone: 3200 }],
  'second-touchdown': [
    { do: 'play', sound: 'touchdown', gain: 0.8 },
    { do: 'off', ramp: 0.5 },
  ],
  'liftoff-early': [
    { do: 'play', sound: 'pyro', gain: 0.7 },
    { do: 'engine', kind: 'ascent', level: 0.8, ramp: 0.3, tone: 3200 },
  ],
  'outpost-dark': [{ do: 'off', ramp: 3 }],
}

// ---------- Making the sounds ----------

interface Buffers {
  white: AudioBuffer
  brown: AudioBuffer
  crackle: AudioBuffer
}

const bufferCache = new WeakMap<BaseAudioContext, Buffers>()

/**
 * A loop with no click at the seam: `length + fade` samples are made and the
 * last `fade` are blended into the first. Scaled to a peak of 1, or (`rms`)
 * to that average level, so a random buffer is as loud on every page load.
 */
function loopBuffer(c: BaseAudioContext, seconds: number, fill: (out: Float32Array) => void, rms?: number): AudioBuffer {
  const length = Math.round(seconds * c.sampleRate)
  const fade = Math.round(0.05 * c.sampleRate)
  const raw = new Float32Array(length + fade)
  fill(raw)
  const buffer = c.createBuffer(1, length, c.sampleRate)
  const out = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) out[i] = i < fade ? raw[i]! * (i / fade) + raw[length + i]! * (1 - i / fade) : raw[i]!
  let peak = 0
  let sum = 0
  for (const v of out) {
    peak = Math.max(peak, Math.abs(v))
    sum += v * v
  }
  const scale = rms ? rms / Math.sqrt(sum / length || 1) : peak > 0 ? 1 / peak : 0
  for (let i = 0; i < length; i++) out[i]! *= scale
  return buffer
}

function buffers(c: BaseAudioContext): Buffers {
  const cached = bufferCache.get(c)
  if (cached) return cached
  const made: Buffers = {
    white: loopBuffer(c, 2, (out) => {
      for (let i = 0; i < out.length; i++) out[i] = Math.random() * 2 - 1
    }),
    // Brown noise: white noise summed up, with a leak so it doesn't wander off.
    brown: loopBuffer(
      c,
      4,
      (out) => {
        let b = 0
        for (let i = 0; i < out.length; i++) {
          b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02
          out[i] = b
        }
      },
      0.3,
    ),
    // The Saturn V's crackle: sparse sharp pops, each a few milliseconds long.
    crackle: loopBuffer(c, 3, (out) => {
      const tail = Math.round(0.004 * c.sampleRate)
      for (let i = 0; i < out.length; i++) {
        if (Math.random() > 0.0012) continue
        const size = 0.3 + Math.random() * 0.7
        for (let k = 0; k < tail && i + k < out.length; k++) out[i + k]! += size * (Math.random() * 2 - 1) * Math.exp(-k / (tail / 4))
      }
    }),
  }
  bufferCache.set(c, made)
  return made
}

function filter(c: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const node = c.createBiquadFilter()
  node.type = type
  node.frequency.value = frequency
  node.Q.value = q
  return node
}

function gainNode(c: BaseAudioContext, value: number): GainNode {
  const node = c.createGain()
  node.gain.value = value
  return node
}

/** A one-off noise burst through a filter, shaped by an attack and an exponential decay. */
function burst(
  c: BaseAudioContext,
  dest: AudioNode,
  at: number,
  options: { buffer?: keyof Buffers; type: BiquadFilterType; frequency: number; q?: number; gain: number; attack: number; decay: number; sweepTo?: number },
): void {
  const source = c.createBufferSource()
  source.buffer = buffers(c)[options.buffer ?? 'white']
  const shape = filter(c, options.type, options.frequency, options.q)
  if (options.sweepTo) {
    shape.frequency.setValueAtTime(options.frequency, at)
    shape.frequency.exponentialRampToValueAtTime(options.sweepTo, at + options.attack + options.decay)
  }
  const env = gainNode(c, 0)
  env.gain.setValueAtTime(0, at)
  env.gain.linearRampToValueAtTime(options.gain, at + options.attack)
  env.gain.exponentialRampToValueAtTime(0.0001, at + options.attack + options.decay)
  source.connect(shape).connect(env).connect(dest)
  source.start(at, Math.random() * 1.5)
  source.stop(at + options.attack + options.decay + 0.05)
}

/** A one-off tone, optionally gliding in pitch, with an attack and an exponential decay. */
function tone(
  c: BaseAudioContext,
  dest: AudioNode,
  at: number,
  options: { type?: OscillatorType; frequency: number; glideTo?: number; gain: number; attack?: number; decay: number },
): void {
  const osc = c.createOscillator()
  osc.type = options.type ?? 'sine'
  osc.frequency.setValueAtTime(options.frequency, at)
  if (options.glideTo) osc.frequency.exponentialRampToValueAtTime(options.glideTo, at + options.decay)
  const attack = options.attack ?? 0.004
  const env = gainNode(c, 0)
  env.gain.setValueAtTime(0, at)
  env.gain.linearRampToValueAtTime(options.gain, at + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, at + attack + options.decay)
  osc.connect(env).connect(dest)
  osc.start(at)
  osc.stop(at + attack + options.decay + 0.05)
}

/** The elevator doors: a motor whine sliding in pitch, rollers rumbling, and (closing) the doors meeting. */
function doors(c: BaseAudioContext, dest: AudioNode, at: number, gain: number, opening: boolean): void {
  const end = at + DOOR_SECONDS
  const env = gainNode(c, 0)
  env.gain.setValueAtTime(0, at)
  env.gain.linearRampToValueAtTime(gain, at + 0.1)
  env.gain.setValueAtTime(gain, end - 0.2)
  env.gain.linearRampToValueAtTime(0, end)
  env.connect(dest)
  const motor = c.createOscillator()
  motor.type = 'sawtooth'
  motor.frequency.setValueAtTime(opening ? 150 : 195, at)
  motor.frequency.linearRampToValueAtTime(opening ? 195 : 150, end)
  motor.connect(filter(c, 'lowpass', 520, 1.2)).connect(gainNode(c, 0.22)).connect(env)
  motor.start(at)
  motor.stop(end + 0.05)
  const rollers = c.createBufferSource()
  rollers.buffer = buffers(c).brown
  rollers.connect(filter(c, 'bandpass', 900, 0.9)).connect(gainNode(c, 0.9)).connect(env)
  rollers.start(at, Math.random() * 3)
  rollers.stop(end + 0.05)
  if (!opening) {
    burst(c, dest, end - 0.04, { type: 'lowpass', frequency: 500, gain: 0.35 * gain, attack: 0.003, decay: 0.12 })
    tone(c, dest, end - 0.04, { frequency: 95, glideTo: 60, gain: 0.3 * gain, decay: 0.15 })
  }
}

/** Plays a one-off sound at `at` (AudioContext seconds) into `dest`. */
export function playSound(c: BaseAudioContext, dest: AudioNode, sound: OneShot, at: number, gain = 1): void {
  switch (sound) {
    case 'beep':
    case 'beep-high':
      tone(c, dest, at, { frequency: sound === 'beep' ? 1000 : 1400, gain: 0.32 * gain, decay: 0.14 })
      return
    case 'tick':
      tone(c, dest, at, { type: 'triangle', frequency: 1250, gain: 0.3 * gain, attack: 0.002, decay: 0.045 })
      return
    case 'tick-urgent':
      for (const offset of [0, 0.11]) tone(c, dest, at + offset, { type: 'triangle', frequency: 1650, gain: 0.34 * gain, attack: 0.002, decay: 0.06 })
      return
    case 'timer-end':
      tone(c, dest, at, { type: 'triangle', frequency: 440, gain: 0.34 * gain, decay: 0.2 })
      tone(c, dest, at + 0.2, { type: 'triangle', frequency: 330, gain: 0.34 * gain, decay: 0.35 })
      return
    case 'clang': {
      // A big metal arm letting go: inharmonic partials, the high ones dying first.
      const partials: [number, number, number][] = [
        [196, 0.32, 1.6],
        [517, 0.22, 1.1],
        [1043, 0.14, 0.7],
        [1611, 0.1, 0.5],
        [2390, 0.06, 0.35],
      ]
      for (const [frequency, level, decay] of partials) tone(c, dest, at, { frequency, gain: level * gain, attack: 0.002, decay })
      burst(c, dest, at, { type: 'lowpass', frequency: 4000, gain: 0.35 * gain, attack: 0.002, decay: 0.05 })
      return
    }
    case 'pyro':
      // Explosive bolts: a sharp crack and a low thump.
      burst(c, dest, at, { type: 'lowpass', frequency: 2600, gain: 0.65 * gain, attack: 0.002, decay: 0.35 })
      tone(c, dest, at, { frequency: 90, glideTo: 35, gain: 0.6 * gain, attack: 0.003, decay: 0.45 })
      return
    case 'puff':
      // Small solid rockets (retro, ullage): a short soft rush.
      burst(c, dest, at + 0.08, { type: 'bandpass', frequency: 1200, q: 0.8, gain: 0.55 * gain, attack: 0.04, decay: 0.7 })
      return
    case 'whoosh':
      // The escape tower's motor: a loud rush falling away.
      burst(c, dest, at, { type: 'bandpass', frequency: 2600, q: 1.1, gain: 0.8 * gain, attack: 0.08, decay: 1.7, sweepTo: 320 })
      burst(c, dest, at, { buffer: 'brown', type: 'lowpass', frequency: 260, gain: 0.7 * gain, attack: 0.06, decay: 1.4 })
      return
    case 'thrusters':
      // Reaction control thrusters: a few short sharp puffs.
      for (const offset of [0, 0.16, 0.34, 0.47]) burst(c, dest, at + offset, { type: 'highpass', frequency: 1800, gain: 0.4 * gain, attack: 0.008, decay: 0.11 })
      return
    case 'clunk':
      tone(c, dest, at, { frequency: 115, glideTo: 70, gain: 0.45 * gain, attack: 0.003, decay: 0.18 })
      burst(c, dest, at, { type: 'lowpass', frequency: 650, gain: 0.35 * gain, attack: 0.002, decay: 0.09 })
      return
    case 'touchdown': {
      // The footpads hit: a deep thud, dust and a creak from the legs taking the weight.
      tone(c, dest, at, { frequency: 75, glideTo: 30, gain: 0.8 * gain, attack: 0.004, decay: 0.6 })
      burst(c, dest, at, { buffer: 'brown', type: 'lowpass', frequency: 320, gain: 0.55 * gain, attack: 0.004, decay: 0.3 })
      burst(c, dest, at + 0.1, { type: 'bandpass', frequency: 380, q: 14, gain: 2.2 * gain, attack: 0.05, decay: 0.7, sweepTo: 330 })
      burst(c, dest, at + 0.16, { type: 'bandpass', frequency: 760, q: 18, gain: 1.2 * gain, attack: 0.04, decay: 0.45, sweepTo: 700 })
      return
    }
    case 'ding':
      for (const [frequency, level] of [
        [1318.5, 0.32],
        [2637, 0.1],
        [3955.5, 0.04],
      ] as const)
        tone(c, dest, at, { frequency, gain: level * gain, attack: 0.004, decay: 1.6 })
      return
    case 'door-open':
    case 'door-close':
      doors(c, dest, at, 0.75 * gain, sound === 'door-open')
      return
  }
}

/** One layer of an engine: a looping noise or a tone, through a filter. */
type Layer =
  | { noise: keyof Buffers; type: BiquadFilterType; frequency: number; q?: number; gain: number }
  | { wave: OscillatorType; frequency: number; lowpass?: number; gain: number }

/** Each engine's layers, mixed so a level of 1 is about as loud for every kind. */
const ENGINES: Record<EngineKind, readonly Layer[]> = {
  // Five F-1s: a deep rumble, a roar and the famous crackle, with a sub-bass you feel.
  saturn: [
    { noise: 'brown', type: 'lowpass', frequency: 120, q: 0.5, gain: 1.1 },
    { noise: 'brown', type: 'bandpass', frequency: 320, q: 0.6, gain: 0.7 },
    { noise: 'white', type: 'bandpass', frequency: 700, q: 0.5, gain: 0.13 },
    { noise: 'crackle', type: 'bandpass', frequency: 1600, q: 0.6, gain: 0.9 },
    { wave: 'sine', frequency: 31, gain: 0.22 },
  ],
  // The J-2s up high: thinner, more hiss than rumble.
  j2: [
    { noise: 'brown', type: 'lowpass', frequency: 200, gain: 0.85 },
    { noise: 'white', type: 'bandpass', frequency: 1100, q: 0.6, gain: 0.16 },
  ],
  // The lunar module's descent engine: a steady hiss.
  lander: [
    { noise: 'brown', type: 'lowpass', frequency: 260, gain: 0.95 },
    { noise: 'white', type: 'bandpass', frequency: 1800, q: 0.5, gain: 0.35 },
  ],
  // Its ascent engine: smaller and sharper.
  ascent: [
    { noise: 'brown', type: 'lowpass', frequency: 300, gain: 0.8 },
    { noise: 'white', type: 'bandpass', frequency: 2400, q: 0.6, gain: 0.4 },
  ],
  // The elevator's motor and the rush of the shaft.
  lift: [
    { wave: 'sawtooth', frequency: 52, lowpass: 220, gain: 0.28 },
    { wave: 'sawtooth', frequency: 104, lowpass: 300, gain: 0.1 },
    { noise: 'brown', type: 'bandpass', frequency: 500, q: 0.7, gain: 0.45 },
  ],
}

/** A running engine: its loudness and tone can change, then it fades out and stops. */
export interface Engine {
  kind: EngineKind
  level: GainNode
  tone: BiquadFilterNode
  sources: AudioScheduledSourceNode[]
  stopped: boolean
}

/** Glides an AudioParam from where it is now to `value` over `seconds`. */
function glide(param: AudioParam, value: number, at: number, seconds: number): void {
  param.cancelScheduledValues(at)
  param.setValueAtTime(param.value, at)
  param.linearRampToValueAtTime(value, at + Math.max(0.01, seconds))
}

/** Starts an engine at `at`, rising to `level` over `ramp` seconds. */
export function startEngine(c: BaseAudioContext, dest: AudioNode, kind: EngineKind, level: number, ramp: number, toneHz: number, at = c.currentTime): Engine {
  const out = gainNode(c, 0)
  out.gain.setValueAtTime(0, at)
  out.gain.linearRampToValueAtTime(level, at + Math.max(0.01, ramp))
  const shape = filter(c, 'lowpass', toneHz, 0.5)
  shape.connect(out).connect(dest)
  const sources: AudioScheduledSourceNode[] = []
  for (const layer of ENGINES[kind]) {
    if ('noise' in layer) {
      const source = c.createBufferSource()
      source.buffer = buffers(c)[layer.noise]
      source.loop = true
      source.connect(filter(c, layer.type, layer.frequency, layer.q)).connect(gainNode(c, layer.gain)).connect(shape)
      source.start(at, Math.random() * source.buffer.duration)
      sources.push(source)
    } else {
      const osc = c.createOscillator()
      osc.type = layer.wave
      osc.frequency.value = layer.frequency
      const level = gainNode(c, layer.gain)
      if (layer.lowpass) osc.connect(filter(c, 'lowpass', layer.lowpass)).connect(level)
      else osc.connect(level)
      level.connect(shape)
      osc.start(at)
      sources.push(osc)
    }
  }
  return { kind, level: out, tone: shape, sources, stopped: false }
}

/** Changes an engine's loudness (and its tone) over `ramp` seconds, from now. */
export function setEngine(c: BaseAudioContext, engine: Engine, level: number, ramp: number, toneHz?: number): void {
  if (engine.stopped) return
  const at = c.currentTime
  glide(engine.level.gain, level, at, ramp)
  if (toneHz !== undefined) {
    engine.tone.frequency.cancelScheduledValues(at)
    engine.tone.frequency.setValueAtTime(engine.tone.frequency.value, at)
    engine.tone.frequency.exponentialRampToValueAtTime(toneHz, at + Math.max(0.01, ramp))
  }
}

/** Fades an engine out over `ramp` seconds and stops it. */
export function stopEngine(c: BaseAudioContext, engine: Engine, ramp: number, at = c.currentTime): void {
  if (engine.stopped) return
  engine.stopped = true
  glide(engine.level.gain, 0, at, ramp)
  for (const source of engine.sources) source.stop(at + Math.max(0.01, ramp) + 0.05)
}

// ---------- The live mix ----------

interface Mix {
  c: AudioContext
  /** The effects volume. */
  master: GainNode
  /** One-off sounds. */
  shots: GainNode
  /** Loops: silenced while the game is frozen, ducked under voices. */
  loops: GainNode
  gate: GainNode
  duck: GainNode
}

let mix: Mix | null = null
let engine: Engine | null = null
const hums = new Map<string, Engine>()
let lastSecondsLeft: number | null = null

function context(): Mix | null {
  if (mix) {
    if (mix.c.state === 'suspended') void mix.c.resume()
    return mix
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  const c = new Ctor()
  const limiter = c.createDynamicsCompressor()
  limiter.threshold.value = -8
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.003
  limiter.release.value = 0.25
  // The compressor adds its own make-up gain, (1 / its gain at 0 dB) ^ 0.6 in the
  // Web Audio spec: about +4.6 dB here. Taken back off, so it only limits.
  const atFullScale = 10 ** ((limiter.threshold.value * (1 - 1 / limiter.ratio.value)) / 20)
  const trim = gainNode(c, atFullScale ** 0.6)
  limiter.connect(trim).connect(c.destination)
  const master = gainNode(c, audioLevels().effects)
  master.connect(limiter)
  const shots = gainNode(c, 0.85)
  shots.connect(master)
  const duck = gainNode(c, 1)
  duck.connect(master)
  const gate = gainNode(c, 1)
  gate.connect(duck)
  // At full level the liftoff roar is about as loud as speech, its peaks under the limiter.
  const loops = gainNode(c, 0.34)
  loops.connect(gate)
  mix = { c, master, shots, loops, gate, duck }
  return mix
}

/** Plays a one-off sound now. */
function play(sound: OneShot, gain = 1): void {
  const m = context()
  if (m && gain > 0.01) playSound(m.c, m.shots, sound, m.c.currentTime, gain)
}

function engineOff(ramp: number): void {
  if (!engine || !mix) return
  stopEngine(mix.c, engine, ramp)
  engine = null
}

function stopLoops(): void {
  engineOff(0.2)
  if (mix) for (const hum of hums.values()) stopEngine(mix.c, hum, 0.2)
  hums.clear()
}

/** A cinematic event: start, change or stop the engine, or play a bang. */
function cinematicCue(id: string): void {
  const actions = CINEMATIC_SFX[id]
  if (!actions) return
  const m = context()
  if (!m) return
  for (const action of actions) {
    if (action.do === 'play') play(action.sound, action.gain)
    else if (action.do === 'off') engineOff(action.ramp)
    else if (action.do === 'level') {
      if (engine) setEngine(m.c, engine, action.level, action.ramp, action.tone)
    } else {
      engineOff(0.15)
      engine = startEngine(m.c, m.loops, action.kind, action.level, action.ramp, action.tone)
    }
  }
}

/**
 * How loud a car's sounds are for the player: full inside it, fading out
 * over about 25 m, and much quieter from another floor.
 */
export function carLoudness(state: ElevatorState, at: { x: number; z: number; level: string }): number {
  if (state.riding) return 1
  const car = state.def.car
  const distance = Math.hypot((car.x0 + car.x1) / 2 - at.x, (car.z0 + car.z1) / 2 - at.z)
  const near = Math.max(0, Math.min(1, 1 - (distance - 3) / 22))
  const level = state.def.stops[state.stop]?.level
  return level === at.level ? near : near * 0.35
}

function elevatorEvent(event: ElevatorEvent): void {
  if (event.kind === 'reset') {
    if (mix) for (const hum of hums.values()) stopEngine(mix.c, hum, 0.1)
    hums.clear()
    return
  }
  const loud = carLoudness(event.state, player)
  const id = event.state.def.id
  if (event.kind === 'doors-open') play('door-open', loud)
  else if (event.kind === 'doors-close') play('door-close', loud)
  else if (event.kind === 'arrive') {
    const hum = hums.get(id)
    if (hum && mix) stopEngine(mix.c, hum, 0.25)
    hums.delete(id)
    play('clunk', 0.6 * loud)
    play('ding', loud)
  } else if (event.kind === 'depart') {
    play('clunk', 0.6 * loud)
    const m = context()
    if (!m || loud < 0.02) return
    const old = hums.get(id)
    if (old) stopEngine(m.c, old, 0.1)
    // Speeding up and slowing down with the car's own ease in and out.
    const now = m.c.currentTime
    const ramp = Math.min(0.8, event.seconds / 3)
    const hum = startEngine(m.c, m.loops, 'lift', 0.8 * loud, ramp, 900, now)
    hum.level.gain.setValueAtTime(0.8 * loud, now + Math.max(ramp, event.seconds - ramp))
    hum.level.gain.linearRampToValueAtTime(0.25 * loud, now + event.seconds)
    hums.set(id, hum)
  }
}

/** Every 50 ms: silence the loops while frozen, duck under voices, tick the storm timer. */
function poll(): void {
  const state = useGame.getState()
  if (mix) {
    const now = mix.c.currentTime
    const frozen = state.screen !== 'game' || state.mode !== 'playing' || document.hidden
    mix.gate.gain.setTargetAtTime(frozen ? 0 : 1, now, 0.03)
    // About 10 dB down while someone speaks, so the roar never buries a line.
    mix.duck.gain.setTargetAtTime(voicePlaying() ? 0.3 : 1, now, 0.12)
  }
  const challenge = state.challenge
  if (challenge && challenge.stage === 'choose' && challenge.deadline !== null) {
    const left = Math.ceil((challenge.deadline - performance.now()) / 1000)
    if (lastSecondsLeft !== null && left < lastSecondsLeft && left >= 1) play(left <= 5 ? 'tick-urgent' : 'tick')
    lastSecondsLeft = left
  } else {
    lastSecondsLeft = null
  }
}

let teardown: (() => void) | null = null

/** Starts the sound effects (once, from src/main.tsx). Returns a function that stops them. */
export function startSfx(): () => void {
  if (typeof window === 'undefined') return () => {}
  teardown?.()
  const offCue = onCinematicCue(cinematicCue)
  const offElevator = onElevatorEvent(elevatorEvent)
  const offLevels = onAudioLevels((levels) => {
    if (mix) mix.master.gain.setTargetAtTime(levels.effects, mix.c.currentTime, 0.05)
  })
  const offStore = useGame.subscribe((state, previous) => {
    // The launch countdown: a beep on each number, in step with the cockpit screen.
    const count = state.sequence?.id === 'launch' ? state.sequence.countdown : null
    const before = previous.sequence?.id === 'launch' ? previous.sequence.countdown : null
    if (count !== null && count > 0 && count !== before) play(count <= 3 ? 'beep-high' : 'beep')
    // The cinematic is over or skipped (Skip fires no more events): its engine stops.
    if (previous.sequence && (!state.sequence || state.sequence.id !== previous.sequence.id)) engineOff(0.3)
    // A storm timer ran out.
    if (state.challenge?.stage === 'result' && previous.challenge?.stage === 'choose' && state.challenge.outcome?.timedOut) play('timer-end')
    // A new run: nothing from the last one keeps going. (On the menu the loops are only
    // silenced, by poll(), so Continue in the middle of a launch or a ride picks them up again.)
    if (state.runId !== previous.runId) stopLoops()
  })
  const timer = window.setInterval(poll, 50)
  // Browsers start audio only after a click or a key.
  const unlock = () => {
    if (mix?.c.state === 'suspended') void mix.c.resume()
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  teardown = () => {
    offCue()
    offElevator()
    offLevels()
    offStore()
    window.clearInterval(timer)
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    stopLoops()
    teardown = null
  }
  return teardown
}

// A hot update in the dev build starts a fresh copy: stop this one first, or every edit would double the roar.
import.meta.hot?.dispose(() => teardown?.())
