/**
 * Where things are on the lander model (public/models/lunar-module.glb,
 * built by tools/build-lunar-module.mjs), in metres: real size, standing
 * on its footpads at y = 0, its hatch, porch and ladder facing +z (the
 * front, as for every prop). Measured from the built model. Kept apart
 * from the loader so maps, scripts and the headless checks can use the
 * numbers without loading anything.
 */
export const LUNAR_MODULE = {
  /** Footpads to the top of the antennas. */
  height: 7.02,
  /** The four footpads (front, back and sides) stand this far from the middle. */
  footpadRadius: 4.5,
  /** Half the width of the descent stage's eight-sided body: the solid part to walk round. */
  bodyHalf: 2.15,
  /** The descent engine's nozzle exit, above the footpads, and its radius. */
  engine: { y: 0.43, radius: 0.7 },
  /** The crew's eyes at the ascent stage's front windows. */
  cabinEye: 4.9,
  /** The porch outside the front hatch: its height, and how far forward it reaches. */
  porch: { y: 3.0, z: 2.9 },
} as const
