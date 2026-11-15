/**
 * The lunar outpost (Phase 3) near the Moon's south pole: a corridor with
 * six rooms, an airlock to the surface, and the surface around it.
 *
 * Outside, each room is a habitat module standing on the surface (see
 * src/scene/kit/outpostModules.ts): the corridor a long central module with
 * the others butting onto it, windows cut where the interior windows are,
 * and a porch at the airlock's outer door. Only the storm shelter is
 * covered in regolith bags (its `shielding`), a real idea for shielding
 * lunar habitats from radiation, so it shows why it is the safe place in a
 * solar storm. The player walks here at about one-sixth of Earth's gravity.
 *
 * World axes as everywhere: x east, z south. The outpost is at the centre;
 * the landing pad is about 60 m to the west.
 *
 *   Airlock        3.8 x 3.0 m   x -16..-12   suit hooks, pressure gauge, window onto the rover parking
 *   Corridor       24 x 2.3 m    x -12..12
 *   Power bay      5.8 x 4.6 m   north, west   challenge 6 (wake the base)
 *   Greenhouse     8.8 x 6.1 m   north, middle challenge 7
 *   Command        6.8 x 4.6 m   north, east   challenge 12 (lunar night), antenna controls, window toward Earth
 *   Storm shelter  3.8 x 3.6 m   south, middle challenge 10 (solar storm)
 *   Crew quarters  7.8 x 5.1 m   south, east   challenge 9 (tired crew)
 */
import type { GameMap } from './types'

const H = 2.6
const DOOR = { kind: 'door', width: 1.2, height: 2.1 } as const

export const OUTPOST: GameMap = {
  id: 'outpost',
  name: 'Lunar outpost',
  phase: 'outpost',
  gravity: 'moon',
  // Each crew member stands in the room they care about: the commander in
  // command, the medic in the crew quarters looking after the crew (he calls
  // the player there for the tired crew), the botanist in the greenhouse.
  // Resting in red health, they lie in a bunk in the crew quarters instead
  // (Kal, the one who rests most often, in a lower bunk where the player can
  // see her).
  crew: [
    { speakerId: 'commander', x: 7.5, z: -4.2, yaw: Math.PI, rest: { x: 3.6, z: 5.95, y: 0.55, yaw: Math.PI / 2 } },
    // By the foot of the bunks, between them and the console, facing the door.
    { speakerId: 'safety', x: 8.4, z: 5.0, yaw: Math.PI / 4, rest: { x: 6.6, z: 5.95, y: 1.45, yaw: Math.PI / 2 } },
    { speakerId: 'science', x: 1.6, z: -4.2, yaw: Math.PI / 2, rest: { x: 6.6, z: 5.95, y: 0.55, yaw: Math.PI / 2 } },
    // After "Shelter everyone", the whole crew waits in the storm shelter until the next day.
    { speakerId: 'commander', place: 'shelter', x: -3.3, z: 4.2, yaw: -Math.PI / 2 },
    { speakerId: 'safety', place: 'shelter', x: -0.7, z: 2.0, yaw: Math.PI / 2 },
    { speakerId: 'science', place: 'shelter', x: -3.3, z: 2.0, yaw: -Math.PI / 2 },
  ],
  style: 'station',
  outfit: 'flight',

  exterior: {
    scene: 'lunar-south-pole',
    // The Sun barely clears the horizon, low in the south-south-west, so the
    // walk from the landing pad to the airlock sees sunlit ground and long
    // shadows; Earth hangs low in the north.
    sun: { bearing: 200, elevation: 3 },
    earth: { bearing: 0, elevation: 1.5 },
    stars: 450,
    size: 800,
    flat: [
      { x: -2, z: 0, radius: 22 },
      { x: -62, z: 18, radius: 14 },
      { x: -48, z: 13, radius: 4 },
      { x: -35, z: 8, radius: 4 },
      { x: -27, z: 3, radius: 4 },
      // The solar field and the antenna stand on levelled ground.
      { x: 22, z: 46, radius: 12 },
      { x: 8, z: -28, radius: 5 },
    ],
    craters: [
      // About 300 m east: deep enough that, with the Sun 3 degrees up, its
      // floor is always in shadow. Its walls are gentle enough to drive down.
      { id: 'ice-crater', x: 270, z: 110, radius: 50, depth: 11, ice: true },
    ],
    // Heaps of dug regolith and the pit they came from, at the regolith site.
    heaps: [
      { x: -104, z: -56, radius: 6, height: 2.2 },
      { x: -95, z: -65, radius: 5, height: 1.6 },
      { x: -92, z: -51, radius: 5, height: -1.5 },
    ],
  },

  rooms: [
    { id: 'airlock', label: 'Airlock', shortLabel: 'Airlock', sign: 'AIRLOCK', rect: { x0: -16, x1: -12, z0: -1.6, z1: 1.6 }, ceiling: H, lights: 1 },
    { id: 'corridor', label: 'Corridor', shortLabel: 'Corridor', rect: { x0: -12, x1: 12, z0: -1.25, z1: 1.25 }, ceiling: H, lights: 2 },
    { id: 'power', label: 'Power bay', shortLabel: 'Power', sign: 'POWER BAY', rect: { x0: -12, x1: -6, z0: -6, z1: -1.25 }, ceiling: H, lights: 1 },
    {
      id: 'greenhouse',
      label: 'Greenhouse',
      shortLabel: 'Greenhouse',
      sign: 'GREENHOUSE',
      rect: { x0: -6, x1: 3, z0: -7.5, z1: -1.25 },
      ceiling: H,
      lights: 1,
      // Red and blue LEDs: the light plants use most, which looks pink-purple.
      lightColor: '#f0a6ff',
    },
    { id: 'command', label: 'Command', shortLabel: 'Command', sign: 'COMMAND', rect: { x0: 3, x1: 10, z0: -6, z1: -1.25 }, ceiling: H, lights: 1 },
    // Regolith bags 0.75 m thick over its roof and outside walls. TODO: source (how thick a cover real designs call for).
    { id: 'shelter', label: 'Storm shelter', shortLabel: 'Shelter', sign: 'STORM SHELTER', rect: { x0: -4, x1: 0, z0: 1.25, z1: 5 }, ceiling: 2.3, lights: 1, shielding: 0.75 },
    { id: 'quarters', label: 'Crew quarters', shortLabel: 'Quarters', sign: 'CREW QUARTERS', rect: { x0: 2, x1: 10, z0: 1.25, z1: 6.5 }, ceiling: H, lights: 1 },
  ],

  walls: [
    // Airlock chamber: inner door to the corridor, outer door to the surface, a window south onto the rover.
    { runs: 'z', at: -12, from: -1.6, to: 1.6, height: H, openings: [{ ...DOOR, center: 0, airlock: 'inner' }] },
    { runs: 'z', at: -16, from: -1.6, to: 1.6, height: H, openings: [{ ...DOOR, center: 0, airlock: 'outer' }] },
    { runs: 'x', at: -1.6, from: -16, to: -12, height: H },
    { runs: 'x', at: 1.6, from: -16, to: -12, height: H, openings: [{ kind: 'window', center: -14.3, width: 0.6, sill: 1.15, top: 1.65 }] },

    // Corridor: doors north to the power bay, greenhouse and command; south to the shelter and quarters.
    {
      runs: 'x',
      at: -1.25,
      from: -12,
      to: 12,
      height: H,
      openings: [
        { ...DOOR, center: -9 },
        { ...DOOR, center: -1.5 },
        { ...DOOR, center: 6.5 },
      ],
    },
    {
      runs: 'x',
      at: 1.25,
      from: -12,
      to: 12,
      height: H,
      openings: [
        { kind: 'door', center: -2, width: 1.1, height: 2 },
        { ...DOOR, center: 4 },
      ],
    },
    { runs: 'z', at: 12, from: -1.25, to: 1.25, height: H, openings: [{ kind: 'window', center: 0, width: 0.6, sill: 1.15, top: 1.65 }] },

    // North rooms.
    { runs: 'z', at: -12, from: -6, to: -1.6, height: H },
    { runs: 'x', at: -6, from: -12, to: -6, height: H },
    { runs: 'z', at: -6, from: -7.5, to: -1.25, height: H },
    { runs: 'x', at: -7.5, from: -6, to: 3, height: H },
    { runs: 'z', at: 3, from: -7.5, to: -1.25, height: H },
    { runs: 'x', at: -6, from: 3, to: 10, height: H, openings: [{ kind: 'window', center: 6.6, width: 0.9, sill: 1.1, top: 1.75 }] },
    { runs: 'z', at: 10, from: -6, to: -1.25, height: H },

    // South rooms.
    { runs: 'z', at: -4, from: 1.25, to: 5, height: H },
    { runs: 'z', at: 0, from: 1.25, to: 5, height: H },
    { runs: 'x', at: 5, from: -4, to: 0, height: H },
    { runs: 'z', at: 2, from: 1.25, to: 6.5, height: H },
    { runs: 'z', at: 10, from: 1.25, to: 6.5, height: H },
    { runs: 'x', at: 6.5, from: 2, to: 10, height: H, openings: [{ kind: 'window', center: 8.2, width: 0.6, sill: 1.15, top: 1.65 }] },
  ],

  consoles: [
    { id: 'console-power', position: { x: -9, z: -5.6 }, facing: { x: 0, z: 1 }, challengeId: 6 },
    { id: 'console-greenhouse', position: { x: -1.5, z: -7.1 }, facing: { x: 0, z: 1 }, challengeId: 7 },
    { id: 'console-quarters', position: { x: 9.6, z: 3.6 }, facing: { x: -1, z: 0 }, challengeId: 9 },
    { id: 'console-shelter', position: { x: -2, z: 4.6 }, facing: { x: 0, z: -1 }, challengeId: 10 },
    { id: 'console-command', position: { x: 4.3, z: -5.6 }, facing: { x: 0, z: 1 }, challengeId: 12 },
  ],

  markers: [
    // Challenge 8 on the ice crater's floor, challenge 11 at the damaged solar panel.
    { id: 'sample-ice', kind: 'challenge', challengeId: 8, label: 'Sample the ice', rect: { x0: 269.5, x1: 270.5, z0: 109.5, z1: 110.5 } },
    // The broken panel is the one nearest the airlock, so the walk out for challenge 11 stays short.
    { id: 'damaged-panel', kind: 'challenge', challengeId: 11, label: 'Inspect the damaged solar panel', rect: { x0: 13.3, x1: 14.3, z0: 42.2, z1: 42.8 } },
  ],

  props: [
    // ---- Surface: the lunar module that landed, on its pad, its ladder toward the outpost ----
    // (the model: src/scene/LunarModuleView.tsx; the size is its descent stage, for collision and the baked shadow)
    { id: 'lander', kind: 'lander', position: { x: -62, z: 18 }, size: { w: 4.3, d: 4.3, h: 7 }, yaw: Math.PI / 2, ground: true },

    // ---- Surface: solar field (about 50 m south-east), comms antenna (30 m north-east), regolith site (about 120 m west) ----
    // Panels stand upright, turned toward the Sun low in the south-south-west (bearing 200).
    ...[
      [14, 40],
      [22, 40],
      [30, 40],
      [14, 52],
      [22, 52],
      [30, 52],
    ].map(([x, z], i) => ({
      id: `solar-${i + 1}`,
      kind: 'solar-panel' as const,
      position: { x: x as number, z: z as number },
      size: { w: 4, d: 1.2, h: 7 },
      yaw: (-20 * Math.PI) / 180,
      ground: true,
      label: i === 0 ? 'broken' : undefined,
    })),
    { id: 'antenna', kind: 'antenna', position: { x: 8, z: -28 }, size: { w: 1.6, d: 1.6, h: 6.5 }, yaw: Math.PI, ground: true },
    { id: 'excavator', kind: 'excavator', position: { x: -99, z: -60 }, size: { w: 2.2, d: 3.6, h: 2.4 }, yaw: 2.3, ground: true },

    // ---- Surface: the developers' tribute, on the ice crater's sunlit western rim (70 m from its centre) ----
    // Facing west, toward the rover coming from the outpost, and well clear of its direct route (about 36 m south).
    // A plinth marked DEVELOPERS with the three developers on it in Moon suits, the flag of Nepal in the middle
    // (src/scene/DeveloperTribute.tsx). Each developer's prop is the size of a standing figure, so the baked
    // shadows are three long thin ones, not one slab; left to right as seen from the front.
    { id: 'tribute', kind: 'tribute', position: { x: 201, z: 122 }, size: { w: 5.2, d: 1.5, h: 0.35 }, yaw: -Math.PI / 2, ground: true },
    { id: 'developer-rishab', kind: 'developer', label: 'Rishab', position: { x: 201, z: 120.3 }, size: { w: 0.9, d: 0.9, h: 2.25 }, yaw: -Math.PI / 2, ground: true },
    { id: 'developer-shishir', kind: 'developer', label: 'Shishir', position: { x: 201, z: 122 }, size: { w: 0.9, d: 0.9, h: 2.25 }, yaw: -Math.PI / 2, ground: true },
    { id: 'developer-vishal', kind: 'developer', label: 'Vishal', position: { x: 201, z: 123.7 }, size: { w: 0.9, d: 0.9, h: 2.25 }, yaw: -Math.PI / 2, ground: true },

    // ---- Airlock ----
    { id: 'suit-rack', kind: 'suit-rack', position: { x: -14.2, z: -1.42 }, size: { w: 1.5, d: 0.3, h: 2.2 }, solid: false },
    { id: 'airlock-panel', kind: 'wall-screen', position: { x: -12.55, z: 1.45 }, size: { w: 0.3, d: 0.05, h: 0.22 }, elevation: 1.15, yaw: Math.PI, solid: false },

    // ---- Power bay ----
    { id: 'battery-1', kind: 'rack', label: 'batteries', position: { x: -11.72, z: -4.7 }, size: { w: 1.3, d: 0.4, h: 2 }, yaw: Math.PI / 2 },
    { id: 'battery-2', kind: 'rack', label: 'batteries', position: { x: -11.72, z: -2.9 }, size: { w: 1.3, d: 0.4, h: 2 }, yaw: Math.PI / 2 },
    { id: 'battery-3', kind: 'rack', label: 'batteries', position: { x: -6.28, z: -3.6 }, size: { w: 1.3, d: 0.4, h: 2 }, yaw: -Math.PI / 2 },
    { id: 'power-distribution', kind: 'rack', label: 'avionics', position: { x: -7.2, z: -5.72 }, size: { w: 0.9, d: 0.4, h: 2.1 } },

    // ---- Greenhouse ----
    { id: 'grow-1', kind: 'grow-shelf', position: { x: -4.3, z: -3.1 }, size: { w: 2.4, d: 0.6, h: 1.9 } },
    { id: 'grow-2', kind: 'grow-shelf', position: { x: -4.3, z: -5.3 }, size: { w: 2.4, d: 0.6, h: 1.9 } },
    { id: 'grow-3', kind: 'grow-shelf', position: { x: 1.3, z: -3.1 }, size: { w: 2.4, d: 0.6, h: 1.9 } },
    { id: 'grow-4', kind: 'grow-shelf', position: { x: 1.3, z: -5.3 }, size: { w: 2.4, d: 0.6, h: 1.9 } },
    { id: 'greenhouse-water', kind: 'water-tank', position: { x: -5.78, z: -6.6 }, size: { w: 1.4, d: 0.22, h: 1.6 }, yaw: Math.PI / 2, solid: false },

    // ---- Command ----
    { id: 'comms-panel', kind: 'rack', label: 'avionics', position: { x: 9.1, z: -5.72 }, size: { w: 1.1, d: 0.4, h: 2.1 } },
    { id: 'command-laptop', kind: 'laptop', position: { x: 9.84, z: -3.2 }, size: { w: 0.34, d: 0.08, h: 0.3 }, elevation: 1.2, yaw: -Math.PI / 2, solid: false },
    { id: 'command-screen', kind: 'wall-screen', label: 'co2', position: { x: 3.2, z: -3.6 }, size: { w: 0.6, d: 0.06, h: 0.45 }, elevation: 1.5, yaw: Math.PI / 2, solid: false },

    // ---- Storm shelter: water and supplies lining the walls ----
    { id: 'shelter-water-west', kind: 'water-tank', position: { x: -3.78, z: 3.2 }, size: { w: 3.2, d: 0.22, h: 1.9 }, yaw: Math.PI / 2, solid: false },
    { id: 'shelter-water-east', kind: 'water-tank', position: { x: -0.22, z: 3.2 }, size: { w: 3.2, d: 0.22, h: 1.9 }, yaw: -Math.PI / 2, solid: false },
    { id: 'shelter-bags', kind: 'cargo-bag', position: { x: -2, z: 4.78 }, size: { w: 3.2, d: 0.24, h: 0.5 }, elevation: 1.55, yaw: Math.PI, solid: false },
    { id: 'shelter-sign', kind: 'sign', label: 'STORM SHELTER', paint: '#a3261c', position: { x: -2, z: 1.13 }, size: { w: 1.05, d: 0.03, h: 0.2 }, elevation: 2.12, yaw: Math.PI, solid: false },

    // ---- Crew quarters ----
    { id: 'bunks-1', kind: 'curtain-bunk', position: { x: 3.6, z: 5.95 }, size: { w: 2.1, d: 0.95, h: 2.1 }, yaw: Math.PI },
    { id: 'bunks-2', kind: 'curtain-bunk', position: { x: 6.6, z: 5.95 }, size: { w: 2.1, d: 0.95, h: 2.1 }, yaw: Math.PI },
    { id: 'locker-1', kind: 'locker', position: { x: 2.35, z: 2.3 }, size: { w: 0.6, d: 0.5, h: 2 }, yaw: Math.PI / 2, paint: '#4f6075' },
    { id: 'locker-2', kind: 'locker', position: { x: 2.35, z: 3.0 }, size: { w: 0.6, d: 0.5, h: 2 }, yaw: Math.PI / 2, paint: '#5d6f84' },
    { id: 'quarters-table', kind: 'table', position: { x: 6, z: 3.1 }, size: { w: 1.2, d: 0.8, h: 0.75 } },
  ],

  outdoor: {
    zones: [
      {
        id: 'surface',
        label: 'Lunar surface',
        shortLabel: 'Surface',
        sign: 'SURFACE',
        rect: { x0: -390, x1: 390, z0: -390, z1: 390 },
        target: { x: -22, z: 0, yaw: Math.PI / 2 },
      },
    ],
    fences: [],
    buildings: [],
    // The first steps: marker lights from the foot of the lander's ladder to the airlock porch.
    paths: [
      {
        points: [
          { x: -56.4, z: 17.2 },
          { x: -48, z: 13 },
          { x: -35, z: 8 },
          { x: -27, z: 3 },
          { x: -21, z: 0 },
        ],
        width: 2.4,
      },
    ],
    lamps: [],
    // Named places: the place name while you're there, and pings on the minimap.
    areas: [
      { id: 'landing-pad', label: 'Landing pad', x: -62, z: 18, radius: 14, ping: true, ring: true },
      { id: 'solar-field', label: 'Solar field', x: 22, z: 46, radius: 14, ping: true },
      { id: 'antenna', label: 'Comms antenna', x: 8, z: -28, radius: 6, ping: true },
      { id: 'regolith-site', label: 'Regolith site', x: -100, z: -60, radius: 16, ping: true },
      { id: 'ice-crater', label: 'Ice crater', x: 270, z: 110, radius: 50, ping: true },
      // Not pinged on the map: a surprise on the way to the ice.
      { id: 'developers', label: 'Developers’ tribute', x: 201, z: 122, radius: 10 },
    ],
    // The edge of the explorable area: a ring of boulders about 370 m out.
    boundary: { x: 0, z: 0, radius: 370 },
    lockedMessage: 'That isn’t part of the mission.',
    edgeMessage: 'I shouldn’t wander this far from the outpost.',
    // Each module's insulated shell stands 0.24 m out from its walls; a little more for the player's sake.
    buildingMargin: 0.3,
  },

  airlock: {
    chamber: 'airlock',
    cycleSeconds: 4,
    // About the air pressure at sea level on Earth.
    pressure: 101,
    outfitInside: 'flight',
    outfitOutside: 'surface',
    gauge: { x: -15.3, y: 1.45, z: 1.48, yaw: Math.PI },
    panel: { x: -12.55, z: 1.1, yaw: Math.PI },
  },

  rover: {
    // Parked just south of the airlock, in view of its window.
    spawn: { x: -14.3, z: 12.5, yaw: (200 * Math.PI) / 180 },
    // TODO: source. Real lunar rovers have been slower; this is for play.
    topSpeed: 5,
    reverseSpeed: 2,
    boost: { factor: 1.4, seconds: 2, recharge: 5 },
    // The rover model's own (public/models/rover.glb).
    wheels: { base: 2.85, track: 1.98, radius: 0.42 },
    seat: { x: -0.44, y: 0.62, z: 0.44 },
    // About 26 degrees.
    maxGrade: 0.5,
    // Tuned so a direct trip to the ice crater and back uses about 80% (see tools/checks/outpost.mts).
    battery: { perMetre: 0.099, perMetreClimbed: 6, headlights: 1.3, homeMargin: 0.2 },
    home: { x: -22, z: 0 },
    towedTo: { x: -14, z: 0, yaw: Math.PI / 2 },
  },

  cards: [
    {
      id: 'first-steps',
      eyebrow: 'Lunar gravity',
      title: 'You’re on the Moon.',
      body: 'The Moon’s gravity is about one-sixth of Earth’s, so you weigh much less here. Try a jump with Space.',
      keys: [['Space', 'jump']],
      trigger: { kind: 'arrive' },
    },
    {
      id: 'ice-crater',
      eyebrow: 'Permanent shadow',
      title: 'Ice that never sees the Sun',
      // TODO: source (the temperature).
      body: 'Sunlight never reaches the bottom of this crater, so it stays colder than −200 °C. Water ice has stayed frozen here for billions of years.',
      trigger: { kind: 'place', place: 'ice-crater' },
    },
    {
      id: 'airlock',
      eyebrow: 'Airlock',
      title: 'One door always stays shut.',
      body: 'An airlock lets you go outside without letting the outpost’s air escape. The air is pumped out before the outer door opens.',
      trigger: { kind: 'event', event: 'airlock' },
    },
  ],

  // At the foot of the lander's ladder, just past its front footpad, facing along the marker lights toward the outpost.
  spawn: { x: -56.6, z: 18.4, yaw: (-65 * Math.PI) / 180 },
}
