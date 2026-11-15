import { useEffect, useMemo, useRef } from 'react'
import { challengeCleared } from '../data/challenges'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import { Astronaut, loadAstronaut } from '../character/astronaut'
import {
  buildCollision,
  roomAt,
  levelY,
  listLevels,
  placeAt,
  sideNormal,
  slideMove,
  type Blocker,
  type CollisionModel,
  CREW_FIGURES,
  crewBlockers,
} from '../maps/collision'
import { crewShown } from './crewRuntime'
import { transmit } from '../state/transmissions'
import { ROVER_LOW_BATTERY } from '../data/transmissionLines'
import { angleDelta, turnToward, yawToward } from '../maps/navigation'
import { START_MAP } from '../maps/registry'
import { findFocus, listTargets, type InteractTarget } from '../maps/targets'
import type { GameMap, Gravity } from '../maps/types'
import { flight } from '../state/flight'
import { CROUCH_EYE_HEIGHT, EYE_HEIGHT, placePlayer, player } from '../state/player'
import { reducedMotion, useSettings } from '../state/settings'
import { useGame } from '../state/store'
import { attachKeyboard, isHeld } from './input'
import {
  carWithPlayer,
  elevatorKey,
  elevatorStates,
  elevatorWalkable,
  resetElevators,
  updateElevators,
  type ElevatorState,
} from './elevatorLogic'
import { groundHeight } from './kit/exterior'
import { isLocked, requestLock, setLockElement } from './pointerLock'
import {
  activateFocus,
  closePanel,
  consumeIntentionalRelease,
  freeCursor,
  pauseGame,
  showElevatorPanel,
} from './session'
import { challengeKey } from './challenges'
import { runKey, towHome } from './run'
import { buildCameraSpace, clearFraction, idealCamera, THIRD_PERSON_MAX_PITCH } from './thirdPerson'
import { FLOAT_SPEED, floatBody, HEAD_TO_CENTER, placeBodyAt, settleTarget, stepFloat, type FloatInput } from './floating'
import { arrive, updateGlide, updateSequence } from './sequences'
import { beatActive, maybeStartBeats, setBeatHost, updateBeat } from './beats'
import { setStoryHost, storyMoments } from './story'
import { updateObjective } from './objective'
import { cinematic } from '../state/cinematic'
import { fireCard, fireEvent } from './cards'
import { airlockState, airlockTargets, airlockWalkable, resetAirlock, updateAirlock } from './airlock'
import { resetRover, roverState, updateRover, type RoverEvent, type RoverState } from './rover'
import { Euler, Object3D, Quaternion, Vector3 } from 'three'

const WALK_SPEED = 3.2
const RUN_SPEED = 5.2
const SNEAK_SPEED = 1.4
/**
 * Jumps: take-off speed and gravity. On Earth about 0.6 m high. On the Moon
 * gravity is about one-sixth of Earth's, so the same push would go six
 * times higher; the take-off is softened so jumps stay under a ceiling,
 * but they still hang in the air much longer.
 */
const JUMPS: Record<Exclude<Gravity, 'micro'>, { speed: number; gravity: number }> = {
  earth: { speed: 3.4, gravity: 9.81 },
  moon: { speed: 2, gravity: 1.62 },
}
/** Second person: the camera stands in front, looking back at the player's face. */
const SECOND_PERSON_DISTANCE = 2.4
/** Arrow-key turning, radians per second. */
const TURN_SPEED = 2.2
/** Radians per pixel of mouse movement, before the player's own sensitivity setting. */
const LOOK_SENSITIVITY = 0.0022
const MAX_PITCH = (72 * Math.PI) / 180
/** Free floating lets the player look almost straight up and down. */
const FREE_FLOAT_MAX_PITCH = (86 * Math.PI) / 180
/** Strapped into a seat: how far the player can turn their head from straight ahead. */
const SEATED_YAW = 1.4
const SEATED_PITCH = 0.9
/** Floating body: height of its middle above the feet, and of the eyes. */
const BODY_CENTER = 0.95
/** A stalled tab must not push the player through a wall in one frame. */
const MAX_FRAME_SECONDS = 0.05
const BOB_HEIGHT = 0.035
/** How fast the third-person camera eases back out after a wall pushed it in. */
const CAMERA_EASE_OUT = 6
/** Closer than this, the body would fill the screen, so it is hidden. */
const AVATAR_HIDE_DISTANCE = 0.25

/**
 * Dev builds only: `?orbit=turn,tilt,distance[,height]` (degrees, degrees,
 * metres, metres above the feet) puts the third-person camera anywhere
 * round the body, looking at it.
 */
const DEV_ORBIT: number[] | null = (() => {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return null
  const orbit = new URLSearchParams(window.location.search).get('orbit')
  const values = orbit?.split(',').map(Number) ?? []
  return values.length >= 3 && values.every(Number.isFinite) ? values : null
})()

/** How the player moves on the current map (set when a map loads). */
let gravity: Gravity = 'earth'


/** Starts a jump if standing on a floor and not riding a car. Floating uses J to rise instead. */
function jump(): void {
  if (gravity === 'micro' || player.jumpY > 0 || carWithPlayer()?.riding) return
  player.crouching = false
  player.jumpVelocity = JUMPS[gravity].speed
  player.jumpY = 0.001
}

/** The "Unbuckle" prompt at the end of the launch. */
const UNBUCKLE: InteractTarget = {
  id: 'sequence:unbuckle',
  kind: 'sequence',
  prompt: 'Unbuckle',
  point: { x: 0, z: 0 },
  roomId: undefined,
  level: 'ground',
}

/** The rover's frame (position and tilt), reused every frame for the driving cameras. */
const roverFrame = new Object3D()
roverFrame.rotation.order = 'YXZ'
const scratch = new Vector3()
const lookQuaternion = new Quaternion()
const lookEuler = new Euler(0, 0, 0, 'YXZ')
/**
 * Driving, from the top of the driver's seat (the map's `rover.seat`): the
 * eyes are this far above it and a little forward, and the seated body's
 * feet this far below it and a little back.
 */
const SEAT_EYE = new Vector3(0, 0.8, -0.03)
const SEAT_BODY = new Vector3(0, -0.31, 0.05)
/** The chase camera: behind and above the rover. */
const CHASE_BACK = 7.5
const CHASE_UP = 3.2
const chasePosition = new Vector3()
let chaseReady = false

/** Points the frame at the rover's position and tilt. */
function placeRoverFrame(rover: RoverState): void {
  roverFrame.position.set(rover.x, rover.y, rover.z)
  roverFrame.rotation.set(rover.pitch, rover.yaw, rover.roll)
  roverFrame.updateMatrixWorld()
}

/** "Drive the rover" (or that its battery is flat), from beside the driver's seat. */
function roverTargets(map: GameMap, rover: RoverState | null): InteractTarget[] {
  if (!rover || rover.driving) return []
  const side = { x: rover.x - Math.cos(rover.yaw) * 1.25, z: rover.z + Math.sin(rover.yaw) * 1.25 }
  return [
    {
      id: 'rover:enter',
      kind: rover.lost ? 'notice' : 'rover',
      prompt: rover.lost ? 'The rover\u2019s battery is flat.' : 'Drive the rover',
      point: side,
      roomId: placeAt(map, side.x, side.z)?.id,
      level: 'ground',
    },
  ]
}

const ROVER_EXIT: InteractTarget = {
  id: 'rover:exit',
  kind: 'rover',
  prompt: 'Get out',
  point: { x: 0, z: 0 },
  roomId: undefined,
  level: 'ground',
}

/** A bump against a rock or a wall shakes the camera for a moment. */
let bumpShake = 0

/** What the game does when the rover reports something. */
function handleRoverEvents(map: GameMap, events: RoverEvent[]): void {
  const state = useGame.getState()
  for (const event of events) {
    if (event === 'bump') bumpShake = 0.06
    if (event === 'home-line') {
      transmit(ROVER_LOW_BATTERY, { style: 'hologram' })
    }
    if (event === 'too-far') state.showToast('I really shouldn\u2019t go further.')
    if (event === 'flat' && map.rover) {
      // Out of charge: the crew tow the player back (a lost day, src/scene/run.ts). The rover stays where it stopped.
      towHome(map)
    }
  }
}

/** How the floating body is moving, for its pose: glide amount, rail side, a catch after a bump. */
const floatMotion = { glide: 0, rail: 0, caught: 0, twist: 0, lastYaw: 0, wasMoving: false, push: 0, bumped: false }

/**
 * Poses the floating body. Still, it hangs in the neutral body posture,
 * upright. Moving, it lines up with the direction of travel: the faster,
 * the more stretched out along it; going up or down pitches it that way.
 * How it lies comes from the float step (../scene/floating.ts), which only
 * lets it lie where it fits. The head stays where the player's eyes are.
 */
function placeFloatingBody(avatar: Group, map: GameMap, dt: number): void {
  const speed = Math.hypot(player.vx, player.vy, player.vz)
  floatMotion.glide = floatBody.glide
  const lean = floatBody.lean
  const forwardX = -Math.sin(floatBody.yaw)
  const forwardZ = -Math.cos(floatBody.yaw)
  const behind = HEAD_TO_CENTER * Math.sin(lean)
  const phase = player.bobPhase
  avatar.position.set(
    player.x - forwardX * behind,
    player.y - HEAD_TO_CENTER * Math.cos(lean) + Math.sin(phase * 0.8) * 0.015,
    player.z - forwardZ * behind,
  )
  avatar.rotation.set(-lean + Math.sin(phase * 0.6) * 0.03, floatBody.yaw + Math.sin(phase * 0.35) * 0.05, Math.sin(phase * 0.5) * 0.04)

  // Push-off: starting to move, the pose snaps quickly into the glide.
  const moving = speed > 0.25
  if (moving && !floatMotion.wasMoving) floatMotion.push = 0.3
  floatMotion.wasMoving = moving
  floatMotion.push = Math.max(0, floatMotion.push - dt)
  // Steering: torso and head turn toward the turn.
  const yawRate = angleDelta(floatMotion.lastYaw, player.yaw) / Math.max(dt, 1e-3)
  floatMotion.lastYaw = player.yaw
  floatMotion.twist += (Math.max(-0.4, Math.min(0.4, yawRate * 0.15)) - floatMotion.twist) * Math.min(1, dt * 5)
  // Along a handrail: moving slowly, within 0.6 m of a wall that has rails, roughly parallel to it.
  floatMotion.rail = 0
  const room = roomAt(map, player.x, player.z, player.level)
  if (room && (room.floor ?? 0) === 0 && speed > 0.1 && speed < 1.1) {
    const walls = [
      { d: player.x - room.rect.x0, nx: -1, nz: 0 },
      { d: room.rect.x1 - player.x, nx: 1, nz: 0 },
      { d: player.z - room.rect.z0, nx: 0, nz: -1 },
      { d: room.rect.z1 - player.z, nx: 0, nz: 1 },
    ]
    const near = walls.reduce((a, b) => (b.d < a.d ? b : a))
    const along = Math.abs(player.vx * near.nx + player.vz * near.nz) / Math.max(1e-3, Math.hypot(player.vx, player.vz))
    if (near.d < 0.6 + 0.1 + 0.32 && along < 0.5) {
      // Which side of the body the rail is on: the body's left is +1.
      const right = Math.cos(player.yaw) * near.nx - Math.sin(player.yaw) * near.nz
      floatMotion.rail = right > 0 ? -1 : 1
    }
  }
  floatMotion.caught = Math.max(0, floatMotion.caught - dt)
}


/** What the player wears now: the map's outfit, or at an airlock, the suit for this side of it. */
function currentOutfit(map: GameMap) {
  const airlock = airlockState()
  if (map.airlock && airlock) return airlock.suited ? map.airlock.outfitOutside : map.airlock.outfitInside
  return map.outfit ?? 'flight'
}

function pitchLimit(): number {
  return gravity === 'micro' && !useGame.getState().easyFloat ? FREE_FLOAT_MAX_PITCH : MAX_PITCH
}

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD'])

/** The call buttons the player could press right now (inside a car, its keys work it instead). */
function elevatorTargets(map: GameMap): InteractTarget[] {
  const targets: InteractTarget[] = []
  for (const state of elevatorStates()) {
    const def = state.def
    def.stops.forEach((stop, index) => {
      if (stop.level !== player.level) return
      const waiting = state.phase !== 'moving' && state.stop === index && (state.phase === 'open' || state.phase === 'opening')
      if (waiting) return
      targets.push({
        id: `elevator:${def.id}:call:${index}`,
        kind: 'elevator',
        prompt: `Call the ${def.label.toLowerCase()}`,
        point: stop.call,
        roomId: placeAt(map, stop.call.x, stop.call.z, stop.level)?.id,
        level: stop.level,
      })
    })

  }
  return targets
}

/** Car names for the room label: "CREW ELEVATOR" -> "Crew elevator". */
function carLabel(state: ElevatorState): string {
  const text = state.def.label.toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Fences and edges the player has already commented on; after the first time they just block. */
const commentedOn = new Set<string>()

/** The first time a fence or edge stops the player, they say something about it. */
function commentOnBlock(blocked: Blocker | null): void {
  if (!blocked?.message || (blocked.kind !== 'fence' && blocked.kind !== 'edge')) return
  const key = blocked.id ?? blocked.kind
  if (commentedOn.has(key)) return
  commentedOn.add(key)
  useGame.getState().showToast(blocked.message)
}


function axis(positive: string, negative: string): number {
  return (isHeld(positive) ? 1 : 0) - (isHeld(negative) ? 1 : 0)
}

/** Follows the click-to-walk route. Returns the speed actually moved. */
function followRoute(model: CollisionModel, dt: number, speed = WALK_SPEED): number {
  const route = player.route
  if (!route) return 0
  const next = route.points[0]

  if (!next) {
    if (route.faceYaw === null) {
      player.route = null
      return 0
    }
    player.yaw = turnToward(player.yaw, route.faceYaw, 3 * dt)
    if (Math.abs(angleDelta(player.yaw, route.faceYaw)) < 0.01) player.route = null
    return 0
  }

  const dx = next.x - player.x
  const dz = next.z - player.z
  const distance = Math.hypot(dx, dz)
  if (distance < 0.1) {
    route.points.shift()
    return 0
  }

  const step = Math.min(speed * dt, distance)
  const moved = slideMove(model, player, (dx / distance) * step, (dz / distance) * step)
  commentOnBlock(moved.blocked)
  const actual = Math.hypot(moved.x - player.x, moved.z - player.z)
  player.x = moved.x
  player.z = moved.z

  if (actual < step * 0.3) {
    route.stuck += dt
    if (route.stuck > 1) player.route = null
  } else {
    route.stuck = 0
  }

  player.yaw = turnToward(player.yaw, yawToward(dx, dz), 5 * dt)
  player.pitch *= Math.max(0, 1 - 3 * dt)
  return actual / dt
}

/**
 * Player controls: pointer-lock mouse look, W A S D, arrow-key turning,
 * collision, click-to-walk, finding what the player can use with E, and the
 * camera in first, second or third person (V cycles), J to jump and K to sneak.
 * In microgravity the player floats instead (see ./floating.ts), and during
 * a launch or landing they sit strapped in (see ./sequences.ts).
 */
export function PlayerController({ map }: { map: GameMap }) {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  // One collision model and camera space per level.
  const models = useMemo(
    () => new Map(listLevels(map).map((level) => [level.id, buildCollision(map, undefined, level.id)])),
    [map],
  )
  const cameraSpaces = useMemo(
    () => new Map(listLevels(map).map((level) => [level.id, buildCameraSpace(map, level.id)])),
    [map],
  )
  const targets = useMemo(() => listTargets(map), [map])
  const ground = useMemo(() => groundHeight(map), [map])
  const avatarRef = useRef<Group>(null)
  const astronaut = useRef<Astronaut | null>(null)
  /** Ground speed, smoothed, so the walk animation doesn't flicker. */
  const smoothSpeed = useRef(0)
  /** Third-person camera distance as a fraction of the full distance, smoothed. */
  const cameraFraction = useRef(0)
  /** The room or zone the player was last in, for first-visit teaching cards. */
  const lastPlace = useRef<string | null>(null)
  const lastArea = useRef<string | null>(null)
  /** The elevator car the player was in last frame, to show or hide its panel when that changes. */
  const lastCar = useRef<string | null>(null)

  const baseOutfit = map.outfit ?? 'flight'
  const profile = useGame((state) => state.astronaut)
  const variant = profile.variant

  // The player's body for third person: loaded once per variant.
  useEffect(() => {
    let cancelled = false
    let body: Astronaut | null = null
    loadAstronaut(variant)
      .then((gltf) => {
        if (cancelled || !avatarRef.current) return
        const now = useGame.getState().astronaut
        body = new Astronaut(gltf, { name: now.name, outfit: currentOutfit(map), look: now })
        avatarRef.current.add(body.root)
        astronaut.current = body
      })
      .catch((error: unknown) => console.error('Could not load the astronaut model', error))
    return () => {
      cancelled = true
      body?.dispose()
      if (astronaut.current === body) astronaut.current = null
    }
  }, [variant])

  // The name and the look change in place (the ASTRONAUT tab edits them).
  useEffect(() => {
    astronaut.current?.setName(profile.name)
    astronaut.current?.applyLook(profile)
  }, [profile])

  // The launch suit on the spacecraft, the flight coverall on Earth; at the
  // outpost it depends on which side of the airlock the player is (set each frame).
  useEffect(() => {
    astronaut.current?.setOutfit(currentOutfit(map))
  }, [map, baseOutfit])

  // Story beats need this scene to play.
  useEffect(() => {
    setBeatHost(true)
    setStoryHost(true)
    return () => {
      setBeatHost(false)
      setStoryHost(false)
    }
  }, [])

  useEffect(() => {
    gravity = map.gravity ?? 'earth'
    resetElevators(map)
    // Arriving at the outpost from the landing pad: the airlock's outer door is open.
    resetAirlock(map, true)
    resetRover(map)
    chaseReady = false
    placePlayer(map.spawn)
    // Plays the map's arrival sequence (the launch), or sets up floating.
    arrive(map)
    lastPlace.current = null
    lastCar.current = null
    fireCard({ kind: 'arrive' })
    // Dev builds only: ?at=x,z,yawDegrees,pitchDegrees,level,eyeHeight starts
    // the player at a given spot on the first map, for screenshots and testing.
    if (!import.meta.env.DEV || map.id !== START_MAP) return
    const at = new URLSearchParams(window.location.search).get('at')
    const parts = (at ?? '').split(',')
    const [x, z, yaw = 0, pitch = 0] = parts.slice(0, 4).map(Number)
    if (at && Number.isFinite(x) && Number.isFinite(z)) {
      useGame.getState().setSequence(null)
      flight.ascent = 1
      const y = Number(parts[5])
      placePlayer({
        x: x as number,
        z: z as number,
        yaw: (yaw * Math.PI) / 180,
        level: parts[4] || 'ground',
        y: Number.isFinite(y) && parts[5] ? y : 1.5,
      })
      player.pitch = (pitch * Math.PI) / 180
    }
  }, [map])

  useEffect(() => {
    camera.rotation.order = 'YXZ'
  }, [camera])

  useEffect(() => {
    const canvas = gl.domElement
    setLockElement(canvas)

    const onLockChange = () => {
      const locked = isLocked()
      const state = useGame.getState()
      state.setPointerLocked(locked)
      if (!locked && state.mode === 'playing' && !consumeIntentionalRelease()) pauseGame()
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!isLocked() || useGame.getState().mode !== 'playing') return
      const { mouseSensitivity, invertY } = useSettings.getState()
      const speed = LOOK_SENSITIVITY * mouseSensitivity
      player.yaw -= event.movementX * speed
      const limit = pitchLimit()
      player.pitch = Math.max(-limit, Math.min(limit, player.pitch - event.movementY * speed * (invertY ? -1 : 1)))
    }

    const onCanvasClick = () => {
      if (useGame.getState().mode === 'playing' && !isLocked()) void requestLock()
    }

    const onKey = (event: KeyboardEvent) => {
      const state = useGame.getState()
      // A teaching card takes Enter first ("Got it"), so Enter doesn't also commit, skip or use anything.
      // (Only while playing: under a panel the card is hidden and waits.)
      if (state.card && state.mode === 'playing' && (event.code === 'Enter' || event.code === 'NumpadEnter')) {
        event.preventDefault()
        state.hideCard()
        return
      }
      // The night card and the ending take Enter (and Esc); the debrief is worked with its buttons.
      if (state.night || state.afterword) {
        if (runKey(event.code)) event.preventDefault()
        return
      }
      // A decision panel takes every key while it is open (1 2 3, Enter, Esc, + and −).
      if (state.challenge) {
        if (challengeKey(event.code)) event.preventDefault()
        return
      }
      if (event.code === 'Escape') {
        if (state.mode === 'panel') closePanel()
        else if (state.mode === 'playing' && !isLocked()) pauseGame()
        return
      }
      if (state.mode !== 'playing') return
      // In an elevator car: 1 and 2 pick a floor, O and C open and close the doors (nothing elsewhere).
      if (elevatorKey(event.code)) return
      if (MOVE_KEYS.has(event.code)) player.route = null
      if (event.code === 'KeyE') activateFocus()
      // G opens the guidebook (not during a scene; the guidebook closes itself with G or Esc).
      if (event.code === 'KeyG' && !state.sequence && !beatActive() && !state.transition) {
        freeCursor()
        state.openGuide()
        return
      }
      // Shift+M opens or shrinks the big map; M on its own frees the mouse to use the map.
      if (event.code === 'KeyM' && event.shiftKey) useGame.getState().toggleBigMap()
      else if (event.code === 'KeyM') freeCursor()
      // Driving, V switches between the driver's seat and the chase camera.
      if (event.code === 'KeyV') {
        if (state.driving) state.toggleRoverView()
        else state.toggleView()
      }
      if (event.code === 'Space' && !state.driving) jump()
      // Sneaking needs a floor; floating, K sinks instead (read every frame).
      if (event.code === 'KeyQ' && gravity !== 'micro' && !state.driving) player.crouching = !player.crouching
    }

    const detachKeyboard = attachKeyboard(onKey)
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('click', onCanvasClick)
    return () => {
      detachKeyboard()
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('click', onCanvasClick)
      setLockElement(null)
    }
  }, [gl])

  useFrame((_, delta) => {
    const dt = Math.min(delta, MAX_FRAME_SECONDS)
    const state = useGame.getState()
    // In the lobby the mission waits as it is: the lobby stage has the camera.
    if (state.screen !== 'game') return
    let speed = 0

    const playing = state.mode === 'playing'
    const floating = gravity === 'micro'
    // Elevators and sequences run only while playing, so pausing freezes them where they are.
    if (playing) {
      updateElevators(dt)
      updateSequence(dt)
      updateAirlock(dt)
      maybeStartBeats()
      updateBeat(dt)
      storyMoments()
    }
    // The task banner's step (also under a night card, so it has moved on when the card closes).
    updateObjective()
    const body0 = astronaut.current
    if (body0) {
      body0.setOutfit(currentOutfit(map))
      if (body0.root.userData.shadowFor !== map.id) {
        body0.root.userData.shadowFor = map.id
        body0.setCastShadow(map.exterior?.scene === 'lunar-south-pole')
      }
    }
    const model = models.get(player.level) ?? (models.values().next().value as CollisionModel)
    model.extra = [...elevatorWalkable(player.level), ...airlockWalkable(player.level)]
    model.people = CREW_FIGURES ? crewBlockers([...crewShown.values()], player.level) : []
    const car = carWithPlayer()
    const riding = car?.riding ?? false
    // The car's panel shows while the player is in a car and hides when they walk out.
    if (playing) {
      const carId = car?.def.id ?? null
      if (carId !== lastCar.current) {
        showElevatorPanel(carId)
        lastCar.current = carId
      }
    }

    // Looking around works while riding or strapped in; moving doesn't.
    if (playing) player.yaw += axis('ArrowLeft', 'ArrowRight') * TURN_SPEED * dt
    const seat = map.seat
    if (player.seated && seat) {
      player.yaw = seat.yaw + Math.max(-SEATED_YAW, Math.min(SEATED_YAW, angleDelta(seat.yaw, player.yaw)))
      player.pitch = Math.max(-SEATED_PITCH, Math.min(SEATED_PITCH, player.pitch))
    }

    // The rover drives (or rolls to a stop) whether or not anyone is in it.
    const rover = roverState()
    const driving = state.driving && rover?.driving === true
    if (rover && playing) {
      const events = updateRover(
        dt,
        driving
          ? { throttle: axis('KeyW', 'KeyS'), steer: axis('KeyA', 'KeyD'), boost: isHeld('ShiftLeft') || isHeld('ShiftRight'), brake: isHeld('Space') }
          : { throttle: 0, steer: 0, boost: false, brake: false },
      )
      handleRoverEvents(map, events)
    }
    if (driving && rover) {
      // Looking around from the seat stays within reason.
      player.yaw = Math.max(-1.9, Math.min(1.9, player.yaw))
      player.pitch = Math.max(-0.9, Math.min(0.7, player.pitch))
    }

    if (playing && (player.seated || beatActive())) {
      // Strapped in, or a story beat holding the view: nothing moves the player.
    } else if (driving && rover) {
      // In the driver's seat: the player goes where the rover goes.
      player.x = rover.x
      player.z = rover.z
    } else if (playing && floating && updateGlide(dt)) {
      // Unbuckling: drifting out of the seat.
    } else if (playing && floating) {
      const input: FloatInput = {
        forward: axis('KeyW', 'KeyS'),
        strafe: axis('KeyD', 'KeyA'),
        lift: axis('Space', 'KeyQ'),
        fast: isHeld('ShiftLeft') || isHeld('ShiftRight'),
      }
      const pushing = input.forward !== 0 || input.strafe !== 0 || input.lift !== 0
      if (pushing) player.route = null
      if (!pushing && player.route) {
        // Click-to-float: follow the route at floating speed, settling to a comfortable height.
        // The route is planned on the floor plan; the whole body still has to fit where it leads.
        const fromX = player.x
        const fromZ = player.z
        speed = followRoute(model, dt, FLOAT_SPEED)
        const toX = player.x
        const toZ = player.z
        player.x = fromX
        player.z = fromZ
        const toY = player.y + (settleTarget(map) - player.y) * Math.min(1, 2 * dt)
        player.vx = player.vy = player.vz = 0
        if (!placeBodyAt(map, toX, toY, toZ, dt) && !placeBodyAt(map, toX, player.y, toZ, dt)) {
          player.route = null
          speed = 0
        }
      } else {
        const before = Math.hypot(player.vx, player.vz)
        const result = stepFloat(map, input, dt, state.easyFloat)
        // Drifting into a wall or ceiling: a quick catch with the hands.
        if ((result.blocked && before > 0.35) || (input.lift !== 0 && player.vy === 0 && Math.abs(input.lift) > 0)) {
          if (before > 0.35 || floatMotion.caught === 0) floatMotion.caught = 0.45
        }
        commentOnBlock(result.blocked)
        speed = result.speed
      }
      if (!state.seenCards.includes('microgravity')) fireEvent('float')
    } else if (playing && !riding) {

      const forward = axis('KeyW', 'KeyS')
      const strafe = axis('KeyD', 'KeyA')
      if (forward !== 0 || strafe !== 0) {
        player.route = null
        const length = Math.hypot(forward, strafe)
        const sin = Math.sin(player.yaw)
        const cos = Math.cos(player.yaw)
        // forward = (-sin, -cos), right = (cos, -sin)
        const dirX = (-sin * forward + cos * strafe) / length
        const dirZ = (-cos * forward - sin * strafe) / length
        const running = !player.crouching && (isHeld('ShiftLeft') || isHeld('ShiftRight'))
        const step = (player.crouching ? SNEAK_SPEED : running ? RUN_SPEED : WALK_SPEED) * dt
        const moved = slideMove(model, player, dirX * step, dirZ * step)
        commentOnBlock(moved.blocked)
        speed = Math.hypot(moved.x - player.x, moved.z - player.z) / dt
        player.x = moved.x
        player.z = moved.z
      } else if (player.route) {
        speed = followRoute(model, dt)
      }
    }

    // Jumping: up and back down under gravity. A car moving under the player ends it.
    if (player.jumpY > 0 && !floating) {
      player.jumpVelocity -= JUMPS[gravity === 'moon' ? 'moon' : 'earth'].gravity * dt
      player.jumpY += player.jumpVelocity * dt
      if (player.jumpY <= 0 || riding) {
        player.jumpY = 0
        player.jumpVelocity = 0
      }
    }
    // Low gravity jumps go high: indoors, a head never goes through the ceiling.
    if (player.jumpY > 0 && !floating) {
      const room = roomAt(map, player.x, player.z, player.level)
      const limit = room ? room.ceiling - player.eye - 0.15 : Infinity
      if (player.jumpY > limit) {
        player.jumpY = Math.max(0.001, limit)
        player.jumpVelocity = Math.min(0, player.jumpVelocity)
      }
    }
    const airborne = player.jumpY > 0
    // Crouching lowers the eyes smoothly.
    const eyeTarget = player.crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT
    player.eye += (eyeTarget - player.eye) * Math.min(1, 10 * dt)

    // Head-bob while moving on the ground, settling back when still or in the air.
    // Floating, a slow gentle drift instead.
    if (floating && !reducedMotion()) {
      player.bobPhase += dt * 0.9
      player.bob = player.seated ? 0 : Math.sin(player.bobPhase) * 0.012
    } else if (speed > 0.1 && !airborne && !reducedMotion()) {
      player.bobPhase += dt * speed * 2.4
      player.bob = Math.sin(player.bobPhase) * BOB_HEIGHT
    } else {
      player.bob *= Math.max(0, 1 - 8 * dt)
    }

    // The floor height: the car's floor when in a car, the terrain outside, else the level's floor.
    const place = placeAt(map, player.x, player.z, player.level)
    const outdoors = !car && place?.kind === 'zone'
    const floorY = car ? car.y : outdoors ? ground(player.x, player.z) : levelY(map, player.level)
    // Floating, the eyes are wherever the player has drifted; the body's feet hang 1.6 m below.
    const baseY = floating ? player.y - EYE_HEIGHT : floorY + player.jumpY
    smoothSpeed.current += (speed - smoothSpeed.current) * Math.min(1, 10 * dt)
    const motion = { speed: smoothSpeed.current, airborne, crouching: player.crouching, floating }
    const cameraSpace = cameraSpaces.get(player.level) ?? buildCameraSpace(map)
    // A little shake as a car starts and stops, or during a launch or landing.
    const shake = (car ? car.shake * car.shake * 0.025 : 0) + (reducedMotion() ? flight.shake * 0.3 : flight.shake)
    const shakeX = shake ? (Math.random() - 0.5) * shake : 0
    const shakeY = shake ? (Math.random() - 0.5) * shake : 0

    const avatar = avatarRef.current
    const body = astronaut.current
    if (body) body.root.position.y = floating ? -BODY_CENTER : 0
    if (avatar) avatar.rotation.order = 'YXZ'

    bumpShake *= Math.exp(-dt * 8)
    if (driving && rover) {
      placeRoverFrame(rover)
      const jolt = reducedMotion() ? 0 : bumpShake
      if (state.roverView === 'seat') {
        // From the driver's seat, looking around relative to the rover.
        roverFrame.localToWorld(scratch.copy(rover.def.seat).add(SEAT_EYE))
        camera.position.copy(scratch)
        lookEuler.set(player.pitch, player.yaw, 0)
        lookQuaternion.setFromEuler(lookEuler)
        camera.quaternion.copy(roverFrame.quaternion).multiply(lookQuaternion)
        camera.position.x += (Math.random() - 0.5) * jolt
        camera.position.y += (Math.random() - 0.5) * jolt
        chaseReady = false
      } else {
        // Chase camera: behind and above, swinging round with the mouse, easing after the rover.
        const angle = rover.yaw + player.yaw
        const target = scratch.set(rover.x + Math.sin(angle) * CHASE_BACK, rover.y + CHASE_UP, rover.z + Math.cos(angle) * CHASE_BACK)
        const groundBelow = ground(target.x, target.z) + 1.2
        if (target.y < groundBelow) target.y = groundBelow
        if (!chaseReady) chasePosition.copy(target)
        chasePosition.lerp(target, Math.min(1, dt * 4))
        chaseReady = true
        camera.position.copy(chasePosition)
        camera.position.x += (Math.random() - 0.5) * jolt
        camera.lookAt(rover.x - Math.sin(rover.yaw) * 2, rover.y + 1.2 + player.pitch * 2, rover.z - Math.cos(rover.yaw) * 2)
      }
      // The body sits in the driver's seat (seen in the chase view).
      if (avatar) {
        avatar.visible = state.roverView === 'chase'
        roverFrame.localToWorld(scratch.copy(rover.def.seat).add(SEAT_BODY))
        avatar.position.copy(scratch)
        avatar.rotation.set(rover.pitch, rover.yaw, rover.roll)
      }
      astronaut.current?.update(dt, { speed: 0, airborne: false, crouching: true })
    } else if (player.seated) {
      // Strapped in for a launch or landing: always first person, from the seat
      // (during an outside shot the cinematic stage moves the camera instead).
      cameraFraction.current = 0
      if (!cinematic.outside) {
        camera.rotation.set(player.pitch, player.yaw, 0)
        // A burn pushes the crew back into their seats.
        const back = flight.push
        camera.position.set(player.x + shakeX + Math.sin(player.yaw) * back, player.y + shakeY, player.z + shakeX * 0.5 + Math.cos(player.yaw) * back)
      }
      if (avatar) avatar.visible = false
    } else if (state.view !== 'first' && car) {
      // Inside a car the shoulder camera has no room: a fixed corner view
      // instead, looking out through the glass (or the doors) past the player.
      const def = car.def
      const look = def.glass?.[0] ?? def.stops[car.target ?? car.stop]?.door ?? 'south'
      const n = sideNormal(look)
      const halfX = (def.car.x1 - def.car.x0) / 2
      const halfZ = (def.car.z1 - def.car.z0) / 2
      const cx = (def.car.x0 + def.car.x1) / 2
      const cz = (def.car.z0 + def.car.z1) / 2
      const back = { x: -n.x * (halfX - 0.12), z: -n.z * (halfZ - 0.12) }
      camera.position.set(cx + back.x + shakeX, car.y + def.height - 0.3 + shakeY, cz + back.z)
      camera.lookAt(cx + n.x * 3, car.y + 1.1, cz + n.z * 3)
      cameraFraction.current = 0
      if (avatar) {
        avatar.visible = true
        avatar.position.set(player.x, baseY, player.z)
        avatar.rotation.set(0, player.yaw, 0)
      }
      astronaut.current?.update(dt, motion)
    } else if (state.view !== 'first') {
      // Third person: behind the shoulder. Second person: in front, turned
      // round to look back at the player's face. Either way pulled in if a
      // wall, lintel or ceiling is in the way.
      const second = state.view === 'second'
      const pitch = Math.max(-THIRD_PERSON_MAX_PITCH, Math.min(THIRD_PERSON_MAX_PITCH, player.pitch))
      const cameraYaw = second ? player.yaw + Math.PI : player.yaw
      const cameraPitch = second ? -pitch * 0.5 : pitch
      const ideal = second
        ? idealCamera(player.x, player.z, cameraYaw, cameraPitch, baseY, SECOND_PERSON_DISTANCE, 0, player.eye)
        : idealCamera(player.x, player.z, cameraYaw, cameraPitch, baseY, undefined, undefined, player.eye)
      const allowed = clearFraction(cameraSpace, player.x, player.z, ideal, baseY, player.eye)
      cameraFraction.current =
        allowed < cameraFraction.current
          ? allowed
          : cameraFraction.current + (allowed - cameraFraction.current) * Math.min(1, CAMERA_EASE_OUT * dt)
      const t = cameraFraction.current
      const eye = baseY + player.eye
      camera.rotation.set(cameraPitch, cameraYaw, 0)
      camera.position.set(
        player.x + (ideal.x - player.x) * t,
        eye + (ideal.y - eye) * t,
        player.z + (ideal.z - player.z) * t,
      )
      camera.rotation.z = floating ? player.roll : 0
      camera.position.x += shakeX
      camera.position.y += shakeY
      if (avatar) {
        avatar.visible = t > AVATAR_HIDE_DISTANCE
        if (floating) placeFloatingBody(avatar, map, dt)
        else {
          avatar.position.set(player.x, baseY, player.z)
          avatar.rotation.set(0, player.yaw, 0)
        }
        if (DEV_ORBIT) {
          // Dev only: a free camera round the body, for checking suits from any side (even below the floor).
          const [turn = 0, tilt = 0, distance = 2.5, height = 0.9] = DEV_ORBIT
          const a = player.yaw + (turn * Math.PI) / 180
          const e = (tilt * Math.PI) / 180
          avatar.updateMatrixWorld()
          const centre = scratch.set(0, floating ? height - BODY_CENTER : height, 0).applyMatrix4(avatar.matrixWorld)
          camera.position.set(centre.x + Math.sin(a) * Math.cos(e) * distance, centre.y + Math.sin(e) * distance, centre.z + Math.cos(a) * Math.cos(e) * distance)
          camera.up.set(0, 1, 0)
          camera.lookAt(centre)
          avatar.visible = true
        }
      }
      // Floating: posed from bones (neutral posture, glide, rail, catch); otherwise the walking clips.
      if (floating) {
        astronaut.current?.updateFloat(dt, {
          glide: floatMotion.glide,
          rail: floatMotion.rail,
          caught: floatMotion.caught > 0,
          twist: floatMotion.twist,
          quick: floatMotion.push > 0,
        })
      } else {
        astronaut.current?.update(dt, motion)
      }
    } else {
      // Start the next third-person view at the head, so it eases out.
      cameraFraction.current = 0
      camera.rotation.set(player.pitch, player.yaw, floating ? player.roll : 0)
      camera.position.set(player.x + shakeX, baseY + player.eye + player.bob + shakeY, player.z)
      if (avatar) avatar.visible = false
    }

    // Outdoors, a named place (the landing pad, the ice crater) gives its name, and its first-visit card.
    const area = outdoors ? map.outdoor?.areas?.find((a) => Math.hypot(player.x - a.x, player.z - a.z) < a.radius) : undefined
    if (playing && (area?.id ?? null) !== lastArea.current) {
      lastArea.current = area?.id ?? null
      if (area) fireCard({ kind: 'place', place: area.id })
    }
    // Place label, indoors or out, level and focus: write to the store only when they change.
    const label = car ? carLabel(car) : (area?.label ?? place?.label ?? null)
    if (label !== state.roomLabel) state.setRoomLabel(label)
    if (outdoors !== state.outdoors) state.setOutdoors(outdoors)
    if (player.level !== state.levelId) state.setLevelId(player.level)

    const placeId = car ? `car:${car.def.id}` : place?.id
    if (playing && (placeId ?? null) !== lastPlace.current) {
      lastPlace.current = placeId ?? null
      if (placeId) fireCard({ kind: 'place', place: placeId })
    }
    const candidates = [
      ...targets.filter(
        (target) =>
          target.level === player.level && (target.requires === undefined || challengeCleared(target.requires, state.usedConsoles)),
      ),
      ...elevatorTargets(map),
      ...airlockTargets(map),
      ...roverTargets(map, rover),
    ]
    let target: InteractTarget | null = null
    if (driving && rover) {
      // Driving, the only thing to do is get out, once stopped.
      if (playing && Math.abs(rover.speed) < 0.3 && !rover.airborne) target = ROVER_EXIT
    } else if (player.seated) {
      // Strapped in, the only thing to do is unbuckle, once the engines are off.
      if (playing && state.sequence?.step === 'unbuckle') target = UNBUCKLE
    } else if (playing && !riding && !beatActive()) {
      target = findFocus(candidates, placeId, player.x, player.z, player.yaw)
    }
    if ((target?.id ?? null) !== (state.focus?.id ?? null)) {
      state.setFocus(target ? { id: target.id, kind: target.kind, prompt: target.prompt } : null)
    }
  })

  return (
    <group ref={avatarRef} visible={false} />
  )
}
