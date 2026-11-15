/**
 * The launch, as a cinematic script. Nothing is told in sentences: the
 * player sees each event happen, with a small label naming it.
 *
 * The rocket is the Saturn V (src/scene/saturnV.ts), real size, and the
 * events follow its flights to the Moon, in the same order.
 *
 * 1. Cockpit, the full countdown, T-10 to T-0: strapped in, the screen
 *    counting down, the cabin lights dimmed a little. At about T-6 the
 *    five F-1 engines start: a low rumble and a light shake through the
 *    seat. The windows are covered by the escape tower's shroud (the boost
 *    protective cover): the crew can't see out until it is jettisoned.
 * 2. Outside, one continuous cinematic from T-0:
 *    - Liftoff, from the ground by the pad: the engines at full thrust, the
 *      hold-down arms let go and the rocket rises, slowly at first because
 *      it is so heavy, the camera tilting up after it. Steam from the water
 *      deluge rolls out of the flame trench.
 *    - The climb, from far away near the shore: the rocket rolls and pitches
 *      over toward the ocean, its plume high up still in sunlight.
 *    - First stage separation, high up: the sky deep blue fading to black,
 *      Earth's curve below. The F-1s stop, retro-rockets in the engine
 *      fairings puff, and the empty first stage falls back and tumbles. The
 *      second stage's ullage motors puff and its five J-2s light. About
 *      half a minute later the interstage ring round them drops away.
 *    - Escape tower jettison: the tower's own motor fires and it pulls the
 *      shroud off the capsule, shooting forward and away.
 *    - Second stage separation: its engines stop and it drops back with the
 *      interstage, whose retro-rockets slow it; the third stage's one J-2
 *      lights. In a vacuum the exhaust spreads very wide, unlike the narrow
 *      flame at sea level. TODO: source.
 *    - A fade: "Later, in Earth orbit". The trans-lunar injection burn on
 *      the third stage, Earth large and curved below, sends the spacecraft
 *      toward the Moon.
 *    - Spacecraft separation: the third stage shuts down, the spacecraft
 *      (command and service module) separates with a small push and drifts
 *      ahead, and the adapter's four panels open like petals, showing the
 *      lunar module inside the empty stage. (The crew turn round, dock
 *      with it and pull it out; that isn't shown.)
 *    The crew access arm is swung away from the rocket in every outside
 *    shot: on real pads it retracts minutes before liftoff.
 * 3. Cockpit again, already weightless: the pen and checklist drifting, the
 *    windows open onto Earth. Then "Unbuckle".
 *
 * Simplifications: times are squeezed (the mission clock shows times close
 * to Apollo 11's). On the pad the coordinates are the launch center's (the
 * pad at x 46, z 0); high up, the rocket flies along +x over an Earth
 * below, at the origin of the stage's "space" set.
 */
import type { Vec3 } from '../../state/cinematic'
import type { SequenceState } from '../../state/store'
import { SATURN_V } from '../saturnLayout'
import { keyframes, linear, type CinematicScript } from './timeline'

/** The pad, and the height of the rocket's base (its nozzle exits) above the ground (exterior.ts). */
export const PAD: Vec3 = [46, 0, 0]
export const ROCKET_BASE = 6.05
/** About the middle of the rocket, above its base. */
const ROCKET_MIDDLE = 55

/** Script times, in seconds from the start. TODO: source (the order and the real times). */
export const LAUNCH_TIMES = {
  countdown: 1,
  /** About T-6: the F-1s start. */
  ignition: 5,
  /** T-0: cut outside. */
  liftoff: 11,
  farShot: 22,
  /** High up: from here on, the stage's space set. */
  space: 30,
  firstCutoff: 32.6,
  firstSeparation: 33,
  secondIgnition: 34,
  interstageJettison: 36.5,
  towerJettison: 39,
  secondCutoff: 44.5,
  secondSeparation: 45.3,
  thirdIgnition: 46.8,
  /** Fade to black: later, in Earth orbit. */
  orbitFade: 51,
  tliStart: 54,
  tliEnd: 58.5,
  spacecraftSeparation: 60,
  panelsStart: 61.5,
  panelsEnd: 65.5,
  /** Back in the cockpit, weightless. */
  cutIn: 68,
  unbuckle: 69.5,
} as const

const T = LAUNCH_TIMES

/** Countdown seconds left at script time `t` (10 ... 0), or null before the count starts. */
export function countdownAt(t: number): number | null {
  if (t < T.countdown) return null
  return Math.max(0, Math.ceil(T.liftoff - t - 1e-9))
}

/**
 * What the cockpit's console screens say during the launch, in place of
 * their tasks: "Preparing for launch" while strapped in and counting down,
 * "Launching" once the engines start (about T-6). Null otherwise: back in
 * the cockpit after the climb, or outside the launch, they show their tasks.
 */
export function launchConsoleTitle(sequence: SequenceState | null): string | null {
  if (sequence?.id !== 'launch') return null
  if (sequence.step === 'ascent') return 'Launching'
  if (sequence.step !== 'countdown') return null
  return sequence.countdown !== null && sequence.countdown <= T.liftoff - T.ignition ? 'Launching' : 'Preparing for launch'
}

export interface RocketPose {
  /** The base of the rocket (between the engines), in the world. */
  base: Vec3
  /** How far it has pitched over toward the east, radians. */
  tilt: number
  /** The roll program, radians about its long axis. */
  roll: number
}

/**
 * The climb from the pad, integrated once at a fixed step: the speed along
 * the flight path grows from nothing (2 m/s faster every second at first,
 * quicker as the fuel burns off), and the path tips over toward the east.
 */
const STEP = 1 / 60
const table: { x: number; y: number; tilt: number }[] = (() => {
  const out = [{ x: 0, y: 0, tilt: 0 }]
  let x = 0
  let y = 0
  for (let tau = 0; tau < 45; tau += STEP) {
    const speed = 2 * tau + 0.18 * tau * tau
    const tilt = pitchOver(tau)
    x += speed * Math.sin(tilt) * STEP
    y += speed * Math.cos(tilt) * STEP
    out.push({ x, y, tilt })
  }
  return out
})()

/** Pitch-over toward the ocean, seconds after liftoff. */
function pitchOver(tau: number): number {
  return keyframes(tau, [
    [9, 0],
    [24, 0.95],
    [40, 1.15],
  ])
}

/** On the pad and in the climb (the pad set). */
export function rocketPose(t: number): RocketPose {
  const tau = Math.max(0, t - T.liftoff)
  const i = Math.min(table.length - 1, Math.floor(tau / STEP))
  const p = table[i]!
  return {
    base: [PAD[0] + p.x, PAD[1] + ROCKET_BASE + p.y, PAD[2]],
    tilt: p.tilt,
    roll: keyframes(tau, [
      [5, 0],
      [12, 0.9],
    ]),
  }
}

/** The rocket's middle on the pad set, for the camera to track. */
export function rocketMiddle(t: number): Vec3 {
  const pose = rocketPose(t)
  return [pose.base[0] + Math.sin(pose.tilt) * ROCKET_MIDDLE, pose.base[1] + Math.cos(pose.tilt) * ROCKET_MIDDLE, pose.base[2]]
}

/** Height of the rocket's base above the pad at a time (the climb). */
export function rocketHeight(t: number): number {
  return rocketPose(t).base[1] - ROCKET_BASE - PAD[1]
}

// ---------- High up: the space set ----------

/** In the space set the stack's base sits here, flying along +x, nosed up a little (its middle near the origin). */
export const SPACE_BASE: Vec3 = [-55, 0, 0]
export const SPACE_PITCH = 0.14

/** Height above Earth for the space set, km: about 67 km at first stage separation, in orbit at 186 km. TODO: source. */
export function altitudeKm(t: number): number {
  if (t < T.space) return rocketHeight(t) / 1000
  return keyframes(t, [
    [T.space, 45],
    [T.firstSeparation, 67],
    [T.towerJettison, 90],
    [T.secondSeparation, 175],
    [T.orbitFade + 1, 186],
  ])
}

/** How black the sky is up there: deep blue fading to black. */
export function skyBlackness(t: number): number {
  return keyframes(t, [
    [T.space, 0.35],
    [T.towerJettison, 0.75],
    [T.secondSeparation, 1],
  ])
}

/** A part's offset from where it sits on the stack, in the stack's own frame (y along the rocket), and its tumble. */
export interface PartMotion {
  offset: Vec3
  /** Tumble, radians about the stack's x, y and z. */
  spin: Vec3
  /** Still in the picture (far away parts are hidden). */
  visible: boolean
}

const still: PartMotion = { offset: [0, 0, 0], spin: [0, 0, 0], visible: true }

export interface Separation {
  first: PartMotion
  interstage: PartMotion
  tower: PartMotion
  second: PartMotion
  /** The third stage, with the lunar module and the adapter's panels. */
  third: PartMotion
  spacecraft: PartMotion
}

/** Where each separating part is, relative to the stack. */
export function partMotion(t: number): Separation {
  // The empty first stage: slowed by its retro-rockets while the rest keeps accelerating, falling back and slowly tumbling.
  const first = (() => {
    const s = t - T.firstSeparation
    if (s <= 0) return still
    return { offset: [0.15 * s * s, -(1.5 * s + 0.5 * 6 * s * s), 0.05 * s * s], spin: [0.04 * s, 0, 0.07 * s], visible: s < 12 } as PartMotion
  })()
  // The ring round the J-2s slides back off them and falls away.
  const interstage = (() => {
    const s = t - T.interstageJettison
    if (s <= 0) return still
    return { offset: [0.04 * s * s, -(0.6 * s + 0.5 * 3.5 * s * s), 0], spin: [0.02 * s, 0, -0.03 * s], visible: s < 8 } as PartMotion
  })()
  const tower = (() => {
    const s = t - T.towerJettison
    if (s <= 0) return still
    return { offset: [0.6 * s * s, 4 * s + 0.5 * 24 * s * s, 0], spin: [0, 0, -0.18 * s * s], visible: s < 5 } as PartMotion
  })()
  const second = (() => {
    const s = t - T.secondSeparation
    if (s <= 0) return still
    // Gone for good after the jump to Earth orbit.
    return { offset: [0.12 * s * s, -(0.8 * s + 0.5 * 2.6 * s * s), 0], spin: [0.03 * s, 0, 0.06 * s], visible: t < T.orbitFade + 1 } as PartMotion
  })()
  // Spacecraft separation: the spacecraft drifts ahead, the empty stage falls behind, slowly turning.
  const sep = t - T.spacecraftSeparation
  const spacecraft: PartMotion = sep <= 0 ? still : { offset: [0, 0.9 * sep, 0], spin: [0, 0, 0], visible: true }
  const third: PartMotion = sep <= 0 ? still : { offset: [0.05 * sep * sep, -0.5 * sep, 0], spin: [0.02 * sep, 0, 0.05 * sep], visible: true }
  return { first, interstage, tower, second, third, spacecraft }
}

/** Engine and motor strengths, 0 to 1 each. */
export function launchEffects(t: number): {
  /** The first stage's five F-1s. */
  first: number
  /** The second stage's five J-2s. */
  second: number
  /** The third stage's J-2. */
  third: number
  towerMotor: number
  vent: number
  steam: number
  panels: number
} {
  const on = (from: number, to: number, ramp = 0.3) =>
    keyframes(t, [
      [from, 0],
      [from + ramp, 1],
      [to - ramp, 1],
      [to, 0],
    ])
  return {
    // The F-1s build up from the start of the ignition sequence to full thrust at T-0, when the hold-down arms let go.
    first: keyframes(t, [
      [T.ignition, 0],
      [T.ignition + 1.5, 0.6],
      [T.liftoff, 1],
      [T.firstCutoff - 0.2, 1],
      [T.firstCutoff, 0],
    ]),
    second: on(T.secondIgnition, T.secondCutoff, 0.5),
    third: Math.max(on(T.thirdIgnition, T.orbitFade, 0.5), on(T.tliStart, T.tliEnd, 0.5)),
    towerMotor: on(T.towerJettison - 0.1, T.towerJettison + 1.4, 0.1),
    vent: keyframes(t, [
      [T.ignition - 3, 1],
      [T.liftoff, 1],
      [T.liftoff + 2, 0],
    ]),
    // The deluge's steam: from engine start, strongest as the rocket leaves the pad, dying away as it climbs.
    steam: keyframes(t, [
      [T.ignition, 0],
      [T.ignition + 0.6, 0.6],
      [T.liftoff + 1, 1],
      [T.liftoff + 6, 0.5],
      [T.liftoff + 11, 0],
    ]),
    // The adapter's panels open after the spacecraft separates.
    panels: keyframes(t, [
      [T.panelsStart, 0],
      [T.panelsEnd, 1],
    ]),
  }
}

/**
 * How far up the stack the camera looks in the space set: the middle of
 * what is still flying (higher as each stage drops away), then partway
 * toward the spacecraft as it leaves.
 */
function spaceAlong(t: number): number {
  const ahead = partMotion(t).spacecraft.offset[1]
  const c = SATURN_V.centres
  return (
    keyframes(t, [
      [T.firstSeparation, ROCKET_MIDDLE],
      [T.firstSeparation + 4, (SATURN_V.firstTop + SATURN_V.height) / 2],
      [T.secondSeparation, (SATURN_V.firstTop + SATURN_V.height) / 2],
      [T.secondSeparation + 4, (SATURN_V.secondTop + SATURN_V.capsuleTop) / 2],
      [T.spacecraftSeparation, (SATURN_V.secondTop + SATURN_V.capsuleTop) / 2],
      [T.spacecraftSeparation + 3, (c.lander + c.spacecraft) / 2],
    ]) +
    ahead * 0.85
  )
}

function spaceSubject(t: number): Vec3 {
  const along = spaceAlong(t)
  return [SPACE_BASE[0] + Math.cos(SPACE_PITCH) * along, SPACE_BASE[1] + Math.sin(SPACE_PITCH) * along, SPACE_BASE[2]]
}

export function launchSubject(t: number): Vec3 {
  return t < T.space ? rocketMiddle(t) : spaceSubject(t)
}

/** Shaking in the cockpit, metres: a low rumble growing from engine start to T-0. Weightless afterwards. */
export function launchShake(t: number): number {
  if (t < T.ignition || t >= T.liftoff) return 0
  return linear(t, [
    [T.ignition, 0.001],
    [T.liftoff, 0.006],
  ])
}

/** The escape tower's shroud over the cockpit windows: on until the tower is jettisoned. */
export function shroudAt(t: number): number {
  return t < T.towerJettison ? 1 : 0
}

/**
 * Mission elapsed time shown, in real seconds: it runs fast. Close to
 * Apollo 11's (first stage separation at 2:42, escape tower at 3:18,
 * second stage at 9:09, Earth orbit at 11:49, trans-lunar injection from
 * 2:44:16 to 2:50:03, the spacecraft separating at about 3:17). TODO: source.
 */
export function missionTime(t: number): number {
  return linear(t, [
    [T.liftoff, 0],
    [T.space, 95],
    [T.firstSeparation, 162],
    [T.interstageJettison, 192],
    [T.towerJettison, 198],
    [T.secondSeparation, 549],
    [T.orbitFade, 709],
    [T.orbitFade + 3, 9700],
    [T.tliStart, 9856],
    [T.tliEnd, 10203],
    [T.spacecraftSeparation, 11820],
    [T.cutIn, 12300],
  ])
}

/** A clock as h:mm:ss. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const PAD_FAR = 9000
const SPACE_FAR = 90000

export const LAUNCH_SCRIPT: CinematicScript = {
  id: 'launch',
  duration: T.unbuckle,
  stage: 'launch-pad',
  subject: launchSubject,
  shots: [
    { id: 'cockpit-countdown', scene: 'cockpit', from: 0, to: T.liftoff },
    {
      // From the ground south-west of the pad, far enough back for the whole rocket, tilting up after it and zooming in a little.
      id: 'liftoff',
      scene: 'launch-pad',
      set: 'pad',
      far: PAD_FAR,
      from: T.liftoff,
      to: T.farShot,
      keys: [
        { at: 0, position: [-58, 2.5, 108], target: [0, -8, 0], fov: 46, track: true },
        { at: T.farShot - T.liftoff, position: [-58, 2.5, 108], target: [0, 0, 0], fov: 28, track: true, ease: 'in' },
      ],
    },
    {
      // From far away near the shore: the rocket arcs out over the ocean.
      id: 'far',
      scene: 'launch-pad',
      set: 'pad',
      far: PAD_FAR,
      from: T.farShot,
      to: T.space,
      keys: [
        { at: 0, position: [330, 4, 780], target: [0, 0, 0], fov: 26, track: true },
        { at: T.space - T.farShot, position: [334, 4, 776], target: [0, 0, 0], fov: 15, track: true, ease: 'in' },
      ],
    },
    {
      // High up, beside the rocket: the first stage drops away, then the interstage ring.
      id: 'first-stage',
      scene: 'launch-pad',
      set: 'space',
      far: SPACE_FAR,
      from: T.space,
      to: T.towerJettison - 0.5,
      keys: [
        { at: 0, position: [-80, 30, 115], target: [-6, -4, 0], fov: 46, follow: true, track: true },
        { at: T.towerJettison - 0.5 - T.space, position: [-50, 24, 135], target: [8, -4, 0], fov: 48, follow: true, track: true, ease: 'linear' },
      ],
    },
    {
      // Ahead and to the side: the tower shoots forward, pulling the shroud off the capsule.
      id: 'tower',
      scene: 'launch-pad',
      set: 'space',
      far: SPACE_FAR,
      from: T.towerJettison - 0.5,
      to: T.secondCutoff - 0.3,
      keys: [
        { at: 0, position: [70, 18, 62], target: [26, 2, 0], fov: 50, follow: true, track: true },
        { at: T.secondCutoff - 0.3 - (T.towerJettison - 0.5), position: [58, 24, 82], target: [42, 8, 0], fov: 56, follow: true, track: true, ease: 'out' },
      ],
    },
    {
      // Behind and below: the second stage falls back and the third stage's wide vacuum plume opens up.
      id: 'second-stage',
      scene: 'launch-pad',
      set: 'space',
      far: SPACE_FAR,
      from: T.secondCutoff - 0.3,
      to: T.orbitFade + 1,
      keys: [
        { at: 0, position: [-100, -16, 75], target: [-18, 0, 0], fov: 50, follow: true, track: true },
        { at: T.orbitFade + 1 - (T.secondCutoff - 0.3), position: [-130, 8, 90], target: [-14, 0, 0], fov: 50, follow: true, track: true, ease: 'linear' },
      ],
    },
    {
      // In Earth orbit, Earth large and curved below: the trans-lunar burn.
      id: 'orbit',
      scene: 'launch-pad',
      set: 'space',
      far: SPACE_FAR,
      from: T.orbitFade + 1,
      to: T.spacecraftSeparation - 0.5,
      keys: [
        { at: 0, position: [60, 32, 70], target: [-8, -16, 0], fov: 50, follow: true, track: true },
        { at: T.spacecraftSeparation - 0.5 - (T.orbitFade + 1), position: [40, 36, 88], target: [-8, -16, 0], fov: 50, follow: true, track: true, ease: 'linear' },
      ],
    },
    {
      // Round the spacecraft as it leaves the stage and the adapter's panels open on the lunar module.
      id: 'spacecraft',
      scene: 'launch-pad',
      set: 'space',
      far: SPACE_FAR,
      from: T.spacecraftSeparation - 0.5,
      to: T.cutIn,
      keys: [
        { at: 0, position: [-22, 14, 44], target: [0, 0, 0], fov: 46, follow: true, track: true },
        { at: (T.cutIn - (T.spacecraftSeparation - 0.5)) * 0.5, position: [8, 22, 44], target: [0, 0, 0], fov: 44, follow: true, track: true, ease: 'linear' },
        { at: T.cutIn - (T.spacecraftSeparation - 0.5), position: [34, 12, 32], target: [0, 0, 0], fov: 42, follow: true, track: true, ease: 'linear' },
      ],
    },
    { id: 'cockpit-coast', scene: 'cockpit', from: T.cutIn, to: T.unbuckle + 1 },
  ],
  events: [
    { at: T.countdown, id: 'countdown' },
    { at: T.ignition, id: 'engines-ignite' },
    { at: T.liftoff, id: 'liftoff', banner: 'LIFTOFF' },
    { at: T.liftoff + 0.05, id: 'hold-downs-release' },
    { at: T.liftoff + 8.6, id: 'tower-clear' },
    { at: T.liftoff + 9, id: 'roll-and-pitch' },
    { at: T.space, id: 'cut-to-space' },
    { at: T.firstCutoff, id: 'first-cutoff' },
    { at: T.firstSeparation, id: 'first-stage-separation', label: 'First stage separation' },
    { at: T.secondIgnition, id: 'second-ignition' },
    { at: T.interstageJettison, id: 'interstage-jettison' },
    { at: T.towerJettison, id: 'tower-jettison', label: 'Escape tower jettison' },
    { at: T.secondCutoff, id: 'second-cutoff' },
    { at: T.secondSeparation, id: 'second-stage-separation', label: 'Second stage separation' },
    { at: T.thirdIgnition, id: 'third-ignition' },
    { at: T.orbitFade, id: 'orbit', fade: { text: 'Later, in Earth orbit', seconds: 2.4 } },
    { at: T.tliStart, id: 'tli-start', label: 'Trans-lunar injection' },
    { at: T.tliEnd, id: 'tli-end' },
    { at: T.spacecraftSeparation, id: 'spacecraft-separation', label: 'Spacecraft separation' },
    { at: T.panelsStart, id: 'adapter-panels-open' },
    { at: T.cutIn, id: 'cut-to-cockpit' },
    { at: T.unbuckle, id: 'unbuckle' },
  ],
}
