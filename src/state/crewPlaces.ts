/**
 * Where each crew member is right now (pure, so the checks can test it).
 * A map lists everyone's places (`crew` in the map data); the mission picks
 * one per person:
 *
 * - Launch center: the trainer waits in the briefing room, then by the crew
 *   elevator after challenge 2; Kal (the science officer) waits in the cargo
 *   hangar from challenge 1 on (Shishir's Phase 1 script, scene 5).
 * - Spacecraft: the commander sits in his seat beside the player's the whole
 *   way (his only place there is a seat); the others float at their posts,
 *   and while the player is strapped in for the launch or the landing, they
 *   sit strapped into the cockpit's other seats.
 * - Outpost: after "Shelter everyone" in a solar storm, the whole crew waits
 *   in the storm shelter until the next day; a crew member resting in red
 *   health lies in a bunk in the crew quarters; otherwise each stands in
 *   the room they care about.
 *
 * Houston (comms) talks over the radio; the one place he's met in person is
 * the launch center's communications building, between challenges 1 and 2.
 */
import type { OutfitId } from '../character/outfits'
import type { CrewSpot, GameMap } from '../maps/types'
import { isCrew, type MissionState, type SpeakerId } from './mission'

/** 'walk': walking with the player in a scene (src/scene/walkTogether.ts), or waiting after it; never solid. */
export type CrewPose = 'stand' | 'float' | 'lie' | 'sit' | 'walk'

export interface CrewPlace {
  speakerId: SpeakerId
  /** Which of their places ('home', 'hangar', 'elevator', 'shelter', 'seat' or 'rest'). */
  place: string
  x: number
  z: number
  /** Height above the floor (a bunk), when lying. */
  y?: number
  yaw: number
  level?: string
  pose: CrewPose
  /** What they wear, when not the map's own outfit (the Moon suit outside). */
  outfit?: OutfitId
  /** Walking speed, metres per second, for the 'walk' pose. */
  speed?: number
}

/** Where a story beat puts someone while it plays (src/scene/beats.ts). */
export interface BeatSpot {
  speakerId: SpeakerId
  x: number
  z: number
  yaw: number
  outfit?: OutfitId
}

const did = (mission: MissionState, challenge: number) => mission.history.some((r) => r.challenge === challenge)

/** The crew sheltered from a storm today ("Shelter everyone"), so they stay in the shelter until the night passes. */
export function shelteredToday(mission: MissionState): boolean {
  const last = [...mission.history].reverse().find((r) => r.challenge === 10)
  return !!last && last.outcomeId === 'c10-a' && (last.day ?? -1) === mission.day
}

/**
 * Where everyone is. `strapped`: the player is strapped in for a launch or a
 * landing, so the crew are in their seats too.
 */
export function crewPlaces(map: GameMap, mission: MissionState, beat: readonly BeatSpot[] | null = null, strapped = false): CrewPlace[] {
  const spots = map.crew ?? []
  const people = [...new Set([...spots.map((s) => s.speakerId), ...(beat ?? []).map((b) => b.speakerId)])]
  const out: CrewPlace[] = []
  for (const id of people) {
    // Houston talks over the radio; he's only met in person at the launch
    // center's communications building, between challenges 1 and 2 (Shishir's
    // Phase 1 script, scene 4).
    if (id === 'comms' && (map.id !== 'launch-center' || !did(mission, 1) || did(mission, 2))) continue
    // A story beat places its people itself.
    const staged = beat?.find((b) => b.speakerId === id)
    if (staged) {
      out.push({ speakerId: id, place: 'beat', x: staged.x, z: staged.z, yaw: staged.yaw, pose: map.gravity === 'micro' ? 'float' : 'stand', outfit: staged.outfit })
      continue
    }
    if (!spots.some((s) => s.speakerId === id)) continue
    // Kal goes to the cargo hangar once the briefing's choice is made; before that she's only in its scenes.
    if (map.id === 'launch-center' && id === 'science' && !did(mission, 1)) continue
    const mine = spots.filter((s) => s.speakerId === id)
    const at = (place: CrewSpot['place']) => mine.find((s) => (s.place ?? 'home') === place)
    const home = at('home') ?? mine[0]!
    let spot: CrewSpot = home
    if (strapped && at('seat')) {
      spot = at('seat')!
    } else if (map.id === 'launch-center' && id === 'trainer') {
      spot = (did(mission, 2) && at('elevator')) || home
    }
    if (map.id === 'outpost') {
      if (shelteredToday(mission) && at('shelter')) spot = at('shelter')!
      else if (isCrew(id) && mission.crewHealth[id] === 'red' && home.rest) {
        const r = home.rest
        out.push({ speakerId: id, place: 'rest', x: r.x, z: r.z, y: r.y, yaw: r.yaw, level: home.level, pose: 'lie' })
        continue
      }
    }
    // Anyone in a seat sits in it, strapped in or not.
    const pose: CrewPose = spot.place === 'seat' ? 'sit' : map.gravity === 'micro' ? 'float' : 'stand'
    out.push({ speakerId: id, place: spot.place ?? 'home', x: spot.x, z: spot.z, yaw: spot.yaw, level: spot.level, pose })
  }
  return out
}
