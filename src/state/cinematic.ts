/**
 * The cinematic playing right now, as plain mutable state (like the
 * player's position and `flight`): the sequence writes it every frame, and
 * the camera, the cinematic stages and the overlay read it.
 *
 * Low-frequency things the HUD reacts to (captions, the big title, the
 * letterbox) are also mirrored into the store's `sequence` state.
 */
/** A point or direction in metres: x east, y up, z south. */
export type Vec3 = [number, number, number]

export type StageId = 'launch-pad' | 'landing-site'

export interface CinematicCamera {
  position: Vec3
  target: Vec3
  /** Vertical field of view in degrees. */
  fov: number
}

/** One line of the readout overlay: a label and a value, e.g. ["ALT", "1 950 m"]. */
export type ReadoutLine = [string, string]

export const cinematic = {
  /** Seconds since the sequence started. */
  time: 0,
  /** True during an outside shot: the camera is the shot's, not the player's. */
  outside: false,
  /** Which stage the outside shots (or the cockpit windows) show. */
  stage: null as StageId | null,
  camera: { position: [0, 0, 0], target: [0, 0, -1], fov: 70 } as CinematicCamera,
  /** The far plane the outside shot wants, metres (null: the stage's default). */
  far: null as number | null,
  /** The glass readout that stays on screen across cuts: a title, lines and a small note. */
  readout: { title: '', lines: [] as ReadoutLine[], note: '' },
  /** What the cockpit screen says (short). */
  screen: '',
}

/** Back to nothing playing. */
export function resetCinematic(): void {
  cinematic.time = 0
  cinematic.outside = false
  cinematic.far = null
  cinematic.stage = null
  cinematic.readout = { title: '', lines: [], note: '' }
  cinematic.screen = ''
}

/**
 * Sound hooks: every timed event in a cinematic calls these with its id
 * ("engines-ignite", "liftoff", "touchdown"...). The sound effects
 * (src/audio/sfx.ts) listen: engines, staging bangs, the touchdown thud.
 */
type CueListener = (id: string) => void
const listeners = new Set<CueListener>()

export function onCue(listener: CueListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function cue(id: string): void {
  for (const listener of listeners) listener(id)
}
