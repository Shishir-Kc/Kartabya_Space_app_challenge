/**
 * The launch and the landing: cinematic sequences, part in the cockpit and
 * part outside (see ./cinematic for the scripts and the stages).
 *
 * Launch (about a minute, skippable): strapped in for the countdown, cut
 * outside at T-5 for engine start, the deluge's steam and liftoff, cut
 * back in for the climb (max Q, booster separation, the escape tower
 * flying off to open the windows, engine cut-off and floating, then the
 * trans-lunar burn), then "Unbuckle" (E) and the player floats free.
 *
 * Landing (after challenge 5, skippable): strapped in for the powered
 * descent with the surface through the windows, cut outside for the final
 * descent and touchdown, then on to the outpost, at the foot of the ladder.
 *
 * Timing lives here and in the scripts; the camera (PlayerController and
 * the stages), the space view (Space.tsx), the cockpit props
 * (SequenceDirector.tsx) and the overlay read state/flight.ts and
 * state/cinematic.ts.
 */
import { useSettings } from '../state/settings'
import type { GameMap, SequenceId } from '../maps/types'
import { advanceTransit, flight, resetFlight } from '../state/flight'
import { cinematic, cue, resetCinematic } from '../state/cinematic'
import { placePlayer, player } from '../state/player'
import { useGame, type SequenceState, type SequenceStep } from '../state/store'
import { fireEvent } from './cards'
import { clearHeld } from './input'
import { SETTLE_HEIGHT } from './floating'
import { altitudeKm, countdownAt, formatClock, LAUNCH_SCRIPT, LAUNCH_TIMES, launchShake, missionTime, shroudAt } from './cinematic/launchScript'
import { descentRate, fuelLeft, LANDING_SCRIPT, LANDING_TIMES, landerAltitude, landerMotion, landingShake, phaseAt } from './cinematic/landingScript'
import { endingScene, type EndingScene } from './cinematic/endingScript'
import type { Ending } from '../state/mission'
import { bannerAt, cameraAt, eventsBetween, fadeAt, labelAt, shotAt, type CinematicScript } from './cinematic/timeline'

const SCRIPTS: Record<'launch' | 'landing', CinematicScript> = { launch: LAUNCH_SCRIPT, landing: LANDING_SCRIPT }

/** The ending scene playing (set by startEndingScene), and what to do after it. */
let ending: EndingScene | null = null
let afterEnding: (() => void) | null = null

function scriptFor(id: SequenceId): CinematicScript {
  return id === 'ending' ? (ending?.script ?? LANDING_SCRIPT) : SCRIPTS[id]
}

/**
 * Plays the scene for this ending (on the landing-site stage), then calls
 * `then` (the ending card). Skippable like the other cinematics.
 */
export function startEndingScene(which: Ending, then: () => void): void {
  ending = endingScene(which)
  afterEnding = then
  landerMotion.override = { pose: ending.pose, thrust: ending.thrust }
  startSequence('ending')
}

/** The ending scene is over (or skipped): back to the game's camera, and on to the ending card. */
function finishEnding(): void {
  const state = useGame.getState()
  landerMotion.override = null
  ending = null
  state.setSequence(null)
  endCinematic()
  const then = afterEnding
  afterEnding = null
  then?.()
}

let elapsed = 0
let map: GameMap | null = null
/** Unbuckling floats the player from the seat to the aisle over this long. */
const GLIDE_SECONDS = 1.2
let glide: { fromX: number; fromZ: number; fromY: number; t: number } | null = null

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Writes the store's sequence state, only when something the HUD shows has changed. */
function publish(next: Omit<SequenceState, 'id'>): void {
  const state = useGame.getState()
  const current = state.sequence
  if (!current) return
  if (
    current.step !== next.step ||
    current.countdown !== next.countdown ||
    (current.label ?? null) !== (next.label ?? null) ||
    (current.fade ?? null) !== (next.fade ?? null) ||
    (current.banner ?? null) !== (next.banner ?? null) ||
    (current.outside ?? false) !== (next.outside ?? false)
  ) {
    state.setSequence({ ...current, ...next })
  }
}

/** Straps the player into the map's seat. */
function seatPlayer(target: GameMap): void {
  const seat = target.seat
  if (!seat) return
  placePlayer({ x: seat.x, z: seat.z, yaw: seat.yaw, level: seat.level, y: seat.eye })
  player.seated = true
  glide = null
}

/** Called once each time a map loads: plays its arrival sequence, or sets up floating. */
export function arrive(target: GameMap): void {
  map = target
  glide = null
  endCinematic()
  const skip = import.meta.env?.DEV && new URLSearchParams(window.location.search).has('skipLaunch')
  if (target.arrival === 'launch' && !skip) {
    resetFlight(true)
    startSequence('launch')
    return
  }
  resetFlight(false)
  useGame.getState().setSequence(null)
  if (target.seat && target.gravity === 'micro') {
    // Dev only: start floating in the aisle, as if the launch had happened.
    placePlayer({ x: target.seat.exit.x, z: target.seat.exit.z, yaw: target.seat.yaw, level: target.seat.level, y: SETTLE_HEIGHT })
  } else if (target.gravity === 'micro') {
    player.y = SETTLE_HEIGHT
  }
}

/** Dev builds only: `?seqAt=17` starts a sequence 17 seconds in, for screenshots. */
function devStart(): number {
  if (!import.meta.env?.DEV) return 0
  const value = Number(new URLSearchParams(window.location.search).get('seqAt'))
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function startSequence(id: SequenceId): void {
  if (!map && id !== 'ending') return
  clearHeld()
  elapsed = devStart()
  previous = elapsed - 1e-6
  if (map && id !== 'ending') seatPlayer(map)
  player.route = null
  flight.shake = 0
  flight.push = 0
  resetCinematic()
  cinematic.time = elapsed
  const script = scriptFor(id)
  // Build the outside stage now, while the cockpit part plays.
  cinematic.stage = script.stage
  useGame.getState().setCinematicStage(script.stage)
  if (id === 'launch') {
    flight.ascent = 0
    flight.sinceCutoff = -1
    flight.shroud = 1
    useGame.getState().setSequence({ id, step: 'countdown', countdown: null })
  } else if (id === 'ending') {
    useGame.getState().setSequence({ id, step: 'descent', countdown: null })
  } else {
    flight.descent = true
    useGame.getState().setSequence({ id, step: 'descent', countdown: null })
  }
  // Try again: on a replay the cutscenes jump straight to their end (a setting, on by default).
  // (Not an ending: it can differ from run to run, so it always plays; Skip still works.)
  if (id !== 'ending' && useGame.getState().runId > 0 && useSettings.getState().skipCutscenesOnReplay) skipSequence()
}

/** Takes down the cinematic stage and puts the camera back with the player. */
function endCinematic(): void {
  resetCinematic()
  flight.descent = false
  flight.push = 0
  if (useGame.getState().cinematicStage !== null) useGame.getState().setCinematicStage(null)
}

/**
 * Skips straight to the end state. Launch: past the trans-lunar burn,
 * unbuckled and floating. Landing: down at the outpost.
 */
export function skipSequence(): void {
  const sequence = useGame.getState().sequence
  if (!sequence) return
  if (sequence.id === 'landing') {
    finishLanding()
    return
  }
  if (sequence.id === 'ending') {
    finishEnding()
    return
  }
  flight.ascent = 1
  flight.shake = 0
  flight.cabinLight = 1
  flight.shroud = 0
  if (flight.sinceCutoff < 0) flight.sinceCutoff = 0
  endCinematic()
  unbuckle()
}

/** Down: on to the outpost, where the player steps off at the foot of the ladder. */
function finishLanding(): void {
  const state = useGame.getState()
  advanceTransit(5)
  state.setSequence(null)
  flight.shake = 0
  flight.cabinLight = 1
  endCinematic()
  state.startTransition({ message: 'Touchdown at the outpost', after: { kind: 'load', mapId: 'outpost' } })
}

/** Out of the seat: float gently into the aisle. */
export function unbuckle(): void {
  const state = useGame.getState()
  state.setSequence(null)
  endCinematic()
  fireEvent('float')
  player.seated = false
  player.vx = 0
  player.vy = 0
  player.vz = 0
  glide = { fromX: player.x, fromZ: player.z, fromY: player.y, t: 0 }
}

/**
 * Moves an unbuckling player from the seat to the aisle (no collision: they
 * start inside the seat). Returns true while gliding.
 */
export function updateGlide(dt: number): boolean {
  if (!glide || !map?.seat) return false
  glide.t += dt / GLIDE_SECONDS
  const t = smooth(0, 1, glide.t)
  player.x = glide.fromX + (map.seat.exit.x - glide.fromX) * t
  player.z = glide.fromZ + (map.seat.exit.z - glide.fromZ) * t
  player.y = glide.fromY + (SETTLE_HEIGHT - glide.fromY) * t
  if (glide.t >= 1) glide = null
  return true
}

/** Script time at the end of the last update, for firing events in between. */
let previous = 0

/** Advances whichever sequence is playing. Runs only while playing (pausing pauses it). */
export function updateSequence(dt: number): void {
  const state = useGame.getState()
  const sequence = state.sequence
  if (!sequence) return
  elapsed += dt
  const t = elapsed
  const script = scriptFor(sequence.id)
  cinematic.time = t

  // Which shot: the cockpit, or outside with the shot's camera.
  const shot = shotAt(script, t)
  cinematic.outside = shot.scene !== 'cockpit' && t < script.duration
  if (cinematic.outside) {
    cinematic.camera = cameraAt(script, shot, t)
    cinematic.far = shot.far ?? null
  }
  for (const event of eventsBetween(script, previous, t)) cue(event.id)
  previous = t
  const label = labelAt(script, t)
  const banner = bannerAt(script, t)
  const fade = fadeAt(script, t)?.text ?? null

  if (sequence.id === 'launch') {
    const T = LAUNCH_TIMES
    flight.shake = launchShake(t)
    flight.shroud = shroudAt(t)
    flight.push = 0
    const count = countdownAt(t)
    if (t < T.cutIn) {
      // Strapped in on the pad, then (unseen while outside) climbing away.
      flight.ascent = t < T.liftoff ? 0 : 1
      flight.cabinLight = t < T.liftoff ? 1 - 0.25 * Math.min(1, Math.max(0, (t - T.countdown) / (T.liftoff - T.countdown))) : 1
      flight.sinceCutoff = -1
    } else {
      // Back in the cockpit, already weightless: things have been floating for a while.
      flight.ascent = 1
      flight.cabinLight = 1
      flight.sinceCutoff = 6 + (t - T.cutIn)
      if (t >= T.cutIn + 0.5 && !state.seenCards.includes('microgravity')) fireEvent('float')
    }
    if (t < T.liftoff) {
      cinematic.readout = { title: 'COUNTDOWN', lines: [['T MINUS', count === null ? '–' : `${count}`]], note: count === null ? 'Go for launch' : '' }
      cinematic.screen = count === null ? 'GO FOR LAUNCH' : `T-${count}`
    } else {
      const met = formatClock(missionTime(t))
      const km = altitudeKm(t)
      cinematic.readout = {
        title: t < T.orbitFade ? 'ASCENT' : t < T.cutIn ? 'EARTH ORBIT' : 'COAST TO MOON',
        lines: [
          ['MET', met],
          ['ALT', km < 1 ? `${Math.round(km * 1000)} m` : `${Math.round(km)} km`],
        ],
        note: '',
      }
      cinematic.screen = t < T.cutIn ? 'ASCENT' : 'COAST TO MOON'
    }
    const step: SequenceStep = t < T.liftoff ? 'countdown' : t < T.cutIn ? 'ascent' : t < T.unbuckle ? 'cutoff' : 'unbuckle'
    publish({ step, countdown: step === 'countdown' ? count : null, label, banner, fade, outside: cinematic.outside })
    return
  }

  // An ending scene: outside shots only, no readout; then the ending card.
  if (sequence.id === 'ending') {
    publish({ step: 'descent', countdown: null, label, banner, fade, outside: cinematic.outside })
    if (t >= script.duration && state.mode === 'playing') finishEnding()
    return
  }

  // Landing.
  const L = LANDING_TIMES
  flight.shake = landingShake(t)
  flight.cabinLight = 1 - 0.2 * Math.min(1, t / 1.5)
  const altitude = landerAltitude(t)
  const height = altitude >= 1000 ? `${(altitude / 1000).toFixed(1)} km` : `${Math.round(altitude)} m`
  cinematic.readout = {
    title: phaseAt(t),
    lines: [
      ['ALT', height],
      ['DESCENT', `${Math.max(0, descentRate(t)).toFixed(t < L.cutOut ? 0 : 1)} m/s`],
      ['FUEL', `${Math.round(fuelLeft(t))}%`],
    ],
    note: '',
  }
  cinematic.screen = `ALT ${height}`
  publish({ step: 'descent', countdown: null, label, banner, fade, outside: cinematic.outside })
  if (t >= script.duration && state.mode === 'playing') finishLanding()
}
