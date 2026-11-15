/**
 * The menu lobby's moving parts, as plain mutable state (like the player's
 * position): the menu writes it when the player drags or picks something,
 * and the lobby stage reads it every frame without waking React.
 */
import type { OutfitId } from '../character/outfits'

export const lobby = {
  /** How far the astronaut is turned from facing the camera, in radians. Dragging changes it. */
  yaw: 0,
  /** True while the player is dragging the astronaut round. */
  dragging: false,
  /** True while the astronaut is turning back to face the camera (after a change to how they look). */
  facing: false,
  /**
   * Where the astronaut stands on screen, as a fraction of the width left
   * of the middle: the tabs with a wide panel push them further over.
   */
  shift: 0.12,
  /** The suit shown in the lobby (the ASTRONAUT tab's suit view). */
  outfit: 'flight' as OutfitId,
  /** Dev builds only: the camera moves in on the face, to check skin tones and eye colours. */
  closeUp: false,
}

/** Radians of turn per pixel dragged. */
const DRAG_SPEED = 0.011

export function dragLobby(pixels: number): void {
  lobby.facing = false
  lobby.yaw += pixels * DRAG_SPEED
}

/** Asks the astronaut to turn back toward the camera. */
export function faceCamera(): void {
  if (!lobby.dragging) lobby.facing = true
}

/** Each frame: eases the turn back to zero by the shortest way round. */
export function settleLobby(dt: number, instant: boolean): void {
  if (!lobby.facing || lobby.dragging) return
  // Wrap into (-PI, PI] so the way back is never more than half a turn.
  lobby.yaw = Math.atan2(Math.sin(lobby.yaw), Math.cos(lobby.yaw))
  if (instant || Math.abs(lobby.yaw) < 0.004) {
    lobby.yaw = 0
    lobby.facing = false
    return
  }
  lobby.yaw *= Math.exp(-dt * 7)
}
