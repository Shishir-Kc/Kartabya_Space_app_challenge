/**
 * Map 1: the launch center (pre-launch).
 *
 * A straight east-west corridor. The player starts in crew quarters at the
 * west end and walks east past the briefing room (north) and the cargo
 * hangar (south) to the launch tower access at the east end.
 *
 *            +---------+
 *            |Briefing |
 * +------+---+---D-----+------------------+-------+
 * | Crew D            Corridor             D Tower |
 * +------+--------------------+--D--+-----+-------+
 *                             |Cargo hangar|
 *                             +------------+
 *
 * Outside, about 30 m east, stands the launch pad and the Saturn V (real
 * size: the crew access arm is 105 m up the service tower). The main
 * exit in the corridor's north wall leads onto the grounds inside the
 * perimeter fence; the pad has its own security fence.
 */
import type { GameMap } from './types'

export const LAUNCH_CENTER: GameMap = {
  id: 'launch-center',
  name: 'Launch center',
  phase: 'pre-launch',

  // The trainer waits by the challenge 1 console, facing the door: in the
  // briefing room until challenge 2, then by the crew elevator.
  // Kal (the science officer) waits in the cargo hangar after challenge 1, by
  // the cargo console (Shishir's Phase 1 script, scene 5).
  crew: [
    { speakerId: 'trainer', x: -2.2, z: -6.6, yaw: Math.PI },
    { speakerId: 'science', place: 'hangar', x: 3.4, z: 8.2, yaw: -0.25 },
    { speakerId: 'trainer', place: 'elevator', x: 12.7, z: 1.3, yaw: -0.52 },
    // Houston, between challenges 1 and 2: at the communications building's door, facing the path.
    { speakerId: 'comms', x: 1.2, z: -14.8, yaw: Math.PI },
  ],

  // No separate tutorial: the trainer teaches the controls in character.
  cards: [
    {
      id: 'lc-move',
      speakerId: 'trainer',
      eyebrow: 'Your trainer',
      title: 'Welcome, mission engineer!',
      body: 'Walk with W A S D and look around with the mouse. Or click on the floor, and you’ll walk there.',
      keys: [
        ['W A S D', 'walk'],
        ['Click', 'walk there'],
      ],
      trigger: { kind: 'arrive' },
    },
    {
      id: 'lc-guide',
      speakerId: 'trainer',
      eyebrow: 'Your trainer',
      title: 'Lost? Press G.',
      body: 'Press G any time for your guidebook: space words, where your tasks are, and every key.',
      keys: [['G', 'guidebook']],
      trigger: { kind: 'place', place: 'corridor' },
    },
  ],

  rooms: [
    {
      id: 'corridor',
      label: 'Corridor',
      shortLabel: 'Corridor',
      rect: { x0: -12, x1: 12, z0: -1.5, z1: 1.5 },
      ceiling: 3,
      dressing: { handrails: true, walkway: true },
    },
    {
      id: 'crew-quarters',
      label: 'Crew quarters',
      shortLabel: 'Crew',
      sign: 'CREW QUARTERS',
      rect: { x0: -18, x1: -12, z0: -3, z1: 3 },
      ceiling: 3,
    },
    {
      id: 'briefing-room',
      label: 'Briefing room',
      shortLabel: 'Briefing',
      sign: 'BRIEFING',
      rect: { x0: -8, x1: -1, z0: -8, z1: -1.5 },
      ceiling: 3,
    },
    {
      id: 'cargo-hangar',
      label: 'Cargo hangar',
      shortLabel: 'Cargo',
      sign: 'CARGO HANGAR',
      rect: { x0: 0, x1: 10, z0: 1.5, z1: 11 },
      ceiling: 5,
    },
    {
      id: 'launch-tower',
      label: 'Launch tower access',
      shortLabel: 'Tower',
      sign: 'LAUNCH TOWER ACCESS',
      rect: { x0: 12, x1: 16, z0: -2, z1: 2 },
      ceiling: 3,
    },
    {
      id: 'crew-tunnel',
      label: 'Crew tunnel',
      shortLabel: 'Tunnel',
      rect: { x0: 15.8, x1: 41.4, z0: -4.6, z1: -2 },
      ceiling: 3,
      level: 'tunnel',
      finish: 'concrete',
      lights: 2,
      dressing: { walkway: true },
    },
    {
      id: 'pad-landing',
      label: 'Pad 1 landing',
      shortLabel: 'Pad 1',
      sign: 'PAD 1',
      rect: { x0: 39, x1: 44.8, z0: -14, z1: -4.6 },
      ceiling: 3,
      level: 'tunnel',
      finish: 'concrete',
      lights: 1,
    },
    {
      id: 'access-arm',
      label: 'Crew access arm',
      shortLabel: 'Arm',
      rect: { x0: 45.1, x1: 46.9, z0: -10.8, z1: -4.25 },
      ceiling: 2.8,
      level: 'arm',
      lights: 1,
      dressing: { handrails: true },
    },
    {
      id: 'clean-room',
      label: 'Clean room',
      shortLabel: 'Clean',
      sign: 'CLEAN ROOM',
      rect: { x0: 44.4, x1: 47.6, z0: -4.25, z1: -2.25 },
      ceiling: 2.8,
      level: 'arm',
      lights: 1,
    },
  ],

  walls: [
    // Crew quarters
    { runs: 'z', at: -18, from: -3, to: 3, height: 3 },
    { runs: 'x', at: -3, from: -18, to: -12, height: 3 },
    { runs: 'x', at: 3, from: -18, to: -12, height: 3 },
    {
      runs: 'z',
      at: -12,
      from: -3,
      to: 3,
      height: 3,
      openings: [{ kind: 'door', center: 0, width: 1.2 }],
    },

    // Corridor north wall, shared with the briefing room; the main exit
    // to the grounds is at its east end
    {
      runs: 'x',
      at: -1.5,
      from: -12,
      to: 12,
      height: 3,
      openings: [
        { kind: 'door', center: -4.5, width: 1.4 },
        { kind: 'door', center: 7, width: 1.8, height: 2.4, sliding: true },
      ],
    },
    // Corridor south wall, split where it meets the taller cargo hangar
    { runs: 'x', at: 1.5, from: -12, to: 0, height: 3 },
    {
      runs: 'x',
      at: 1.5,
      from: 0,
      to: 10,
      height: 5,
      openings: [{ kind: 'door', center: 5, width: 2.4, height: 2.4 }],
    },
    { runs: 'x', at: 1.5, from: 10, to: 12, height: 3 },
    // Corridor east end, into the launch tower access
    {
      runs: 'z',
      at: 12,
      from: -2,
      to: 2,
      height: 3,
      openings: [{ kind: 'door', center: 0, width: 1.4 }],
    },

    // Briefing room
    { runs: 'z', at: -8, from: -8, to: -1.5, height: 3 },
    { runs: 'z', at: -1, from: -8, to: -1.5, height: 3 },
    {
      runs: 'x',
      at: -8,
      from: -8,
      to: -1,
      height: 3,
      openings: [{ kind: 'window', center: -6.6, width: 1.4, sill: 1, top: 2.2 }],
    },

    // Cargo hangar
    { runs: 'z', at: 0, from: 1.5, to: 11, height: 5 },
    { runs: 'z', at: 10, from: 1.5, to: 11, height: 5 },
    { runs: 'x', at: 11, from: 0, to: 10, height: 5 },

    // Launch tower access: one big window east; the crew elevator is on the north wall
    {
      runs: 'x',
      at: -2,
      from: 12,
      to: 16,
      height: 3,
      openings: [{ kind: 'door', center: 14.6, width: 1.2, height: 2.2, elevator: 'crew' }],
    },
    { runs: 'x', at: 2, from: 12, to: 16, height: 3 },
    // Crew elevator shaft, above ground: a small block north of the tower room
    { runs: 'z', at: 13.4, from: -4.4, to: -2, height: 3.4 },
    { runs: 'z', at: 15.8, from: -4.4, to: -2, height: 3.4 },
    { runs: 'x', at: -4.4, from: 13.4, to: 15.8, height: 3.4 },
    {
      runs: 'z',
      at: 16,
      from: -2,
      to: 2,
      height: 3,
      openings: [{ kind: 'window', center: 0, width: 3.2, sill: 0.5, top: 2.7 }],
    },

    // ---- Tunnel level (8 m below ground) ----
    // Crew elevator shaft, below ground
    { level: 'tunnel', finish: 'concrete', runs: 'z', at: 13.4, from: -4.4, to: -2, height: 8 },
    { level: 'tunnel', finish: 'concrete', runs: 'x', at: -4.4, from: 13.4, to: 15.8, height: 8 },
    { level: 'tunnel', finish: 'concrete', runs: 'x', at: -2, from: 13.4, to: 15.8, height: 8 },
    {
      level: 'tunnel',
      finish: 'concrete',
      runs: 'z',
      at: 15.8,
      from: -4.6,
      to: -2,
      height: 8,
      openings: [{ kind: 'door', center: -3.2, width: 1.2, height: 2.2, elevator: 'crew' }],
    },
    // Crew tunnel, running east under the grounds
    {
      level: 'tunnel',
      finish: 'concrete',
      runs: 'x',
      at: -4.6,
      from: 15.8,
      to: 44.8,
      height: 3,
      openings: [{ kind: 'door', center: 40.2, width: 2, height: 2.4 }],
    },
    { level: 'tunnel', finish: 'concrete', runs: 'x', at: -2, from: 15.8, to: 41.4, height: 3 },
    { level: 'tunnel', finish: 'concrete', runs: 'z', at: 41.4, from: -4.6, to: -2, height: 3 },
    // Pad 1 landing, under the service tower
    { level: 'tunnel', finish: 'concrete', runs: 'z', at: 39, from: -14, to: -4.6, height: 3 },
    { level: 'tunnel', finish: 'concrete', runs: 'x', at: -14, from: 39, to: 44.8, height: 3 },
    { level: 'tunnel', finish: 'concrete', runs: 'z', at: 44.8, from: -14, to: -13.2, height: 3 },
    {
      level: 'tunnel',
      finish: 'concrete',
      runs: 'z',
      at: 44.8,
      from: -13.2,
      to: -10.8,
      height: 8.8,
      openings: [{ kind: 'door', center: -12, width: 1.2, height: 2.2, elevator: 'tower' }],
    },
    { level: 'tunnel', finish: 'concrete', runs: 'z', at: 44.8, from: -10.8, to: -4.6, height: 3 },
    // Tower elevator pit, up to the pad surface
    { level: 'tunnel', finish: 'concrete', runs: 'x', at: -13.2, from: 44.8, to: 47.2, height: 8.8 },
    { level: 'tunnel', finish: 'concrete', runs: 'x', at: -10.8, from: 44.8, to: 47.2, height: 8.8 },
    { level: 'tunnel', finish: 'concrete', runs: 'z', at: 47.2, from: -13.2, to: -10.8, height: 8.8 },

    // ---- Access arm level (105 m up the service tower) ----
    {
      level: 'arm',
      runs: 'x',
      at: -10.8,
      from: 45.1,
      to: 46.9,
      height: 2.8,
      openings: [{ kind: 'door', center: 46, width: 1.2, height: 2.1, elevator: 'tower' }],
    },
    {
      level: 'arm',
      runs: 'z',
      at: 45.1,
      from: -10.8,
      to: -4.25,
      height: 2.8,
      openings: [-9.78, -8.28, -6.78, -5.28].map((center) => ({ kind: 'window' as const, center, width: 1.25, sill: 0.6, top: 2.4 })),
    },
    {
      level: 'arm',
      runs: 'z',
      at: 46.9,
      from: -10.8,
      to: -4.25,
      height: 2.8,
      openings: [-9.78, -8.28, -6.78, -5.28].map((center) => ({ kind: 'window' as const, center, width: 1.25, sill: 0.6, top: 2.4 })),
    },
    {
      level: 'arm',
      runs: 'x',
      at: -4.25,
      from: 44.4,
      to: 47.6,
      height: 2.8,
      openings: [{ kind: 'door', center: 46, width: 1.6, height: 2.1 }],
    },
    {
      level: 'arm',
      runs: 'z',
      at: 44.4,
      from: -4.25,
      to: -2.25,
      height: 2.8,
      openings: [{ kind: 'window', center: -3.25, width: 1.6, sill: 0.6, top: 2.4 }],
    },
    {
      level: 'arm',
      runs: 'z',
      at: 47.6,
      from: -4.25,
      to: -2.25,
      height: 2.8,
      openings: [{ kind: 'window', center: -3.25, width: 1.6, sill: 0.6, top: 2.4 }],
    },
    // Capsule side, clear of the service module's widest point: the hatch in the middle, a narrow window either side onto the capsule
    {
      level: 'arm',
      runs: 'x',
      at: -2.25,
      from: 44.4,
      to: 47.6,
      height: 2.8,
      openings: [
        { kind: 'window', center: 44.87, width: 0.6, sill: 0.9, top: 2.0 },
        { kind: 'window', center: 47.13, width: 0.6, sill: 0.9, top: 2.0 },
      ],
    },
  ],

  consoles: [
    {
      id: 'c01-console',
      position: { x: -4.5, z: -7.3 },
      facing: { x: 0, z: 1 },
      challengeId: 1,
    },
    {
      id: 'c02-console',
      position: { x: 5, z: 10.3 },
      facing: { x: 0, z: -1 },
      challengeId: 2,
    },
  ],

  markers: [
    {
      id: 'board-spacecraft',
      kind: 'exit',
      label: 'Board the spacecraft',
      level: 'arm',
      rect: { x0: 45.6, x1: 46.4, z0: -3.0, z1: -2.5 },
      target: 'spacecraft',
      unavailableMessage: 'Spacecraft map arrives in Phase 2',
      // Back in the corridor, just west of the tower door, facing west.
      returnTo: { x: 10.4, z: 0, yaw: Math.PI / 2, level: 'ground' },
    },
  ],

  props: [
    // Crew quarters: two bunks, two lockers, a desk with a lamp, a picture of Earth
    { id: 'bunk-north', kind: 'bunk', position: { x: -16, z: -2.5 }, size: { w: 2, d: 0.9, h: 1.9 }, paint: '#4f6075' },
    { id: 'bunk-south', kind: 'bunk', position: { x: -16, z: 2.5 }, size: { w: 2, d: 0.9, h: 1.9 }, paint: '#4f6075' },
    {
      id: 'locker-1',
      kind: 'locker',
      position: { x: -12.45, z: -2.4 },
      size: { w: 0.6, d: 0.5, h: 2 },
      yaw: -Math.PI / 2,
      paint: '#4f6075',
    },
    {
      id: 'locker-2',
      kind: 'locker',
      position: { x: -12.45, z: -1.75 },
      size: { w: 0.6, d: 0.5, h: 2 },
      yaw: -Math.PI / 2,
      paint: '#4f6075',
    },
    {
      id: 'desk',
      kind: 'desk',
      position: { x: -13.4, z: 2.6 },
      size: { w: 1, d: 0.5, h: 0.76 },
      yaw: Math.PI,
    },
    {
      id: 'earth-picture',
      kind: 'picture',
      position: { x: -13.4, z: 2.88 },
      size: { w: 0.8, d: 0.04, h: 0.55 },
      yaw: Math.PI,
      elevation: 1.3,
      solid: false,
    },

    // Briefing room: the long table with chairs, the mission screen
    { id: 'briefing-table', kind: 'table', position: { x: -6.3, z: -4.5 }, size: { w: 1.2, d: 3.6, h: 0.75 } },
    { id: 'chair-1', kind: 'chair', position: { x: -7.25, z: -5.6 }, size: { w: 0.5, d: 0.5, h: 0.9 }, yaw: Math.PI / 2 },
    { id: 'chair-2', kind: 'chair', position: { x: -7.25, z: -4.5 }, size: { w: 0.5, d: 0.5, h: 0.9 }, yaw: Math.PI / 2 },
    { id: 'chair-3', kind: 'chair', position: { x: -7.25, z: -3.4 }, size: { w: 0.5, d: 0.5, h: 0.9 }, yaw: Math.PI / 2 },
    { id: 'chair-4', kind: 'chair', position: { x: -5.25, z: -5.4 }, size: { w: 0.5, d: 0.5, h: 0.9 }, yaw: -Math.PI / 2 },
    { id: 'chair-5', kind: 'chair', position: { x: -5.25, z: -3.6 }, size: { w: 0.5, d: 0.5, h: 0.9 }, yaw: -Math.PI / 2 },
    { id: 'chair-6', kind: 'chair', position: { x: -6.3, z: -6.75 }, size: { w: 0.5, d: 0.5, h: 0.9 } },
    { id: 'chair-7', kind: 'chair', position: { x: -6.3, z: -2.25 }, size: { w: 0.5, d: 0.5, h: 0.9 }, yaw: Math.PI },
    {
      id: 'briefing-screen',
      kind: 'wall-screen',
      position: { x: -4.5, z: -7.86 },
      size: { w: 2.2, d: 0.08, h: 1.2 },
      elevation: 1.35,
      solid: false,
      label: 'mission-briefing',
    },

    // Corridor: the countdown clock on the north wall
    {
      id: 'countdown-clock',
      kind: 'clock',
      position: { x: 3, z: -1.38 },
      size: { w: 0.9, d: 0.06, h: 0.26 },
      elevation: 2.25,
      solid: false,
    },

    // Cargo hangar: stencilled crates on pallets down both sides, the middle
    // lane from the door to the console kept clear; bay markings; a gantry
    {
      id: 'crate-1',
      kind: 'crate',
      position: { x: 1.3, z: 3.4 },
      size: { w: 1.6, d: 1.6, h: 1.4 },
      yaw: Math.PI / 2,
      paint: '#c8692d',
      label: 'SUPPLIES',
    },
    {
      id: 'crate-1-top',
      kind: 'crate',
      position: { x: 1.3, z: 3.4 },
      size: { w: 1, d: 1, h: 0.7 },
      yaw: Math.PI / 2,
      elevation: 1.54,
      solid: false,
      pallet: false,
      paint: '#4f6075',
      label: 'SPARES',
    },
    {
      id: 'crate-2',
      kind: 'crate',
      position: { x: 1.1, z: 6.6 },
      size: { w: 2, d: 1.2, h: 1.1 },
      yaw: Math.PI / 2,
      paint: '#69704a',
      label: 'SHIELDING',
    },
    {
      id: 'crate-3',
      kind: 'crate',
      position: { x: 1.6, z: 9.4 },
      size: { w: 1.6, d: 2.2, h: 1.8 },
      yaw: Math.PI / 2,
      paint: '#4f6075',
      label: 'POWER',
    },
    {
      id: 'crate-4',
      kind: 'crate',
      position: { x: 8.7, z: 3.3 },
      size: { w: 1.6, d: 1.6, h: 1.3 },
      yaw: -Math.PI / 2,
      paint: '#4f6075',
      label: 'POWER',
    },
    {
      id: 'crate-5',
      kind: 'crate',
      position: { x: 8.5, z: 6.2 },
      size: { w: 1.8, d: 2, h: 2 },
      yaw: -Math.PI / 2,
      paint: '#c8692d',
      label: 'SUPPLIES',
    },
    {
      id: 'crate-6',
      kind: 'crate',
      position: { x: 8.9, z: 9 },
      size: { w: 1.2, d: 1.2, h: 0.9 },
      yaw: -Math.PI / 2,
      paint: '#69704a',
      label: 'SPARES',
    },
    {
      id: 'crate-7',
      kind: 'crate',
      position: { x: 7.4, z: 10.1 },
      size: { w: 1, d: 1, h: 0.7 },
      yaw: Math.PI,
      paint: '#4f6075',
      label: 'SHIELDING',
    },
    { id: 'bay-1', kind: 'floor-marking', position: { x: 3, z: 3.4 }, size: { w: 1.2, d: 0.52, h: 0 }, yaw: Math.PI, solid: false, label: 'BAY 1' },
    { id: 'bay-2', kind: 'floor-marking', position: { x: 3, z: 6.6 }, size: { w: 1.2, d: 0.52, h: 0 }, yaw: Math.PI, solid: false, label: 'BAY 2' },
    { id: 'bay-3', kind: 'floor-marking', position: { x: 7, z: 3.3 }, size: { w: 1.2, d: 0.52, h: 0 }, yaw: Math.PI, solid: false, label: 'BAY 3' },
    { id: 'bay-4', kind: 'floor-marking', position: { x: 7, z: 6.2 }, size: { w: 1.2, d: 0.52, h: 0 }, yaw: Math.PI, solid: false, label: 'BAY 4' },
    {
      id: 'gantry',
      kind: 'gantry',
      position: { x: 5, z: 6.25 },
      size: { w: 9.8, d: 2, h: 0.3 },
      elevation: 4.4,
      solid: false,
      paint: '#c8692d',
    },

    // ---- Crew tunnel ----
    { id: 'tunnel-sign-pad', kind: 'wall-text', level: 'tunnel', position: { x: 21, z: -4.48 }, size: { w: 1.6, d: 0.02, h: 0.34 }, elevation: 1.5, solid: false, label: 'PAD 1', arrow: 'right', paint: '#e9b81a' },
    { id: 'tunnel-sign-center', kind: 'wall-text', level: 'tunnel', position: { x: 36, z: -4.48 }, size: { w: 3.2, d: 0.02, h: 0.3 }, elevation: 1.5, solid: false, label: 'LAUNCH CENTER', arrow: 'left', paint: '#e8eaee' },
    { id: 'tunnel-sign-pad-2', kind: 'wall-text', level: 'tunnel', position: { x: 33, z: -2.12 }, size: { w: 1.6, d: 0.02, h: 0.34 }, elevation: 1.5, yaw: Math.PI, solid: false, label: 'PAD 1', arrow: 'left', paint: '#e9b81a' },
    { id: 'tunnel-10m', kind: 'wall-text', level: 'tunnel', position: { x: 25.8, z: -2.12 }, size: { w: 0.6, d: 0.02, h: 0.2 }, elevation: 0.45, yaw: Math.PI, solid: false, label: '10 M', paint: '#e8eaee' },
    { id: 'tunnel-20m', kind: 'wall-text', level: 'tunnel', position: { x: 35.8, z: -2.12 }, size: { w: 0.6, d: 0.02, h: 0.2 }, elevation: 0.45, yaw: Math.PI, solid: false, label: '20 M', paint: '#e8eaee' },
    { id: 'tunnel-blast-door', kind: 'blast-door', level: 'tunnel', position: { x: 28.6, z: -3.3 }, size: { w: 0.5, d: 2.6, h: 3 }, solid: false },
    { id: 'tunnel-hose', kind: 'hose-cabinet', level: 'tunnel', position: { x: 23.4, z: -2.18 }, size: { w: 0.6, d: 0.16, h: 0.8 }, elevation: 0.9, yaw: Math.PI, solid: false },
    { id: 'tunnel-exit-1', kind: 'exit-sign', level: 'tunnel', position: { x: 19, z: -2.13 }, size: { w: 0.42, d: 0.06, h: 0.16 }, elevation: 2.45, yaw: Math.PI, solid: false, label: 'EXIT' },
    { id: 'tunnel-exit-2', kind: 'exit-sign', level: 'tunnel', position: { x: 38, z: -2.13 }, size: { w: 0.42, d: 0.06, h: 0.16 }, elevation: 2.45, yaw: Math.PI, solid: false, label: 'EXIT' },

    // ---- Clean room at the capsule hatch ----
    { id: 'hatch', kind: 'hatch', level: 'arm', position: { x: 46, z: -2.37 }, size: { w: 1.1, d: 0.1, h: 1.45 }, elevation: 0.35, yaw: Math.PI, solid: false },
    {
      id: 'crew-access-sign',
      kind: 'sign',
      level: 'arm',
      position: { x: 46, z: -2.34 },
      size: { w: 2.5, d: 0.02, h: 0.22 },
      elevation: 2.2,
      yaw: Math.PI,
      solid: false,
      label: 'CREW ACCESS: AUTHORIZED PERSONNEL',
    },
    { id: 'clean-bench', kind: 'bench', level: 'arm', position: { x: 44.78, z: -3.25 }, size: { w: 1.2, d: 0.4, h: 0.45 }, yaw: Math.PI / 2 },
    { id: 'helmet-rack', kind: 'helmet-rack', level: 'arm', position: { x: 47.22, z: -4.13 }, size: { w: 0.62, d: 0.3, h: 0.4 }, elevation: 1.4, solid: false },
  ],

  spawn: { x: -17.2, z: 0, yaw: -Math.PI / 2 },

  levels: [
    { id: 'ground', label: 'Ground', y: 0 },
    { id: 'tunnel', label: 'Tunnel', y: -8, underground: true },
    // Matches the capsule hatch on the Saturn V (ARM_FLOOR in src/scene/kit/exterior.ts).
    { id: 'arm', label: 'Access arm', y: 105 },
  ],

  elevators: [
    {
      id: 'crew',
      label: 'CREW ELEVATOR',
      car: { x0: 13.6, x1: 15.6, z0: -4.2, z1: -2.2 },
      height: 2.5,
      doorWidth: 1.2,
      doorHeight: 2.2,
      start: 0,
      rideSeconds: 4.5,
      panel: { x: 13.66, z: -3.5, yaw: -Math.PI / 2 },
      shaftTop: 3.4,
      stops: [
        { level: 'ground', label: 'GROUND', door: 'south', call: { x: 15.55, z: -1.86, yaw: 0 } },
        { level: 'tunnel', label: 'TUNNEL', door: 'east', call: { x: 15.94, z: -2.35, yaw: Math.PI / 2 } },
      ],
    },
    {
      id: 'tower',
      label: 'TOWER ELEVATOR',
      car: { x0: 45, x1: 47, z0: -13, z1: -11 },
      height: 2.5,
      doorWidth: 1.2,
      doorHeight: 2.1,
      start: 0,
      rideSeconds: 15,
      glass: ['south'],
      panel: { x: 46.94, z: -12.3, yaw: Math.PI / 2 },
      stops: [
        { level: 'tunnel', label: 'TUNNEL', door: 'west', call: { x: 44.66, z: -13, yaw: Math.PI / 2 } },
        { level: 'arm', label: 'ACCESS ARM', door: 'south', call: { x: 45.22, z: -10.25, yaw: -Math.PI / 2 } },
      ],
    },
  ],

  exterior: { scene: 'launch-complex', pad: { x: 46, z: 0 } },

  // The grounds inside the perimeter fence. The launch pad sits behind an
  // inner security fence: the rocket is boarded only through the tower elevator.
  outdoor: {
    zones: [
      {
        id: 'grounds',
        label: 'Launch complex grounds',
        shortLabel: 'Grounds',
        sign: 'MAIN EXIT',
        rect: { x0: -28, x1: 80, z0: -30, z1: 28 },
        // On the road by the pad fence, facing the rocket.
        target: { x: 21, z: -3, yaw: -Math.PI / 2 },
      },
    ],
    fences: [
      {
        id: 'perimeter',
        points: [
          { x: -28, z: -30 },
          { x: 80, z: -30 },
          { x: 80, z: 28 },
          { x: -28, z: 28 },
        ],
        closed: true,
        height: 2.4,
        message: "That's the edge of the launch complex.",
      },
      {
        id: 'pad-security',
        points: [
          { x: 25, z: -20 },
          { x: 68, z: -20 },
          { x: 68, z: 17 },
          { x: 25, z: 17 },
        ],
        closed: true,
        height: 3,
        message: "The pad is off-limits on foot. I'll board through the tower elevator.",
      },
    ],
    buildings: [
      {
        id: 'storage',
        label: 'Storage shed',
        shortLabel: 'Storage',
        rect: { x0: -22, x1: -10, z0: 13, z1: 21 },
        height: 4.5,
        door: { side: 'east', along: 3 },
      },
      {
        // Shishir's Phase 1 script: the communications officer works here, and meets the player at the door.
        id: 'support',
        label: 'Communications building',
        shortLabel: 'Comms',
        rect: { x0: -6, x1: 6, z0: -24, z1: -16 },
        height: 5,
        door: { side: 'south', along: 6 },
      },
    ],
    paths: [
      // From the main exit north, then east to the road.
      { points: [{ x: 7, z: -2 }, { x: 7, z: -7 }, { x: 16.5, z: -7 }], width: 2 },
      // To the communications building.
      { points: [{ x: 7, z: -7 }, { x: 0, z: -7 }, { x: 0, z: -15.6 }], width: 1.8 },
      // From the road to the storage shed, south of the cargo hangar.
      { points: [{ x: 16.5, z: 16 }, { x: -9.6, z: 16 }], width: 1.8 },
    ],
    lamps: [
      { x: 24.1, z: -24 },
      { x: 24.1, z: -10 },
      { x: 24.1, z: 4 },
      { x: 24.1, z: 22 },
      { x: -24, z: -12 },
      { x: -24, z: 8 },
      { x: 40, z: 22.5 },
      { x: 60, z: 22.5 },
      { x: 74, z: 0 },
      { x: 40, z: -25 },
      { x: 60, z: -25 },
    ],
    lockedMessage: "This building isn't part of your mission",
    edgeMessage: "That's the edge of the launch complex.",
  },
}
