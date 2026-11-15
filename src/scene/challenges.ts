/**
 * The decision panel's controller: opening a challenge at its console, the
 * keys, picking, the split's + and −, the timer, committing and Continue.
 * The rules themselves are in src/state/decisions.ts and the drawing in
 * src/hud/ChallengePanel.tsx; this file only moves the session along, so
 * tools/checks/decisions.mts can play a challenge with keys alone.
 *
 * Keys: 1, 2, 3 pick an option; Enter commits; Esc backs out without
 * choosing (not on a timed challenge). In a split: the arrows or the number
 * keys pick a bucket, + and − (or up and down) change it. On the result
 * screen, Enter continues.
 */
import { startBeat, startBriefing } from './beats'
import { askFirst } from './story'
import { getChallenge, type Challenge } from '../data/challenges'
import { P1 } from '../data/phase1Lines'
import { transmissionHost } from '../state/transmissions'
import {
  blockedBy,
  changeBucket,
  commit,
  effectiveEffects,
  lockOf,
  panelLines,
  placed,
  splitComplete,
  splitEffects,
  splitTotal,
  startAllocation,
  type Decision,
} from '../state/decisions'
import { emitLine, stopVoice } from '../state/lines'
import { isDone, type Effects, type MissionState } from '../state/mission'
import { player } from '../state/player'
import { useGame, type ChallengeSession } from '../state/store'
import { clearHeld } from './input'
import { releaseLock, requestLock } from './pointerLock'
import { afterChallenge, showCaption } from './run'

function session(): ChallengeSession | null {
  return useGame.getState().challenge
}

function patch(change: Partial<ChallengeSession>): void {
  const current = session()
  if (current) useGame.getState().setChallenge({ ...current, ...change })
}

function challengeOf(current: ChallengeSession): Challenge {
  const challenge = getChallenge(current.id)
  if (!challenge) throw new Error(`No challenge ${current.id}`)
  return challenge
}

/**
 * Opens a challenge's decision panel. Returns false when the challenge
 * isn't ready yet (the caller shows the "coming soon" panel instead). A
 * challenge done on this run only says so: each is done once. An event
 * challenge (the storm) opens only when the game triggers it (`event`), and
 * the last one (the lunar night) waits for the others, with a crew reminder.
 */
export function openDecision(id: number, now = performance.now(), options: { event?: boolean } = {}): boolean {
  const challenge = getChallenge(id)
  if (!challenge?.ready) return false
  const state = useGame.getState()
  // Never over another panel, a night card, the ending or a fade.
  if (state.challenge || state.night || state.afterword || state.transition) return true
  // A hazard's console only says it isn't happening; the hazard itself opens by surprise.
  if (challenge.trigger === 'event' && !options.event) {
    if (challenge.reminder) showCaption(challenge.reminder)
    else state.showToast('No storm right now. If one comes, the alarm will sound.')
    return true
  }
  if (!challenge.hazard && isDone(state.mission, id)) {
    state.showToast(`Done already: ${challenge.title}`)
    return true
  }
  const blocker = blockedBy(challenge, state.mission)
  if (blocker) {
    // The blocking challenge says what's needed if it can be opened now; else this one's own reminder.
    const blockerOpen = blocker !== challenge && blocker.trigger !== 'event' && !blockedBy(blocker, state.mission)
    const line = (blockerOpen ? blocker.reminder : undefined) ?? challenge.reminder
    if (line) showCaption(line)
    else state.showToast(`Finish ${blocker.title} first`)
    return true
  }
  // Before the lunar night, the commander's story first (once per profile); then this panel, its timer starting then.
  if (id === 12 && startBeat('lunar-night', () => openDecision(12))) return true
  // Before the first decision, the trainer's briefing in the briefing room (once per profile); then this panel.
  if (id === 1 && startBriefing(() => openDecision(1))) return true
  // The crew member at the task asks for the player's help first (every run; hazards ask in src/scene/run.ts).
  if (!options.event && askFirst(id, () => openDecision(id))) return true
  const seconds =
    challenge.storm && state.mission.remembered.antennaUnpowered && challenge.timerWithoutWarning
      ? challenge.timerWithoutWarning
      : challenge.timerSeconds

  clearHeld()
  player.route = null
  const split = challenge.kind === 'split'
  useGame.setState({
    mode: 'panel',
    focus: null,
    challenge: {
      id,
      stage: 'choose',
      selected: null,
      hovered: null,
      allocation: split ? startAllocation(challenge) : [],
      bucket: 0,
      total: split ? splitTotal(challenge, state.mission) : 0,
      deadline: seconds ? now + seconds * 1000 : null,
      outcome: null,
    },
  })
  releaseLock()
  for (const line of panelLines(challenge, state.mission)) emitLine(line)
  return true
}

/** Picks option `index` (0 to 2). A locked one can be picked to read why; it can't be committed. */
export function selectOption(index: number): void {
  const current = session()
  if (!current || current.stage !== 'choose') return
  const challenge = challengeOf(current)
  if (challenge.kind !== 'choice') return
  const option = challenge.options[index]
  if (!option || current.selected === index) return
  patch({ selected: index })
  const lock = lockOf(option, useGame.getState().mission)
  hushLockLines(challenge, lock?.line?.lineId)
  if (lock?.line) emitLine(lock.line)
}

/**
 * Stops the crew saying why an earlier pick is locked or ruled out (all but
 * `keep`): the pick changed, or the panel moved on. Voice lines queue, so
 * without this, picking the ridge, then the crater, then committing the
 * slope would play "Let's land there" over the result.
 */
function hushLockLines(challenge: Challenge, keep?: string): void {
  if (challenge.kind !== 'choice') return
  const mission = useGame.getState().mission
  for (const option of challenge.options) {
    const lineId = lockOf(option, mission)?.line?.lineId
    if (lineId && lineId !== keep) stopVoice(lineId)
  }
}

/** The option under the mouse (for the ghost bars), or null. */
export function hoverOption(index: number | null): void {
  const current = session()
  if (!current || current.stage !== 'choose' || current.hovered === index) return
  patch({ hovered: index })
}

/** The bucket the keys work on. */
export function pickBucket(index: number): void {
  const current = session()
  if (!current || current.stage !== 'choose') return
  const challenge = challengeOf(current)
  if (challenge.kind !== 'split' || index < 0 || index >= challenge.buckets.length) return
  patch({ bucket: index })
}

/** Adds (+1) or takes away (−1) units in a bucket (the picked one by default). */
export function changeUnits(steps: number, index?: number): void {
  const current = session()
  if (!current || current.stage !== 'choose') return
  const challenge = challengeOf(current)
  if (challenge.kind !== 'split') return
  const bucket = index ?? current.bucket
  const allocation = changeBucket(challenge, current.allocation, bucket, steps, current.total)
  patch({ bucket, allocation })
  // Packing the cargo (2): with the pallet full, a block that won't fit gets Kal's "It's full!" (Shishir's Phase 1 script).
  if (challenge.id === 2 && steps > 0 && allocation[bucket] === current.allocation[bucket] && placed(allocation) >= current.total) itsFull()
}

/** When Kal last said the pallet is full: once per try, not on every key repeat. */
let fullSaidAt = -Infinity

function itsFull(): void {
  // Story only: without the game's screen (the headless checks) nothing is said.
  if (!transmissionHost()) return
  const now = performance.now()
  if (now - fullSaidAt < 4000) return
  fullSaidAt = now
  emitLine(P1.science04)
}

/** True when Commit would work now. */
export function canCommit(current: ChallengeSession | null, mission: MissionState): boolean {
  if (!current || current.stage !== 'choose') return false
  const challenge = getChallenge(current.id)
  if (!challenge) return false
  if (challenge.kind === 'split') return splitComplete(challenge, current.allocation, current.total)
  const option = current.selected === null ? undefined : challenge.options[current.selected]
  return option !== undefined && lockOf(option, mission) === null
}

function finish(decision: Decision): boolean {
  const current = session()
  if (!current || current.stage !== 'choose') return false
  const state = useGame.getState()
  const outcome = commit(challengeOf(current), state.mission, decision)
  if (!outcome) return false
  hushLockLines(challengeOf(current))
  useGame.setState({
    mission: outcome.after,
    challenge: { ...current, stage: 'result', hovered: null, deadline: null, outcome },
  })
  // Earlier choices coming back are spoken on the result screen.
  for (const line of outcome.lines) emitLine(line)
  return true
}

/** Commits the picked option or the split. Returns false when it can't (nothing picked, locked, blocks left). */
export function commitDecision(): boolean {
  const current = session()
  if (!current || !canCommit(current, useGame.getState().mission)) return false
  const challenge = challengeOf(current)
  if (challenge.kind === 'split') return finish({ kind: 'split', allocation: current.allocation })
  const option = challenge.options[current.selected ?? -1]
  return option ? finish({ kind: 'option', optionId: option.id }) : false
}

/** Seconds left on a timed challenge, or null. */
export function secondsLeft(current: ChallengeSession | null, now = performance.now()): number | null {
  if (!current?.deadline) return null
  return Math.max(0, (current.deadline - now) / 1000)
}

/** Runs the timer: when it reaches zero, the commander's option happens. */
export function tickChallenge(now = performance.now()): void {
  const current = session()
  if (!current || current.stage !== 'choose' || current.deadline === null || now < current.deadline) return
  const challenge = challengeOf(current)
  if (challenge.kind !== 'choice' || !challenge.timeoutOption) return
  finish({ kind: 'option', optionId: challenge.timeoutOption, timedOut: true })
}

/** Esc: closes without choosing. Not on a timed challenge, and not after committing. */
export function backOut(): boolean {
  const current = session()
  if (!current || current.stage !== 'choose' || current.deadline !== null) return false
  // A hazard has already happened: it can't be put off.
  if (getChallenge(current.id)?.hazard) return false
  hushLockLines(challengeOf(current))
  useGame.setState({ challenge: null, mode: 'playing' })
  void requestLock()
  return true
}

/**
 * Continue on the result screen: the challenge is done, its console turns
 * green and the banner moves on. Then the mouse is captured again, or at
 * the outpost a night passes, or the mission's ending shows (src/scene/run.ts).
 */
export function continueChallenge(): boolean {
  const current = session()
  if (!current || current.stage !== 'result') return false
  afterChallenge(current)
  return true
}

const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']
const NUMPAD = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad6']

function digit(code: string): number {
  const index = DIGITS.indexOf(code)
  return index >= 0 ? index : NUMPAD.indexOf(code)
}

/**
 * A key while the panel is open. Returns true when the panel used it (the
 * caller then stops the browser's default, so Enter doesn't also press a
 * focused button). Every other key is swallowed by the panel too.
 */
export function challengeKey(code: string): boolean {
  const current = session()
  if (!current) return false
  const enter = code === 'Enter' || code === 'NumpadEnter'

  if (current.stage === 'result') {
    if (enter || code === 'Space' || code === 'Escape') return continueChallenge()
    return false
  }

  if (code === 'Escape') return backOut()
  if (enter) return commitDecision()

  const challenge = challengeOf(current)
  const number = digit(code)
  if (challenge.kind === 'choice') {
    if (number >= 0 && number < challenge.options.length) {
      selectOption(number)
      return true
    }
    if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'ArrowRight' || code === 'ArrowDown') {
      const step = code === 'ArrowLeft' || code === 'ArrowUp' ? -1 : 1
      const count = challenge.options.length
      const from = current.selected ?? (step > 0 ? -1 : count)
      selectOption((from + step + count) % count)
      return true
    }
    return false
  }

  if (number >= 0 && number < challenge.buckets.length) {
    pickBucket(number)
    return true
  }
  if (code === 'ArrowLeft' || code === 'ArrowRight') {
    const count = challenge.buckets.length
    pickBucket((current.bucket + (code === 'ArrowLeft' ? -1 : 1) + count) % count)
    return true
  }
  if (code === 'Equal' || code === 'NumpadAdd' || code === 'ArrowUp') {
    changeUnits(1)
    return true
  }
  if (code === 'Minus' || code === 'NumpadSubtract' || code === 'ArrowDown') {
    changeUnits(-1)
    return true
  }
  return false
}

/**
 * What the HUD's ghost bars preview: the hovered option, else the picked
 * one, else the split as it stands. Null when there is nothing to preview,
 * or the option is locked (it can't happen).
 */
export function previewEffects(current: ChallengeSession | null, mission?: MissionState): Effects | null {
  if (!current || current.stage !== 'choose') return null
  const challenge = getChallenge(current.id)
  if (!challenge) return null
  if (challenge.kind === 'split') {
    return current.allocation.some((units) => units > 0) ? splitEffects(challenge, current.allocation) : null
  }
  const index = current.hovered ?? current.selected
  const option = index === null ? undefined : challenge.options[index]
  if (!option || (mission && lockOf(option, mission))) return null
  return mission ? effectiveEffects(challenge, option, mission).effects : option.effects
}
