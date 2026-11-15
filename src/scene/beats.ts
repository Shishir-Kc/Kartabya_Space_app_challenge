/**
 * The four short story beats (Phase 10). Each plays once per saved profile,
 * is skippable (Skip or Enter), stops the hazard clock while it plays, and
 * never stacks with a teaching card (the card waits until the beat ends):
 *
 * 1. Night before launch: in crew quarters right after Play, Kal talks about
 *    the Moon and the trainer looks in from the doorway.
 * 2. Arrival at the outpost: after the landing, the commander in his Moon
 *    suit welcomes the player, and the view turns to the airlock.
 * 3. The first outpost storm: 3 s of red alarm light and a shaking view while
 *    the crew hurry to the shelter; then the storm panel opens (its timer
 *    starts only then).
 * 4. Before the lunar night: in command, the commander's story at the window;
 *    then challenge 12's panel opens.
 *
 * Shishir's Phase 1 script (src/data/phase1Lines.ts) adds the launch center's
 * scenes, timed by the length of each recorded line:
 *
 * - The opening in crew quarters ("night-before", replacing beat 1's draft
 *   lines), after the trainer's welcome card has been shown and said (it
 *   closes by itself once he has said it): the trainer in the doorway, then
 *   Kal; the commander and the
 *   safety officer wait in the corridor outside. Then the walk
 *   (src/scene/walkTogether.ts): the trainer leads the way to the briefing
 *   room and the crew walk with the player, talking in person: the trainer
 *   introduces himself and the commander teases him; "Here we are" on
 *   reaching the briefing room.
 * - The briefing: on reaching the briefing room after "Here we are" (or on
 *   using the challenge 1 console first), the trainer's briefing (the view
 *   slowly closing in on the screen, then turning to each speaker), then
 *   challenge 1's panel opens. The crew wait in the briefing room until the
 *   choice is made.
 * - The opening, the walk, the briefing, Houston at the door and the goodbye
 *   play on every run (Skip still works); the other scenes play once per
 *   profile.
 * - After challenge 1: the trainer's "Good", then he sends the player to
 *   Houston at the communications building's door, who asks about the cargo
 *   and sends them to the hangar. In the cargo hangar: Kal. After challenge
 *   2: Kal, then Houston on the radio.
 * - The goodbye: with the cargo packed, walking up to the trainer at the
 *   crew elevator plays his farewell.
 *
 * A scene longer than 15 s carries on as the next beat (`next`), so each
 * beat stays short; Skip ends the whole scene.
 *
 * A beat holds the player's view on a few key poses (eased between) and
 * places the crew it needs; its lines go through showCaption, so they reach
 * Shishir's audio with their speakerId and lineId. Without the 3D scene
 * (the headless checks) a beat is skipped at once.
 */
import { create } from 'zustand'
import type { CrewLine } from '../data/challenges'
import { CARGO_ANSWERS, P1, TEACHING_CARD_LINES } from '../data/phase1Lines'
import { VOICE_SECONDS } from '../data/voiceManifest'
import type { OutfitId } from '../character/outfits'
import { roomAt } from '../maps/collision'
import { requireMap } from '../maps/registry'
import { EYE_HEIGHT, player } from '../state/player'
import { useSettings } from '../state/settings'
import { useGame } from '../state/store'
import { CAST, type SpeakerId } from '../state/mission'
import { emitCue, type Cue } from '../state/lines'
import { clearTransmissions, transmit, useTransmissions } from '../state/transmissions'
import { fireCard } from './cards'
import { openDecision } from './challenges'
import { clearHeld } from './input'
import { isLocked, requestLock } from './pointerLock'
import { freeCursor } from './session'
import { delivered } from './story'
import { showCaption } from './run'
import { startWalk, stopWalk, walkPlaces, WALK_START, type Walker } from './walkTogether'

/** Scenes that may run longer than one beat: `briefing`, then `briefing-2`, `briefing-3`... */
type Chain = 'night-before' | 'briefing' | 'comms-visit' | 'comms-no' | 'comms-yes' | 'farewell'

export type BeatId = Chain | `${Chain}-${number}` | 'arrival' | 'first-storm' | 'lunar-night'

interface Key {
  at: number
  x?: number
  z?: number
  yaw: number
  pitch: number
}

export interface BeatCrew {
  speakerId: SpeakerId
  x: number
  z: number
  yaw: number
  outfit?: OutfitId
}

export interface Beat {
  id: BeatId
  map: string
  duration: number
  /** The view: poses eased between. None keeps the player's own view. */
  keys: readonly Key[]
  /** Lines at times; `{name}` becomes the player's name. */
  lines: readonly { at: number; line: CrewLine }[]
  /** Who stands where while it plays. */
  crew: readonly BeatCrew[]
  /** Red alarm light and a shaking view. */
  alarm?: boolean
  /** Said as a toast when it ends. */
  then?: string
  /** The sound cue as it starts (a scene's later beats have none). */
  cue?: Cue
  /** The scene carries on in this beat. */
  next?: BeatId
  /**
   * A scripted scene: other messages are cleared as it starts, and each line
   * stays up exactly until the next (the lines are timed by their voices).
   */
  quiet?: boolean
  /**
   * At its end the beat waits for the player's answer (text buttons, keys 1
   * and 2); each answer carries on in its own beat.
   */
  ask?: readonly { label: string; then: BeatId }[]
}

const SHELTER: readonly BeatCrew[] = [
  { speakerId: 'commander', x: -3.3, z: 4.2, yaw: -Math.PI / 2 },
  { speakerId: 'safety', x: -0.7, z: 2.0, yaw: Math.PI / 2 },
  { speakerId: 'science', x: -3.3, z: 2.0, yaw: -Math.PI / 2 },
]

// ---------- Shishir's Phase 1 script: scenes timed by their voices ----------

/** A pause between two lines, in seconds. */
const BREATH = 0.35
/** The longest one beat of a scene runs; a longer scene carries on in the next beat. */
const MAX_BEAT = 14.5

/** How long a line takes to say: its recording (plus the radio's crackle), or a speaking pace if it has none yet. */
export function spokenSeconds(line: CrewLine): number {
  const recorded = VOICE_SECONDS[line.lineId]
  const words = line.text.split(/\s+/).filter(Boolean).length
  return (recorded ?? words * 0.4 + 0.3) + (CAST[line.speakerId].radio && !line.inPerson ? 0.25 : 0)
}

interface View {
  x: number
  z: number
  yaw: number
  pitch: number
}

/** Standing at (x, z), looking at the point (tx, ty, tz). */
function look(x: number, z: number, tx: number, tz: number, ty = 1.65): View {
  const dx = tx - x
  const dz = tz - z
  return { x, z, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(ty - EYE_HEIGHT, Math.hypot(dx, dz)) }
}

/** A line, and where the view looks while it's said. */
interface Shot {
  line: CrewLine
  view: View
}

/**
 * A scene from its shots, split into beats of at most MAX_BEAT seconds that
 * follow each other (`id`, then `id-2`, `id-3`...). Each line starts a
 * breath after the last one's voice ends, and the view eases to its shot as
 * it starts.
 */
function scene(
  id: Chain,
  shots: readonly Shot[],
  options: { map: string; crew: readonly BeatCrew[]; cue?: Cue; then?: string; ask?: Beat['ask'] },
): Beat[] {
  const groups: Shot[][] = []
  let length = 0
  for (const shot of shots) {
    const need = spokenSeconds(shot.line) + BREATH
    if (!groups.length || length + need + 0.15 > MAX_BEAT) {
      groups.push([])
      length = groups.length === 1 ? 0.5 : 0.3
    }
    groups[groups.length - 1]!.push(shot)
    length += need
  }
  const idOf = (g: number) => (g === 0 ? id : (`${id}-${g + 1}` as BeatId))
  let view = shots[0]!.view
  return groups.map((group, g) => {
    const keys: Key[] = [{ at: 0, ...view }]
    const lines: { at: number; line: CrewLine }[] = []
    let at = g === 0 ? 0.5 : 0.3
    for (const shot of group) {
      if (shot.view !== view) {
        keys.push({ at: Math.max(keys[keys.length - 1]!.at, at - 0.1), ...view }, { at: at + 0.9, ...shot.view })
        view = shot.view
      }
      lines.push({ at, line: shot.line })
      at += spokenSeconds(shot.line) + BREATH
    }
    const duration = at + 0.15
    keys.push({ at: duration, ...view })
    const last = g === groups.length - 1
    return {
      id: idOf(g),
      map: options.map,
      duration,
      keys,
      lines,
      crew: options.crew,
      quiet: true,
      cue: g === 0 ? options.cue : undefined,
      next: last ? undefined : idOf(g + 1),
      then: last ? options.then : undefined,
      ask: last ? options.ask : undefined,
    }
  })
}

// Scene 1: crew quarters. The trainer looks in from the doorway; Kal sits on the opposite bunk; the
// commander and the safety officer wait in the corridor behind him (src/scene/walkTogether.ts starts the walk there).
const QUARTERS = { x: -15.6, z: -1.4 }
const OPENING = scene(
  'night-before',
  [
    { line: P1.trainer01, view: look(QUARTERS.x, QUARTERS.z, -12.6, 0.3) },
    { line: P1.science01, view: look(QUARTERS.x, QUARTERS.z, -15.6, 1.6, 1.45) },
  ],
  {
    map: 'launch-center',
    crew: [WALK_START.science, WALK_START.trainer, WALK_START.commander, WALK_START.safety].map(({ speakerId, x, z, yaw }) => ({ speakerId, x, z, yaw })),
    cue: 'beat-night-before',
    then: 'First stop: the briefing room',
  },
)

// Scene 3: the briefing. The trainer stands by the screen; the commander and the
// safety officer in front; Kal beside the player at the back. The view starts at
// the back and closes in on the screen, then turns to each speaker.
const SCREEN = { x: -4.5, y: 1.85, z: -7.86 }
const TRAINER_AT_SCREEN = { x: -2.9, z: -7.2 }
const SAFETY_SEAT = { x: -2.3, z: -5.2 }
const COMMANDER_SEAT = { x: -5.0, z: -6.0 }
const closer = (k: number) => look(-3.6 - 0.6 * k, -2.4 - 1.9 * k, SCREEN.x, SCREEN.z, SCREEN.y)
const NEAR = { x: -4.2, z: -4.3 }
/** The crew at the briefing (the trainer stands by the screen); they wait there until the first choice is made. */
const BRIEFING_CREW: readonly BeatCrew[] = [
  { speakerId: 'safety', ...SAFETY_SEAT, yaw: Math.atan2(-(SCREEN.x - SAFETY_SEAT.x), -(SCREEN.z - SAFETY_SEAT.z)) },
  { speakerId: 'commander', ...COMMANDER_SEAT, yaw: Math.atan2(-(SCREEN.x - COMMANDER_SEAT.x), -(SCREEN.z - COMMANDER_SEAT.z)) },
  { speakerId: 'science', x: -2.3, z: -2.5, yaw: 0.15 },
]
const BRIEFING = scene(
  'briefing',
  [
    { line: P1.trainer05, view: look(-3.6, -2.4, TRAINER_AT_SCREEN.x, TRAINER_AT_SCREEN.z) },
    { line: P1.trainer06, view: closer(0) },
    { line: P1.trainer07, view: closer(0.25) },
    { line: P1.trainer08, view: closer(0.5) },
    { line: P1.trainer09, view: closer(0.75) },
    { line: P1.trainer10, view: closer(1) },
    { line: P1.safety01, view: look(NEAR.x, NEAR.z, SAFETY_SEAT.x, SAFETY_SEAT.z) },
    { line: P1.commander02, view: look(NEAR.x, NEAR.z, COMMANDER_SEAT.x, COMMANDER_SEAT.z) },
    { line: P1.trainer11, view: look(NEAR.x, NEAR.z, TRAINER_AT_SCREEN.x, TRAINER_AT_SCREEN.z) },
  ],
  {
    map: 'launch-center',
    crew: [{ speakerId: 'trainer', ...TRAINER_AT_SCREEN, yaw: Math.atan2(-(NEAR.x - TRAINER_AT_SCREEN.x), -(NEAR.z - TRAINER_AT_SCREEN.z)) }, ...BRIEFING_CREW],
    cue: 'beat-briefing',
  },
)

// Scene 4: Houston at the communications building's door (the grounds, north
// of the main exit). He asks about the cargo; the player answers with a button.
const HOUSTON = { x: 1.2, z: -14.8, yaw: Math.PI }
const AT_THE_DOOR = look(0.4, -12.0, HOUSTON.x, HOUSTON.z, 2.05)
const inPerson = (line: CrewLine): CrewLine => ({ ...line, inPerson: true })
const HOUSTON_CREW: readonly BeatCrew[] = [{ speakerId: 'comms', ...HOUSTON }]
const COMMS_VISIT = scene(
  'comms-visit',
  [P1.comms01, P1.comms02, P1.comms03].map((line) => ({ line: inPerson(line), view: AT_THE_DOOR })),
  {
    map: 'launch-center',
    crew: HOUSTON_CREW,
    cue: 'beat-comms-visit',
    ask: [
      { label: CARGO_ANSWERS[0], then: 'comms-no' },
      { label: CARGO_ANSWERS[1], then: 'comms-yes' },
    ],
  },
)
const NEXT_HANGAR = 'Next: the cargo hangar'
const COMMS_NO = scene('comms-no', [P1.comms04a, P1.comms05].map((line) => ({ line: inPerson(line), view: AT_THE_DOOR })), { map: 'launch-center', crew: HOUSTON_CREW, then: NEXT_HANGAR })
const COMMS_YES = scene('comms-yes', [P1.comms04b, P1.comms05].map((line) => ({ line: inPerson(line), view: AT_THE_DOOR })), { map: 'launch-center', crew: HOUSTON_CREW, then: NEXT_HANGAR })
/** Houston's scene plays when the player comes this close to him. */
const HOUSTON_RADIUS = 4

// Scene 6: the goodbye at the crew elevator. The view stands between the
// trainer and the elevator door, looking back at him, aimed a little above
// his head so his face sits below the message at the top of the screen.
const TRAINER_AT_ELEVATOR = { x: 12.7, z: 1.3, yaw: -0.52 }
const FAREWELL_VIEW = look(
  TRAINER_AT_ELEVATOR.x - Math.sin(TRAINER_AT_ELEVATOR.yaw) * 2.8,
  TRAINER_AT_ELEVATOR.z - Math.cos(TRAINER_AT_ELEVATOR.yaw) * 2.8,
  TRAINER_AT_ELEVATOR.x,
  TRAINER_AT_ELEVATOR.z,
  2.05,
)
const FAREWELL = scene(
  'farewell',
  [
    { line: P1.trainer14, view: FAREWELL_VIEW },
    { line: P1.trainer15, view: FAREWELL_VIEW },
  ],
  { map: 'launch-center', crew: [{ speakerId: 'trainer', ...TRAINER_AT_ELEVATOR }], cue: 'beat-farewell' },
)

/** The farewell plays when the player comes this close to the trainer at the elevator. */
const FAREWELL_RADIUS = 4.5

const OTHER_BEATS: Record<'arrival' | 'first-storm' | 'lunar-night', Beat> = {
  arrival: {
    id: 'arrival',
    cue: 'beat-arrival',
    map: 'outpost',
    duration: 8,
    keys: [
      { at: 0, x: -56.6, z: 18.4, yaw: -1.86, pitch: 0.02 },
      { at: 3.6, x: -56.6, z: 18.4, yaw: -1.86, pitch: 0.02 },
      { at: 7, x: -56.6, z: 18.4, yaw: -1.14, pitch: 0 },
      { at: 8, x: -56.6, z: 18.4, yaw: -1.14, pitch: 0 },
    ],
    lines: [{ at: 0.6, line: { speakerId: 'commander', lineId: 'beat-arrival-commander', text: 'Welcome to the Moon, {name}. The airlock is this way.' } }],
    crew: [{ speakerId: 'commander', x: -52.5, z: 19.6, yaw: 1.29, outfit: 'surface' }],
  },
  'first-storm': {
    id: 'first-storm',
    cue: 'beat-first-storm',
    map: 'outpost',
    duration: 3,
    keys: [],
    lines: [],
    crew: SHELTER,
    alarm: true,
  },
  'lunar-night': {
    id: 'lunar-night',
    cue: 'beat-lunar-night',
    map: 'outpost',
    duration: 12,
    keys: [
      { at: 0, x: 5.0, z: -2.3, yaw: -0.45, pitch: 0.02 },
      { at: 12, x: 5.0, z: -2.6, yaw: -0.3, pitch: 0.04 },
    ],
    lines: [
      { at: 1, line: { speakerId: 'commander', lineId: 'beat-night-commander-1', text: 'On my first mission, I took a risk to save time.' } },
      { at: 6, line: { speakerId: 'commander', lineId: 'beat-night-commander-2', text: 'We got home. But I learned: plan for the long night.' } },
    ],
    crew: [{ speakerId: 'commander', x: 6.6, z: -5.2, yaw: 0 }],
  },
}

/** Every beat, by id. */
export const BEATS: Readonly<Record<string, Beat>> = {
  ...Object.fromEntries([...OPENING, ...BRIEFING, ...COMMS_VISIT, ...COMMS_NO, ...COMMS_YES, ...FAREWELL].map((beat) => [beat.id, beat])),
  ...OTHER_BEATS,
}

/** Every line the beats say, for Shishir's audio list. */
export const BEAT_LINES: readonly CrewLine[] = Object.values(BEATS)
  .flatMap((beat) => beat.lines.map((l) => l.line))
  .filter((line, i, all) => all.findIndex((l) => l.lineId === line.lineId) === i)

// ---------- Running one ----------

export const useBeat = create<{ id: BeatId | null; asking: boolean }>()(() => ({ id: null, asking: false }))

let time = 0
let after: (() => void) | null = null
let said = 0
let heldCard: ReturnType<typeof useGame.getState>['card'] = null
/** A question freed a captured mouse for its answer buttons: it is captured again on answering (or, failing that, once the scene is over). */
let recapture = false
/** The 3D scene runs beats (PlayerController sets this); without it they're skipped. */
let host = false

export function setBeatHost(on: boolean): void {
  host = on
}

export function beatActive(): Beat | null {
  const id = useBeat.getState().id
  return (id && BEATS[id]) || null
}

export function beatSeen(id: BeatId): boolean {
  return useSettings.getState().beatsSeen.includes(id)
}

/**
 * Plays a beat once per profile, then calls `then`. Returns false (and
 * calls nothing) if it has played before or can't play now, so the caller
 * goes straight on.
 */
export function startBeat(id: BeatId, then?: () => void): boolean {
  const state = useGame.getState()
  const beat = BEATS[id]
  if (!beat || !host || beatSeen(id) || useBeat.getState().id || state.mapId !== beat.map) return false
  useSettings.getState().set({ beatsSeen: [...useSettings.getState().beatsSeen, id] })
  time = 0
  said = 0
  after = then ?? null
  // A teaching card waits until the beat is over (one held by the scene's earlier beat stays held).
  if (state.card) {
    heldCard = state.card
    useGame.setState({ card: null })
  }
  // A scripted scene starts with the screen clear of other messages.
  if (beat.quiet && beat.cue) clearTransmissions()
  clearHeld()
  // A captured mouse stays captured: the scene holds the view, Enter skips, and nothing needs clicking. (Freeing it
  // here meant capturing it again without a click when the scene ended, which the browser may refuse, leaving the
  // cursor on screen.) Only a question frees it, for its answer buttons (updateBeat).
  player.route = null
  useBeat.setState({ id })
  if (beat.cue) emitCue(beat.cue)
  return true
}

/** Plays a scene even if it was seen before (the launch center's scenes play every run). Returns false if it can't play now. */
export function playScene(id: BeatId, then?: () => void): boolean {
  const seen = useSettings.getState().beatsSeen
  const scene = wholeScene(id)
  useSettings.getState().set({ beatsSeen: seen.filter((b) => !scene.includes(b as BeatId)) })
  if (startBeat(id, then)) return true
  useSettings.getState().set({ beatsSeen: seen })
  return false
}

/** Plays a beat again on purpose, even if it was seen. */
export function replayBeat(id: BeatId): void {
  playScene(id)
}

/** A whole scene: the beat, the beats it carries on in, and, if it ends on a question, each answer's scene. */
function wholeScene(id: BeatId): BeatId[] {
  const chain = chainFrom(id)
  const ask = BEATS[chain[chain.length - 1] ?? id]?.ask ?? []
  return [...chain, ...ask.flatMap((option) => wholeScene(option.then))]
}

/** A beat and the beats its scene carries on in. */
function chainFrom(id: BeatId): BeatId[] {
  const out: BeatId[] = []
  for (let at: BeatId | undefined = id; at && BEATS[at] && !out.includes(at); at = BEATS[at]!.next) out.push(at)
  return out
}

/** The beat is over: its scene carries on in the next beat, or what follows happens. */
export function finishBeat(): void {
  endBeat(false)
}

/** Skip or Enter: the whole scene ends at once, and what follows happens. */
export function skipBeat(): void {
  endBeat(true)
}

/**
 * The player answers the beat's question (button or key 1/2): the scene goes
 * on in that answer's beat. The other answer counts as seen, so the
 * question is asked once.
 */
export function answerBeat(index: number): void {
  const beat = beatActive()
  const option = beat?.ask?.[index]
  if (!beat?.ask || !option || !useBeat.getState().asking) return
  const then = after
  after = null
  useBeat.setState({ id: null, asking: false })
  // The answer came from a click or a key press, so the browser lets the mouse be captured again right now.
  if (recapture) {
    recapture = false
    void requestLock()
  }
  markSeen(beat.ask.filter((o) => o !== option).flatMap((o) => chainFrom(o.then)))
  if (startBeat(option.then, then ?? undefined)) return
  if (heldCard && !useGame.getState().card) useGame.setState({ card: heldCard })
  heldCard = null
  then?.()
  sceneOver()
}

/**
 * The whole scene is over and what follows it has happened. A mouse a
 * question freed and that wasn't captured again on answering is captured
 * now, unless what followed needs it free (a decision panel, a night card,
 * the ending). The browser may refuse this without a click; the "Click to
 * capture the mouse" hint then stays up.
 */
function sceneOver(): void {
  const again = recapture
  recapture = false
  const state = useGame.getState()
  if (again && state.mode === 'playing' && !state.challenge && !state.night && !state.afterword && !useBeat.getState().id) void requestLock()
}

function markSeen(ids: readonly BeatId[]): void {
  if (ids.length) useSettings.getState().set({ beatsSeen: [...new Set([...useSettings.getState().beatsSeen, ...ids])] })
}

function endBeat(skipped: boolean): void {
  const beat = beatActive()
  if (!beat) return
  useBeat.setState({ id: null, asking: false })
  const then = after
  after = null
  if (!skipped && beat.next && startBeat(beat.next, then ?? undefined)) return
  let rest = chainFrom(beat.id).slice(1)
  if (skipped) {
    // The rest of the scene counts as seen (a question in it too, with every
    // answer's scene), and its line on screen (and voice) goes.
    const ask = BEATS[rest[rest.length - 1] ?? beat.id]?.ask ?? []
    rest = [...rest, ...ask.flatMap((option) => chainFrom(option.then))]
    markSeen(rest)
    if (beat.quiet) clearTransmissions()
  }
  if (heldCard && !useGame.getState().card) useGame.setState({ card: heldCard })
  heldCard = null
  const toast = BEATS[rest[rest.length - 1] ?? beat.id]?.then
  if (toast) useGame.getState().showToast(toast)
  then?.()
  sceneOver()
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const ease = (k: number) => k * k * (3 - 2 * k)

/** The view at time t: eased between the keys. */
export function beatPose(beat: Beat, t: number): Key | null {
  const keys = beat.keys
  if (!keys.length) return null
  let i = 0
  while (i < keys.length - 1 && keys[i + 1]!.at <= t) i++
  const a = keys[i]!
  const b = keys[Math.min(i + 1, keys.length - 1)]!
  const k = b.at > a.at ? ease(Math.max(0, Math.min(1, (t - a.at) / (b.at - a.at)))) : 0
  let dyaw = b.yaw - a.yaw
  dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw))
  return {
    at: t,
    x: a.x !== undefined && b.x !== undefined ? lerp(a.x, b.x, k) : a.x,
    z: a.z !== undefined && b.z !== undefined ? lerp(a.z, b.z, k) : a.z,
    yaw: a.yaw + dyaw * k,
    pitch: lerp(a.pitch, b.pitch, k),
  }
}

/** Each frame while playing: holds the view, says the lines on time, ends the beat. */
export function updateBeat(dt: number): void {
  const beat = beatActive()
  if (!beat) return
  // A teaching card that comes up meanwhile waits too.
  const card = useGame.getState().card
  if (card) {
    heldCard = heldCard ?? card
    useGame.setState({ card: null })
  }
  time += dt
  const pose = beatPose(beat, time)
  if (pose) {
    if (pose.x !== undefined) player.x = pose.x
    if (pose.z !== undefined) player.z = pose.z
    player.yaw = pose.yaw
    player.pitch = pose.pitch
  }
  if (beat.alarm) {
    // A slight shake.
    player.yaw += Math.sin(time * 37) * 0.006
    player.pitch += Math.sin(time * 29 + 1) * 0.005
  }
  const name = useGame.getState().astronaut.name || 'astronaut'
  while (said < beat.lines.length && beat.lines[said]!.at <= time) {
    const { at, line } = beat.lines[said]!
    const spoken = { ...line, text: line.text.replace('{name}', name) }
    // A scripted scene's line stays up until the next one (or the beat's end).
    if (beat.quiet) transmit(spoken, { exactMs: Math.max(800, ((beat.lines[said + 1]?.at ?? beat.duration) - at) * 1000) })
    else showCaption(spoken, 5500)
    said++
  }
  // A question waits at the end for the player's answer; any other beat ends.
  if (time >= beat.duration) {
    if (!beat.ask) finishBeat()
    else if (!useBeat.getState().asking) {
      // The answers are buttons: the mouse is freed for them (on purpose, so the game doesn't pause), and captured
      // again when the player answers (answerBeat).
      if (isLocked()) recapture = true
      freeCursor()
      useBeat.setState({ asking: true })
    }
  }
}

/** Where the crew stand while a beat plays (src/state/crewPlaces.ts asks). */
export function beatCrew(): readonly BeatCrew[] | null {
  return beatActive()?.crew ?? null
}

/** The trainer's welcome card ("Welcome, mission engineer!"), shown and said before the opening. */
const WELCOME_CARD = 'lc-move'
/** When the welcome card went up this run (performance.now), to know when he has finished saying it. */
let welcomeShownAt: number | null = null

/**
 * The beats that start by themselves (each frame while playing): the night
 * before launch, right after the trainer's welcome card; the arrival, once
 * off the lander.
 */
export function maybeStartBeats(): void {
  const state = useGame.getState()
  if (state.mode !== 'playing' || state.sequence || state.challenge || state.transition || state.night || state.afterword || useBeat.getState().id) return
  if (state.mapId === 'launch-center') {
    // At the start of every run: first the trainer's welcome card, shown and said; then the opening, once the card is
    // closed (Got it, Enter) or he has finished saying it; then the walk to the briefing room.
    if (state.mission.history.length === 0 && !saidThisRun.has('opening')) {
      const hasWelcome = requireMap(state.mapId).cards?.some((c) => c.id === WELCOME_CARD)
      if (hasWelcome && !state.seenCards.includes(WELCOME_CARD)) {
        fireCard({ kind: 'arrive' })
        welcomeShownAt = performance.now()
        return
      }
      if (state.card?.id === WELCOME_CARD) {
        welcomeShownAt ??= performance.now()
        if (performance.now() - welcomeShownAt < welcomeMs()) return
        state.hideCard()
      }
      if (playScene('night-before', walkToBriefing)) saidThisRun.add('opening')
    } else launchCenterMoments()
  } else if (
    state.mapId === 'outpost' &&
    !state.mission.history.some((r) => r.challenge === 6) &&
    !beatSeen('arrival') &&
    Math.hypot(player.x - -56.6, player.z - 18.4) < 12
  ) {
    startBeat('arrival')
  }
}

// ---------- Phase 1: the launch center's lines between the scenes ----------

/** What has been said on this run (each moment once). */
const saidThisRun = new Set<string>()

/**
 * True once `key` has come up on this run: 'opening', 'walk', 'here-we-are', 'briefing', 'comms-visit',
 * 'farewell' (the task banner reads them, src/scene/objective.ts).
 */
export function sceneHappened(key: string): boolean {
  return saidThisRun.has(key)
}

/** True the first time `key` comes up on this run. */
function once(key: string): boolean {
  if (saidThisRun.has(key)) return false
  saidThisRun.add(key)
  return true
}

/** A new run (Try again, back to the menu): every moment can happen again. */
export function resetSceneMoments(): void {
  saidThisRun.clear()
  stopWalk()
  welcomeShownAt = null
  recapture = false
}

/** How long the welcome card stays before the opening: its recorded voice, and a breath. */
function welcomeMs(): number {
  return ((VOICE_SECONDS[TEACHING_CARD_LINES[WELCOME_CARD]?.lineId ?? ''] ?? 6) + 0.9) * 1000
}

const did = (challenge: number) => useGame.getState().mission.history.some((r) => r.challenge === challenge)

/** After the opening: the trainer leads the way to the briefing room, the crew walk along, and they talk on the way. */
function walkToBriefing(): void {
  if (!once('walk')) return
  if (useGame.getState().mapId === 'launch-center') startWalk(player)
  transmit(inPerson(P1.trainer02))
  transmit(inPerson(P1.trainer03))
  transmit(inPerson(P1.commander01))
}

/**
 * The crew the launch center's scenes place between beats: walking with the
 * player to the briefing room, then waiting there until the first choice is
 * made. A beat places its own crew (it always wins). Advanced once a frame
 * (`now` tells frames apart).
 */
export function sceneCrew(now: number, dt: number): readonly Walker[] {
  const state = useGame.getState()
  if (useBeat.getState().id || state.mapId !== 'launch-center' || did(1)) return []
  // The walk stands still while the game is paused (Esc, the guidebook).
  const walkers = walkPlaces(now, state.mode === 'playing' ? dt : 0, player)
  if (walkers.length) return walkers
  if (saidThisRun.has('briefing')) return BRIEFING_CREW.map((c) => ({ ...c, speed: 0 }))
  return []
}

/** Each frame in the launch center: "Here we are", Kal in the hangar, and the goodbye at the elevator. */
function launchCenterMoments(): void {
  const room = roomAt(requireMap('launch-center'), player.x, player.z, player.level)?.id
  // The walk's last line, on reaching the briefing room (only after the walk's talk).
  if (room === 'briefing-room' && saidThisRun.has('walk') && !did(1) && once('here-we-are')) transmit(inPerson(P1.trainer04))
  // Then the briefing starts by itself, once everyone has finished talking (Scene 3).
  const quiet = useTransmissions.getState().current === null && useTransmissions.getState().queue.length === 0
  if (room === 'briefing-room' && saidThisRun.has('here-we-are') && !saidThisRun.has('briefing') && !did(1) && quiet && !useGame.getState().challenge) {
    openDecision(1)
    return
  }
  // Scene 5: Kal is already in the cargo hangar (in person: she stands by the cargo console).
  if (room === 'cargo-hangar' && did(1) && !did(2) && once('hangar')) transmit(delivered(P1.science03))
  // Scene 6: the goodbye, once the cargo is packed and the player walks up to the trainer at the elevator.
  // It waits until Houston's call after packing has been heard (a scene clears waiting messages).
  const talking = useTransmissions.getState().current !== null || useTransmissions.getState().queue.length > 0
  // Scene 4: Houston at the communications building's door, after the briefing's choice and before packing.
  const atDoor = Math.hypot(player.x - HOUSTON.x, player.z - HOUSTON.z) < HOUSTON_RADIUS
  // Every run (he is the one who sends the player to the hangar), once the scene has actually started.
  if (did(1) && !did(2) && atDoor && !talking && player.level === 'ground' && !saidThisRun.has('comms-visit') && playScene('comms-visit')) {
    saidThisRun.add('comms-visit')
    return
  }
  // Every run (he is standing there waiting for the player), once the scene has actually started.
  const near = Math.hypot(player.x - TRAINER_AT_ELEVATOR.x, player.z - TRAINER_AT_ELEVATOR.z) < FAREWELL_RADIUS
  if (did(2) && near && !talking && player.level === 'ground' && !saidThisRun.has('farewell') && playScene('farewell')) saidThisRun.add('farewell')
}

/**
 * Before challenge 1's panel opens: the trainer's briefing (once a run, on
 * reaching the briefing room or at the console). It ends the walk. Returns
 * false if it doesn't play, so the panel opens.
 */
export function startBriefing(then: () => void): boolean {
  if (saidThisRun.has('briefing') || did(1) || !playScene('briefing', then)) return false
  saidThisRun.add('briefing')
  stopWalk()
  return true
}

/** After a launch center challenge's panel closes: who speaks next (src/scene/run.ts). */
export function afterLaunchChallenge(id: number): void {
  // Story only: without the 3D scene (the headless checks) the run stays as it was.
  if (!host) return
  if (id === 1 && once('after-1')) {
    // Said in person when they're still in the briefing room with the player (they leave once out of view).
    transmit(delivered(P1.trainer12))
    // The trainer sends the player to Houston at the communications building (every run); Kal teases.
    transmit(delivered(P1.trainer13))
    transmit(delivered(P1.science02), { then: () => useGame.getState().showToast('Next: meet Houston at the communications building, out of the main exit') })
  }
  if (id === 2 && once('after-2')) {
    transmit(delivered(P1.science05))
    transmit(P1.comms06)
    transmit(P1.comms07)
  }
}
