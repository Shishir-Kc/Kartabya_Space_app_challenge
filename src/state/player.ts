/**
 * The player's position and view, kept outside the store on purpose.
 * The render loop writes to this object every frame; putting it in zustand
 * would re-render React sixty times a second. The minimap reads it directly.
 */
import type { Route } from '../maps/navigation'
import type { Pose } from '../maps/types'

/** Eye height in metres for a first-person view. */
export const EYE_HEIGHT = 1.6
/** Eye height while sneaking (crouched). */
export const CROUCH_EYE_HEIGHT = 1.05

export interface PlayerState {
  x: number
  z: number
  /** Turn left/right in radians. 0 looks north (-z), -PI/2 looks east. */
  yaw: number
  /** Look up/down in radians, clamped to about +-72 degrees. */
  pitch: number
  /** Current head-bob offset in metres, and where in the step cycle we are. */
  bob: number
  bobPhase: number
  /** Click-to-walk route being followed, if any. */
  route: Route | null
  /** The level the player is on. Only elevators change it. */
  level: string
  /** Height above the floor during a jump, and upward speed in m/s. */
  jumpY: number
  jumpVelocity: number
  /** Sneaking (K toggles): crouched, slow and quiet. */
  crouching: boolean
  /** Eye height now, easing between standing and crouched. */
  eye: number
  /** Floating (microgravity): eye height in world metres, velocity in m/s, and head roll in radians. */
  y: number
  vx: number
  vy: number
  vz: number
  roll: number
  rollVelocity: number
  /** Strapped into a seat for a sequence: no moving, only looking around. */
  seated: boolean
}

export const player: PlayerState = {
  x: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  bob: 0,
  bobPhase: 0,
  route: null,
  level: 'ground',
  jumpY: 0,
  jumpVelocity: 0,
  crouching: false,
  eye: EYE_HEIGHT,
  y: EYE_HEIGHT,
  vx: 0,
  vy: 0,
  vz: 0,
  roll: 0,
  rollVelocity: 0,
  seated: false,
}

/** Puts the player at a pose, looking straight ahead, with no route. */
export function placePlayer(pose: Pose & { y?: number }): void {
  player.x = pose.x
  player.z = pose.z
  player.yaw = pose.yaw
  player.pitch = 0
  player.bob = 0
  player.bobPhase = 0
  player.route = null
  player.level = pose.level ?? 'ground'
  player.jumpY = 0
  player.jumpVelocity = 0
  player.crouching = false
  player.eye = EYE_HEIGHT
  player.y = pose.y ?? EYE_HEIGHT
  player.vx = 0
  player.vy = 0
  player.vz = 0
  player.roll = 0
  player.rollVelocity = 0
  player.seated = false
}
