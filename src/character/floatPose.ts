/**
 * Body poses for microgravity, built from bone rotations on the T-pose
 * skeleton (there are no floating clips in the animation library we use).
 *
 * - Still: the "neutral body posture" that crews settle into in weightlessness:
 *   arms floating up in front to about chest height with elbows bent,
 *   shoulders slightly forward, back gently rounded, hips and knees each bent
 *   about 50 degrees, feet relaxed, head tilted slightly forward.
 *   TODO: source (NASA research on the neutral body posture in microgravity).
 * - Moving: astronauts can't swim through air (arm strokes don't push you
 *   anywhere), so they push off and glide: one arm leading, the other along
 *   the side, legs together and trailing, toes pointed.
 * - Along a handrail: hand over hand, the nearer hand reaching for the rail.
 * - Bumping into a wall: a quick catch with both hands out.
 *
 * Directions are in the model's rest space: +x is the body's left, +y up,
 * +z forward. Each pose rotates bones in that space; children follow.
 */
import { Quaternion, Vector3 } from 'three'

export type BonePose = Map<string, Quaternion>

const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const DOWN = new Vector3(0, -1, 0)
const deg = (d: number) => (d * Math.PI) / 180
const about = (axis: Vector3, degrees: number) => new Quaternion().setFromAxisAngle(axis, deg(degrees))
const toward = (from: Vector3, to: Vector3) => new Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize())

/** An arm pointing along `upper`, its forearm along `fore` (both in rest space; mirrored for the right side). */
function arm(pose: BonePose, side: 'l' | 'r', upper: [number, number, number], fore: [number, number, number]): void {
  const m = side === 'l' ? 1 : -1
  const rest = new Vector3(m, 0, 0)
  const u = new Vector3(upper[0] * m, upper[1], upper[2]).normalize()
  const f = new Vector3(fore[0] * m, fore[1], fore[2]).normalize()
  pose.set(`upperarm_${side}`, toward(rest, u))
  pose.set(`lowerarm_${side}`, toward(u, f))
}

/** A leg whose thigh points along `thigh` and shin along `shin`, foot tipped down by `point` degrees. */
function leg(pose: BonePose, side: 'l' | 'r', thigh: [number, number, number], shin: [number, number, number], point: number): void {
  const m = side === 'l' ? 1 : -1
  const t = new Vector3(thigh[0] * m, thigh[1], thigh[2]).normalize()
  const s = new Vector3(shin[0] * m, shin[1], shin[2]).normalize()
  pose.set(`thigh_${side}`, toward(DOWN, t))
  pose.set(`calf_${side}`, toward(t, s))
  pose.set(`foot_${side}`, about(X, point))
}

/** The relaxed float: the neutral body posture. */
export function neutralPose(time: number): BonePose {
  const pose: BonePose = new Map()
  // Slow breathing in the chest, and a gently rounded back.
  const breath = Math.sin((time * Math.PI * 2) / 4.5) * 1.5
  pose.set('spine_01', about(X, 6))
  pose.set('spine_02', about(X, 6))
  pose.set('spine_03', about(X, 6 + breath))
  pose.set('neck_01', about(X, 6))
  pose.set('Head', about(X, 8))
  pose.set('clavicle_l', about(Y, -10))
  pose.set('clavicle_r', about(Y, 10))
  // Each limb drifts on its own slow cycle, a few degrees.
  const drift = (period: number, offset: number) => Math.sin((time * Math.PI * 2) / period + offset) * 0.06
  arm(pose, 'l', [0.5, -0.3 + drift(5.3, 0), 0.8], [0.3, 0.05 + drift(6.1, 1), 1])
  arm(pose, 'r', [0.5, -0.3 + drift(4.7, 2), 0.8], [0.3, 0.05 + drift(6.7, 3), 1])
  leg(pose, 'l', [0.1 + drift(5.9, 1), -0.64, 0.77], [0.05, -1, 0.05 + drift(4.3, 2)], 22)
  leg(pose, 'r', [0.1 + drift(6.4, 4), -0.64, 0.77], [0.05, -1, 0.05 + drift(5.1, 5)], 22)
  return pose
}

/** Streamlined glide: the left arm leading past the head, the right along the side, legs trailing. */
export function glidePose(time: number): BonePose {
  const pose: BonePose = new Map()
  pose.set('spine_01', about(X, 0))
  pose.set('spine_02', about(X, 0))
  pose.set('spine_03', about(X, Math.sin((time * Math.PI * 2) / 4.5)))
  // The head lifts to look where the body is going (the body itself lies along the glide).
  pose.set('neck_01', about(X, -18))
  pose.set('Head', about(X, -12))
  arm(pose, 'l', [0.15, 1, 0.2], [0.05, 1, 0.25])
  arm(pose, 'r', [0.2, -1, 0.05], [0.12, -1, 0.1])
  leg(pose, 'l', [0.03, -1, -0.04], [0.02, -1, -0.16], 40)
  leg(pose, 'r', [0.03, -1, -0.04], [0.02, -1, -0.16], 40)
  return pose
}

/**
 * Strapped into a reclined crew seat for launch or landing: the back leaning
 * back against the seat, the head up looking ahead, thighs along the seat pan,
 * shins down to the footrest, forearms resting on the armrests. Only the
 * breathing moves.
 */
export function seatedPose(time: number): BonePose {
  const pose: BonePose = new Map()
  const breath = Math.sin((time * Math.PI * 2) / 4.2) * 1.2
  // Leaning back about 18 degrees in all, then the neck and head bring the eyes level again.
  pose.set('spine_01', about(X, -8))
  pose.set('spine_02', about(X, -6))
  pose.set('spine_03', about(X, -4 + breath))
  pose.set('neck_01', about(X, 8))
  pose.set('Head', about(X, 8))
  // Upper arms down along the sides and a little out, forearms forward along the armrests.
  arm(pose, 'l', [0.28, -1, 0.12], [0.12, -0.18, 1])
  arm(pose, 'r', [0.28, -1, 0.12], [0.12, -0.18, 1])
  // Thighs forward along the seat pan (its front tipped up a little), shins down and a little forward.
  leg(pose, 'l', [0.1, 0.12, 1], [0.04, -1, 0.22], 6)
  leg(pose, 'r', [0.1, 0.12, 1], [0.04, -1, 0.22], 6)
  return pose
}

/** Hand over hand along a rail on one side (+1 the body's left, -1 its right). */
export function railArms(pose: BonePose, side: number, phase: number): void {
  const near = side > 0 ? 'l' : 'r'
  const far = side > 0 ? 'r' : 'l'
  const reach = Math.sin(phase)
  // The near hand reaches out to the rail and pulls back; the far hand crosses over to take the next grip.
  arm(pose, near, [0.85, 0.15 + reach * 0.25, 0.5 + reach * 0.35], [0.9, 0.1, 0.45 + reach * 0.4])
  arm(pose, far, [-0.4, 0.15 - reach * 0.25, 0.85 - reach * 0.2], [-0.75, 0.05, 0.6 - reach * 0.3])
}

/** A quick catch: both hands out in front. */
export function catchArms(pose: BonePose): void {
  arm(pose, 'l', [0.35, 0.15, 1], [0.3, 0.25, 1])
  arm(pose, 'r', [0.35, 0.15, 1], [0.3, 0.25, 1])
}

/** A twist of the torso and head toward where the player is turning (radians, + to the left). */
export function twistToward(pose: BonePose, twist: number): void {
  const spine = pose.get('spine_03') ?? new Quaternion()
  pose.set('spine_03', new Quaternion().setFromAxisAngle(Y, twist * 0.5).multiply(spine))
  const head = pose.get('Head') ?? new Quaternion()
  pose.set('Head', new Quaternion().setFromAxisAngle(Y, twist).multiply(head))
}

/** Blends pose `b` into `a` by `t` (0 = all a, 1 = all b), per bone. */
export function blendPoses(a: BonePose, b: BonePose, t: number): BonePose {
  const out: BonePose = new Map()
  const names = new Set([...a.keys(), ...b.keys()])
  for (const name of names) {
    const qa = a.get(name) ?? new Quaternion()
    const qb = b.get(name) ?? new Quaternion()
    out.set(name, qa.clone().slerp(qb, t))
  }
  return out
}
