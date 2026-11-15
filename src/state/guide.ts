/**
 * The guidebook's "Where are my tasks?" table and its hazards table, worked
 * out from the game's own rules (pure, so the checks can hold the table to
 * the real gates):
 *
 * - a task on a map the crew hasn't reached is locked until they get there
 *   (the rocket waits for every launch center task, the landing for every
 *   spacecraft task);
 * - on the current map, a task is locked while `blockedBy` says so (the ice
 *   waits for the commander's briefing, the lunar night for every other
 *   outpost task), and open otherwise ("Go here now");
 * - 1 and 2 can be done in either order, like 7 and 9.
 */
import { CHALLENGES, type Challenge } from '../data/challenges'
import { requireMap } from '../maps/registry'
import { placeAt, roomAt } from '../maps/collision'
import type { GameMap } from '../maps/types'
import { blockedBy } from './decisions'
import { CAST, isDone, type MissionState, type SpeakerId } from './mission'

export const MAP_ORDER = ['launch-center', 'spacecraft', 'outpost'] as const
export const MAP_LABEL: Record<string, string> = { 'launch-center': 'Launch center', spacecraft: 'Spacecraft', outpost: 'Outpost' }

/** Who asks the player to do each task (the launch center's from Shishir's script, the rest from src/scene/story.ts). */
export const ASKED_BY: Record<number, SpeakerId> = { 1: 'trainer', 2: 'science', 3: 'safety', 5: 'commander', 6: 'commander', 7: 'science', 8: 'science', 9: 'safety', 12: 'commander' }

export type TaskStatus = 'done' | 'go' | 'locked'

export interface TaskRow {
  id: number
  number: number
  title: string
  map: string
  /** "Briefing room", "Ice crater"... */
  place: string
  /** Where it is, for the big map. */
  at: { x: number; z: number; level?: string }
  asker: SpeakerId
  askerName: string
  status: TaskStatus
  /** For a locked task: what unlocks it. */
  unlock?: string
}

/** The planned tasks, in mission order (no hazards). */
export function plannedTasks(): Challenge[] {
  return CHALLENGES.filter((c) => c.ready && !c.hazard)
}

/** Where a task is done: its console, or its marker (the ice, the broken panel). */
function spotOf(challenge: Challenge): { map: GameMap; x: number; z: number; level?: string } | null {
  for (const id of MAP_ORDER) {
    const map = requireMap(id)
    const console = map.consoles.find((c) => c.challengeId === challenge.id)
    if (console) return { map, x: console.position.x, z: console.position.z, level: console.level }
    const marker = map.markers.find((m) => m.kind === 'challenge' && m.challengeId === challenge.id)
    if (marker && 'rect' in marker) return { map, x: (marker.rect.x0 + marker.rect.x1) / 2, z: (marker.rect.z0 + marker.rect.z1) / 2, level: marker.level }
  }
  return null
}

function placeName(map: GameMap, x: number, z: number, level?: string): string {
  // Outdoors, the named area it's in (the ice crater, the solar field) says more than "Lunar surface".
  const area = map.outdoor?.areas?.find((a) => Math.hypot(a.x - x, a.z - z) <= a.radius)
  return roomAt(map, x, z, level)?.label ?? area?.label ?? placeAt(map, x, z, level ?? 'ground')?.label ?? MAP_LABEL[map.id] ?? map.id
}

function travel(map: string): string {
  if (map === 'spacecraft') return 'Board the rocket first: finish every launch center task.'
  return 'Land on the Moon first: finish every spacecraft task.'
}

export function taskRows(mission: MissionState, currentMap: string): TaskRow[] {
  const here = MAP_ORDER.indexOf(currentMap as (typeof MAP_ORDER)[number])
  return plannedTasks().map((challenge, i) => {
    const spot = spotOf(challenge)
    const map = spot?.map.id ?? challenge.map ?? currentMap
    const asker = ASKED_BY[challenge.id] ?? 'commander'
    const base = {
      id: challenge.id,
      number: i + 1,
      title: challenge.title,
      map,
      place: spot ? placeName(spot.map, spot.x, spot.z, spot.level) : MAP_LABEL[map] ?? map,
      at: spot ? { x: spot.x, z: spot.z, level: spot.level } : { x: 0, z: 0 },
      asker,
      askerName: CAST[asker].name,
    }
    if (isDone(mission, challenge.id)) return { ...base, status: 'done' as const }
    const there = MAP_ORDER.indexOf(map as (typeof MAP_ORDER)[number])
    if (there > here) return { ...base, status: 'locked' as const, unlock: travel(map) }
    // (The crew can't leave a map with a task undone, so this only happens in tests.)
    if (there < here) return { ...base, status: 'locked' as const, unlock: `Left behind on the ${MAP_LABEL[map]?.toLowerCase() ?? map}.` }
    const blocker = blockedBy(challenge, mission)
    if (blocker === challenge) return { ...base, status: 'locked' as const, unlock: challenge.id === 8 ? 'Wait for the commander’s briefing at command.' : 'Not yet: it opens later.' }
    if (blocker) {
      const number = plannedTasks().findIndex((c) => c.id === blocker.id) + 1
      return { ...base, status: 'locked' as const, unlock: `Finish task ${number} (${blocker.title}) first.` }
    }
    return { ...base, status: 'go' as const }
  })
}

export interface HazardRow {
  name: string
  where: string
  what: string
  todo: string
}

/** The random events, and what to do when one comes. */
export const HAZARD_ROWS: readonly HazardRow[] = [
  { name: 'Solar storm', where: 'Spacecraft', what: 'The Sun throws out radiation. It can come any time.', todo: 'Shelter everyone behind the thick walls.' },
  { name: 'Solar storm', where: 'Outpost', what: 'Radiation from the Sun, with a warning if the antenna has power.', todo: 'Go to the storm shelter. Pick fast when the alarm sounds.' },
  { name: 'Meteoroid hit', where: 'Outpost, the solar panels', what: 'A tiny space rock breaks a solar panel.', todo: 'Replace it with a spare, patch it, or run on less power.' },
]
