/**
 * Moving between play modes, in one place so the rules stay consistent:
 *
 * - Losing pointer lock while playing means pause, unless we released it
 *   on purpose (opening a panel, or M to free the mouse for the map).
 * - Closing a panel asks for the lock again. If the browser refuses, the
 *   player keeps playing with arrow-key look.
 */
import { replayBeat, resetSceneMoments } from './beats'
import { resetStory } from './story'
import { clearTransmissions } from '../state/transmissions'
import { planRoute } from '../maps/navigation'
import { requireMap } from '../maps/registry'
import { getChallenge } from '../data/challenges'
import { placePlayer, player } from '../state/player'
import { useGame, type PanelContent, type TransitionAfter } from '../state/store'
import { advanceTransit, flight } from '../state/flight'
import { elevatorState, requestStop } from './elevatorLogic'
import { clearHeld } from './input'
import { startSequence, unbuckle } from './sequences'
import { useAirlock } from './airlock'
import { enterRover, exitRover, roverState } from './rover'
import { openDecision } from './challenges'
import { remind, showNight } from './run'
import { unfinishedOn } from '../state/decisions'
import { isLocked, releaseLock, requestLock } from './pointerLock'

let intentionalRelease = false

/** True once if the last loss of pointer lock was on purpose. */
export function consumeIntentionalRelease(): boolean {
  const value = intentionalRelease
  intentionalRelease = false
  return value
}

/** Leaves the pause menu. */
export function beginPlay(mouseLook: boolean): void {
  const state = useGame.getState()
  state.setStarted()
  state.setMode('playing')
  if (mouseLook) void requestLock()
}

/**
 * From the lobby into the mission: a new one (`fresh`, or when there is
 * none yet), or back to the one in progress. Called from a click, so the
 * browser lets the mouse be captured.
 */
export function startMission(fresh: boolean): void {
  clearHeld()
  // A new mission over one in progress ("Yes, start again"): its story starts over too, with the opening, the walk
  // and the briefing, and nobody still talking from the old one (Try again does the same).
  if (fresh && useGame.getState().started) {
    clearTransmissions()
    resetSceneMoments()
    resetStory()
  }
  useGame.getState().enterGame(fresh)
  void requestLock()
}

/** From the pause menu back to the lobby. The mission waits where it is. */
export function quitToMenu(): void {
  clearHeld()
  player.route = null
  useGame.getState().leaveGame()
  releaseLock()
}

export function pauseGame(): void {
  clearHeld()
  useGame.getState().setMode('paused')
  releaseLock()
}

/** Frees the mouse so the minimap can be clicked, without pausing. */
export function freeCursor(): void {
  if (!isLocked()) return
  intentionalRelease = true
  releaseLock()
}

/**
 * Shows an elevator car's panel on screen. It is a display only (the keys
 * work it), so the mouse stays captured and looking round keeps working.
 */
export function showElevatorPanel(id: string | null): void {
  const state = useGame.getState()
  if (state.elevatorPanel !== id) state.setElevatorPanel(id)
}

export function openPanel(panel: PanelContent): void {
  clearHeld()
  player.route = null
  useGame.getState().openPanel(panel)
  releaseLock()
}

export function closePanel(): void {
  useGame.getState().closePanel()
  void requestLock()
}

/**
 * Opens a challenge: its decision panel (src/scene/challenges.ts) once its
 * data is ready, or a "coming soon" panel until then. Reaching a challenge
 * that isn't ready still counts as doing it, so the route stays playable:
 * on the spacecraft the trip moves on toward the Moon.
 */
function openChallenge(challengeId: number, note: string): void {
  if (openDecision(challengeId)) return
  const challenge = getChallenge(challengeId)
  useGame.getState().markConsoleUsed(challengeId)
  advanceTransit(challengeId)
  openPanel({
    eyebrow: `Challenge ${challengeId}`,
    title: challenge?.title ?? `Challenge ${challengeId}`,
    note: `Coming soon. ${note}`,
  })
}

/** Uses whatever the player is looking at (the E key). */
export function activateFocus(): void {
  const state = useGame.getState()
  if (state.mode !== 'playing' || !state.focus) return
  const map = requireMap(state.mapId)
  const id = state.focus.id

  if (state.focus.kind === 'airlock') {
    useAirlock(id)
    return
  }

  // Climbing into the rover's driver's seat, and out again once it has stopped.
  if (state.focus.kind === 'rover') {
    const rover = roverState()
    if (!rover) return
    if (id === 'rover:enter' && !rover.lost) {
      clearHeld()
      player.route = null
      enterRover()
      state.setDriving(true)
      // Mouse look is relative to the rover while driving.
      player.yaw = 0
      player.pitch = -0.08
    } else if (id === 'rover:exit' && exitRover()) {
      state.setDriving(false)
      // Step out on the driver's side, facing the way the rover faces.
      player.x = rover.x - Math.cos(rover.yaw) * 1.6
      player.z = rover.z + Math.sin(rover.yaw) * 1.6
      player.yaw = rover.yaw
      player.pitch = 0
    }
    return
  }

  // "Unbuckle" at the end of the launch.
  if (state.focus.kind === 'sequence') {
    if (id === 'sequence:unbuckle') unbuckle()
    return
  }

  // Elevators: "elevator:<id>:call:<stop>" at a landing brings the car.
  // (Inside the car the keys work it: see elevatorKey in ./elevators.)
  if (state.focus.kind === 'elevator') {
    const [, elevatorId, , stop] = id.split(':')
    const car = elevatorId ? elevatorState(elevatorId) : undefined
    if (!car || !elevatorId) return
    requestStop(elevatorId, Number(stop))
    return
  }

  const item = map.consoles.find((candidate) => candidate.id === id)
  if (item) {
    openChallenge(item.challengeId, 'This console only checks that you can reach it.')
    return
  }

  const marker = map.markers.find((candidate) => candidate.id === id)
  // Notices only show their message; there is nothing to use.
  if (!marker || marker.kind === 'notice') return
  if (marker.kind === 'challenge') {
    openChallenge(marker.challengeId, 'This spot only checks that you can reach it.')
    return
  }
  if (marker.kind === 'sequence') {
    // The landing waits for every ready challenge on the spacecraft (3, the storm 4 and 5); the crew says what's left.
    const left = marker.sequence === 'landing' ? unfinishedOn(state.mapId, state.mission) : []
    if (left.length > 0) {
      if (!remind(left)) state.showToast(`Finish ${left[0]!.title} first`)
      return
    }
    startSequence(marker.sequence)
    return
  }
  if (marker.kind === 'cutscene') {
    // The night-before talk plays again whenever the player asks.
    if (marker.cutscene === 'night-before-launch') replayBeat('night-before')
    return
  }

  // Leaving a map (boarding the rocket) waits for its ready challenges; the trainer says what's left.
  const left = unfinishedOn(state.mapId, state.mission)
  if (left.length > 0) {
    if (!remind(left)) state.showToast(`Finish ${left[0]!.title} first`)
    return
  }

  clearHeld()
  player.route = null
  const destination = requireMap(marker.target)
  const ready = destination.id === marker.target
  state.startTransition(
    ready
      ? { message: marker.label, after: { kind: 'load', mapId: marker.target } }
      : { message: marker.unavailableMessage, after: { kind: 'teleport', pose: marker.returnTo } },
  )
}

/** Runs at the darkest point of a fade. */
export function runTransition(after: TransitionAfter): void {
  if (after.kind === 'teleport') {
    // A teleport also ends any cabin effects (the landing's shake).
    flight.shake = 0
    flight.cabinLight = 1
    placePlayer(after.pose)
    return
  }
  // The player controller places the player when the new map loads
  // (and plays its arrival sequence, like the launch).
  useGame.getState().loadMap(after.mapId)
}

/** At the end of a fade: back to playing, or straight into a panel the move asked for. */
export function finishTransition(after: TransitionAfter): void {
  useGame.getState().endTransition()
  if (after.kind === 'teleport' && after.then) openPanel(after.then)
  // A sheltered storm: the night card shows once the player is in the shelter.
  if (after.kind === 'teleport' && after.night) showNight(after.night)
}

/** Click-to-walk: walks the player into a room on the current map. */
export function walkTo(roomId: string): void {
  const state = useGame.getState()
  if (state.mode !== 'playing') return
  player.route = planRoute(requireMap(state.mapId), player, roomId, player.level)
}
