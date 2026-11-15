/**
 * Standing poses for the developers' tribute by the ice crater
 * (src/scene/DeveloperTribute.tsx), built from bone rotations on the T-pose
 * skeleton like the floating ones (./floatPose.ts): one wave, one holding
 * the flagpole, one cheering with both arms up. All three are worn in the
 * Moon suit, so the back and the neck stay nearly upright (the suit's hard
 * upper torso doesn't bend much) and the arms are kept clear of the body.
 *
 * Directions are in the model's rest space: +x is the body's left, +y up,
 * +z forward. Arms and legs are given for the left side and mirrored for the
 * right, so +x there means away from the body on either side.
 */
import { Vector3 } from 'three'
import { about, arm, leg, type BonePose } from './floatPose'

const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)

/** Slow breathing in the chest, a degree or so. */
function breathe(pose: BonePose, time: number, period: number): void {
  pose.set('spine_03', about(X, Math.sin((time * Math.PI * 2) / period) * 1.2))
}

/** Waving to whoever drives up: the right arm up, the hand swinging side to side; the left hand on the hip. */
export function wavePose(time: number): BonePose {
  const pose: BonePose = new Map()
  breathe(pose, time, 4.4)
  // The head tipped a little toward the waving hand, as people do.
  pose.set('Head', about(Z, -6))
  const swing = Math.sin(time * 5.2) * 0.38
  arm(pose, 'r', [0.75, 0.6, 0.18], [0.12 + swing, 1, 0.12])
  arm(pose, 'l', [0.62, -0.75, -0.12], [-0.6, -0.55, 0.32])
  // Weight on the left leg, the right a little out.
  leg(pose, 'l', [0.04, -1, 0], [0.03, -1, 0], 0)
  leg(pose, 'r', [0.16, -1, 0.04], [0.1, -1, -0.02], 0)
  return pose
}

/**
 * Holding the flagpole, which stands just in front of the body's left side:
 * the left hand high on it, the right hand reaching across lower down, like
 * planting it. The pole is put where the left hand ends up (DeveloperTribute).
 * Only the head moves, looking up at the flag now and then.
 */
export function flagPose(time: number): BonePose {
  const pose: BonePose = new Map()
  const glance = Math.max(0, Math.sin((time * Math.PI * 2) / 9)) ** 2
  pose.set('Head', about(Y, 14 + glance * 10).multiply(about(X, -6 - glance * 14)))
  arm(pose, 'l', [0.5, -0.3, 0.62], [0.02, 0.78, 0.5])
  arm(pose, 'r', [0.12, -0.72, 0.62], [-0.88, 0.12, 0.42])
  leg(pose, 'l', [0.1, -1, 0.02], [0.08, -1, 0], 0)
  leg(pose, 'r', [0.1, -1, -0.02], [0.08, -1, 0], 0)
  return pose
}

/** Both arms up in a V, looking up a little: we made it. */
export function cheerPose(time: number): BonePose {
  const pose: BonePose = new Map()
  breathe(pose, time, 3.8)
  pose.set('Head', about(X, -10))
  const pump = Math.sin(time * 2.4) * 0.05
  arm(pose, 'l', [0.55, 0.82 + pump, 0.12], [0.36, 1, 0.12])
  arm(pose, 'r', [0.55, 0.82 - pump, 0.12], [0.36, 1, 0.12])
  // Feet apart.
  leg(pose, 'l', [0.2, -1, 0], [0.14, -1, 0], 0)
  leg(pose, 'r', [0.2, -1, 0], [0.14, -1, 0], 0)
  return pose
}
