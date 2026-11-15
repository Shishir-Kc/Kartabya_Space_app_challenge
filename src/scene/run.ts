/**
 * The run around the challenges: the night card after each outpost
 * challenge, the solar storm event, the lunar night, the ending, the
 * debrief and Try again. The daily rules are in src/state/days.ts; this
 * file only moves the game along, so tools/checks/run.mts can play whole
 * runs headless.
 */
import { CLOSING_LINES } from '../data/endings'
import { P1 } from '../data/phase1Lines'
import { getChallenge, type Challenge, type CrewLine } from '../data/challenges'
import { chanceWithin, devHazardMode, HAZARD_CHALLENGE, HAZARD_KINDS, HAZARD_MAP, HAZARD_RULES, seededRandom, startHazard, type HazardKind, type HazardMode } from '../state/hazards'
import { airlockState, resetAirlock } from './airlock'
import { advanceTransit } from '../state/flight'
import { lunarNight, nightTick, towNight, type NightReport } from '../state/days'
import { requireMap } from '../maps/registry'
import type { GameMap } from '../maps/types'
import { loseRover, parkRoverAtHome } from './rover'
import { meetsCondition } from '../state/decisions'
import { currentRadioDelay, emitCue, emitLine, setRadioDelay, stopVoice } from '../state/lines'
import { radioDelaySeconds } from '../data/science'
import type { Pose } from '../maps/types'
import { endMission, SPEAKER_IDS, type MissionState, type SpeakerId } from '../state/mission'
import { player } from '../state/player'
import { useGame, type ChallengeSession } from '../state/store'
import { openDecision } from './challenges'
import { clearTransmissions, transmissionHost, transmit } from '../state/transmissions'
import { ALERT_METEOROID, ALERT_STORM } from '../data/transmissionLines'
import { afterLaunchChallenge, beatActive, resetSceneMoments, startBeat } from './beats'
import { afterStoryChallenge, askFirst, resetStory } from './story'
import { startEndingScene } from './sequences'
import { clearHeld } from './input'
import { releaseLock, requestLock } from './pointerLock'
import { quitToMenu, startMission } from './session'

// ---------- Messages: a crew line on screen outside a panel ----------

// Houston's voice reaches the crew late once they leave Earth.
setRadioDelay(radioDelaySeconds(useGame.getState().mapId))
useGame.subscribe((state, before) => {
  if (state.mapId !== before.mapId) setRadioDelay(radioDelaySeconds(state.mapId))
})

/**
 * Shows a crew line as a big transmission (src/state/transmissions.ts): queued,
 * up while it's read (at least `ms`), firing onLine for its voice when it
 * appears. Houston's comes over the radio after the signal delay.
 */
export function showCaption(line: CrewLine, ms = 0): void {
  transmit(line, { ms })
}

/** Says what is left before moving on: the reminder line of the first challenge not done. */
export function remind(challenges: readonly Challenge[]): boolean {
  const first = challenges.find((challenge) => challenge.reminder)
  if (!first?.reminder) return false
  showCaption(first.reminder)
  return true
}

// ---------- After a challenge ----------

/** Where the storm shelter puts the player: in the shelter, facing its console. */
export const SHELTER_POSE: Pose = { x: -2, z: 2.6, yaw: Math.PI }

/**
 * Continue on a result screen. Outside the outpost: back to playing. At the
 * outpost a night passes (the lunar night after challenge 12), shown on a
 * card; a sheltered storm first fades the player into the storm shelter.
 * A mission that has ended goes to its ending.
 */
export function afterChallenge(session: ChallengeSession): void {
  const state = useGame.getState()
  const challenge = getChallenge(session.id)
  // The panel is closing: its crew's voices stop, so they never talk over what comes next.
  for (const line of [...(challenge?.lines ?? []), ...(session.outcome?.lines ?? []), P1.science04]) stopVoice(line.lineId)
  // A hazard can come again, so its console never turns green "done".
  if (!challenge?.hazard) state.markConsoleUsed(session.id)
  // On the spacecraft, each challenge moves the trip on toward the Moon.
  advanceTransit(session.id)
  useGame.setState({ challenge: null, alarm: false })

  if (state.mission.status === 'ended') {
    showEnding()
    return
  }
  if (challenge?.phase !== 'outpost') {
    useGame.setState({ mode: 'playing' })
    void requestLock()
    // The launch center's story carries on (Shishir's Phase 1 script).
    if (challenge?.map === 'launch-center') afterLaunchChallenge(session.id)
    else afterStoryChallenge(session.id, session.outcome?.outcomeId)
    return
  }
  // The outpost's story: the crew react and point to the next task (they speak after the night card).
  afterStoryChallenge(session.id, session.outcome?.outcomeId)

  // A hazard is an interruption, not a day's work: no night passes for it. A sheltered storm still fades into the shelter.
  if (challenge.hazard) {
    const sheltered = challenge.storm && challenge.stormKey !== 'transit' && session.outcome && !session.outcome.outcomeId.endsWith('-c')
    if (sheltered) {
      clearHeld()
      player.route = null
      state.startTransition({ message: 'Into the storm shelter', after: { kind: 'teleport', pose: SHELTER_POSE } })
      return
    }
    useGame.setState({ mode: 'playing' })
    void requestLock()
    return
  }
  const passed = challenge.last ? lunarNight(state.mission) : nightTick(state.mission)
  // After the lunar night the run is over: the ending follows the morning card.
  useGame.setState({ mission: challenge.last ? endMission(passed.state) : passed.state })
  // The ice (8): the drive home is done for the player, who arrives at the airlock with the rover parked.
  const map = requireMap(state.mapId)
  if (challenge.endsAtAirlock && map.rover) {
    clearHeld()
    player.route = null
    parkRoverAtHome()
    state.setDriving(false)
    resetAirlock(map, true)
    state.startTransition({
      message: 'Driving home to the airlock',
      after: { kind: 'teleport', pose: map.rover.towedTo, night: passed.report },
    })
    return
  }
  const sheltered = challenge.storm && challenge.stormKey !== 'transit' && session.outcome && !session.outcome.outcomeId.endsWith('-c')
  if (sheltered) {
    clearHeld()
    player.route = null
    state.startTransition({
      message: 'Into the storm shelter',
      after: { kind: 'teleport', pose: SHELTER_POSE, night: passed.report },
    })
    return
  }
  showNight(passed.report)
}

/**
 * A flat battery: the crew tow the player back to the airlock. The rover is
 * lost where it stopped, a mission day passes (with its card), and
 * lostRover makes challenge 11 cost more on foot.
 */
export function towHome(map: GameMap): void {
  const state = useGame.getState()
  if (!map.rover) return
  loseRover()
  state.setDriving(false)
  resetAirlock(map, true)
  const passed = towNight(state.mission)
  useGame.setState({ mission: passed.state })
  clearHeld()
  player.route = null
  state.startTransition({
    message: 'The crew had to tow you back. It cost a day.',
    after: { kind: 'teleport', pose: map.rover.towedTo, night: passed.report },
  })
}

/** Shows the morning card (the mode stays 'panel', so the player waits). */
export function showNight(report: NightReport): void {
  clearHeld()
  useGame.setState({ night: report, mode: 'panel', focus: null })
  for (const line of report.lines) emitLine(line)
  releaseLock()
}

/** Closes the night card: on to the ending if the mission ended, else back to playing. */
export function closeNight(): boolean {
  const state = useGame.getState()
  if (!state.night) return false
  useGame.setState({ night: null })
  if (state.mission.status === 'ended') {
    showEnding()
    return true
  }
  useGame.setState({ mode: 'playing' })
  void requestLock()
  return true
}

// ---------- The ending and the debrief ----------

/** Whose advice the player followed most (ties go in cast order; the commander if none). */
export function mostFollowed(mission: MissionState): SpeakerId {
  const counts = new Map<SpeakerId, number>()
  for (const record of mission.history) {
    const challenge = getChallenge(record.challenge)
    if (challenge?.kind !== 'choice') continue
    const advisedBy = challenge.options.find((option) => option.id === record.outcomeId)?.advisedBy
    if (advisedBy) counts.set(advisedBy, (counts.get(advisedBy) ?? 0) + 1)
  }
  let best: SpeakerId = 'commander'
  let most = 0
  for (const id of SPEAKER_IDS) {
    const count = counts.get(id) ?? 0
    if (count > most) {
      best = id
      most = count
    }
  }
  return best
}

/** The closing line for this run's ending. */
export function closingLine(mission: MissionState): CrewLine {
  const lines = CLOSING_LINES[mostFollowed(mission)]
  const good = mission.ending === 'outpost-thrives' || mission.ending === 'mission-complete'
  return good ? lines.good : lines.early
}

export function showEnding(): void {
  // How long the run spent on each map, for the handbook's luck report.
  useGame.setState((s) => ({ mission: { ...s.mission, played: { spacecraft: clock.perMap.spacecraft ?? 0, outpost: clock.perMap.outpost ?? 0 } } }))
  const state = useGame.getState()
  clearHeld()
  // On the Moon, the ending plays as a short scene first (skippable), then the card.
  const ending = state.mission.ending
  if (ending && state.mapId === 'outpost' && !state.sequence) {
    // No teaching card over the scene (it would also take Enter, the skip key).
    useGame.setState({ mode: 'playing', challenge: null, night: null, alarm: false, focus: null, card: null })
    releaseLock()
    startEndingScene(ending, showEndingCard)
    return
  }
  showEndingCard()
}

/** The ending card (and then the handbook). */
function showEndingCard(): void {
  const state = useGame.getState()
  clearHeld()
  useGame.setState({ afterword: 'ending', mode: 'panel', challenge: null, night: null, alarm: false, focus: null })
  releaseLock()
  emitCue(state.mission.ending === 'outpost-thrives' || state.mission.ending === 'mission-complete' ? 'ending-good' : 'ending-early')
  emitLine(closingLine(state.mission))
}

export function openDebrief(): void {
  if (useGame.getState().afterword) useGame.setState({ afterword: 'debrief' })
}

/** A fresh run with the same astronaut: everything resets. */
export function tryAgain(): void {
  resetStorm()
  clearTransmissions()
  resetSceneMoments()
  resetStory()
  useGame.setState({ afterword: null, night: null, caption: null, alarm: false })
  startMission(true)
}

/** Back to the lobby. The finished run is cleared, so Play starts a new one. */
export function backToMenu(): void {
  resetStorm()
  clearTransmissions()
  resetSceneMoments()
  resetStory()
  const state = useGame.getState()
  useGame.setState({ afterword: null, night: null, caption: null, alarm: false })
  state.enterGame(true)
  quitToMenu()
  useGame.setState({ started: false })
}

/** Keys on the night and ending cards. The debrief is worked with its buttons (Tab and Enter). */
export function runKey(code: string): boolean {
  const state = useGame.getState()
  const go = code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'Escape'
  if (state.night) return go ? closeNight() : false
  if (state.afterword === 'ending' && go) {
    openDebrief()
    return true
  }
  return false
}

// ---------- Hazards: storms and meteoroids at random ----------

/** Seconds Houston's warning shows before a storm's alarm, when Earth can reach the crew (plus the signal delay). */
export const WARNING_LEAD = 4

interface HazardClock {
  runId: number
  random: () => number
  mode: HazardMode
  /** Seconds of play on the current map, and in the whole run, and per map. */
  perMap: Record<string, number>
  mapSeconds: number
  mapId: string
  total: number
  /** When each kind last happened (run seconds). */
  last: Record<HazardKind, number>
  /** A storm warned about and coming. */
  warning: { kind: HazardKind; seconds: number } | null
}

const clock: HazardClock = {
  runId: -1,
  random: Math.random,
  mode: 'random',
  perMap: {},
  mapSeconds: 0,
  mapId: '',
  total: 0,
  last: { transitStorm: -Infinity, outpostStorm: -Infinity, meteoroid: -Infinity },
  warning: null,
}
let forcedMode: HazardMode | null = null

/** Checks and the dev probe: force hazards off, to the maximum, or back to random. */
export function setHazardMode(mode: HazardMode | null): void {
  forcedMode = mode
  clock.mode = mode ?? devHazardMode()
}

export function resetStorm(): void {
  const state = useGame.getState()
  clock.runId = state.runId
  clock.random = seededRandom(state.mission.seed)
  clock.mode = forcedMode ?? devHazardMode()
  clock.mapSeconds = 0
  clock.mapId = state.mapId
  clock.total = 0
  clock.perMap = {}
  clock.last = { transitStorm: -Infinity, outpostStorm: -Infinity, meteoroid: -Infinity }
  clock.warning = null
}

/** Where the hazard clock is, for checks and the dev probe. */
export function hazardClock(): { mapSeconds: number; total: number; warning: HazardKind | null; mode: HazardMode } {
  return { mapSeconds: clock.mapSeconds, total: clock.total, warning: clock.warning?.kind ?? null, mode: clock.mode }
}

/** True while a hazard may not start: cinematics, panels, cards, the airlock cycling, an elevator ride, a fade. */
function quiet(): boolean {
  const state = useGame.getState()
  if (state.screen !== 'game' || state.mode !== 'playing' || state.mission.status === 'ended') return true
  if (state.sequence || state.challenge || state.night || state.afterword || state.transition || state.card || beatActive()) return true
  if (state.elevatorPanel) return true
  const airlock = airlockState()
  return !!airlock && (airlock.phase === 'to-outside' || airlock.phase === 'to-inside')
}

/** A hazard begins now: counted, its flare drawn, the alarm for a storm, and its panel opens by itself. */
export function triggerHazard(kind: HazardKind, now = performance.now()): boolean {
  const challenge = getChallenge(HAZARD_CHALLENGE[kind])
  if (!challenge?.ready) return false
  const state = useGame.getState()
  if (clocksRun() !== state.runId) resetStorm()
  // Houston warned of this one already (the alert went up then).
  const warned = clock.warning?.kind === kind
  useGame.setState({ mission: startHazard(state.mission, kind, clock.random), alarm: kind !== 'meteoroid' })
  clock.last[kind] = clock.total
  clock.warning = null
  emitCue(kind === 'meteoroid' ? 'meteoroid-hit' : 'storm-alarm')
  let later = false
  const panel = () => openDecision(challenge.id, later ? performance.now() : now, { event: true })
  // After a meteoroid's alert, the commander asks how to fix the panel; then the panel opens.
  const open = () => (kind === 'meteoroid' && askFirst(11, panel) ? true : panel())
  // Without a warning: the alert first, impossible to miss; the panel (and its timer) opens when it closes.
  const alert = () =>
    !warned &&
    transmissionHost() &&
    transmit(kind === 'meteoroid' ? ALERT_METEOROID : ALERT_STORM, { style: 'alert', headline: kind === 'meteoroid' ? 'METEOROID STRIKE' : 'SOLAR STORM', ms: 3000, then: open })
  // The first storm at the outpost: 3 s of alarm while the crew hurry to the shelter (the alert shows meanwhile), then the panel.
  if (kind === 'outpostStorm' && state.mission.hazards.outpostStorm === 0 && startBeat('first-storm', open)) {
    later = true
    if (!warned && transmissionHost()) transmit(ALERT_STORM, { style: 'alert', headline: 'SOLAR STORM', ms: 3000 })
    return true
  }
  if (alert()) {
    later = true
    return true
  }
  return open()
}

/** The outpost storm by default (old name kept for the dev probe and checks). */
export function triggerStorm(now = performance.now(), id = 10): boolean {
  const kind = (Object.keys(HAZARD_CHALLENGE) as HazardKind[]).find((k) => HAZARD_CHALLENGE[k] === id) ?? 'outpostStorm'
  return triggerHazard(kind, now)
}

function clocksRun(): number {
  return clock.runId
}

/** Could this kind of hazard start now (ignoring luck)? */
export function hazardAllowed(kind: HazardKind): boolean {
  const state = useGame.getState()
  return (
    !!getChallenge(HAZARD_CHALLENGE[kind])?.ready &&
    HAZARD_MAP[kind] === state.mapId &&
    state.mission.hazards[kind] < HAZARD_RULES.max &&
    clock.mapSeconds >= HAZARD_RULES.graceSeconds &&
    clock.total - clock.last[kind] >= HAZARD_RULES.spacingSeconds
  )
}

/**
 * Runs the hazard clock while the player plays. Each second on a map can
 * bring a storm or a meteoroid, by chance (seeded per run), more likely the
 * longer the mission goes; never in the first 30 s on a map, never twice of
 * a kind within 60 s, and at most 3 of each. A storm comes with Houston's
 * warning first (when Earth can reach the crew), late by the signal delay.
 */
export function stormTick(dt: number, now = performance.now()): void {
  const state = useGame.getState()
  if (clock.runId !== state.runId) resetStorm()
  if (state.mapId !== clock.mapId) {
    clock.mapId = state.mapId
    clock.mapSeconds = 0
  }
  if (quiet()) return
  clock.mapSeconds += dt
  clock.total += dt
  clock.perMap[state.mapId] = (clock.perMap[state.mapId] ?? 0) + dt

  if (clock.warning) {
    clock.warning.seconds -= dt
    if (clock.warning.seconds <= 0) triggerHazard(clock.warning.kind, now)
    return
  }
  if (clock.mode === 'none') return
  for (const kind of HAZARD_KINDS) {
    if (!hazardAllowed(kind)) continue
    const roll = clock.random()
    const hit = clock.mode === 'max' || roll < chanceWithin(kind, state.mission, dt)
    if (!hit) continue
    const challenge = getChallenge(HAZARD_CHALLENGE[kind])!
    const houston = challenge.extraLines?.find((item) => item.line.speakerId === 'comms' && meetsCondition(item.when, state.mission))
    if (houston) {
      // The warning itself takes the signal delay to arrive from Earth, so the alarm comes that much later.
      clock.warning = { kind, seconds: WARNING_LEAD + currentRadioDelay() }
      transmit(houston.line, { style: 'alert', headline: kind === 'meteoroid' ? 'METEOROID STRIKE' : 'SOLAR STORM WARNING', ms: (WARNING_LEAD + 1) * 1000 })
      return
    }
    triggerHazard(kind, now)
    return
  }
}
