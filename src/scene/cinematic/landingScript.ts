/**
 * The lunar landing, as a cinematic script: the mirror of the launch.
 *
 * 1. Cockpit, powered descent (time squeezed): strapped in, the screen
 *    showing altitude, descent rate and fuel, and the phase.
 *    - Powered descent starts about 15 km up: a steady low rumble.
 *    - Braking: the vehicle flies tipped over, engine first, so the windows
 *      look down at the surface sliding past, craters rushing by.
 *    - Pitch-over, about 2 km up: it swings upright, and the landing site
 *      comes into view ahead: the landing pad, the outpost's modules and the
 *      solar field, with long low-Sun shadows.
 *    TODO: source (the phases and heights).
 * 2. Outside, final descent and touchdown:
 *    - A, chase view: behind and above the lander, the plume pointing down.
 *    - B, from the ground near the pad, tilting down after it: it slows to
 *      a near-hover, edges sideways, then comes straight down, its long
 *      shadow sliding in to meet it. The dust sprays out flat and fast in
 *      straight lines and falls straight back: there is no air on the Moon,
 *      so there is no cloud. Touchdown: the legs give a little, the engine
 *      stops, and the last dust drops almost at once. TODO: source.
 * 3. Cut to the arrival at the outpost: at the foot of the ladder.
 *
 * Simplifications: times are squeezed, and the crew land in the cabin they
 * flew in, seen from outside as the Apollo lunar module (on Apollo they
 * moved into it from the command module). Coordinates are the outpost's
 * (the landing pad at x -62, z 18); the lander flies in from the west.
 */
import type { Vec3 } from '../../state/cinematic'
import { lunarGround } from '../kit/lunar'
import { OUTPOST } from '../../maps/outpost'
import { curve, keyframes, type CinematicScript } from './timeline'

/** Where the lander comes down (the outpost's landing pad and its lander prop). */
export const LANDING_PAD = { x: -62, z: 18 }
/** The lander faces the outpost, as the parked lander does. */
export const LANDER_YAW = Math.PI / 2

export const LANDING_TIMES = {
  pitchOverStart: 9,
  pitchOverEnd: 11.5,
  /** About 500 m up: cut to outside. */
  cutOut: 15,
  groundShot: 22,
  dust: 28.6,
  touchdown: 31,
  end: 34,
} as const

const T = LANDING_TIMES

let padGround: number | null = null
/** The ground height at the pad (the levelled pad on the lunar terrain). */
export function padHeight(): number {
  if (padGround === null) padGround = lunarGround(OUTPOST)?.(LANDING_PAD.x, LANDING_PAD.z) ?? 0
  return padGround
}

/** Height of the footpads above the pad, metres. TODO: source (15 km at the start of powered descent). */
export function landerAltitude(t: number): number {
  if (landerMotion.override) return Math.max(0, landerMotion.override.pose(t).base[1] - padHeight())
  return Math.max(
    0,
    curve(t, [
      [0, 15000],
      [3, 10500],
      [9, 2000],
      [15, 500],
      [19, 150],
      [22, 60],
      // A near-hover while it edges sideways over the pad, then straight down, gently.
      [24.5, 28],
      [27.5, 20],
      [29.5, 5],
      [30.5, 1.2],
      [T.touchdown, 0],
    ]),
  )
}

/** How far short of the pad it still is, metres (flying east). */
export function landerRange(t: number): number {
  return Math.max(
    0,
    curve(t, [
      [0, 26000],
      [3, 17500],
      [9, 3200],
      [15, 900],
      [19, 260],
      [22, 90],
      [25, 10],
      [27.5, 0],
    ]),
  )
}

/** Sideways offset from the pad: it comes in a few metres north, then edges across. */
function landerSideways(t: number): number {
  return keyframes(t, [
    [24, -6],
    [27.5, 0],
  ])
}

/**
 * How far the vehicle is tipped forward (radians): engine first while
 * braking, so the windows look down; swinging upright at the pitch-over.
 */
export function landerPitch(t: number): number {
  if (landerMotion.override) return landerMotion.override.pose(t).pitch
  return keyframes(t, [
    [0, 1.05],
    [T.pitchOverStart, 0.95],
    // Upright, the windows look ahead and down at the landing site.
    [T.pitchOverEnd, 0.45],
    [T.cutOut, 0.5],
    [22, 0.08],
    [26, 0],
  ])
}

export interface LanderPose {
  /** The footpads' centre, in the world. */
  base: Vec3
  pitch: number
}

/**
 * Another cinematic on the landing-site stage (the ending scenes) moves
 * the lander its own way: a liftoff, or a second lander coming down. While
 * set, the pose, height, pitch and engine below follow it instead.
 */
export const landerMotion: { override: { pose: (t: number) => LanderPose; thrust: (t: number) => number } | null } = { override: null }

export function landerPose(t: number): LanderPose {
  if (landerMotion.override) return landerMotion.override.pose(t)
  return {
    base: [LANDING_PAD.x - landerRange(t), padHeight() + landerAltitude(t), LANDING_PAD.z + landerSideways(t)],
    pitch: landerPitch(t),
  }
}

/** The lander's middle, for the camera to track. */
export function landerMiddle(t: number): Vec3 {
  const base = landerPose(t).base
  return [base[0], base[1] + 2.4, base[2]]
}

/** Descent rate, metres per second (positive going down). */
export function descentRate(t: number): number {
  const dt = 0.05
  return (landerAltitude(t - dt) - landerAltitude(t + dt)) / (2 * dt)
}

/** Fuel left, percent. TODO: source (a real lander keeps a small reserve). */
export function fuelLeft(t: number): number {
  return keyframes(
    t,
    [
      [0, 100],
      [T.touchdown, 9],
    ],
    'linear',
  )
}

/** The engine: full while braking, throttled down near the ground, off at touchdown. */
export function engineThrust(t: number): number {
  if (landerMotion.override) return landerMotion.override.thrust(t)
  if (t >= T.touchdown) return 0
  return keyframes(t, [
    [0, 0.2],
    [1, 1],
    [T.pitchOverEnd, 0.85],
    [24, 0.55],
    [T.touchdown, 0.6],
  ])
}

export function phaseAt(t: number): string {
  if (t >= T.touchdown) return 'TOUCHDOWN'
  if (t < 1.5) return 'POWERED DESCENT'
  if (t < T.pitchOverStart) return 'BRAKING'
  if (t < T.pitchOverEnd) return 'PITCH-OVER'
  if (t < T.groundShot) return 'APPROACH'
  return 'FINAL DESCENT'
}

/** Cockpit rumble, metres: steady through the descent, then still on the ground. */
export function landingShake(t: number): number {
  if (t >= T.cutOut) return 0
  return 0.006 + 0.004 * keyframes(t, [[0, 0], [1.5, 1], [T.pitchOverEnd, 0.8]])
}

export const LANDING_SCRIPT: CinematicScript = {
  id: 'landing',
  duration: T.end,
  stage: 'landing-site',
  subject: landerMiddle,
  ground: (x, z) => lunarGround(OUTPOST)?.(x, z) ?? 0,
  shots: [
    { id: 'cockpit-descent', scene: 'cockpit', from: 0, to: T.cutOut },
    {
      // Behind and above the lander, the surface below.
      id: 'chase',
      scene: 'landing-site',
      from: T.cutOut,
      to: T.groundShot,
      keys: [
        { at: 0, position: [-60, 26, -20], target: [30, -14, 6], fov: 52, follow: true, track: true },
        { at: T.groundShot - T.cutOut, position: [-36, 15, -14], target: [24, -9, 4], fov: 46, follow: true, track: true },
      ],
    },
    {
      // From the ground near the pad, looking up, tilting down to follow it in.
      id: 'ground',
      scene: 'landing-site',
      from: T.groundShot,
      to: T.end + 1,
      keys: [
        { at: 0, position: [-40, 1.7, 44], target: [0, 0, 0], fov: 42, track: true, aboveGround: true },
        { at: T.touchdown - T.groundShot, position: [-40, 1.7, 44], target: [0, -0.8, 0], fov: 34, track: true, aboveGround: true, ease: 'out' },
      ],
    },
  ],
  events: [
    { at: 0.01, id: 'powered-descent', label: 'Powered descent' },
    { at: 3, id: 'braking', label: 'Braking' },
    { at: T.pitchOverStart, id: 'pitch-over', label: 'Pitch-over' },
    { at: T.cutOut, id: 'cut-to-chase', label: 'Final approach' },
    { at: T.groundShot, id: 'cut-to-ground' },
    { at: T.dust, id: 'dust' },
    { at: T.touchdown, id: 'touchdown', banner: 'TOUCHDOWN' },
    { at: T.touchdown + 0.05, id: 'engine-stop' },
    { at: T.end, id: 'arrive' },
  ],
}
