/**
 * The ending scenes: a short cinematic per ending (10 to 15 seconds,
 * skippable), on the landing-site stage, before the ending card and the
 * Mission Handbook.
 *
 * - The outpost thrives: from beside the outpost, looking north, where
 *   Earth sits low on the horizon (as it does from near the Moon's south
 *   pole; the map's Earth is due north, 1.5 degrees up), a second lander
 *   comes down at the pad: the next crew.
 * - Mission complete: the lander on the pad, then lifting off on schedule.
 * - Early return: the lander lifting off early, and the outpost going dark.
 *
 * Simplifications: the crew aren't shown (the crew figures are off), and
 * the whole lander lifts off (on Apollo only the top half did).
 */
import type { Ending } from '../../state/mission'
import { lunarGround } from '../kit/lunar'
import { OUTPOST } from '../../maps/outpost'
import { LANDING_PAD, padHeight, type LanderPose } from './landingScript'
import type { CinematicScript } from './timeline'

/** The lander lifting off the pad at `at` seconds, speeding up as it climbs. */
export function liftoffPose(at: number): (t: number) => LanderPose {
  return (t) => {
    const s = Math.max(0, t - at)
    return { base: [LANDING_PAD.x, padHeight() + 1.2 * s * s, LANDING_PAD.z], pitch: 0 }
  }
}

/** A second lander coming down at the pad from the north (out of Earth's side of the sky), touching down at `touchdown` seconds. */
export function arrivalPose(touchdown: number): (t: number) => LanderPose {
  return (t) => {
    const left = Math.max(0, touchdown - t)
    return { base: [LANDING_PAD.x - left * 2, padHeight() + left * left * 0.7, LANDING_PAD.z - left * 5], pitch: 0 }
  }
}

const PX = LANDING_PAD.x
const PZ = LANDING_PAD.z

export interface EndingScene {
  script: CinematicScript
  pose: (t: number) => LanderPose
  thrust: (t: number) => number
}

const ground = (x: number, z: number) => lunarGround(OUTPOST)?.(x, z) ?? 0

const subject = (pose: (t: number) => LanderPose) => (t: number): [number, number, number] => {
  const base = pose(t).base
  return [base[0], base[1] + 2.4, base[2]]
}

/** The scene for an ending. */
export function endingScene(ending: Ending): EndingScene {
  if (ending === 'outpost-thrives') {
    const touchdown = 10
    const pose = arrivalPose(touchdown)
    return {
      pose,
      thrust: (t) => (t < touchdown ? 0.6 : 0),
      script: {
        id: 'ending',
        duration: 13.5,
        stage: 'landing-site',
        ground,
        subject: subject(pose),
        shots: [
          {
            // South of the pad, looking north: Earth low on the horizon, the pad just left of it.
            id: 'earthrise',
            scene: 'landing-site',
            from: 0,
            to: 14.5,
            keys: [
              { at: 0, position: [PX + 14, 1.6, PZ + 40], target: [PX, 8, PZ - 120], fov: 46, aboveGround: true },
              { at: 13.5, position: [PX + 12, 1.6, PZ + 32], target: [PX - 2, 5, PZ - 120], fov: 42, aboveGround: true, ease: 'inOut' },
            ],
          },
        ],
        events: [
          { at: 0.3, id: 'ending-thrives', label: 'Earth on the horizon' },
          { at: 4, id: 'second-crew', label: 'The next crew arrives' },
          { at: touchdown, id: 'second-touchdown', banner: 'THE OUTPOST THRIVES' },
        ],
      },
    }
  }
  const early = ending !== 'mission-complete'
  const lift = early ? 2.5 : 5
  const pose = liftoffPose(lift)
  return {
    pose,
    thrust: (t) => (t < lift - 0.4 ? 0 : 1),
    script: {
      id: 'ending',
      duration: 13,
      stage: 'landing-site',
      ground,
      subject: subject(pose),
      shots: [
        {
          // From near the outpost, the lander on the pad with Earth low behind it; it lifts off and climbs away.
          id: 'liftoff',
          scene: 'landing-site',
          from: 0,
          to: 14,
          // Far enough back that the horizon stays in frame as the camera tilts up after it.
          keys: [
            { at: 0, position: [PX - 50, 2, PZ + 70], target: [PX, 4, PZ], fov: 40, aboveGround: true },
            { at: lift, position: [PX - 50, 2, PZ + 70], target: [PX, 4, PZ], fov: 42, aboveGround: true },
            { at: 13, position: [PX - 52, 2, PZ + 74], target: [PX, 45, PZ], fov: 55, aboveGround: true, ease: 'inOut' },
          ],
        },
      ],
      events: early
        ? [
            { at: 0.3, id: 'ending-early', label: 'Heading home early' },
            { at: lift, id: 'liftoff-early', banner: 'LIFTOFF' },
            { at: 9, id: 'outpost-dark', fade: { text: 'The outpost powers down until the next crew', seconds: 4 } },
          ]
        : [
            { at: 0.3, id: 'ending-complete', label: 'Mission complete' },
            { at: lift, id: 'liftoff-on-schedule', banner: 'LIFTOFF' },
            { at: 10, id: 'homeward', label: 'Homeward bound' },
          ],
    },
  }
}
