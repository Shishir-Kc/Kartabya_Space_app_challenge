/**
 * The story through the spacecraft and the outpost (lines in
 * src/data/storyLines.ts): for every planned task,
 *
 * 1. the ask: the crew member at that task asks the player for help, in
 *    person if they're in the same room, by hologram if not (Houston always
 *    on the radio); then the decision panel opens;
 * 2. the thanks and the hand-off: a reaction to the choice (a good one or a
 *    risky one), then a pointer to the next place, with a "Next:" toast.
 *
 * Plus the welcome after unbuckling, the welcome inside the outpost, a line
 * after each storm from whoever was there, and a line on each night card.
 * Asks and hand-offs are short and play every run; nothing here plays
 * without the 3D scene (the headless checks), so their runs stay as they were.
 */
import type { CrewLine } from '../data/challenges'
import { NIGHT_LINES, P2, P3 } from '../data/storyLines'
import { roomAt } from '../maps/collision'
import { requireMap } from '../maps/registry'
import { fillName } from '../state/astronaut'
import { player } from '../state/player'
import { useGame } from '../state/store'
import { transmit, useTransmissions } from '../state/transmissions'
import { crewShown } from './crewRuntime'

let host = false

/** The 3D scene tells the story (PlayerController sets this). */
export function setStoryHost(on: boolean): void {
  host = on
}

const said = new Set<string>()

/** True the first time `key` comes up on this run. */
function once(key: string): boolean {
  if (said.has(key)) return false
  said.add(key)
  return true
}

/** A new run: everything can be said again. */
export function resetStory(): void {
  said.clear()
  asked.clear()
}

/** In person if the speaker stands in the player's room, else a hologram (Houston: the radio). */
export function delivered(line: CrewLine): CrewLine {
  const state = useGame.getState()
  const text = fillName(line.text, state.astronaut.name || 'astronaut')
  if (line.speakerId === 'comms') return { ...line, text }
  const shown = crewShown.get(line.speakerId)
  const map = requireMap(state.mapId)
  const here = roomAt(map, player.x, player.z, player.level)?.id
  const there = shown && shown.pose !== 'lie' ? roomAt(map, shown.x, shown.z, shown.level)?.id : undefined
  return { ...line, text, inPerson: !!here && here === there }
}

function say(line: CrewLine, then?: () => void): void {
  transmit(delivered(line), { then })
}

// ---------- The asks ----------

export const ASKS: Partial<Record<number, CrewLine>> = { 3: P2.ask3, 5: P2.ask5, 6: P3.ask6, 7: P3.ask7, 8: P3.ask8, 9: P3.ask9, 11: P3.ask11, 12: P3.ask12 }

/** Tasks asked for on this run (an ask opens its panel once; the next time it opens straight away). */
const asked = new Set<number>()

/**
 * Before a task's panel opens: its ask, then the panel. Returns false (and
 * does nothing) if there's no ask or it was just asked, so the panel opens.
 */
export function askFirst(id: number, open: () => void): boolean {
  const line = ASKS[id]
  if (!host || !line || asked.has(id)) return false
  asked.add(id)
  say(line, open)
  return true
}

// ---------- The thanks and the hand-offs ----------

const RISKY = new Set(['c03-c', 'c07-c', 'c08-c', 'c09-c'])

function next(where: string): () => void {
  return () => useGame.getState().showToast(`Next: ${where}`)
}

/** After a spacecraft or outpost task's panel closes, with what was chosen. */
export function afterStoryChallenge(id: number, outcomeId: string | undefined): void {
  if (!host || !outcomeId) return
  const risky = RISKY.has(outcomeId)
  switch (id) {
    case 3:
      say(risky ? P2.risky3 : P2.good3)
      say(P2.next3, next('the cockpit, to pick a landing site'))
      return
    case 4:
      say(outcomeId === 'c04-a' ? P2.stormSheltered : outcomeId === 'c04-b' ? P2.stormPart : P2.stormWorked)
      return
    case 5:
      say(P2.after5, next('prepare for landing in your seat'))
      return
    case 6:
      say(P3.after6)
      say(P3.next6, next('the greenhouse'))
      return
    case 7:
      say(risky ? P3.risky7 : P3.good7)
      say(P3.next7, next('crew quarters'))
      return
    case 8:
      say(risky ? P3.risky8 : P3.good8)
      say(P3.next8, next('back to base'))
      return
    case 9:
      say(risky ? P3.risky9 : P3.good9)
      return
    case 10:
      say(outcomeId === 'c10-a' ? P3.stormSheltered : P3.stormExposed)
      return
    case 11:
      say(outcomeId === 'c11-a' ? P3.replaced11 : outcomeId === 'c11-b' ? P3.patched11 : P3.left11)
      return
  }
}

// ---------- Arrivals ----------

/** Each frame while playing: the welcomes, once per run each. */
export function storyMoments(): void {
  if (!host) return
  const state = useGame.getState()
  if (state.mode !== 'playing' || state.sequence || state.challenge || state.night || state.transition || state.afterword) return
  const busy = useTransmissions.getState().current !== null || useTransmissions.getState().queue.length > 0
  const done = (c: number) => state.mission.history.some((r) => r.challenge === c)
  if (state.mapId === 'spacecraft' && !player.seated && !done(3) && !busy && once('spacecraft-welcome')) {
    say(P2.welcome1)
    say(P2.welcome2, next('life support, at the back'))
  }
  if (state.mapId === 'outpost' && !state.outdoors && !done(6) && !busy) {
    const room = roomAt(requireMap('outpost'), player.x, player.z, player.level)?.id
    if (room && room !== 'airlock' && once('outpost-welcome')) say(P3.welcome, next('the power bay'))
  }
}

// ---------- The night cards ----------

/** The crew line on the night card that ends day `day` (in turn). */
export function nightLine(day: number): CrewLine {
  const line = NIGHT_LINES[(Math.max(1, day) - 1) % NIGHT_LINES.length]!
  return { ...line, text: fillName(line.text, useGame.getState().astronaut.name || 'astronaut'), inPerson: line.speakerId !== 'comms' }
}
