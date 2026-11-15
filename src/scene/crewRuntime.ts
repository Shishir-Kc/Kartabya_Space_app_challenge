import type { CrewPlace } from '../state/crewPlaces'
import type { SpeakerId } from '../state/mission'

/**
 * Where each crew figure is shown right now (CrewView moves them only out of
 * the player's view, so this can lag the mission for a moment). The player's
 * collision uses it, so nobody walks through a crew member.
 */
export const crewShown = new Map<SpeakerId, CrewPlace>()
