/**
 * Replays a run from its timeline (src/state/mission.ts `Step`): the same
 * seed, the same hazards with the same real flares, the same nights, and
 * the player's decisions, optionally with one decision swapped or every
 * hazard taken out. The Mission Handbook uses it to say honestly whether a
 * different choice would have helped, and how much was luck.
 */
import { getChallenge } from '../data/challenges'
import { towNight, nightTick } from './days'
import { commit, type Decision } from './decisions'
import { applyHazard } from './hazards'
import { createInitialMission, endMission, type MissionState, type Step } from './mission'

export interface ReplayOptions {
  /** Swap the decision at this timeline index for another one. */
  swap?: { index: number; decision: Decision }
  /** Take every hazard (and the player's answer to it) out of the run. */
  noHazards?: boolean
  /** Add these steps just before the lunar night (a stress test with extra hazards). */
  extraBeforeNight?: readonly Step[]
}

/**
 * The run's final state, or null when a swapped decision can't be played
 * in that replay (it is locked there, or a split no longer adds up).
 */
export function replay(seed: number, steps: readonly Step[], options: ReplayOptions = {}): MissionState | null {
  let state = createInitialMission(seed)
  let lastWasLunar = false
  let skipAnswer = false
  let extraDone = false
  const run = (list: readonly Step[], offset: number): boolean => {
    for (let i = 0; i < list.length; i++) {
      const step = list[i]!
      if (state.status === 'ended') return true
      if (step.kind === 'night' && step.lunar && !extraDone && options.extraBeforeNight) {
        extraDone = true
        if (!run(options.extraBeforeNight, -1)) return false
      }
      lastWasLunar = false
      if (step.kind === 'hazard') {
        if (options.noHazards) {
          skipAnswer = true
          continue
        }
        state = applyHazard(state, step.hazard, step.flareId)
      } else if (step.kind === 'decision') {
        const challenge = getChallenge(step.challenge)
        if (!challenge) continue
        if (challenge.hazard && skipAnswer) {
          skipAnswer = false
          continue
        }
        const swapped = offset >= 0 && options.swap?.index === offset + i
        const outcome = commit(challenge, state, swapped ? options.swap!.decision : step.decision)
        if (!outcome) {
          if (swapped) return false
          continue
        }
        state = outcome.after
      } else if (step.kind === 'night') {
        state = nightTick(state, step.lunar).state
        lastWasLunar = step.lunar
      } else if (step.kind === 'tow') {
        state = towNight(state).state
      }
    }
    return true
  }
  if (!run(steps, 0)) return null
  // The run ends after the lunar night, as in the game (src/scene/run.ts).
  if (state.status === 'running' && lastWasLunar) state = endMission(state)
  return state
}

/** How good an ending is, for comparing replays: thrives 3, complete 2, early returns 1 (supplies) and 0 (health). */
export function endingRank(state: MissionState | null): number {
  switch (state?.ending) {
    case 'outpost-thrives':
      return 3
    case 'mission-complete':
      return 2
    case 'early-return-supplies':
      return 1
    default:
      return 0
  }
}

/** A finer score within one ending: meters, food, crew and dose, all on one scale. */
export function outcomeScore(state: MissionState | null): number {
  if (!state) return -Infinity
  const health = Object.values(state.crewHealth).reduce((sum, h) => sum + (h === 'green' ? 10 : h === 'yellow' ? 5 : 0), 0)
  return (
    endingRank(state) * 1000 +
    state.meters.power +
    state.meters.lifeSupport +
    state.meters.shielding +
    state.foodDays * 3 +
    health -
    state.dose
  )
}
