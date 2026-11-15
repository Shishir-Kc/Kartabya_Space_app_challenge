/**
 * The spacecraft (Phase 2): a fictional crew vehicle on its way to the Moon.
 * A cone-shaped cockpit capsule is docked, through a short round tunnel, to
 * a cylindrical habitation module: galley and bunks forward, the life
 * support bay aft, and a storm shelter alcove off the life support bay.
 *
 * Built along the x axis with the cockpit at the east (front) end. The crew
 * float here: the map's gravity is "micro", so the player floats instead of
 * walking, between each room's floor and ceiling.
 *
 * Simplification: on Apollo the crew moved from the command module into
 * the lunar module for the trip down to the surface. Here they land in the
 * cabin they flew in, to keep the game simple; seen from outside, what
 * lands is the lunar module (src/scene/lunarModule.ts).
 *
 * Sizes (inside):
 *   Cockpit          3.3 m long (3.5 m with its bulkheads), 3.0 m wide, 2.6 m tall, narrowing at the front
 *   Docking tunnel   1.8 m long, 1.2 m round; a 1.0 m round hatch at each end
 *   Galley + bunks   4.8 m long, 2.4 x 2.6 m cross-section (2.6 x 2.6 m to the hull)
 *   Life support     2.8 m long, same cross-section
 *   Storm shelter    1.8 x 1.8 m alcove, 2.2 m tall
 */
import type { GameMap } from './types'

const HULL_HEIGHT = 2.6
const HATCH = { kind: 'door', center: 0, width: 1, sill: 0.75, height: 1.85, round: true } as const

export const SPACECRAFT: GameMap = {
  id: 'spacecraft',
  name: 'Spacecraft',
  phase: 'transit',
  gravity: 'micro',
  // The commander flies the ship: he stays in his seat, the front right one
  // beside the player's, the whole way. Floating at their posts: the safety
  // officer by the life support racks, the science officer in the galley.
  // Strapped in for the launch and the landing, in the cockpit's other three
  // seats (the player has the front left one): the commander beside the
  // player, the safety officer and the science officer behind. Each sits a
  // little back from the seat's middle, as the player does.
  crew: [
    { speakerId: 'commander', place: 'seat', x: 11.45, z: 0.8, yaw: -Math.PI / 2 },
    { speakerId: 'safety', x: 1.6, z: 0.15, yaw: 0 },
    { speakerId: 'science', x: 4.9, z: 0.1, yaw: Math.PI },
    { speakerId: 'safety', place: 'seat', x: 10.55, z: -0.8, yaw: -Math.PI / 2 },
    { speakerId: 'science', place: 'seat', x: 10.55, z: 0.8, yaw: -Math.PI / 2 },
  ],
  style: 'station',
  outfit: 'launch',
  exterior: { scene: 'space' },
  // Boarding at the hatch plays the launch, strapped into the front left seat.
  arrival: 'launch',

  cards: [
    {
      id: 'microgravity',
      eyebrow: 'Microgravity',
      title: 'You’re in microgravity.',
      body: 'You and everything around you are falling around Earth together, so nothing feels heavy. Use Space and Q to float up and down.',
      keys: [
        ['Space', 'float up'],
        ['Q', 'float down'],
      ],
      trigger: { kind: 'event', event: 'float' },
    },
  ],

  rooms: [
    {
      id: 'cockpit',
      label: 'Cockpit',
      shortLabel: 'Cockpit',
      sign: 'COCKPIT',
      rect: { x0: 9.8, x1: 13.3, z0: -1.6, z1: 1.6 },
      ceiling: HULL_HEIGHT,
      shape: 'capsule',
      lights: 1,
    },
    {
      id: 'tunnel',
      label: 'Docking tunnel',
      shortLabel: 'Tunnel',
      rect: { x0: 8, x1: 9.8, z0: -0.6, z1: 0.6 },
      floor: 0.7,
      ceiling: 1.9,
      lights: 0,
    },
    {
      id: 'galley',
      label: 'Galley',
      shortLabel: 'Galley',
      sign: 'GALLEY',
      rect: { x0: 3, x1: 8, z0: -1.3, z1: 1.3 },
      ceiling: HULL_HEIGHT,
      lights: 1,
    },
    {
      id: 'life-support',
      label: 'Life support',
      shortLabel: 'Life support',
      sign: 'LIFE SUPPORT',
      rect: { x0: 0, x1: 3, z0: -1.3, z1: 1.3 },
      ceiling: HULL_HEIGHT,
      lights: 1,
    },
    {
      id: 'storm-shelter',
      label: 'Storm shelter',
      shortLabel: 'Shelter',
      sign: 'STORM SHELTER',
      rect: { x0: 0.5, x1: 2.5, z0: 1.3, z1: 3.3 },
      ceiling: 2.2,
      lights: 1,
    },
  ],

  walls: [
    // Habitation module hull, north and south. The galley porthole looks south, toward Earth.
    { runs: 'x', at: -1.3, from: 0, to: 8, height: HULL_HEIGHT },
    {
      runs: 'x',
      at: 1.3,
      from: 0,
      to: 8,
      height: HULL_HEIGHT,
      openings: [
        { kind: 'door', center: 1.5, width: 1.2, height: 2 },
        { kind: 'window', center: 5.6, width: 0.55, sill: 1.15, top: 1.7, round: true },
      ],
    },
    // Aft end of the module.
    { runs: 'z', at: 0, from: -1.3, to: 1.3, height: HULL_HEIGHT },
    // A partition ring between the life support bay and the galley, wide open.
    { runs: 'z', at: 3, from: -1.3, to: 1.3, height: HULL_HEIGHT, openings: [{ kind: 'door', center: 0, width: 2, height: 2.4 }] },
    // Forward bulkhead of the module, with the hatch into the tunnel.
    { runs: 'z', at: 8, from: -1.3, to: 1.3, height: HULL_HEIGHT, openings: [HATCH] },
    // The capsule's aft bulkhead, with the hatch from the tunnel.
    { runs: 'z', at: 9.8, from: -1.6, to: 1.6, height: HULL_HEIGHT, openings: [HATCH] },
    // Capsule sides and front, with two forward windows.
    { runs: 'x', at: -1.6, from: 9.8, to: 13.3, height: HULL_HEIGHT },
    { runs: 'x', at: 1.6, from: 9.8, to: 13.3, height: HULL_HEIGHT },
    {
      runs: 'z',
      at: 13.3,
      from: -1.6,
      to: 1.6,
      height: HULL_HEIGHT,
      openings: [
        { kind: 'window', center: -0.58, width: 0.92, sill: 1.15, top: 1.95 },
        { kind: 'window', center: 0.58, width: 0.92, sill: 1.15, top: 1.95 },
      ],
    },
    // Storm shelter alcove.
    { runs: 'z', at: 0.5, from: 1.3, to: 3.3, height: 2.2 },
    { runs: 'z', at: 2.5, from: 1.3, to: 3.3, height: 2.2 },
    { runs: 'x', at: 3.3, from: 0.5, to: 2.5, height: 2.2 },
  ],

  consoles: [
    // Challenge 3: the CO2 scrubber fault, in the life support bay.
    { id: 'console-scrubber', position: { x: 1.5, z: -0.9 }, facing: { x: 0, z: 1 }, challengeId: 3 },
    // Challenge 4: storm in transit, inside the storm shelter.
    { id: 'console-storm', position: { x: 1.5, z: 2.9 }, facing: { x: 0, z: -1 }, challengeId: 4 },
    // Challenge 5: pick the landing site, at the front of the cockpit under the windows.
    { id: 'console-landing', position: { x: 12.85, z: 0 }, facing: { x: -1, z: 0 }, challengeId: 5 },
  ],

  markers: [
    {
      id: 'prepare-landing',
      kind: 'sequence',
      sequence: 'landing',
      requires: 5,
      label: 'Prepare for landing',
      rect: { x0: 11.1, x1: 11.6, z0: -0.25, z1: 0.25 },
    },
  ],

  props: [
    // ---- Cockpit ----
    { id: 'seat-front-left', kind: 'seat', position: { x: 11.55, z: -0.8 }, size: { w: 0.62, d: 0.7, h: 1.45 }, yaw: Math.PI / 2 },
    { id: 'seat-front-right', kind: 'seat', position: { x: 11.55, z: 0.8 }, size: { w: 0.62, d: 0.7, h: 1.45 }, yaw: Math.PI / 2 },
    { id: 'seat-back-left', kind: 'seat', position: { x: 10.65, z: -0.8 }, size: { w: 0.62, d: 0.7, h: 1.45 }, yaw: Math.PI / 2 },
    { id: 'seat-back-right', kind: 'seat', position: { x: 10.65, z: 0.8 }, size: { w: 0.62, d: 0.7, h: 1.45 }, yaw: Math.PI / 2 },
    { id: 'dash-left', kind: 'dashboard', position: { x: 12.92, z: -1.05 }, size: { w: 0.9, d: 0.55, h: 1.05 }, yaw: -Math.PI / 2 },
    { id: 'dash-right', kind: 'dashboard', position: { x: 12.92, z: 1.05 }, size: { w: 0.9, d: 0.55, h: 1.05 }, yaw: -Math.PI / 2 },
    { id: 'cockpit-laptop', kind: 'laptop', position: { x: 10.4, z: -1.46 }, size: { w: 0.34, d: 0.08, h: 0.3 }, elevation: 1.35, solid: false },
    { id: 'cockpit-bag', kind: 'cargo-bag', position: { x: 10.3, z: 1.38 }, size: { w: 0.5, d: 0.22, h: 0.4 }, elevation: 1.7, yaw: Math.PI, solid: false },
    { id: 'cockpit-hold-1', kind: 'handhold', position: { x: 10.05, z: -1.48 }, size: { w: 0.4, d: 0.08, h: 0.04 }, elevation: 1.6, solid: false },
    { id: 'cockpit-hold-2', kind: 'handhold', position: { x: 10.05, z: 1.48 }, size: { w: 0.4, d: 0.08, h: 0.04 }, elevation: 1.6, yaw: Math.PI, solid: false },

    // ---- Galley and bunks ----
    { id: 'galley-unit', kind: 'galley', position: { x: 4.1, z: -1.05 }, size: { w: 1.4, d: 0.3, h: 1.3 }, elevation: 0.55 },
    { id: 'galley-table', kind: 'fold-table', position: { x: 4.6, z: 0.98 }, size: { w: 1, d: 0.45, h: 0.1 }, elevation: 0.85, yaw: Math.PI },
    { id: 'galley-laptop', kind: 'laptop', position: { x: 5.5, z: -1.16 }, size: { w: 0.34, d: 0.08, h: 0.3 }, elevation: 1.3, solid: false },
    { id: 'galley-bag-1', kind: 'cargo-bag', position: { x: 3.5, z: 1.05 }, size: { w: 0.5, d: 0.28, h: 0.4 }, elevation: 1.75, yaw: Math.PI, solid: false },
    { id: 'galley-bag-2', kind: 'cargo-bag', position: { x: 5.0, z: -1.06 }, size: { w: 0.45, d: 0.26, h: 0.36 }, elevation: 2.0, solid: false },
    { id: 'sleeping-bag-1', kind: 'sleeping-bag', position: { x: 6.45, z: -1.12 }, size: { w: 0.75, d: 0.16, h: 1.85 }, elevation: 0.35, solid: false },
    { id: 'sleeping-bag-2', kind: 'sleeping-bag', position: { x: 7.4, z: -1.12 }, size: { w: 0.75, d: 0.16, h: 1.85 }, elevation: 0.35, solid: false },
    { id: 'sleeping-bag-3', kind: 'sleeping-bag', position: { x: 6.75, z: 1.12 }, size: { w: 0.75, d: 0.16, h: 1.85 }, elevation: 0.35, yaw: Math.PI, solid: false },
    { id: 'sleeping-bag-4', kind: 'sleeping-bag', position: { x: 7.55, z: 1.12 }, size: { w: 0.7, d: 0.16, h: 1.85 }, elevation: 0.35, yaw: Math.PI, solid: false },
    { id: 'galley-hold', kind: 'handhold', position: { x: 7.75, z: -1.18 }, size: { w: 0.4, d: 0.08, h: 0.04 }, elevation: 1.4, solid: false },

    // ---- Life support bay ----
    { id: 'rack-fans', kind: 'rack', label: 'fans', position: { x: 0.5, z: -1.02 }, size: { w: 0.75, d: 0.36, h: 2.1 } },
    { id: 'rack-filters', kind: 'rack', label: 'filters', position: { x: 2.55, z: -1.02 }, size: { w: 0.7, d: 0.36, h: 2.1 } },
    { id: 'rack-tanks', kind: 'rack', label: 'tanks', position: { x: 0.28, z: 0.1 }, size: { w: 1.3, d: 0.36, h: 2.1 }, yaw: Math.PI / 2 },
    { id: 'rack-avionics', kind: 'rack', label: 'avionics', position: { x: 2.6, z: 1.02 }, size: { w: 0.6, d: 0.36, h: 2.1 }, yaw: Math.PI },
    { id: 'co2-readout', kind: 'wall-screen', label: 'co2', position: { x: 1.5, z: -1.17 }, size: { w: 0.5, d: 0.06, h: 0.38 }, elevation: 1.75, solid: false },
    { id: 'shelter-sign', kind: 'sign', label: 'STORM SHELTER', paint: '#a3261c', position: { x: 1.5, z: 1.18 }, size: { w: 1.05, d: 0.03, h: 0.2 }, elevation: 2.08, yaw: Math.PI, solid: false },

    // ---- Storm shelter: walls lined with water and soft stowage ----
    { id: 'shelter-water-west', kind: 'water-tank', position: { x: 0.72, z: 2.35 }, size: { w: 1.5, d: 0.22, h: 1.9 }, yaw: Math.PI / 2, solid: false },
    { id: 'shelter-water-east', kind: 'water-tank', position: { x: 2.28, z: 2.35 }, size: { w: 1.5, d: 0.22, h: 1.9 }, yaw: -Math.PI / 2, solid: false },
    { id: 'shelter-bags-back', kind: 'cargo-bag', position: { x: 1.5, z: 3.08 }, size: { w: 1.6, d: 0.24, h: 0.5 }, elevation: 1.55, yaw: Math.PI, solid: false },
    { id: 'shelter-bags-top-west', kind: 'cargo-bag', position: { x: 0.75, z: 2.35 }, size: { w: 1.4, d: 0.26, h: 0.28 }, elevation: 1.9, yaw: Math.PI / 2, solid: false },
    { id: 'shelter-bags-top-east', kind: 'cargo-bag', position: { x: 2.25, z: 2.35 }, size: { w: 1.4, d: 0.26, h: 0.28 }, elevation: 1.9, yaw: -Math.PI / 2, solid: false },
  ],

  // The player starts strapped into the front left seat for the launch.
  spawn: { x: 11.45, z: -0.8, yaw: -Math.PI / 2 },
  seat: { x: 11.45, z: -0.8, yaw: -Math.PI / 2, eye: 1.18, exit: { x: 11.3, z: 0 } },
  // On the left dashboard, straight ahead of the player's seat.
  countdown: { x: 12.68, y: 1.2, z: -0.95, yaw: -Math.PI / 2, width: 0.5, height: 0.18 },
}
