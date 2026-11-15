/**
 * The single game store. It holds the mission state, the current map, the
 * play mode and what the HUD shows; the mission rules themselves live in
 * ./mission.ts.
 *
 * The player's position is deliberately NOT in here. It changes every frame,
 * so it lives in a plain mutable object (./player.ts) that the render loop
 * reads without waking React.
 */
import { create } from 'zustand'
import { START_MAP } from '../maps/registry'
import type { MapId, Pose, SequenceId, TeachingCard } from '../maps/types'
import type { StageId } from './cinematic'
import { applyEffects, createInitialMission, type Effects, type MissionState } from './mission'
import type { Outcome } from './decisions'
import type { NightReport } from './days'
import type { CrewLine } from '../data/challenges'
import {
  loadAstronautProfile,
  randomProfile,
  saveAstronautProfile,
  type AstronautProfile,
} from './astronaut'
import { GRAPHICS_ORDER, GRAPHICS_PRESETS, lowerTier, type GraphicsPresetId } from './graphics'

/**
 * paused: start or pause screen is up. playing: the player walks around.
 * panel: a console or scene panel is open. transition: a fade between places.
 */
export type Mode = 'paused' | 'playing' | 'panel' | 'transition'

/** The console or marker the player is looking at, in range. */
export interface FocusTarget {
  id: string
  /** Notices show their text without the E key. */
  kind: 'console' | 'marker' | 'notice' | 'elevator' | 'sequence' | 'airlock' | 'rover'
  /** Text after "Press E:". */
  prompt: string
}

export interface PanelContent {
  eyebrow: string
  title: string
  note: string
}

/** First person, second person (the camera in front, looking back at you) or third person. */
export type View = 'first' | 'second' | 'third'

export const VIEW_ORDER: readonly View[] = ['first', 'second', 'third']

/**
 * Which screen is up. title: the game's name over the lobby. menu: the
 * lobby with its tabs. game: the mission (playing, or paused with the
 * pause menu).
 */
export type Screen = 'title' | 'menu' | 'game'

export type MenuTab = 'play' | 'astronaut' | 'settings' | 'data'

const VIEW_KEY = 'lunar-outpost:view'

/** The view the player picked last time, if the browser kept it. */
function savedView(): View {
  try {
    const value = window.localStorage.getItem(VIEW_KEY)
    return VIEW_ORDER.includes(value as View) ? (value as View) : 'first'
  } catch {
    return 'first'
  }
}

function saveView(view: View): void {
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Storage blocked: the choice just isn't remembered.
  }
}

const GRAPHICS_KEY = 'lunar-outpost:graphics'

/** The tier the player picked last time, or medium. */
function savedGraphics(): GraphicsPresetId {
  try {
    const value = window.localStorage.getItem(GRAPHICS_KEY)
    return GRAPHICS_ORDER.find((id) => id === value) ?? 'medium'
  } catch {
    return 'medium'
  }
}

function saveGraphics(id: GraphicsPresetId): void {
  try {
    window.localStorage.setItem(GRAPHICS_KEY, id)
  } catch {
    // Storage blocked: the choice just isn't remembered.
  }
}

export type TransitionAfter =
  | { kind: 'teleport'; pose: Pose; then?: PanelContent; night?: NightReport }
  | { kind: 'load'; mapId: MapId }

/**
 * Where an in-engine sequence is. Launch: countdown, then ascent, then the
 * engines cut off, then the player unbuckles. Landing: one descent step.
 */
export type SequenceStep = 'countdown' | 'ascent' | 'cutoff' | 'unbuckle' | 'descent'

export interface SequenceState {
  id: SequenceId
  step: SequenceStep
  /** Seconds left on the launch countdown, while counting. */
  countdown: number | null
  /** A small label naming what is happening now, two to four words. */
  label?: string | null
  /** A fade to black with this line of text ("Later, in Earth orbit"). */
  fade?: string | null
  /** A big title across the screen ("LIFTOFF", "TOUCHDOWN"). */
  banner?: string | null
  /** An outside shot is playing: letterbox bars. */
  outside?: boolean
}

const EASY_FLOAT_KEY = 'lunar-outpost:easy-float'

function savedEasyFloat(): boolean {
  try {
    return window.localStorage.getItem(EASY_FLOAT_KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * A challenge's decision panel, while it is open. choose: the player is
 * picking; result: they committed and see what happened.
 */
export interface ChallengeSession {
  id: number
  stage: 'choose' | 'result'
  /** Choice: the option picked (index), and the one under the mouse. */
  selected: number | null
  hovered: number | null
  /** Split: units per bucket, and the bucket the keys work on. */
  allocation: number[]
  bucket: number
  /** Split: units to place on this run. */
  total: number
  /** Timed: when time runs out (performance.now() ms), or null. */
  deadline: number | null
  outcome: Outcome | null
}

export interface TransitionState {
  message: string
  after: TransitionAfter
}

interface GameStore {
  mission: MissionState
  graphics: GraphicsPresetId

  mapId: MapId
  mode: Mode
  view: View
  /** False until a mission starts; true while there is one to continue. */
  started: boolean
  screen: Screen
  menuTab: MenuTab
  /** From the title to the lobby. */
  openMenu: () => void
  setMenuTab: (tab: MenuTab) => void
  /** Counts missions started: the player and the sequences start over when it changes. */
  runId: number
  /** Into the mission: a new one (`fresh`, or when there is none yet), or the one in progress. */
  enterGame: (fresh: boolean) => void
  /** Back to the lobby. The mission stays as it is, to continue later. */
  leaveGame: () => void
  pointerLocked: boolean
  focus: FocusTarget | null
  roomLabel: string | null
  /** True while the player is on outdoor ground; the minimap shows the grounds then. */
  outdoors: boolean
  /** The level the player is on (ground, tunnel, access arm). */
  levelId: string
  setLevelId: (levelId: string) => void

  /** The player's astronaut: the saved one, or a suggested one until they make their own. */
  astronaut: AstronautProfile
  /** True once the player has made (and saved) their astronaut. */
  astronautSaved: boolean
  setAstronaut: (profile: AstronautProfile) => void
  panel: PanelContent | null
  transition: TransitionState | null

  /** The sequence playing (launch or landing), or null. */
  sequence: SequenceState | null
  setSequence: (sequence: SequenceState | null) => void
  /** The cinematic stage built for the sequence's outside shots, or null (see src/scene/cinematic). */
  cinematicStage: StageId | null
  setCinematicStage: (stage: StageId | null) => void
  /** The decision panel open now, or null. */
  challenge: ChallengeSession | null
  setChallenge: (challenge: ChallengeSession | null) => void
  /** The morning card after a night at the outpost, or null. */
  night: NightReport | null
  /** After the run: the ending card, then the debrief. */
  afterword: 'ending' | 'debrief' | null
  /** A crew line on screen outside a panel (the trainer at the hatch, Houston's warning), or null. */
  caption: CrewLine | null
  /** The storm alarm: the screen pulses red. */
  alarm: boolean
  /** Shift+M: the big map across the bottom half of the screen. */
  bigMap: boolean
  toggleBigMap: () => void
  /** The guidebook (G) is open: the game is paused under it. */
  guide: boolean
  openGuide: () => void
  closeGuide: () => void
  /** A place the big map points at (a task picked in the guidebook), on this map, or null. */
  mapFocus: { mapId: string; x: number; z: number; label: string } | null
  showOnMap: (focus: { mapId: string; x: number; z: number; label: string } | null) => void
  /** Challenges done on this run (and placeholder consoles reached); done consoles glow green. */
  usedConsoles: number[]
  markConsoleUsed: (challengeId: number) => void
  /**
   * Easy float (on by default): a floating player slowly rights themselves,
   * so the ceiling stays up. Off: free floating, for older players.
   */
  easyFloat: boolean
  setEasyFloat: (on: boolean) => void
  /** The teaching card on screen, if any, and the ids of cards already shown this run. */
  card: TeachingCard | null
  seenCards: string[]
  /** Science words already explained on this run (src/data/glossary.ts). */
  seenTerms: string[]
  markTerms: (ids: readonly string[]) => void
  /** Shows a card unless it was shown before. */
  showCard: (card: TeachingCard) => void
  hideCard: () => void
  /** Driving the rover, and from where: the driver's seat or a chase camera behind (V switches). */
  driving: boolean
  setDriving: (driving: boolean) => void
  roverView: 'seat' | 'chase'
  toggleRoverView: () => void
  /** The elevator whose button panel is on screen (the player is in its car), or null. */
  elevatorPanel: string | null
  setElevatorPanel: (id: string | null) => void
  /** Bumped to play a quick fade to black and back (changing suits in the airlock). */
  fade: number
  flashFade: () => void

  /** Applies effects outside a challenge (losing the rover, dev tools). Challenges commit through src/scene/challenges.ts. */
  apply: (effects: Effects) => void
  restart: () => void
  /** The player picks a tier (remembered next time). */
  setGraphics: (preset: GraphicsPresetId) => void
  /** The frame rate is too low: drop one tier and say so. */
  lowerGraphics: () => void

  /** A short message shown for a few seconds, or null. */
  toast: string | null
  showToast: (message: string) => void
  clearToast: () => void

  setMode: (mode: Mode) => void
  toggleView: () => void
  /** The view the game starts in and V switches from (remembered next time). */
  setView: (view: View) => void
  setStarted: () => void
  setPointerLocked: (locked: boolean) => void
  setFocus: (focus: FocusTarget | null) => void
  setRoomLabel: (label: string | null) => void
  setOutdoors: (outdoors: boolean) => void
  openPanel: (panel: PanelContent) => void
  closePanel: () => void
  startTransition: (transition: TransitionState) => void
  endTransition: () => void
  loadMap: (mapId: MapId) => void
}

/** A fresh mission. Dev builds take `?power=10` to start with that much power (to test low-power lighting). */
function devMission(): MissionState {
  const mission = createInitialMission()
  if (!import.meta.env?.DEV || typeof window === 'undefined') return mission
  const power = Number(new URLSearchParams(window.location.search).get('power'))
  if (new URLSearchParams(window.location.search).has('power') && Number.isFinite(power)) {
    mission.meters = { ...mission.meters, power: Math.max(0, Math.min(100, power)) }
  }
  return mission
}

const savedAstronaut = typeof window === 'undefined' ? null : loadAstronautProfile()

export const useGame = create<GameStore>()((set) => ({
  mission: devMission(),
  graphics: savedGraphics(),
  toast: null,

  mapId: START_MAP,
  mode: 'paused',
  view: savedView(),
  started: false,
  screen: 'title',
  menuTab: 'play',
  openMenu: () => set({ screen: 'menu' }),
  setMenuTab: (menuTab) => set({ menuTab }),
  runId: 0,
  enterGame: (fresh) =>
    set((state) => {
      // The first mission, or the one in progress: everything is already where it should be.
      if (!state.started || !fresh) return { started: true, screen: 'game', mode: 'playing' }
      // A new mission over an old one: back to the start, with nothing carried over.
      return {
        screen: 'game',
        mode: 'playing',
        runId: state.runId + 1,
        mission: createInitialMission(),
        mapId: START_MAP,
        focus: null,
        roomLabel: null,
        outdoors: false,
        levelId: 'ground',
        panel: null,
        transition: null,
        sequence: null,
        cinematicStage: null,
        challenge: null,
        night: null,
        afterword: null,
        caption: null,
        alarm: false,
        usedConsoles: [],
        card: null,
        seenCards: [],
        seenTerms: [],
        driving: false,
        roverView: 'chase',
        elevatorPanel: null,
        toast: null,
      }
    }),
  leaveGame: () => set({ screen: 'menu', menuTab: 'play', mode: 'paused', focus: null, elevatorPanel: null }),
  pointerLocked: false,
  focus: null,
  roomLabel: null,
  outdoors: false,
  levelId: 'ground',
  setLevelId: (levelId) => set({ levelId }),
  astronaut: savedAstronaut ?? randomProfile(),
  astronautSaved: savedAstronaut !== null,
  setAstronaut: (profile) => {
    saveAstronautProfile(profile)
    set({ astronaut: profile, astronautSaved: true })
  },
  panel: null,
  transition: null,

  sequence: null,
  setSequence: (sequence) => set({ sequence }),
  cinematicStage: null,
  setCinematicStage: (cinematicStage) => set({ cinematicStage }),
  challenge: null,
  setChallenge: (challenge) => set({ challenge }),
  night: null,
  afterword: null,
  caption: null,
  alarm: false,
  bigMap: false,
  toggleBigMap: () => set((state) => ({ bigMap: !state.bigMap })),
  guide: false,
  openGuide: () => set({ guide: true, mode: 'panel', focus: null }),
  closeGuide: () => set({ guide: false, mode: 'playing' }),
  mapFocus: null,
  showOnMap: (mapFocus) => set((state) => ({ mapFocus, bigMap: mapFocus ? true : state.bigMap })),
  usedConsoles: [],
  markConsoleUsed: (challengeId) =>
    set((state) => (state.usedConsoles.includes(challengeId) ? {} : { usedConsoles: [...state.usedConsoles, challengeId] })),
  easyFloat: savedEasyFloat(),
  setEasyFloat: (on) => {
    try {
      window.localStorage.setItem(EASY_FLOAT_KEY, on ? 'on' : 'off')
    } catch {
      // Storage blocked: the choice just isn't remembered.
    }
    set({ easyFloat: on })
  },
  card: null,
  seenCards: [],
  seenTerms: [],
  markTerms: (ids) => set((state) => ({ seenTerms: [...new Set([...state.seenTerms, ...ids])] })),
  showCard: (card) =>
    set((state) => (state.seenCards.includes(card.id) ? {} : { card, seenCards: [...state.seenCards, card.id] })),
  hideCard: () => set({ card: null }),
  driving: false,
  setDriving: (driving) => set({ driving }),
  roverView: 'chase',
  toggleRoverView: () => set((state) => ({ roverView: state.roverView === 'seat' ? 'chase' : 'seat' })),
  elevatorPanel: null,
  setElevatorPanel: (elevatorPanel) => set({ elevatorPanel }),
  fade: 0,
  flashFade: () => set((state) => ({ fade: state.fade + 1 })),

  apply: (effects) =>
    set((state) => ({ mission: applyEffects(state.mission, effects) })),

  restart: () => set({ mission: createInitialMission() }),

  setGraphics: (preset) => {
    saveGraphics(preset)
    set({ graphics: preset })
  },
  lowerGraphics: () =>
    set((state) => {
      const next = lowerTier(state.graphics)
      return next ? { graphics: next, toast: 'Graphics lowered for speed' } : {}
    }),
  showToast: (message) => set({ toast: message }),
  clearToast: () => set({ toast: null }),

  setMode: (mode) => set({ mode }),
  toggleView: () =>
    set((state) => {
      const view = VIEW_ORDER[(VIEW_ORDER.indexOf(state.view) + 1) % VIEW_ORDER.length] ?? 'first'
      saveView(view)
      return { view }
    }),
  setView: (view) => {
    saveView(view)
    set({ view })
  },
  setStarted: () => set({ started: true }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setFocus: (focus) => set({ focus }),
  setRoomLabel: (roomLabel) => set({ roomLabel }),
  setOutdoors: (outdoors) => set({ outdoors }),
  openPanel: (panel) => set({ panel, mode: 'panel', focus: null }),
  closePanel: () => set({ panel: null, mode: 'playing' }),
  startTransition: (transition) => set({ transition, mode: 'transition', focus: null }),
  endTransition: () => set({ transition: null, mode: 'playing' }),
  loadMap: (mapId) => set({ mapId, focus: null, roomLabel: null, driving: false, elevatorPanel: null, mapFocus: null, guide: false }),
}))

/** The settings of the active graphics preset. */
export function useGraphicsPreset() {
  return useGame((state) => GRAPHICS_PRESETS[state.graphics])
}
