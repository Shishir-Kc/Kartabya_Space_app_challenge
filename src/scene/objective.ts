/**
 * What the player should do right now, for the task banner at the bottom of
 * the screen (src/hud/Hud.tsx): "Follow the trainer to the briefing room",
 * "Meet Houston at the communications building", "Go to the greenhouse".
 *
 * It is worked out every frame from the run itself (the tasks done, the
 * scenes played on this run, the line on screen, where the player is), so it
 * moves on with every voiced direction and can't be left behind by a
 * skipped scene, a task done out of order or a reload. The words follow the
 * crew's own lines and the "Next:" toasts.
 *
 * Without the 3D scene (the headless checks) nothing updates it, and the
 * banner shows the next task's title as before.
 */
import { create } from 'zustand'
import { CHALLENGES, getChallenge } from '../data/challenges'
import { roomAt } from '../maps/collision'
import { requireMap } from '../maps/registry'
import { isDone } from '../state/mission'
import { player } from '../state/player'
import { useGame } from '../state/store'
import { useTransmissions } from '../state/transmissions'
import { sceneHappened, useBeat } from './beats'
import { blockedBy } from '../state/decisions'

export interface Objective {
  /** The planned task this step leads to ("Task 1 of 9"); null once every task is done. */
  task: number | null
  /** What to do now, in a few words. */
  step: string
  /** Where, or how, in fewer words still. */
  hint?: string
}

export const useObjective = create<{ objective: Objective | null }>()(() => ({ objective: null }))

/** For each planned task: the way there, and what to do on arriving. */
const TASK_STEPS: Readonly<Record<number, { go: string; act: string; goHint?: string }>> = {
  1: { go: 'Go to the briefing room', act: 'Choose the power source' },
  2: { go: 'Go to the cargo hangar', act: 'Pack the cargo' },
  3: { go: 'Go to life support', goHint: 'At the back of the spacecraft', act: 'Help fix the air scrubber' },
  5: { go: 'Go up to the cockpit', act: 'Pick the landing site' },
  6: { go: 'Go to the power bay', goHint: 'First job: wake the base', act: 'Wake the base' },
  7: { go: 'Go to the greenhouse', act: 'Choose what to plant' },
  8: { go: 'Drive to the ice crater', act: 'Sample the ice' },
  9: { go: 'Go to crew quarters', goHint: 'The crew needs you', act: 'Help the tired crew' },
  12: { go: 'Go to command', goHint: 'The long night is coming', act: 'Plan for the lunar night' },
}

/** The planned tasks (no hazards), in mission order. */
const PLANNED = CHALLENGES.filter((c) => c.ready && !c.hazard).map((c) => c.id)

interface Spot {
  x: number
  z: number
  /** The room it's in; outdoors, none. */
  room?: string
  /** Outdoors: how close counts as there (the named area round it). */
  radius: number
  console: boolean
}

const spots = new Map<number, Spot | null>()

/** Where a task is done: its console, or its marker (the ice). */
function spotOf(id: number): Spot | null {
  if (spots.has(id)) return spots.get(id)!
  const challenge = getChallenge(id)
  let spot: Spot | null = null
  if (challenge) {
    const map = requireMap(challenge.map)
    const console = map.consoles.find((c) => c.challengeId === id)
    const marker = map.markers.find((m) => m.kind === 'challenge' && m.challengeId === id)
    const at = console
      ? { x: console.position.x, z: console.position.z, level: console.level }
      : marker && 'rect' in marker
        ? { x: (marker.rect.x0 + marker.rect.x1) / 2, z: (marker.rect.z0 + marker.rect.z1) / 2, level: marker.level }
        : null
    if (at) {
      const area = map.outdoor?.areas?.find((a) => Math.hypot(a.x - at.x, a.z - at.z) <= a.radius)
      spot = { x: at.x, z: at.z, room: roomAt(map, at.x, at.z, at.level)?.id, radius: area?.radius ?? 12, console: !!console }
    }
  }
  spots.set(id, spot)
  return spot
}

/** The scene playing now ('briefing' for 'briefing-2'), or null. */
function sceneNow(): string | null {
  const id = useBeat.getState().id
  return id ? id.replace(/-\d+$/, '') : null
}

/** One of these lines is on screen or waiting to be said. */
function pending(...lineIds: string[]): boolean {
  const { current, queue } = useTransmissions.getState()
  return [current, ...queue].some((t) => t && lineIds.includes(t.line.lineId))
}

/** The first planned task not done yet (null once all are). */
function firstUndone(done: (id: number) => boolean): number | null {
  return PLANNED.find((id) => !done(id)) ?? null
}

/** The step for a task on this map: the way there, or what to do there. */
function taskStep(id: number, room: string | undefined): Objective {
  const words = TASK_STEPS[id]
  const challenge = getChallenge(id)
  const spot = spotOf(id)
  const state = useGame.getState()
  const title = words?.act ?? challenge?.title ?? `Task ${id}`
  if (!spot) return { task: id, step: title }
  // The ice waits for the commander's briefing (it comes with the night after the tired crew).
  if (challenge && id === 8 && blockedBy(challenge, state.mission) === challenge) return { task: id, step: 'Wait for the commander’s briefing' }
  // Indoors: in its room. Outdoors: inside the named area round it.
  const there = spot.room ? room === spot.room : state.outdoors && Math.hypot(player.x - spot.x, player.z - spot.z) <= spot.radius
  if (there) return { task: id, step: title, hint: spot.console ? 'Walk up to the console and press E' : 'Find the marker and press E' }
  // An indoor task with the player outside: back in first.
  if (spot.room && state.outdoors) return { task: id, step: 'Go in through the airlock', hint: words?.go }
  // The ice: out to the rover, then the drive.
  if (!spot.room) {
    if (!state.outdoors) return { task: id, step: 'Go out through the airlock', hint: 'Then take the rover to the ice crater' }
    if (!state.driving) return { task: id, step: 'Climb into the rover', hint: 'Then drive to the ice crater' }
  }
  return { task: id, step: words?.go ?? title, hint: words?.goHint }
}

/** The launch center: the opening, the walk, the briefing, Houston, the cargo, the goodbye and the way up to the rocket. */
function launchCenterStep(room: string | undefined, done: (id: number) => boolean): Objective {
  const scene = sceneNow()
  const state = useGame.getState()
  if (!done(1)) {
    if (scene === 'briefing') return { task: 1, step: 'Listen to the briefing' }
    if (sceneHappened('briefing')) return taskStep(1, room)
    // The welcome card, then the opening: the trainer is about to say "Follow me to the briefing room".
    const openingToCome = state.mission.history.length === 0 && !sceneHappened('opening')
    if (openingToCome || (scene === 'night-before' && !useTransmissions.getState().current)) return { task: 1, step: 'Listen to your trainer' }
    // No walk on this run (the cargo was packed first): the briefing starts at the console.
    if (!sceneHappened('walk') && scene !== 'night-before') return taskStep(1, room)
    if (room === 'briefing-room') return { task: 1, step: 'Wait for the briefing to start' }
    return { task: 1, step: 'Follow the trainer to the briefing room' }
  }
  if (!done(2)) {
    if (scene === 'comms-visit') return useBeat.getState().asking ? { task: 2, step: 'Answer Houston', hint: 'Press 1 or 2' } : { task: 2, step: 'Talk to Houston' }
    if (scene === 'comms-no' || scene === 'comms-yes') return { task: 2, step: 'Listen to Houston' }
    // The trainer is still saying where to go.
    if (pending('p1-trainer-12', 'p1-trainer-13')) return { task: 2, step: 'Listen to your trainer' }
    if (!sceneHappened('comms-visit')) return { task: 2, step: 'Meet Houston at the communications building', hint: 'Out of the main exit' }
    return taskStep(2, room)
  }
  // Both tasks done: Houston says the rocket is ready; the trainer waits at the crew elevator to say goodbye.
  const next = firstUndone(done)
  if (scene === 'farewell') return { task: next, step: 'Say goodbye to your trainer' }
  if (pending('p1-comms-06', 'p1-comms-07')) return { task: next, step: 'Listen to Houston' }
  if (player.level === 'tunnel') {
    return room === 'pad-landing'
      ? { task: next, step: 'Take the tower elevator up', hint: 'To the crew access arm' }
      : { task: next, step: 'Walk through the crew tunnel', hint: 'To the launch pad' }
  }
  if (player.level === 'arm') return { task: next, step: 'Board the spacecraft', hint: 'In the clean room' }
  if (!sceneHappened('farewell')) return { task: next, step: 'Meet your trainer at the crew elevator', hint: 'Launch tower access' }
  return { task: next, step: 'Take the crew elevator down', hint: 'To the crew tunnel' }
}

/** The spacecraft: life support, the cockpit, then strap in for the landing. */
function spacecraftStep(room: string | undefined, done: (id: number) => boolean): Objective {
  // The commander's welcome after unbuckling says where to go.
  if (!done(3) && pending('p2-commander-01', 'p2-commander-02')) return { task: 3, step: 'Listen to the commander' }
  for (const id of [3, 5]) if (!done(id)) return taskStep(id, room)
  return { task: firstUndone(done), step: 'Strap in for the landing', hint: 'Your seat is in the cockpit' }
}

/** The outpost: in through the airlock, then each task where the crew ask for help. */
function outpostStep(room: string | undefined, done: (id: number) => boolean): Objective | null {
  const state = useGame.getState()
  if (sceneNow() === 'arrival') return { task: 6, step: 'Listen to the commander' }
  if (!done(6) && (state.outdoors || room === 'airlock')) return { task: 6, step: 'Go in through the airlock', hint: 'The outpost is waiting' }
  // The next task open now (7 and 9 in either order; the ice after its briefing; the lunar night last), else the next one.
  const left = PLANNED.filter((id) => getChallenge(id)?.map === 'outpost' && !done(id))
  const open = left.find((id) => !blockedBy(getChallenge(id)!, state.mission))
  const id = open ?? left[0]
  return id === undefined ? null : taskStep(id, room)
}

/** The step now, worked out from the run (null: no step, the banner shows the task's title). */
export function currentObjective(): Objective | null {
  const state = useGame.getState()
  const done = (id: number) => isDone(state.mission, id)
  const room = roomAt(requireMap(state.mapId), player.x, player.z, player.level)?.id
  if (state.mapId === 'launch-center') return launchCenterStep(room, done)
  if (state.mapId === 'spacecraft') return spacecraftStep(room, done)
  if (state.mapId === 'outpost') return outpostStep(room, done)
  return null
}

/** Each frame in the game: the banner's step, stored only when it changes. */
export function updateObjective(): void {
  const next = currentObjective()
  const now = useObjective.getState().objective
  if (now?.step === next?.step && now?.hint === next?.hint && now?.task === next?.task) return
  useObjective.setState({ objective: next })
}
