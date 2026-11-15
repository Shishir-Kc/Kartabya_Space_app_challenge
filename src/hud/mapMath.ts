/**
 * The maths that turns headings into map rotations, in one place so the map
 * arrows and the headless check (tools/checks/map.mts) agree with how the
 * player and the rover really move. The map is an SVG in world metres: x
 * across, z down, so north (−z) is up and a positive rotate() turns
 * clockwise on screen. Icons are drawn with their nose pointing up.
 */

/** The SVG rotation, in degrees, for an icon facing `yaw` (0 = north). */
export function mapRotation(yaw: number): number {
  return (-yaw * 180) / Math.PI
}

/** Where an up-pointing icon's nose points after rotate(`degrees`), in world (x, z). */
export function noseAfter(degrees: number): { x: number; z: number } {
  const a = (degrees * Math.PI) / 180
  return { x: Math.sin(a), z: -Math.cos(a) }
}

/**
 * "Map turns with you": the whole map is turned round the vehicle by this
 * many degrees, so its heading points up the screen.
 */
export function headingUpRotation(yaw: number): number {
  return -mapRotation(yaw)
}

/** Whole metres, or kilometres with one decimal past 1 km. */
export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`
}
