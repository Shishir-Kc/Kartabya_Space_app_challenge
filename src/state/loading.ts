/**
 * What the main menu waits for before it shows the lobby: the astronaut on
 * the podium and the Saturn V behind (src/scene/lobby/LobbyStage.tsx). The
 * loading screen (src/hud/menu/LobbyLoading.tsx) reads it.
 */
import { create } from 'zustand'

export type LobbyPart = 'astronaut' | 'rocket'

interface LoadingState {
  /** The lobby's astronaut is on the podium (or failed to load: the menu doesn't wait forever). */
  astronaut: boolean
  /** The Saturn V stands on the pad (or failed to load). */
  rocket: boolean
}

export const useLoading = create<LoadingState>()(() => ({ astronaut: false, rocket: false }))

/** A part of the lobby is shown (or has failed and won't be), or has gone again. */
export function setLobbyReady(part: LobbyPart, ready: boolean): void {
  if (useLoading.getState()[part] !== ready) useLoading.setState({ [part]: ready })
}
