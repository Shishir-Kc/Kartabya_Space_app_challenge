/**
 * Elevator checks, run headless with `npx tsx tools/checks/elevators.mts`.
 * The cars only move when the player picks a floor on the car's panel:
 * standing inside sends them nowhere, the current floor does nothing, the
 * doors reopen on someone in the doorway, walking out leaves the car where
 * it is, and calls from a landing never carry the player. The keys (1 and
 * 2 for a floor, O and C for the doors) work only inside a car. Then the
 * whole route to the rocket, riding both elevators with the keys.
 *
 * Mouse look inside the cars (the panel never releases the mouse) needs a
 * browser: see the note at the end of README's elevator section.
 */
const P = '../../src'
const { LAUNCH_CENTER: map } = await import(`${P}/maps/launchCenter`)
const { carDoorway, rectCenter, roomAt } = await import(`${P}/maps/collision`)
const { planRoute } = await import(`${P}/maps/navigation`)
const { player, placePlayer } = await import(`${P}/state/player`)
const E = await import(`${P}/scene/elevatorLogic`)

let failed = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed++
}

const STEP = 1 / 60
const run = (seconds: number) => {
  for (let t = 0; t < seconds; t += STEP) E.updateElevators(STEP)
}
/** Runs until `done` is true (or `limit` seconds pass); returns the seconds it took, or Infinity. */
const until = (done: () => boolean, limit = 60) => {
  for (let t = 0; t < limit; t += STEP) {
    if (done()) return t
    E.updateElevators(STEP)
  }
  return done() ? limit : Number.POSITIVE_INFINITY
}

const car = (id: string) => E.elevatorState(id)!
const stand = (id: string) => {
  const s = car(id)
  const c = rectCenter(s.def.car)
  placePlayer({ x: c.x, z: c.z, yaw: 0, level: s.def.stops[s.stop].level })
}
const inDoorway = (id: string) => {
  const s = car(id)
  const stop = s.def.stops[s.stop]
  const c = rectCenter(carDoorway(s.def, stop.door, 0))
  placePlayer({ x: c.x, z: c.z, yaw: 0, level: stop.level })
}
const outside = (id: string) => {
  const s = car(id)
  const call = s.def.stops[s.stop].call
  placePlayer({ x: call.x, z: call.z, yaw: call.yaw, level: s.def.stops[s.stop].level })
}
/** Brings the car to its stop and opens it, as the call button there does. */
const callHere = (id: string) => {
  outside(id)
  E.requestStop(id, car(id).stop)
  until(() => car(id).phase === 'open')
}

for (const id of ['crew', 'tower']) {
  E.resetElevators(map)
  const s = () => car(id)
  check(s() !== undefined && s().def.stops.length === 2, `${id}: the elevator exists, with two stops`)
  callHere(id)
  const start = s().stop
  stand(id)
  check(E.carWithPlayer()?.def.id === id, `${id}: the player standing in the car counts as inside`)

  // Standing still for 30 s: nothing moves, the doors stay open.
  run(30)
  check(s().stop === start && s().phase === 'open' && s().door === 1 && s().target === null, `${id}: standing in the car for 30 s, it doesn't move and the doors stay open`)

  // The current floor does nothing.
  check(E.chooseFloor(id, start) === false && s().phase === 'open' && s().target === null, `${id}: choosing the current floor does nothing`)

  // A call from a landing never carries the player.
  E.requestStop(id, 1 - start)
  run(5)
  check(s().stop === start && s().phase === 'open' && !s().riding, `${id}: a call for the other stop doesn't send the player anywhere`)

  // Door close, then Door open.
  E.closeCarDoors(id)
  until(() => s().phase === 'closed', 5)
  run(10)
  check(s().phase === 'closed' && s().stop === start, `${id}: Door close shuts the doors, and the car stays put`)
  E.openCarDoors(id)
  until(() => s().phase === 'open', 5)
  check(s().phase === 'open', `${id}: Door open opens them again`)

  // The doorway: choose a floor, step into the doorway as the doors close; they reopen, and the ride waits.
  check(E.chooseFloor(id, 1 - start), `${id}: choosing the other floor is accepted`)
  check(s().phase === 'closing' && s().target === 1 - start, `${id}: after choosing, the doors start to close`)
  run(0.3)
  inDoorway(id)
  run(0.5)
  check(s().phase === 'opening' || s().phase === 'open', `${id}: someone in the doorway makes the closing doors open again`)
  run(10)
  check(s().phase === 'open' && s().stop === start && s().target === 1 - start, `${id}: the ride waits while the doorway is blocked (floor still chosen)`)

  // Step back in: the doors close and the car rides there with the player.
  stand(id)
  const closed = until(() => s().phase === 'moving', 5)
  check(closed > 0.8 && closed < 1.6, `${id}: once clear the doors close in about a second (${closed.toFixed(2)} s) and the car moves`)
  check(s().riding, `${id}: the player rides with the car`)
  until(() => s().phase === 'open', 60)
  const arrived = s().def.stops[1 - start]
  check(s().stop === 1 - start && player.level === arrived.level && !s().riding, `${id}: the car arrives at ${arrived.label}, the player on that level, doors open`)

  // Walking out without choosing leaves the car parked.
  outside(id)
  run(30)
  check(s().stop === 1 - start && s().phase === 'closed', `${id}: walking out without choosing, the car stays where it is (doors shut after a while)`)

  // Choosing, then walking out before the doors shut: the car stays.
  callHere(id)
  stand(id)
  E.chooseFloor(id, start)
  run(0.2)
  outside(id)
  run(20)
  check(s().stop === 1 - start && s().target === null, `${id}: choosing then walking straight out, the car doesn't leave on its own`)
}

// ---- What a ride sounds like: each step is announced once, in order (src/audio/sfx.ts) ----
for (const id of ['crew', 'tower']) {
  const heard: string[] = []
  const off = E.onElevatorEvent((event: any) => heard.push(event.kind === 'depart' ? `depart ${event.seconds}` : event.kind))
  E.resetElevators(map)
  check(heard.join() === 'reset', `${id}: loading a map announces a reset (no hum keeps going)`)
  heard.length = 0
  callHere(id)
  stand(id)
  const start = car(id).stop
  E.chooseFloor(id, 1 - start)
  until(() => car(id).phase === 'open', 60)
  off()
  const seconds = car(id).def.rideSeconds
  check(
    heard.join() === ['doors-open', 'doors-close', `depart ${seconds}`, 'arrive', 'doors-open'].join(),
    `${id}: a ride sounds doors opening, closing, setting off (${seconds} s), arriving, doors opening (${heard.join(', ')})`,
  )
}

// ---- The keys: 1, 2, O and C work in a car and nowhere else ----
for (const id of ['crew', 'tower']) {
  E.resetElevators(map)
  const s = () => car(id)
  // Outside, at the landing: none of the keys do anything.
  outside(id)
  const before = JSON.stringify({ stop: s().stop, phase: s().phase, target: s().target })
  const used = ['Digit1', 'Digit2', 'KeyO', 'KeyC', 'Numpad2'].map((code) => E.elevatorKey(code))
  run(10)
  check(used.every((u: boolean) => !u) && JSON.stringify({ stop: s().stop, phase: s().phase, target: s().target }) === before, `${id}: outside the car, 1, 2, O and C do nothing`)
  callHere(id)
  stand(id)
  const start = s().stop
  check(E.elevatorKey('KeyW') === false && E.elevatorKey('Space') === false && E.elevatorKey('KeyE') === false, `${id}: in the car, other keys (W, Space, E) are left to the game`)
  check(E.elevatorKey('KeyC'), `${id}: C is the car's key inside`)
  until(() => s().phase === 'closed', 5)
  check(s().phase === 'closed' && s().stop === start, `${id}: C closes the doors, and the car stays`)
  E.elevatorKey('KeyO')
  until(() => s().phase === 'open', 5)
  check(s().phase === 'open', `${id}: O opens them`)
  E.elevatorKey(`Digit${start + 1}`)
  run(5)
  check(s().phase === 'open' && s().stop === start, `${id}: the key for the floor you're on does nothing`)
  E.elevatorKey(`Digit${2 - start}`)
  until(() => s().phase === 'moving', 5)
  check(s().phase === 'moving' && s().riding, `${id}: the other floor's key closes the doors and rides there`)
  E.elevatorKey('KeyO')
  run(0.5)
  check(s().phase === 'moving', `${id}: O does nothing during the ride`)
  until(() => s().phase === 'open', 60)
  check(s().stop === 1 - start, `${id}: arrived`)
}

// ---- The whole route: crew elevator down, the tunnel, tower elevator up, the access arm, the hatch ----
E.resetElevators(map)
const crew = () => car('crew')
const tower = () => car('tower')
const stopIndex = (id: string, level: string) => car(id).def.stops.findIndex((stop: any) => stop.level === level)

// Crew elevator: called at the ground, ridden down to the tunnel.
const groundStop = stopIndex('crew', 'ground')
outside('crew')
E.requestStop('crew', groundStop)
until(() => crew().stop === groundStop && crew().phase === 'open', 60)
check(crew().stop === groundStop && crew().phase === 'open', 'route: the crew elevator comes to the ground floor when called')
stand('crew')
check(E.elevatorKey(`Digit${stopIndex('crew', 'tunnel') + 1}`), 'route: press 2 (TUNNEL) in the crew elevator')
until(() => crew().phase === 'open' && crew().stop === stopIndex('crew', 'tunnel'), 60)
check(player.level === 'tunnel', 'route: the crew elevator brings the player down to the tunnel')

// Through the tunnel to the tower elevator's landing.
const towerTunnel = tower().def.stops[stopIndex('tower', 'tunnel')]
const landingRoom = roomAt(map, towerTunnel.call.x, towerTunnel.call.z, 'tunnel')
const crewExit = crew().def.stops[crew().stop].call
const walk = planRoute(map, { x: crewExit.x, z: crewExit.z }, landingRoom?.id, 'tunnel')
check(landingRoom !== null && walk !== null, `route: the tunnel leads from the crew elevator to the tower elevator (${landingRoom?.id})`)

// Tower elevator: called to the tunnel, ridden up to the access arm.
outside('tower')
placePlayer({ x: towerTunnel.call.x, z: towerTunnel.call.z, yaw: 0, level: 'tunnel' })
E.requestStop('tower', stopIndex('tower', 'tunnel'))
until(() => tower().stop === stopIndex('tower', 'tunnel') && tower().phase === 'open', 60)
check(tower().phase === 'open' && tower().stop === stopIndex('tower', 'tunnel'), 'route: the tower elevator comes down to the tunnel when called')
stand('tower')
check(E.elevatorKey(`Digit${stopIndex('tower', 'arm') + 1}`), 'route: press 2 (ACCESS ARM) in the tower elevator')
until(() => tower().phase === 'open' && tower().stop === stopIndex('tower', 'arm'), 120)
check(player.level === 'arm', 'route: the tower elevator brings the player up to the access arm')

// Along the arm to the hatch.
const hatch = map.props.find((p: any) => p.id === 'hatch')
const hatchRoom = hatch ? roomAt(map, hatch.position.x, hatch.position.z, 'arm') : null
const armExit = tower().def.stops[tower().stop].call
check(hatchRoom !== null && planRoute(map, { x: armExit.x, z: armExit.z }, hatchRoom.id, 'arm') !== null, `route: the access arm leads to the hatch (${hatchRoom?.id})`)

console.log(failed ? `\n${failed} elevator check(s) FAILED.` : '\nAll elevator checks passed.')
process.exit(failed ? 1 : 0)
