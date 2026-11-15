// Headless checks for the Phase 2 spacecraft map.
const P = new URL('../../src', import.meta.url).pathname
const { SPACECRAFT: map } = await import(`${P}/maps/spacecraft`)
const { LAUNCH_CENTER } = await import(`${P}/maps/launchCenter`)
const { getMap } = await import(`${P}/maps/registry`)
const { buildCollision, contains, floatRange, isWalkable, roomAt, standPoint, listDoors, FLOAT_MARGIN, roomFloor } = await import(`${P}/maps/collision`)
const { findFocus, listTargets } = await import(`${P}/maps/targets`)
const { planRoute } = await import(`${P}/maps/navigation`)
const { player, placePlayer } = await import(`${P}/state/player`)
const { stepFloat, NO_INPUT, floatBody, floatSpaceFor, currentDepth, SETTLE_HEIGHT } = await import(`${P}/scene/floating`)
const { bodySpheres, pointDepth, BODY_GAP } = await import(`${P}/maps/floatSpace`)
const { buildMap } = await import(`${P}/scene/kit/buildMap`)

let failed = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed++
}

// ---- Geometry builds, no NaN ----
const built = buildMap(map)
let verts = 0
for (const p of built.parts) {
  verts += p.geometry.attributes.position.count
  const a = p.geometry.attributes.position.array
  let nan = false
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) nan = true
  check(!nan, `geometry ${p.key} has no NaN`)
}
console.log('buckets', built.parts.map((p: any) => p.key).join(','), 'verts', verts, 'texts', built.extras.texts.length, 'lights', built.extras.lights.length)
check(built.parts.length + built.extras.texts.length < 40, `merged meshes + texts under 40 (${built.parts.length} + ${built.extras.texts.length})`)

// ---- Reachability over the floor plan ----
const model = buildCollision(map)
const start = map.seat.exit
check(isWalkable(model, start.x, start.z), 'the unbuckle point in the aisle is free')
const STEP = 0.05
const key = (i: number, k: number) => `${i},${k}`
const seen = new Set<string>()
const queue: [number, number][] = [[Math.round(start.x / STEP), Math.round(start.z / STEP)]]
seen.add(key(queue[0][0], queue[0][1]))
while (queue.length) {
  const [i, k] = queue.pop()!
  for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = i + di, nk = k + dk
    const id = key(ni, nk)
    if (seen.has(id)) continue
    if (!isWalkable(model, ni * STEP, nk * STEP)) continue
    seen.add(id)
    queue.push([ni, nk])
  }
}
const cells = [...seen].map((s) => s.split(',').map((n) => Number(n) * STEP))
for (const room of map.rooms) {
  check(cells.some(([x, z]) => contains(room.rect, x, z)), `room ${room.id} is reachable`)
}
const doors = listDoors(map)
const outside = cells.filter(([x, z]) => !roomAt(map, x, z) && !doors.some((d: any) => Math.abs((d.runs === 'x' ? x - d.center.x : z - d.center.z)) <= d.width / 2 && Math.abs((d.runs === 'x' ? z - d.center.z : x - d.center.x)) <= 0.15))
check(outside.length === 0, `no reachable spot outside the hull (${outside.length} found)`)
const noRange = cells.filter(([x, z]) => !floatRange(map, x, z))
check(noRange.length === 0, `every reachable spot has a floating height range (${noRange.length} without)`)
let badRange = 0
for (const [x, z] of cells) {
  const room = roomAt(map, x, z)
  const r = floatRange(map, x, z)
  if (!room || !r) continue
  if (r.lo < roomFloor(map, room) + FLOAT_MARGIN - 1e-6 || r.hi > room.ceiling - FLOAT_MARGIN + 1e-6 || r.lo > r.hi) badRange++
}
check(badRange === 0, `height ranges stay between floor and ceiling (${badRange} bad)`)

// ---- Floating: the whole body stays out of walls and everything solid ----
const space = floatSpaceFor(map, 'ground')
const props = (kind: string) => map.props.filter((p: any) => p.kind === kind)
check(space.solids.length >= map.props.length - 10, `props and consoles are 3D solids (${space.solids.length})`)
for (const id of ['rack-fans', 'rack-tanks', 'galley-unit', 'galley-table', 'seat-front-left', 'shelter-water-west', 'galley-bag-1']) {
  const prop = map.props.find((p: any) => p.id === id)
  const y = (prop.elevation ?? 0) + prop.size.h / 2
  check(pointDepth(space, prop.position.x, y, prop.position.z, 0.05).solid, `${id} is solid floating`)
}
check(props('sleeping-bag').length > 0 && pointDepth(space, 1.5, 0.5, -0.9, 0.05).solid, 'the life support console is solid floating')

/** Starts the player at an eye position, with the body lying however fits (upright first). */
function startAt(x: number, y0: number, z: number, yaw: number): boolean {
  for (let i = 0; i <= 24; i++) {
    const dy = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.1
    if (startAtExactly(x, y0 + dy, z, yaw)) return true
  }
  return false
}
function startAtExactly(x: number, y: number, z: number, yaw: number): boolean {
  placePlayer({ x, z, yaw, y })
  player.pitch = 0
  stepFloat(map, NO_INPUT, 0, true)
  for (let k = 0; k <= 30; k++) {
    for (const lean of k === 0 ? [0] : [k * 0.1, -k * 0.1]) {
      if (lean < -1.65 || lean > Math.PI - 0.2) continue
      floatBody.yaw = yaw
      floatBody.lean = lean
      floatBody.glide = 0
      if (currentDepth(space).depth === 0) return true
    }
  }
  return false
}

/** Floats with keys held; returns where it ended and the deepest any body sphere ever went into anything. */
function fly(from: { x: number; z: number; y: number }, yaw: number, pitch: number, seconds: number, input = { forward: 1, strafe: 0, lift: 0, fast: true }) {
  const fits = startAt(from.x, from.y, from.z, yaw)
  player.pitch = pitch
  let worst = fits ? 0 : Infinity
  let minFloor = Infinity
  for (let t = 0; t < seconds; t += 1 / 60) {
    stepFloat(map, input, 1 / 60, true)
    worst = Math.max(worst, currentDepth(space).depth)
    const room = roomAt(map, player.x, player.z)
    if (room && !room.floor) for (const s of bodySpheres({ x: player.x, y: player.y, z: player.z, yaw: floatBody.yaw, lean: floatBody.lean, glide: floatBody.glide })) minFloor = Math.min(minFloor, s.y - s.r)
  }
  return { x: player.x, z: player.z, y: player.y, worst, minFloor, fits }
}
const east = -Math.PI / 2
const west = Math.PI / 2
const north = 0
const south = Math.PI
for (const y of [0.45, 1.3, 1.9, 2.3]) {
  for (const z of [0, 0.3, -0.3]) {
    const run = fly({ x: 6, z, y }, east, 0, 8)
    check(run.fits && run.x > 10.6 && run.worst < 1e-6, `glide galley -> cockpit from height ${y}, z ${z}: reached x ${run.x.toFixed(2)}, deepest ${run.worst.toFixed(4)}`)
    const back = fly({ x: 11.3, z: z / 2, y }, west, 0, 8)
    check(back.fits && back.x < 7.4 && back.worst < 1e-6, `glide cockpit -> galley from height ${y}, z ${z / 2}: reached x ${back.x.toFixed(2)}, deepest ${back.worst.toFixed(4)}`)
    const aft = fly({ x: 7.2, z, y }, west, 0, 6)
    check(aft.fits && aft.x < 2.9 && aft.worst < 1e-6, `glide galley -> life support from height ${y}, z ${z}: reached x ${aft.x.toFixed(2)}, deepest ${aft.worst.toFixed(4)}`)
  }
}
const up = fly({ x: 6, z: 0, y: 1.6 }, east, 0.6, 8)
check(up.x > 10.6 && up.worst < 1e-6, `flying toward the hatch looking up still gets through (x ${up.x.toFixed(2)})`)
const shelter = fly({ x: 1.5, z: 0, y: 1.8 }, south, 0, 4)
check(contains(map.rooms.find((r: any) => r.id === 'storm-shelter').rect, shelter.x, shelter.z) && shelter.worst < 1e-6, `float into the storm shelter (z ${shelter.z.toFixed(2)}, y ${shelter.y.toFixed(2)}, deepest ${shelter.worst.toFixed(4)})`)
// Straight at things, at full speed: they stop the body.
for (const [label, from, yaw, pitch] of [
  ['the fans rack', { x: 0.9, z: 0.2, y: 1.6 }, north, 0],
  ['the filters rack', { x: 2.4, z: 0.5, y: 1.2 }, north, -0.3],
  ['the life support console', { x: 1.5, z: 0.6, y: 1.5 }, north, -0.5],
  ['the tanks rack', { x: 2.2, z: 0.1, y: 1.6 }, west, 0],
  ['the galley unit', { x: 4.2, z: 0.3, y: 1.4 }, north, 0],
  ['the galley table', { x: 4.6, z: 0.0, y: 1.9 }, south, -0.6],
  ['the galley floor', { x: 5.5, z: 0, y: 1.6 }, east, -1.2],
  ['a cockpit seat', { x: 11.1, z: 0.1, y: 1.7 }, north, -0.4],
  ['the shelter water tanks', { x: 1.5, z: 2.2, y: 1.6 }, west, 0],
] as const) {
  const run = fly(from, yaw, pitch, 3)
  check(run.fits && run.worst < 1e-6, `glide straight at ${label}: no body part goes in (deepest ${run.worst.toFixed(4)})`)
}
const floor = fly({ x: 5.5, z: 0, y: 1.6 }, east, -1.2, 3)
check(floor.minFloor >= -1e-6, `gliding down at the galley floor, the body stays at least ${(floor.minFloor + BODY_GAP).toFixed(3)} m off it`)
// Every module at full speed, wandering with the view swinging round: never inside anything.
let wander = 0
startAt(6, 1.7, 0, east)
let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const input = { forward: 1, strafe: 0, lift: 0, fast: true }
for (let t = 0; t < 120; t += 1 / 60) {
  if (Math.floor(t * 60) % 45 === 0) {
    player.yaw = rand() * Math.PI * 2
    player.pitch = (rand() - 0.5) * 2
    input.strafe = Math.round(rand() * 2 - 1)
    input.lift = Math.round(rand() * 2 - 1)
  }
  stepFloat(map, input, 1 / 60, true)
  wander = Math.max(wander, currentDepth(space).depth)
}
check(wander < 1e-6, `two minutes of random full-speed floating: no body part ever inside anything (deepest ${wander.toFixed(4)})`)
placePlayer({ x: 5, z: 0, yaw: east, y: SETTLE_HEIGHT })
player.vx = 1.5
for (let t = 0; t < 1; t += 1 / 60) stepFloat(map, NO_INPUT, 1 / 60, true)
check(Math.abs(player.vx) < 0.15 && Math.abs(player.vx) > 0, `drift slows from 1.5 to ${player.vx.toFixed(3)} m/s in a second`)
placePlayer({ x: 5, z: 0, yaw: east, y: SETTLE_HEIGHT })
for (let t = 0; t < 2; t += 1 / 60) stepFloat(map, { forward: 0, strafe: 1, lift: 0, fast: false }, 1 / 60, false)
const rolled = player.roll
for (let t = 0; t < 3; t += 1 / 60) stepFloat(map, NO_INPUT, 1 / 60, true)
check(Math.abs(rolled) > 0.3 && Math.abs(player.roll) < Math.abs(rolled) * 0.1, `free float rolled ${rolled.toFixed(2)} rad, easy float righted to ${player.roll.toFixed(3)}`)
startAt(5, SETTLE_HEIGHT, 0, east)
let liftWorst = 0
for (let t = 0; t < 3; t += 1 / 60) { stepFloat(map, { forward: 0, strafe: 0, lift: 1, fast: false }, 1 / 60, true); liftWorst = Math.max(liftWorst, currentDepth(space).depth) }
const top = player.y
check(top > 2 && liftWorst < 1e-6, `Space floats up until the head nears the ceiling (eyes at ${top.toFixed(2)})`)
for (let t = 0; t < 3; t += 1 / 60) { stepFloat(map, { forward: 0, strafe: 0, lift: -1, fast: false }, 1 / 60, true); liftWorst = Math.max(liftWorst, currentDepth(space).depth) }
check(player.y < 0.9 && liftWorst < 1e-6, `Q floats down head first toward the floor (eyes at ${player.y.toFixed(2)}, lean ${floatBody.lean.toFixed(2)})`)

// ---- Consoles and the landing marker ----
const targets = listTargets(map)
for (const item of map.consoles) {
  const p = standPoint(item)
  check(isWalkable(model, p.x, p.z), `console ${item.challengeId}: stand point is free`)
  const yaw = Math.atan2(-(item.position.x - p.x), -(item.position.z - p.z))
  const room = roomAt(map, p.x, p.z)
  const focus = findFocus(targets.filter((t: any) => t.requires === undefined), room?.id, p.x, p.z, yaw)
  check(focus?.id === item.id, `console ${item.challengeId} prompts at its stand point (${focus?.id})`)
}
const landing = targets.find((t: any) => t.id === 'prepare-landing')
check(landing?.requires === 5, 'the landing prompt waits for challenge 5')
const lp = landing.point
check(isWalkable(model, lp.x, lp.z) || isWalkable(model, lp.x - 0.4, lp.z), 'the landing marker can be reached')

// ---- Click-to-float routes ----
for (const room of map.rooms) {
  const route = planRoute(map, start, room.id)
  check(route !== null, `click-to-float route from the cockpit to ${room.id}`)
}

// ---- Boarding ----
const board = LAUNCH_CENTER.markers.find((m: any) => m.id === 'board-spacecraft')
check(board?.kind === 'exit' && getMap(board.target)?.id === 'spacecraft', 'the hatch in the launch center boards the spacecraft')
check(map.arrival === 'launch' && !!map.seat && !!map.countdown, 'arriving plays the launch from the seat')

console.log(failed ? `${failed} FAILED` : 'ALL PASSED')
