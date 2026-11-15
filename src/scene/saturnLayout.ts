/**
 * Where things are on the Saturn V model (public/models/saturn-v.glb), in
 * the model's own metres: it is real size, 110.8 m tall, standing on +y
 * with the F-1 nozzle exits at y = 0. Measured from the model; kept apart
 * from the loader so the launch script (and its headless checks) can use
 * the numbers without loading anything.
 *
 * The world puts the model's y = 0 at ROCKET_BASE above the pad's ground
 * (src/scene/kit/exterior.ts, src/scene/cinematic/launchScript.ts).
 */

export type Pair = readonly [number, number]

export const SATURN_V = {
  /** Nozzle exits to the escape tower's tip. */
  height: 110.76,
  /** The first and second stages' body (S-IC, S-II). */
  radius: 5.05,
  /** The fin tips stand out this far, on the diagonals, low on the first stage. */
  finRadius: 10.4,
  /** The fins' and engine fairings' lowest point. */
  fairingBottom: 4.4,

  /** Stage joints, bottom to top. */
  firstTop: 42.1,
  secondTop: 66.9,
  /** The third stage's top: the lunar module adapter's hinged panels start here. */
  adapterBase: 87.98,
  /** The service module's top and the command module's base. */
  capsuleBase: 99.25,
  capsuleTop: 102.25,
  capsuleBaseRadius: 1.94,
  /** Widest the service module gets (its thruster quads). */
  serviceRadius: 2.18,

  /** Five F-1s: one in the middle, four on the diagonals. Nozzle exits and their radius. */
  f1: { y: 0.07, radius: 1.85, at: [[0, 0], [3.5, 3.5], [3.5, -3.5], [-3.5, -3.5], [-3.5, 3.5]] as readonly Pair[] },
  /** The second stage's five J-2s. */
  j2Second: { y: 42.17, radius: 1.0, at: [[0, 0], [1.95, 1.95], [1.95, -1.95], [-1.95, -1.95], [-1.95, 1.95]] as readonly Pair[] },
  /** The third stage's one J-2 (hidden inside the interstage until the second stage goes). */
  j2Third: { y: 69.16, radius: 1.0 },
  /** The escape tower's four motor nozzles, round its axis. */
  towerNozzles: { y: 103.43, radius: 0.6 },
  /** The first stage's retro-rockets fire from the engine fairings; the second stage's ullage motors from its interstage. */
  firstRetros: { y: 6, radius: 6.2 },
  ullage: { y: 44, radius: 5.5 },
  /** The third stage's retro-rockets are on the interstage that stays with the second stage. */
  secondRetros: { y: 68.3, radius: 4.1 },

  /** Each piece turns about its own middle once it separates. */
  centres: {
    first: 21,
    interstage: 45,
    second: 58,
    third: 80,
    lander: 90,
    spacecraft: 96,
    tower: 105.8,
  },
  /** The four adapter panels open outward on hinges at their foot, up to this angle (radians). */
  panelOpen: 0.8,
} as const

export type PieceId = keyof typeof SATURN_V.centres

/**
 * Floor of the crew access arm above the model's base: just above the
 * service module's top, so the capsule hatch (0.35 m above the floor, 1.45 m
 * tall) opens onto the command module's side below the escape tower's cover.
 */
export const ARM_FLOOR_ABOVE_BASE = 98.95
