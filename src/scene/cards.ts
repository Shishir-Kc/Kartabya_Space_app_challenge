/**
 * Teaching cards: short glass cards, each shown once, the first time its
 * trigger happens. The cards themselves are map data (`cards` in the map),
 * so later phases can add more without code changes.
 */
import { requireMap } from '../maps/registry'
import type { CardTrigger } from '../maps/types'
import { useGame } from '../state/store'

function matches(trigger: CardTrigger, fired: CardTrigger): boolean {
  if (trigger.kind !== fired.kind) return false
  if (trigger.kind === 'event' && fired.kind === 'event') return trigger.event === fired.event
  if (trigger.kind === 'place' && fired.kind === 'place') return trigger.place === fired.place
  return true
}

/** Shows the current map's card for this trigger, if there is one and it hasn't been shown yet. */
export function fireCard(trigger: CardTrigger): void {
  const state = useGame.getState()
  const map = requireMap(state.mapId)
  for (const card of map.cards ?? []) {
    if (!state.seenCards.includes(card.id) && matches(card.trigger, trigger)) {
      state.showCard(card)
      return
    }
  }
}

/** Shorthand for event triggers: fireEvent('float'), fireEvent('airlock'). */
export function fireEvent(event: string): void {
  fireCard({ kind: 'event', event })
}
