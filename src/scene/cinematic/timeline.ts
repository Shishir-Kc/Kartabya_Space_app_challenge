/**
 * A small data-driven cinematic system, shared by the launch, the landing
 * and (later) the Phase 10 cutscenes.
 *
 * A script is a list of shots back to back, and timed events:
 *
 * - A shot is either the cockpit (the player's own seat, first person) or an
 *   outside view of a stage (the launch pad, the landing site), with camera
 *   keyframes: position, a look-at target and a field of view, eased
 *   between. A key can follow the script's moving subject (the rocket, the
 *   lander), so the camera can track it.
 * - An event happens at a moment: it can show a small label naming what
 *   is happening (two to four words, so kids learn the names), a big
 *   title ("LIFTOFF"), or a fade to black with a line of text ("Later, in
 *   Earth orbit"), and always calls the sound hook with its id.
 *
 * Everything here is pure (no three.js scene), so the checks can test it.
 */
import type { CinematicCamera, StageId, Vec3 } from '../../state/cinematic'

export type Ease = 'linear' | 'in' | 'out' | 'inOut'

export function ease(kind: Ease, u: number): number {
  const t = Math.max(0, Math.min(1, u))
  switch (kind) {
    case 'linear':
      return t
    case 'in':
      return t * t
    case 'out':
      return 1 - (1 - t) * (1 - t)
    case 'inOut':
      return t * t * (3 - 2 * t)
  }
}

/** A value at time `t` from [time, value] pairs, eased between neighbours and held at the ends. */
export function keyframes(t: number, pairs: readonly (readonly [number, number])[], kind: Ease = 'inOut'): number {
  const first = pairs[0]
  if (!first) return 0
  if (t <= first[0]) return first[1]
  for (let i = 1; i < pairs.length; i++) {
    const a = pairs[i - 1]!
    const b = pairs[i]!
    if (t <= b[0]) return a[1] + (b[1] - a[1]) * ease(kind, (t - a[0]) / (b[0] - a[0]))
  }
  return pairs[pairs.length - 1]![1]
}

/** Straight-line interpolation through [time, value] pairs (no easing). */
export function linear(t: number, pairs: readonly (readonly [number, number])[]): number {
  return keyframes(t, pairs, 'linear')
}

export interface CameraKey {
  /** Seconds from the start of the shot. */
  at: number
  /** Where the camera is; with `follow`, an offset from the subject. */
  position: Vec3
  /** What it looks at: a point, or (with `follow`) an offset from the subject. */
  target: Vec3
  /** Vertical field of view, degrees. */
  fov: number
  /** Easing into this key from the one before. */
  ease?: Ease
  /** The position rides along with the subject. */
  follow?: boolean
  /** The target is the subject (plus `target` as an offset). */
  track?: boolean
  /** The position's height is above the ground there (the script's `ground`). */
  aboveGround?: boolean
}

export interface Shot {
  id: string
  scene: 'cockpit' | StageId
  /** Which part of the stage it shows, if the stage has more than one (the launch: the pad, or high up in space). */
  set?: string
  /** Far plane for this shot, metres (the stage's default if left out). */
  far?: number
  /** Seconds from the start of the script. */
  from: number
  to: number
  /** Camera keys for an outside shot. */
  keys?: CameraKey[]
}

export interface CinematicEvent {
  /** Seconds from the start of the script. */
  at: number
  id: string
  /** A small label naming what is happening, two to four words ("Booster separation"). */
  label?: string
  /** A big title across the screen ("LIFTOFF"). */
  banner?: string
  /** A fade to black and back, with a line of text, lasting `seconds`. */
  fade?: { text: string; seconds: number }
}

export interface CinematicScript {
  id: string
  duration: number
  /** The stage the outside shots show (built while the cockpit part plays, disposed afterwards). */
  stage: StageId
  shots: Shot[]
  events: CinematicEvent[]
  /** Where the moving subject is at a time (the rocket's or lander's centre). */
  subject: (t: number) => Vec3
  /** Ground height, for keys placed `aboveGround`. */
  ground?: (x: number, z: number) => number
}

/** The shot playing at time `t` (the last one after the end). */
export function shotAt(script: CinematicScript, t: number): Shot {
  return script.shots.find((shot) => t >= shot.from && t < shot.to) ?? script.shots[script.shots.length - 1]!
}

function resolve(script: CinematicScript, key: CameraKey, subject: Vec3): { position: Vec3; target: Vec3 } {
  let position: Vec3 = key.follow ? [subject[0] + key.position[0], subject[1] + key.position[1], subject[2] + key.position[2]] : key.position
  if (key.aboveGround && script.ground) position = [position[0], position[1] + script.ground(position[0], position[2]), position[2]]
  const target: Vec3 = key.track ? [subject[0] + key.target[0], subject[1] + key.target[1], subject[2] + key.target[2]] : key.target
  return { position, target }
}

/** The camera for an outside shot at time `t` (script time). */
export function cameraAt(script: CinematicScript, shot: Shot, t: number): CinematicCamera {
  const keys = shot.keys ?? []
  const subject = script.subject(t)
  const local = t - shot.from
  const first = keys[0]
  if (!first) return { position: [0, 10, 30], target: subject, fov: 50 }
  let a = first
  let b = first
  for (const key of keys) {
    if (key.at <= local) a = key
    if (key.at >= local) {
      b = key
      break
    }
    b = key
  }
  const ra = resolve(script, a, subject)
  const rb = resolve(script, b, subject)
  const u = b.at > a.at ? ease(b.ease ?? 'inOut', (local - a.at) / (b.at - a.at)) : 0
  const mix = (p: Vec3, q: Vec3): Vec3 => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]
  return { position: mix(ra.position, rb.position), target: mix(ra.target, rb.target), fov: a.fov + (b.fov - a.fov) * u }
}

/** Events after `from` up to and including `to` (script time). */
export function eventsBetween(script: CinematicScript, from: number, to: number): CinematicEvent[] {
  return script.events.filter((event) => event.at > from && event.at <= to)
}

/** The label showing at time `t`: the latest labelled event, for a few seconds. */
export function labelAt(script: CinematicScript, t: number, hold = 3.5): string | null {
  let label: string | null = null
  for (const event of script.events) {
    if (event.label && event.at <= t && t < event.at + hold) label = event.label
  }
  return label
}

/** The fade playing at time `t`, if any: its text and how far through it is (0 to 1). */
export function fadeAt(script: CinematicScript, t: number): { text: string; progress: number } | null {
  for (const event of script.events) {
    if (event.fade && event.at <= t && t < event.at + event.fade.seconds) return { text: event.fade.text, progress: (t - event.at) / event.fade.seconds }
  }
  return null
}

/** The big title showing at time `t`, for a couple of seconds after its event. */
export function bannerAt(script: CinematicScript, t: number, hold = 2.6): string | null {
  let banner: string | null = null
  for (const event of script.events) {
    if (event.banner && event.at <= t && t < event.at + hold) banner = event.banner
  }
  return banner
}

/**
 * A smooth curve through [time, value] pairs that never overshoots
 * (monotone cubic, Fritsch–Carlson): for altitudes and distances, which
 * must keep falling without stopping at every key. Held at the ends.
 */
export function curve(t: number, pairs: readonly (readonly [number, number])[]): number {
  const n = pairs.length
  if (n === 0) return 0
  if (t <= pairs[0]![0]) return pairs[0]![1]
  if (t >= pairs[n - 1]![0]) return pairs[n - 1]![1]
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i++) slopes.push((pairs[i + 1]![1] - pairs[i]![1]) / (pairs[i + 1]![0] - pairs[i]![0]))
  const tangents: number[] = [slopes[0]!]
  for (let i = 1; i < n - 1; i++) {
    const a = slopes[i - 1]!
    const b = slopes[i]!
    // The harmonic mean of the slopes either side keeps the curve from overshooting.
    tangents.push(a * b <= 0 ? 0 : (2 * a * b) / (a + b))
  }
  tangents.push(slopes[n - 2]!)
  let i = 0
  while (t > pairs[i + 1]![0]) i++
  const [x0, y0] = pairs[i]!
  const [x1, y1] = pairs[i + 1]!
  const h = x1 - x0
  const s = (t - x0) / h
  const s2 = s * s
  const s3 = s2 * s
  return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * tangents[i]! + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * tangents[i + 1]!
}
