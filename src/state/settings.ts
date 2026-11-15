/**
 * Player settings that aren't part of a mission: mouse look, audio volumes
 * and accessibility. Remembered in this browser.
 *
 * Audio: the three volumes, each from 0 to 1. The crew's voices
 * (src/audio/voices.ts) and the sound effects (src/audio/sfx.ts) read them
 * with `audioLevels()` (voices and effects already multiplied by master) and
 * follow changes with `onAudioLevels(listener)`; the raw values are in
 * localStorage under "lunar-outpost:settings" as `audio.master`,
 * `audio.voices` and `audio.effects`.
 */
import { create } from 'zustand'

export interface AudioSettings {
  master: number
  voices: number
  effects: number
}

export type TextSize = 'normal' | 'large'

export interface Settings {
  /** Mouse look speed, as a multiple of the normal speed. */
  mouseSensitivity: number
  /** Moving the mouse up looks down. */
  invertY: boolean
  audio: AudioSettings
  textSize: TextSize
  /** Fewer and shorter animations. Starts from the device's own setting. */
  reducedMotion: boolean
  /** On a second run and after (Try again), the launch and landing skip straight to the end. */
  skipCutscenesOnReplay: boolean
  /** While driving, the map turns so the rover's heading is up (else north stays up). */
  mapHeadingUp: boolean
  /** The Mission Handbook's "how to use" guide has been seen (it shows the first time only). */
  handbookGuideSeen: boolean
  /** The story beats already played on this profile (each plays once). */
  beatsSeen: string[]
}

export const SENSITIVITY_MIN = 0.4
export const SENSITIVITY_MAX = 2

const STORAGE_KEY = 'lunar-outpost:settings'

function systemReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function defaults(): Settings {
  return {
    mouseSensitivity: 1,
    invertY: false,
    audio: { master: 0.8, voices: 1, effects: 1 },
    textSize: 'normal',
    reducedMotion: systemReducedMotion(),
    skipCutscenesOnReplay: true,
    mapHeadingUp: false,
    handbookGuideSeen: false,
    beatsSeen: [],
  }
}

const unit = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback

function load(): Settings {
  const base = defaults()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<Settings> & { audio?: Partial<AudioSettings> }
    const sensitivity = Number(saved.mouseSensitivity)
    return {
      mouseSensitivity: Number.isFinite(sensitivity) ? Math.max(SENSITIVITY_MIN, Math.min(SENSITIVITY_MAX, sensitivity)) : base.mouseSensitivity,
      invertY: saved.invertY === true,
      audio: {
        master: unit(saved.audio?.master, base.audio.master),
        voices: unit(saved.audio?.voices, base.audio.voices),
        effects: unit(saved.audio?.effects, base.audio.effects),
      },
      textSize: saved.textSize === 'large' ? 'large' : 'normal',
      reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : base.reducedMotion,
      skipCutscenesOnReplay: saved.skipCutscenesOnReplay !== false,
      mapHeadingUp: saved.mapHeadingUp === true,
      handbookGuideSeen: saved.handbookGuideSeen === true,
      beatsSeen: Array.isArray(saved.beatsSeen) ? saved.beatsSeen.filter((id): id is string => typeof id === 'string') : [],
    }
  } catch {
    return base
  }
}

function save(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage blocked: the settings just aren't remembered next time.
  }
}

/** The page's root element carries the two accessibility settings, for the style sheets. */
function applyToPage(settings: Settings): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.textSize = settings.textSize
  document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full'
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void
  setAudio: (patch: Partial<AudioSettings>) => void
}

const values = ({ mouseSensitivity, invertY, audio, textSize, reducedMotion, skipCutscenesOnReplay, mapHeadingUp, handbookGuideSeen, beatsSeen }: Settings): Settings => ({
  mouseSensitivity,
  invertY,
  audio,
  textSize,
  reducedMotion,
  skipCutscenesOnReplay,
  mapHeadingUp,
  handbookGuideSeen,
  beatsSeen,
})

export const useSettings = create<SettingsStore>()((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch)
    const next = values(get())
    save(next)
    applyToPage(next)
  },
  setAudio: (patch) => get().set({ audio: { ...get().audio, ...patch } }),
}))

applyToPage(values(useSettings.getState()))

/** Volumes ready to use, 0 to 1: voices and effects already scaled by master. */
export function audioLevels(): AudioSettings {
  const { master, voices, effects } = useSettings.getState().audio
  return { master, voices: voices * master, effects: effects * master }
}

/** Calls `listener` whenever a volume changes. Returns a function that stops it. */
export function onAudioLevels(listener: (levels: AudioSettings) => void): () => void {
  return useSettings.subscribe((state, previous) => {
    if (state.audio !== previous.audio) listener(audioLevels())
  })
}

/** True when animations should be kept short (the camera stops drifting, tabs don't slide). */
export function reducedMotion(): boolean {
  return useSettings.getState().reducedMotion
}
