/**
 * The map data format. Every map (launch center, spacecraft, outpost,
 * surface) is one plain data file in this shape. The 3D geometry, the
 * collision and the minimap are all generated from it, so changing a layout
 * means editing numbers, not code.
 *
 * World axes: x runs west (-) to east (+), z runs north (-) to south (+),
 * y is up. 1 unit = 1 metre. The floor of every room is at y = 0.
 */
import type { OutfitId } from '../character/outfits'
import type { Phase, SpeakerId } from '../state/mission'

export type MapId = 'launch-center' | 'spacecraft' | 'outpost' | 'surface'

/**
 * How the player moves. earth: walking, with jumps under Earth gravity.
 * micro: floating in microgravity (the spacecraft). moon: walking at about
 * one-sixth of Earth gravity, so jumps go higher and slower (Phase 3).
 */
export type Gravity = 'earth' | 'micro' | 'moon'

/** A point on the floor. */
export interface Vec2 {
  x: number
  z: number
}

/** A position on the floor plus a facing. yaw = 0 looks north (-z); -PI/2 looks east. */
export interface Pose extends Vec2 {
  yaw: number
  /** Which level the pose is on. Defaults to the ground level. */
  level?: string
}

/**
 * A floor level. Every room, wall, prop, console and marker sits on one
 * level; the player is always on exactly one. Collision, interaction and
 * click-to-walk work per level. Levels are joined only by elevators.
 */
export interface Level {
  id: string
  label: string
  /** Floor height in metres. */
  y: number
  /** No sky light reaches it: the sun and sky fill are dimmed while the player is here. */
  underground?: boolean
}

/** The level everything is on unless it says otherwise. */
export const GROUND_LEVEL = 'ground'

/** An axis-aligned rectangle on the floor. x0 < x1 and z0 < z1. */
export interface Rect {
  x0: number
  x1: number
  z0: number
  z1: number
}

export interface Room {
  id: string
  label: string
  /** Short name drawn on the minimap. Left out to draw no name. */
  shortLabel?: string
  /** Text on the sign above doors leading into this room. Left out for no sign. */
  sign?: string
  rect: Rect
  ceiling: number
  /** Defaults to the ground level. */
  level?: string
  /** Wall and ceiling surface: composite panels (default) or bare concrete. */
  finish?: 'panel' | 'concrete'
  /** Number of real point lights. Defaults to one per 8 m of length. */
  lights?: number
  /** Extra wall and floor detail for this room. */
  dressing?: RoomDressing
  /** Colour of this room's real lights (sRGB hex), e.g. the greenhouse's pink grow light. Defaults to the map's style. */
  lightColor?: string
  /**
   * A raised floor, in metres above the level: the docking tunnel is a
   * narrow tube, so its floor is lifted. Floating keeps the player between
   * this floor and the ceiling.
   */
  floor?: number
  /** A capsule narrows toward its front end (east): slanted wall panels are added there. */
  shape?: 'box' | 'capsule'
  /**
   * Regolith bags piled over this module's roof and outside walls, this
   * thick in metres (the lunar outpost's storm shelter). Solid outside.
   */
  shielding?: number
}

export interface RoomDressing {
  /** Handrails along every wall stretch. */
  handrails?: boolean
  /** Painted walkway lines along the room's long axis. */
  walkway?: boolean
}

/** Walls are this thick, centred on their line. */
export const WALL_THICKNESS = 0.2

/** Doors are this tall unless they say otherwise. */
export const DOOR_HEIGHT = 2.2

export interface DoorOpening {
  kind: 'door'
  /** Centre along the wall. */
  center: number
  width: number
  height?: number
  /** Glass sliding doors that open as the player comes near. */
  sliding?: boolean
  /** A landing door of this elevator; it opens only when the car is here. */
  elevator?: string
  /**
   * The bottom of the opening, above the floor. A spacecraft hatch is a
   * round hole in a bulkhead, so it starts above the floor; `height` is
   * then the top of the opening. Floating players are eased toward the
   * opening's middle height as they come close, so they never snag.
   */
  sill?: number
  /** Round hatch: drawn with a round rim and hazard stripes. */
  round?: boolean
  /** One of an airlock's two doors: it opens only when the airlock says so (see `Airlock`). */
  airlock?: 'inner' | 'outer'
}

export interface WindowOpening {
  kind: 'window'
  /** Centre along the wall. */
  center: number
  width: number
  /** Height of the bottom edge above the floor. */
  sill: number
  /** Height of the top edge above the floor. */
  top: number
  /** A round porthole instead of a rectangle. */
  round?: boolean
}

export type Opening = DoorOpening | WindowOpening

/**
 * A straight wall. `runs: 'x'` walls run east-west along a fixed z = `at`,
 * from x = `from` to x = `to`. `runs: 'z'` walls run north-south along a
 * fixed x = `at`. Doors exist only as openings in a wall, so a door can never
 * appear without a hole to walk through.
 */
export interface Wall {
  runs: 'x' | 'z'
  at: number
  from: number
  to: number
  /** Measured up from the wall's level floor. */
  height: number
  openings?: Opening[]
  /** Defaults to the ground level. */
  level?: string
  /** Wall surface: composite panels (default) or bare concrete. */
  finish?: 'panel' | 'concrete'
}

export interface Console {
  id: string
  /** Centre of the desk, on the floor. */
  position: Vec2
  /** Unit vector the screen points along: where the player stands to use it. */
  facing: Vec2
  /** Matches an id in src/data/challenges.ts. */
  challengeId: number
  /** Defaults to the ground level. */
  level?: string
}

interface MarkerBase {
  id: string
  /** Shown in the "Press E" prompt. */
  label: string
  /** The floor zone, drawn as a ring at its centre. */
  rect: Rect
  /** Defaults to the ground level. */
  level?: string
}

/** A spot where a cutscene will play (Phase 10). */
export interface CutsceneMarker extends MarkerBase {
  kind: 'cutscene'
  cutscene: string
}

/** A way to another map. */
export interface ExitMarker extends MarkerBase {
  kind: 'exit'
  target: MapId
  /** Shown on the fade while the target map does not exist yet. */
  unavailableMessage: string
  /** Where the player is put back while the target map does not exist yet. */
  returnTo: Pose
}

/**
 * A spot that only shows a message when the player is close, without the E
 * key: for example the locked door of a building that isn't part of the
 * mission.
 */
export interface NoticeMarker extends MarkerBase {
  kind: 'notice'
}

/**
 * A spot that starts an in-engine sequence, like "Prepare for landing".
 * With `requires`, it appears only after that challenge's console was used.
 */
export interface SequenceMarker extends MarkerBase {
  kind: 'sequence'
  sequence: SequenceId
  requires?: number
}

/**
 * A challenge that happens at a spot rather than at a console (sampling the
 * ice in the crater, the damaged solar panel). Opens the challenge panel.
 */
export interface ChallengeMarker extends MarkerBase {
  kind: 'challenge'
  challengeId: number
}

export type Marker = CutsceneMarker | ExitMarker | NoticeMarker | SequenceMarker | ChallengeMarker

/** In-engine sequences: the launch on boarding, and the landing that leaves the spacecraft. */
export type SequenceId = 'launch' | 'landing' | 'ending'

/**
 * What a prop is. Each kind has a builder in src/scene/kit/props.ts that
 * turns it into detailed geometry from the shared materials.
 */
export type PropKind =
  | 'bunk'
  | 'locker'
  | 'desk'
  | 'picture'
  | 'table'
  | 'chair'
  | 'wall-screen'
  | 'crate'
  | 'gantry'
  | 'floor-marking'
  | 'clock'
  | 'bench'
  | 'helmet-rack'
  | 'hatch'
  | 'sign'
  | 'wall-text'
  | 'exit-sign'
  | 'blast-door'
  | 'hose-cabinet'
  // Spacecraft (Phase 2)
  | 'seat'
  | 'dashboard'
  | 'rack'
  | 'cargo-bag'
  | 'sleeping-bag'
  | 'water-tank'
  | 'galley'
  | 'fold-table'
  | 'laptop'
  | 'handhold'
  // Lunar outpost (Phase 3)
  | 'lander'
  | 'grow-shelf'
  | 'curtain-bunk'
  | 'suit-rack'
  | 'solar-panel'
  | 'antenna'
  | 'excavator'

/**
 * A prop. Its footprint is `size.w` by `size.d` before turning by `yaw`;
 * `solid: false` props (pictures, wall screens, floor markings) have no
 * collision. The prop's front is its local +z, so yaw = 0 faces south,
 * PI faces north, PI/2 faces east and -PI/2 faces west.
 */
export interface Prop {
  id: string
  kind: PropKind
  /** Centre of the footprint. */
  position: Vec2
  /** w along local x, d along local z, h up. */
  size: { w: number; d: number; h: number }
  /** Turn in radians; use multiples of PI/2 so the footprint stays axis-aligned. */
  yaw?: number
  /** Height of the bottom face above the floor. Defaults to 0. */
  elevation?: number
  /** Defaults to true. */
  solid?: boolean
  /** Paint colour as an sRGB hex string, for painted props. */
  paint?: string
  /** Stencil or marking text (crates, floor markings), or the screen id (wall screens). */
  label?: string
  /** Crates only: stand on a pallet. Defaults to true unless elevated. */
  pallet?: boolean
  /** Signs and painted wall text: an arrow after or before the text. */
  arrow?: 'left' | 'right'
  /** Defaults to the ground level. */
  level?: string
  /** Stands on the outdoor terrain: its height comes from the ground there. */
  ground?: boolean
}

export type Side = 'north' | 'south' | 'east' | 'west'

/** Where an elevator stops: a level, which side of the car opens there, and the call button outside. */
export interface ElevatorStop {
  level: string
  /** Shown on the car's panel and in prompts. */
  label: string
  /** The side of the car whose doors open at this stop. */
  door: Side
  /** The call button, on the wall beside the landing door, and the direction it faces. */
  call: Pose
}

/**
 * An elevator: a car that moves between stops on different levels. The
 * landing doors must exist as door openings (with `elevator` set to this
 * id) in the walls `CAR_WALL_GAP` beyond the car's edge on each stop's side.
 */
export interface Elevator {
  id: string
  /** Sign above every landing door, e.g. "CREW ELEVATOR". */
  label: string
  /** The car's floor area (inside). */
  car: Rect
  /** Inside height of the car. */
  height: number
  doorWidth: number
  doorHeight: number
  stops: ElevatorStop[]
  /** Which stop the car waits at when the map loads. */
  start: number
  /** Seconds for one ride between neighbouring stops. */
  rideSeconds: number
  /** Car sides that are glass, for the view on the way. */
  glass?: Side[]
  /** The button panel inside the car, on a wall, facing into the car. */
  panel: Pose
  /** Height of a roof slab over the shaft, if the shaft is enclosed above ground. */
  shaftTop?: number
}

/** Landing door walls stand this far outside the car's floor edge (half the wall plus a small gap). */
export const CAR_WALL_GAP = 0.2

/**
 * An outdoor area the player can walk on. The ground height comes from the
 * terrain. The main building's own rooms are cut out of it automatically.
 */
export interface OutdoorZone {
  id: string
  label: string
  shortLabel?: string
  /** Text on the sign above doors leading out into this zone. */
  sign?: string
  rect: Rect
  /** Where click-to-walk ends, and which way the player then faces. */
  target: Pose
}

/** A fence line. It blocks movement; the first time the player reaches it, `message` shows. */
export interface Fence {
  id: string
  /** Corner points, joined in order. */
  points: Vec2[]
  /** Join the last point back to the first. */
  closed?: boolean
  height: number
  /** In the player's own voice. */
  message: string
}

/** A building the player can't enter. Its footprint is solid. */
export interface Outbuilding {
  id: string
  label: string
  /** Name drawn on the minimap. */
  shortLabel?: string
  rect: Rect
  height: number
  /** A door (always locked) on one side, `along` metres from that side's west or north end. */
  door?: { side: 'north' | 'south' | 'east' | 'west'; along: number }
}

/** A floodlit walkway: a paved strip with lit bollards along both edges. */
export interface Path {
  points: Vec2[]
  width: number
}

/** Everything about walking outside. Phase 3 uses the same shape for the outpost and the lunar surface. */
export interface Outdoor {
  zones: OutdoorZone[]
  fences: Fence[]
  buildings: Outbuilding[]
  paths: Path[]
  /** Lamp posts along roads and open ground, each with a pool of light. */
  lamps: Vec2[]
  /** Shown when a locked building door is near. */
  lockedMessage: string
  /** Shown the first time the player reaches the edge of a zone where there is no fence. */
  edgeMessage: string
  /**
   * How far outside its walls the main building is solid: on the Moon, the
   * insulated shell round each module. A lane leads through it to each
   * outside door.
   */
  buildingMargin?: number
  /**
   * Named places outdoors: shown as the place name while the player is there,
   * as pings on the minimap, and usable as teaching card triggers.
   */
  areas?: OutdoorArea[]
  /** A circle the player can't leave (a ring of boulders on the Moon); reaching it shows `edgeMessage`. */
  boundary?: { x: number; z: number; radius: number }
}

export interface OutdoorArea {
  id: string
  label: string
  x: number
  z: number
  radius: number
  /** Show on the minimap. */
  ping?: boolean
  /** A ring of marker lights around it (the landing pad). */
  ring?: boolean
}

/** The outdoor world seen through windows. Built by src/scene/kit/exterior.ts. */
export interface LaunchComplexExterior {
  scene: 'launch-complex'
  /** Centre of the launch pad; the rocket stands here. */
  pad: Vec2
}

/**
 * Space, seen from the spacecraft: stars, the Sun, Earth and the Moon.
 * Drawn by src/scene/Space.tsx. How big Earth and the Moon look follows the
 * transit progress (see src/state/flight.ts).
 */
export interface SpaceExterior {
  scene: 'space'
}

/**
 * The lunar surface near the south pole, where the outpost stands. The Sun
 * barely clears the horizon, so shadows are very long and crater floors lie
 * in permanent shade; Earth hangs low over the horizon.
 */
export interface LunarExterior {
  scene: 'lunar-south-pole'
  /** Direction the Sun is in, as a compass bearing in degrees (0 north, 90 east), and its height above the horizon. */
  sun: { bearing: number; elevation: number }
  /** Direction Earth is in, the same way. */
  earth: { bearing: number; elevation: number }
  /** How many faint stars to draw (the bright ground washes most of them out). */
  stars: number
  /** Side of the square of terrain, in metres, centred on the outpost. */
  size: number
  /** Flat, cleared areas: around the outpost, the landing pad, paths. */
  flat: { x: number; z: number; radius: number }[]
  /** Named craters placed on purpose (the ice crater); the rest are scattered at random. */
  craters?: { id: string; x: number; z: number; radius: number; depth: number; ice?: boolean }[]
  /** Heaps and pits of dug regolith (the regolith site). Negative height is a pit. */
  heaps?: { x: number; z: number; radius: number; height: number }[]
}

export type Exterior = LaunchComplexExterior | SpaceExterior | LunarExterior

/** Interior look: the launch center's offices, or a spacecraft's padded modules. */
export type InteriorStyle = 'launch-center' | 'station'

/** A seat the player is strapped into during a sequence: where it is, which way it faces, and eye height. */
export interface Seat extends Pose {
  eye: number
  /** Where the player floats to on unbuckling: clear of the seats. */
  exit: Vec2
}

/** A screen showing the launch countdown, in world space. */
export interface CountdownScreen {
  x: number
  y: number
  z: number
  /** Turn of the screen's face, like a prop: 0 faces south, -PI/2 faces west. */
  yaw: number
  width: number
  height: number
}

export interface GameMap {
  id: MapId
  /** Used in the start screen button: "Enter the launch center". */
  name: string
  phase: Phase
  rooms: Room[]
  walls: Wall[]
  consoles: Console[]
  markers: Marker[]
  props: Prop[]
  spawn: Pose
  /** Floor levels. Without this the map has one ground level at y = 0. */
  levels?: Level[]
  elevators?: Elevator[]
  exterior?: Exterior
  /** Walkable ground outside the building, with fences and other buildings. */
  outdoor?: Outdoor
  /** How the player moves here. Defaults to earth (walking). */
  gravity?: Gravity
  /** Interior look. Defaults to the launch center's. */
  style?: InteriorStyle
  /** What the astronaut wears on this map. Defaults to the blue flight coverall. */
  outfit?: OutfitId
  /** The player's seat for the launch and landing sequences. */
  seat?: Seat
  /** Where the launch countdown is shown. */
  countdown?: CountdownScreen
  /** A sequence that plays on arriving here: boarding the spacecraft plays the launch. */
  arrival?: SequenceId
  /** An airlock between the inside and the outside. */
  airlock?: Airlock
  /** Short teaching cards, each shown once, the first time its trigger happens. */
  cards?: TeachingCard[]
  /** A rover parked outside, to drive across the surface. */
  rover?: Rover
  /** The crew standing near the rooms they care about. */
  crew?: CrewSpot[]
}

/**
 * Where a crew member (or the trainer) stands on a map: a simple standing
 * figure in their suit, solid like a prop. A crew member in red health
 * leaves their spot and lies down at `rest` (a bunk) until they recover.
 */
export interface CrewSpot {
  speakerId: SpeakerId
  x: number
  z: number
  /** Which way they face, as the player's yaw: 0 faces −z, −π/2 faces +x. */
  yaw: number
  level?: string
  /** Lying on a bunk while resting in red health: the body's centre and its height. */
  rest?: { x: number; z: number; y: number; yaw: number }
  /**
   * Which of this person's places it is (src/state/crewPlaces.ts picks one
   * from the mission): 'home' (the default), 'hangar' for Kal and 'elevator'
   * for the trainer as the launch day goes on, 'shelter' after sheltering in
   * a storm, 'seat' strapped in for the launch and the landing.
   */
  place?: 'home' | 'hangar' | 'elevator' | 'shelter' | 'seat'
}

/**
 * The lunar rover: where it's parked, how it drives and how its battery
 * drains. No physics engine: the body follows the ground under its four
 * wheels, and low gravity lets it leave the ground over a crest.
 */
export interface Rover {
  /** Where it's parked when the map loads. */
  spawn: Pose
  /** Metres per second. TODO: source (real lunar rovers have been slower). */
  topSpeed: number
  reverseSpeed: number
  /** Shift: a short burst of extra speed, then a wait while it recharges. */
  boost: { factor: number; seconds: number; recharge: number }
  /**
   * Wheel layout: distance between front and rear axles, between left and
   * right wheels, and wheel radius. They match the rover model (public/models/rover.glb,
   * built by tools/build-rover.mjs; tools/checks/outpost.mts checks they agree).
   */
  wheels: { base: number; track: number; radius: number }
  /** The top of the driver's seat (the left one), in the rover's frame: x right, y up, -z forward. */
  seat: { x: number; y: number; z: number }
  /** The steepest slope it can climb, as rise over run. Steeper ground stops it. */
  maxGrade: number
  battery: {
    /** Percent of a full battery used per metre on level ground. */
    perMetre: number
    /** Each metre climbed costs this many metres' worth of level driving. */
    perMetreClimbed: number
    /** Headlights multiply the drain by this. */
    headlights: number
    /** The home line allows this much extra (a fraction) over the straight-line trip home. */
    homeMargin: number
  }
  /** Where "home" is, for the home line: the outpost's airlock trench. */
  home: Vec2
  /** Where a towed-back player is put: in the airlock chamber. */
  towedTo: Pose
}

/**
 * An airlock: a small chamber with an inner and an outer door, only one of
 * which is ever open. Cycling pumps the air out (to go outside) or back in
 * (to come inside), and the player changes suit on the way.
 */
export interface Airlock {
  /** The chamber room's id. Its walls hold the two doors (openings with `airlock: 'inner'` and `'outer'`). */
  chamber: string
  /** Seconds for the pressure to change. */
  cycleSeconds: number
  /** Pressure inside the outpost, in kilopascals (about sea-level pressure on Earth). */
  pressure: number
  /** What the player wears indoors, and outside on the surface (with a helmet). */
  outfitInside: OutfitId
  outfitOutside: OutfitId
  /** The pressure gauge on the chamber wall: where it is, facing into the chamber. */
  gauge: { x: number; y: number; z: number; yaw: number }
  /** The cycle panel inside the chamber. */
  panel: Pose
}

/** When a teaching card shows. */
export type CardTrigger =
  /** On arriving on the map. */
  | { kind: 'arrive' }
  /** When something happens: 'float' (first time floating), 'airlock' (first airlock cycle). */
  | { kind: 'event'; event: string }
  /** On first reaching a place (a room, zone or marker id). */
  | { kind: 'place'; place: string }

/** A short glass card that teaches one idea in two sentences, with optional keys. */
export interface TeachingCard {
  id: string
  /** Said in character by this speaker (the trainer teaching the controls). */
  speakerId?: SpeakerId
  /** Small label above the title, e.g. "Microgravity". */
  eyebrow: string
  title: string
  body: string
  keys?: [string, string][]
  trigger: CardTrigger
}

/** The launch pad, on maps that have one. */
export function launchPad(map: GameMap): Vec2 | undefined {
  return map.exterior?.scene === 'launch-complex' ? map.exterior.pad : undefined
}
