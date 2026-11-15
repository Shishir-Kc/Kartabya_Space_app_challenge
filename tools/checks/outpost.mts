// Headless checks for the Phase 3 lunar outpost.  Run: npx tsx tools/checks/outpost.mts
const P = new URL('../../src', import.meta.url).pathname
const { OUTPOST: map } = await import(`${P}/maps/outpost`)
const { getMap } = await import(`${P}/maps/registry`)
const { buildCollision, buildingCuts, contains, isWalkable, moduleRects, roomAt, standPoint } = await import(`${P}/maps/collision`)
const { Parts } = await import(`${P}/scene/kit/parts`)
const { buildOutpostModules, SHELL_OUT } = await import(`${P}/scene/kit/outpostModules`)
const { Mesh, MeshBasicMaterial, Raycaster, Vector3 } = await import('three')
const { findFocus, listTargets } = await import(`${P}/maps/targets`)
const { buildMap } = await import(`${P}/scene/kit/buildMap`)
const { lunarTerrain } = await import(`${P}/scene/kit/lunar`)
const { player, placePlayer } = await import(`${P}/state/player`)
const airlock = await import(`${P}/scene/airlock`)

let failed = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed++
}

// ---- Builds ----
const errors: string[] = []
const warn = console.warn
const error = console.error
console.warn = (...a: unknown[]) => { errors.push(String(a[0])); warn(...a) }
console.error = (...a: unknown[]) => { errors.push(String(a[0])); error(...a) }
const built = buildMap(map)
console.warn = warn
console.error = error
check(errors.length === 0, `outpost builds without merge errors (${errors.length})`)
for (const p of built.parts) {
  const a = p.geometry.attributes.position.array
  let bad = false
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { bad = true; break }
  check(!bad, `geometry ${p.key} has no NaN`)
}
console.log('buckets', built.parts.map((p: any) => `${p.key}:${p.geometry.attributes.position.count}`).join(' '), 'texts', built.extras.texts.length, 'lights', built.extras.lights.length)
check(built.parts.length + built.extras.texts.length + map.consoles.length < 40, 'merged meshes + texts + console screens under 40')

// ---- The modules stand open on the surface ----
const terrain = lunarTerrain(map)
check(Math.abs(terrain.height(map.spawn.x, map.spawn.z)) < 0.2, `spawn stands on level ground (${terrain.height(map.spawn.x, map.spawn.z).toFixed(2)} m)`)
for (const room of map.rooms) {
  const c = { x: (room.rect.x0 + room.rect.x1) / 2, z: (room.rect.z0 + room.rect.z1) / 2 }
  const h = Math.max(...[[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => terrain.height(c.x + dx * (room.rect.x1 - room.rect.x0) * 0.6, c.z + dz * (room.rect.z1 - room.rect.z0) * 0.6)))
  check(Math.abs(h) < 0.2, `${room.id} stands on the surface, not buried (ground ${h.toFixed(2)} m round it)`)
}
// ---- The lunar module on the landing pad ----
{
  const { LUNAR_MODULE } = await import(`${P}/scene/lunarModuleLayout`)
  const lander = map.props.find((p: any) => p.kind === 'lander')
  const yaw = lander.yaw ?? 0
  // The lander's front (+z, the ladder) in the map: the same turn the props use.
  const front = { x: Math.sin(yaw), z: Math.cos(yaw) }
  const dx = map.spawn.x - lander.position.x
  const dz = map.spawn.z - lander.position.z
  const ahead = dx * front.x + dz * front.z
  const aside = Math.abs(dx * front.z - dz * front.x)
  check(ahead > LUNAR_MODULE.footpadRadius + 0.3 && ahead < LUNAR_MODULE.footpadRadius + 1.5 && aside < 1, `the player starts at the foot of the ladder, just past the front footpad (${ahead.toFixed(1)} m ahead, ${aside.toFixed(1)} m aside)`)
  check(Math.abs(lander.size.w - LUNAR_MODULE.bodyHalf * 2) < 0.1 && Math.abs(lander.size.d - LUNAR_MODULE.bodyHalf * 2) < 0.1 && Math.abs(lander.size.h - LUNAR_MODULE.height) < 0.1, 'the lander prop is the model\'s size (collision and baked shadow)')
  const pad = map.outdoor.areas.find((a: any) => a.id === 'landing-pad')
  check(Math.hypot(pad.x - lander.position.x, pad.z - lander.position.z) + LUNAR_MODULE.footpadRadius < pad.radius - 2.5, 'the footpads stand inside the pad\'s ring of lights')
}
const shielded = map.rooms.filter((r: any) => r.shielding)
check(shielded.length === 1 && shielded[0].id === 'shelter', `only the storm shelter is covered in regolith bags (${shielded.map((r: any) => r.id).join(', ')})`)
const texts = built.extras.texts.map((t: any) => t.text)
check(texts.some((t: string) => t.includes('STORM SHELTER') && t.includes('REGOLITH SHIELDING')), 'the shielded module has its sign')
check(texts.includes('AIRLOCK'), 'the airlock porch has its lit sign')
const cuts = buildingCuts(map)
check(cuts.length === 1, `one approach lane through the shell, to the airlock's outer door (${cuts.length})`)

// The outside, built on its own: nothing of it pokes into any room, and the windows see out.
const outside = new Parts()
const outsideExtras = { texts: [], lights: [] } as any
buildOutpostModules(map, outside, outsideExtras, terrain.height, () => [0, 0], () => 1)
const outsideParts = outside.build()
let poking = 0
for (const part of outsideParts) {
  const a = part.geometry.attributes.position.array
  for (let i = 0; i < a.length; i += 3) {
    const [x, y, z] = [a[i], a[i + 1], a[i + 2]]
    const room = map.rooms.find((r: any) => x > r.rect.x0 + 0.11 && x < r.rect.x1 - 0.11 && z > r.rect.z0 + 0.11 && z < r.rect.z1 - 0.11)
    if (room && y > 0.01 && y < room.ceiling - 0.01) poking++
  }
}
check(poking === 0, `no part of the modules' outside pokes into a room (${poking} points)`)
const shell = outsideParts.filter((p: any) => p.key === 'padded' || p.key === 'fabric').map((p: any) => new Mesh(p.geometry, new MeshBasicMaterial()))
const ray = new Raycaster()
const firstHit = (from: any, dir: any, far = 6) => {
  ray.set(from, dir)
  ray.far = far
  const hits = ray.intersectObjects(shell, false)
  return hits.length ? hits[0].distance : Infinity
}
let windows = 0
for (const wall of map.walls) {
  for (const opening of wall.openings ?? []) {
    if (opening.kind !== 'window') continue
    for (const side of [-1, 1]) {
      const at = wall.runs === 'x' ? { x: opening.center, z: wall.at + side * 0.5 } : { x: wall.at + side * 0.5, z: opening.center }
      if (roomAt(map, at.x, at.z)) continue
      windows++
      const y = ((opening.sill ?? 1) + (opening.top ?? 1.6)) / 2
      // Looking in from a metre outside: through the window, nothing of the shell is in the way to the wall.
      const inward = wall.runs === 'x' ? new Vector3(0, 0, -side) : new Vector3(-side, 0, 0)
      const origin = wall.runs === 'x' ? new Vector3(opening.center, y, wall.at + side) : new Vector3(wall.at + side, y, opening.center)
      check(firstHit(origin, inward, 0.95) === Infinity, `the window at (${opening.center}, ${wall.at}) looks straight out through the shell`)
      const beside = origin.clone().add(wall.runs === 'x' ? new Vector3(opening.width / 2 + 0.25, 0, 0) : new Vector3(0, 0, opening.width / 2 + 0.25))
      const d = firstHit(beside, inward)
      check(Math.abs(d - (1 - SHELL_OUT)) < 0.02, `beside it, the shell's outer face is ${(1 - d).toFixed(3)} m out from the wall line (expected ${SHELL_OUT})`)
    }
  }
}
check(windows === 4, `four windows look outside (${windows})`)

// ---- Collision outside: every module is solid; a lane leads to the airlock door ----
const model = buildCollision(map)
let inShell = 0
const solids = moduleRects(map).map((m: any) => m.rect)
for (let x = -24; x <= 16; x += 0.2) {
  for (let z = -14; z <= 14; z += 0.2) {
    if (!solids.some((r: any) => contains(r, x, z))) continue
    if (roomAt(map, x, z)) continue
    if (cuts.some((c: any) => contains(c.rect, x, z))) continue
    if (isWalkable(model, x, z)) inShell++
  }
}
check(inShell === 0, `no walkable spot inside any module's shell or bags from outside (${inShell} found)`)

function reach(start: { x: number; z: number }, goal: (x: number, z: number) => boolean, extra: any[]): boolean {
  model.extra = extra
  const STEP = 0.25
  const seen = new Set<string>()
  const queue: [number, number][] = [[Math.round(start.x / STEP), Math.round(start.z / STEP)]]
  while (queue.length) {
    const [i, k] = queue.pop()!
    const x = i * STEP, z = k * STEP
    if (goal(x, z)) return true
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nk = k + dk
      const key = `${ni},${nk}`
      if (seen.has(key) || Math.abs(ni * STEP) > 80 || Math.abs(nk * STEP) > 40) continue
      seen.add(key)
      if (isWalkable(model, ni * STEP, nk * STEP)) queue.push([ni, nk])
    }
  }
  return false
}
const inRoom = (id: string) => (x: number, z: number) => roomAt(map, x, z)?.id === id

// ---- The airlock ----
airlock.resetAirlock(map, true)
let s = airlock.airlockState()
check(s?.phase === 'outside' && s.outer === 1 && s.inner === 0, 'arriving: the outer door is open, the inner door shut')
check(reach(map.spawn, inRoom('airlock'), airlock.airlockWalkable('ground')), 'from the landing pad, the path reaches the airlock chamber')
check(reach({ x: map.rover.spawn.x + 3.5, z: map.rover.spawn.z }, inRoom('airlock'), airlock.airlockWalkable('ground')), 'from the rover parking, the airlock chamber can be reached on foot')
{
  // With the outer door shut, the player can still walk up to it and press its button.
  const shut = buildCollision(map)
  const lane = cuts[0].rect
  const laneMid = { x: (lane.x0 + lane.x1) / 2, z: (lane.z0 + lane.z1) / 2 }
  check(isWalkable(shut, laneMid.x, laneMid.z), 'the approach lane in front of the outer door is walkable with the door shut')
}
check(!reach(map.spawn, inRoom('corridor'), airlock.airlockWalkable('ground')), 'from outside, the corridor is shut off by the inner door')
// Stand in the chamber and cycle in.
placePlayer({ x: -14, z: 0, yaw: 0 })
airlock.requestCycle(false)
let bothOpen = false
let lastPressure = -1
let monotonic = true
let swappedAt = -1
for (let t = 0; t < 12 && airlock.airlockState().phase !== 'inside'; t += 1 / 60) {
  airlock.updateAirlock(1 / 60)
  s = airlock.airlockState()
  if (s.inner > 0 && s.outer > 0) bothOpen = true
  if (s.pressure < lastPressure - 1e-9) monotonic = false
  lastPressure = s.pressure
  if (swappedAt < 0 && !s.suited) swappedAt = s.pressure
}
check(airlock.airlockState().phase === 'inside', `cycling in finishes (${airlock.airlockState().phase})`)
check(!bothOpen, 'cycling in: the two doors are never open together')
check(monotonic && Math.round(lastPressure) === map.airlock.pressure, `cycling in: pressure rises steadily to ${map.airlock.pressure} kPa`)
check(swappedAt > 0 && swappedAt < map.airlock.pressure, `cycling in: the player changes into the coverall halfway (at ${swappedAt.toFixed(0)} kPa)`)
check(reach({ x: -14, z: 0 }, inRoom('greenhouse'), airlock.airlockWalkable('ground')), 'inside: every room is reachable from the chamber (greenhouse)')
check(!reach({ x: -14, z: 0 }, (x: number) => x < -22, airlock.airlockWalkable('ground')), 'inside: the outer door keeps the surface shut off')
// And out again.
airlock.requestCycle(true)
bothOpen = false
let suitedAt = -1
for (let t = 0; t < 12 && airlock.airlockState().phase !== 'outside'; t += 1 / 60) {
  airlock.updateAirlock(1 / 60)
  s = airlock.airlockState()
  if (s.inner > 0 && s.outer > 0) bothOpen = true
  if (suitedAt < 0 && s.suited) suitedAt = s.pressure
}
check(airlock.airlockState().phase === 'outside' && !bothOpen, 'cycling out finishes, never with both doors open')
check(suitedAt >= 0 && suitedAt < map.airlock.pressure, `cycling out: the surface suit goes on halfway (at ${suitedAt.toFixed(0)} kPa)`)
// A player outside the chamber doesn't change suits.
airlock.resetAirlock(map, false)
placePlayer({ x: 0, z: 0, yaw: 0 })
airlock.requestCycle(true)
for (let t = 0; t < 12; t += 1 / 60) airlock.updateAirlock(1 / 60)
check(!airlock.airlockState().suited, 'cycling with nobody inside leaves the corridor player in the coverall')

// ---- Consoles ----
airlock.resetAirlock(map, false)
const targets = listTargets(map)
for (const id of [6, 7, 9, 10, 12]) {
  const item = map.consoles.find((c: any) => c.challengeId === id)
  check(!!item, `console ${id} exists`)
  if (!item) continue
  const p = standPoint(item)
  model.extra = airlock.airlockWalkable('ground')
  check(isWalkable(model, p.x, p.z), `console ${id}: stand point is free`)
  const yaw = Math.atan2(-(item.position.x - p.x), -(item.position.z - p.z))
  const focus = findFocus(targets, roomAt(map, p.x, p.z)?.id, p.x, p.z, yaw)
  check(focus?.id === item.id, `console ${id} prompts at its stand point`)
}

// ---- The surface (Part B) ----
const { lightAt } = await import(`${P}/scene/kit/lunarLight`)
const { scatterRocks, BLOCKING_ROCK } = await import(`${P}/maps/lunarScatter`)
airlock.resetAirlock(map, true)
model.extra = airlock.airlockWalkable('ground')
const b = map.outdoor.boundary
check(!isWalkable(model, b.x + b.radius + 1, b.z), 'the boundary stops the player')
const edgeBlock = (await import(`${P}/maps/collision`)).blockerAt(model, b.x + b.radius + 1, b.z)
check(edgeBlock?.kind === 'edge' && !!edgeBlock.message, `reaching the boundary gives the self-talk ("${edgeBlock?.message}")`)
const rocks = scatterRocks(map)
const boulders = rocks.filter((r: any) => r.size >= BLOCKING_ROCK && !r.edge)
const ring = rocks.filter((r: any) => r.edge)
console.log(`rocks ${rocks.length}: ${boulders.length} blocking boulders, ${ring.length} in the boundary ring`)
check(boulders.every((r: any) => !isWalkable(model, r.x, r.z)), 'every boulder blocks the way')
// The ring leaves no gap: walk the circle just outside it.
let gaps = 0
for (let a = 0; a < Math.PI * 2; a += 0.002) {
  const x = b.x + Math.cos(a) * (b.radius + 2.5)
  const z = b.z + Math.sin(a) * (b.radius + 2.5)
  if (isWalkable(model, x, z)) gaps++
}
check(gaps === 0, `the boundary ring has no gaps (${gaps})`)
// Every named place can be reached on foot from the airlock porch (1 m grid).
{
  const STEP = 1
  const start = { x: -21, z: 0 }
  const seen = new Set<string>()
  const queue: [number, number][] = [[start.x, start.z]]
  seen.add(`${start.x},${start.z}`)
  while (queue.length) {
    const [x, z] = queue.pop()!
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx * STEP, nz = z + dz * STEP
      const key = `${nx},${nz}`
      if (seen.has(key) || Math.abs(nx) > 380 || Math.abs(nz) > 380) continue
      seen.add(key)
      if (isWalkable(model, nx, nz)) queue.push([nx, nz])
    }
  }
  const reached = (x: number, z: number, r: number) => [...seen].some((k) => { const [px, pz] = k.split(',').map(Number); return Math.hypot(px - x, pz - z) < r && isWalkable(model, px, pz) })
  for (const area of map.outdoor.areas) check(reached(area.x, area.z, Math.max(3, area.radius * 0.5)), `on foot, the ${area.label.toLowerCase()} can be reached`)
}
const crater = map.exterior.craters.find((c: any) => c.ice)
const floorLight = Math.max(...[0, 0.3, 0.6].flatMap((f) => [0, 1, 2, 3].map((q) => lightAt(map, crater.x + Math.cos(q * 1.57) * crater.radius * f * 0.6, crater.z + Math.sin(q * 1.57) * crater.radius * f * 0.6))))
const openLight = lightAt(map, -30, 10)
check(floorLight < 0.06, `the ice crater floor is in permanent shadow (light ${floorLight.toFixed(3)} vs ${openLight.toFixed(3)} on open ground)`)
for (const marker of map.markers.filter((m: any) => m.kind === 'challenge')) {
  const c = { x: (marker.rect.x0 + marker.rect.x1) / 2, z: (marker.rect.z0 + marker.rect.z1) / 2 }
  // Stand a metre and a half away, on the side that's free, facing it.
  let ok = false
  for (let a = 0; a < Math.PI * 2 && !ok; a += Math.PI / 8) {
    const p = { x: c.x + Math.cos(a) * 1.5, z: c.z + Math.sin(a) * 1.5 }
    if (!isWalkable(model, p.x, p.z)) continue
    const yaw = Math.atan2(-(c.x - p.x), -(c.z - p.z))
    const place = (await import(`${P}/maps/collision`)).placeAt(map, p.x, p.z)
    ok = findFocus(listTargets(map), place?.id, p.x, p.z, yaw)?.id === marker.id
  }
  check(ok, `challenge ${marker.challengeId} ("${marker.label}") prompts`)
}

// ---- The rover model agrees with the map: the physics drives the wheels you see ----
{
  const { readFileSync } = await import('node:fs')
  const glb = readFileSync(new URL('../../public/models/rover.glb', import.meta.url))
  const gltf = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)))
  const layout = gltf.scenes[gltf.scene ?? 0].extras.rover
  const names = new Set(gltf.nodes.map((node: any) => node.name))
  check(['fl', 'fr', 'rl', 'rr'].every((k) => names.has(`wheel_${k}`) && names.has(`spin_${k}`)), 'the rover model has four steering wheels that spin')
  check(Math.abs(layout.base - map.rover.wheels.base) < 0.03 && Math.abs(layout.track - map.rover.wheels.track) < 0.03 && Math.abs(layout.radius - map.rover.wheels.radius) < 0.01,
    `the map's wheel layout matches the rover model (model ${layout.base} x ${layout.track} m, radius ${layout.radius})`)
  const [sx, sy, sz] = layout.seat
  check(Math.hypot(sx - map.rover.seat.x, sy - map.rover.seat.y, sz - map.rover.seat.z) < 0.03, `the driver's seat matches the rover model (${layout.seat.join(', ')})`)
}

// ---- The rover (Part C) ----
{
  const rover = await import(`${P}/scene/rover`)
  const { groundHeight } = await import(`${P}/scene/kit/exterior`)
  const ground = groundHeight(map)
  const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
  rover.resetRover(map)
  let r = rover.roverState()
  check(!!r && r.battery === 100 && !r.driving, 'the rover is parked by the airlock with a full battery')
  check(Math.hypot(r.x - map.airlock.panel.x, r.z - map.airlock.panel.z) < 16, 'it is parked next to the airlock')
  rover.enterRover()
  check(r.driving, 'E gets into the driver\'s seat')
  check(rover.exitRover(), 'E gets out again while stopped')
  rover.enterRover()
  const step = (input: any) => rover.updateRover(1 / 60, input)
  // Drive toward a point with simple steering; report what happened.
  const driveTo = (tx: number, tz: number, seconds: number, boost = false) => {
    const events = new Set<string>()
    let minClearance = Infinity
    let maxAir = 0
    let maxTilt = 0
    for (let t = 0; t < seconds; t += 1 / 60) {
      const want = Math.atan2(-(tx - r.x), -(tz - r.z))
      for (const e of step({ throttle: 1, steer: Math.max(-1, Math.min(1, angle(want - r.yaw) * 2)), boost })) events.add(e)
      maxAir = Math.max(maxAir, r.y - (ground(r.x, r.z)))
      maxTilt = Math.max(maxTilt, Math.abs(r.pitch), Math.abs(r.roll))
      if (Math.hypot(tx - r.x, tz - r.z) < 4) break
    }
    return { events, maxAir, maxTilt, minClearance }
  }
  // A direct trip to the ice crater floor and back uses about 80%.
  const out = driveTo(270, 110, 200)
  check(Math.hypot(270 - r.x, 110 - r.z) < 4, 'the rover drives to the ice crater floor')
  check(r.headlights, 'its headlights are on in the crater\'s shadow')
  check(out.maxTilt > 0.05, `the body pitches and rolls with the ground (up to ${(out.maxTilt * 57.3).toFixed(0)} degrees)`)
  driveTo(map.rover.home.x + 6, map.rover.home.z + 10, 200)
  const used = 100 - r.battery
  console.log(`direct trip to the ice crater and back: ${used.toFixed(1)}% used, ${r.odometer.toFixed(0)} m driven`)
  check(used > 74 && used < 86, `a direct trip to the ice crater and back uses about 80% (${used.toFixed(1)}%)`)
  check(!r.warned, 'a direct trip never crosses the home line')
  rover.resetRover(map)
  r = rover.roverState()
  rover.enterRover()
  // Low gravity: lifted 2 m, it floats down at 1.62 m/s^2.
  r.speed = 0
  const floor = r.y
  r.y += 2
  r.vy = 0
  let fallen = 0
  for (let t = 0; t < 1; t += 1 / 60) step({ throttle: 0, steer: 0, boost: false })
  fallen = floor + 2 - r.y
  check(fallen > 0.7 && fallen < 0.95, `low gravity: it falls ${fallen.toFixed(2)} m in the first second (0.81 m at 1.62 m/s^2)`)
  // Boulders stop it.
  const { scatterRocks } = await import(`${P}/maps/lunarScatter`)
  const boulder = scatterRocks(map).filter((b: any) => b.size > 2.5 && !b.edge && Math.hypot(b.x, b.z) < 250)[0]
  rover.resetRover(map)
  r = rover.roverState()
  rover.enterRover()
  r.x = boulder.x + 12
  r.z = boulder.z
  r.yaw = Math.PI / 2
  const bumped = new Set<string>()
  for (let t = 0; t < 8; t += 1 / 60) for (const e of step({ throttle: 1, steer: 0, boost: false })) bumped.add(e)
  check(bumped.has('bump') && Math.hypot(r.x - boulder.x, r.z - boulder.z) > boulder.size * 0.4, `a ${boulder.size.toFixed(1)} m boulder stops it with a bump`)
  // It drives over rocks up to about 1 m across... 2 m (they're low lumps), rocking as it goes.
  const pebble = scatterRocks(map).find((b: any) => b.size > 1.1 && b.size < 1.9 && !b.edge && Math.hypot(b.x, b.z) > 40 && Math.hypot(b.x, b.z) < 250)
  rover.resetRover(map)
  r = rover.roverState()
  rover.enterRover()
  r.x = pebble.x + 10
  r.z = pebble.z
  r.yaw = Math.PI / 2
  r.y = ground(r.x, r.z)
  let rocked = 0
  let crossed = false
  for (let t = 0; t < 8; t += 1 / 60) {
    const before = r.pitch
    step({ throttle: 1, steer: 0, boost: false })
    rocked = Math.max(rocked, Math.abs(r.pitch - before) * 60)
    if (r.x < pebble.x - 3) { crossed = true; break }
  }
  check(crossed, `the rover drives over a ${pebble.size.toFixed(1)} m rock`)
  check(rocked > 0.02, `and pitches as it goes over it (up to ${(rocked * 57.3).toFixed(0)} degrees a second)`)
  // The boundary ring stops it.
  rover.resetRover(map)
  r = rover.roverState()
  rover.enterRover()
  const ringRadius = map.outdoor.boundary.radius
  r.x = ringRadius - 25
  r.z = 0
  r.yaw = -Math.PI / 2
  r.y = ground(r.x, r.z)
  for (let t = 0; t < 30; t += 1 / 60) step({ throttle: 1, steer: 0, boost: false })
  check(Math.hypot(r.x, r.z) < ringRadius, `the boundary ring stops the rover (stopped ${Math.hypot(r.x, r.z).toFixed(0)} m out)`)
  // A slope over about 26 degrees stops it: find one and drive straight up it.
  let steep: any = null
  const roverModel = buildCollision(map, rover.ROVER_RADIUS, 'ground', 2)
  for (let x = -300; x < 300 && !steep; x += 3) {
    for (let z = -300; z < 300 && !steep; z += 3) {
      if (Math.hypot(x, z) < 60) continue
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw)
        if ((ground(x + fx * 1.2, z + fz * 1.2) - ground(x, z)) / 1.2 <= map.rover.maxGrade + 0.1) continue
        // A clear, gentle run-up of 4 m to the foot of the slope.
        let clear = true
        for (let k = 0; k <= 4; k += 0.5) {
          const px = x - fx * k, pz = z - fz * k
          if (!isWalkable(roverModel, px, pz) || (k > 0.6 && (ground(px + fx * 1.2, pz + fz * 1.2) - ground(px, pz)) / 1.2 > map.rover.maxGrade * 0.95)) clear = false
        }
        if (clear) { steep = { x: x - fx * 4, z: z - fz * 4, yaw }; break }
      }
    }
  }
  if (steep) {
    rover.resetRover(map)
    r = rover.roverState()
    rover.enterRover()
    Object.assign(r, { x: steep.x, z: steep.z, yaw: steep.yaw, y: ground(steep.x, steep.z) })
    const startHeight = ground(r.x, r.z)
    const seenSteep = new Set<string>()
    for (let t = 0; t < 6; t += 1 / 60) for (const e of step({ throttle: 1, steer: 0, boost: false })) seenSteep.add(e)
    console.log('steep test', JSON.stringify(steep), [...seenSteep], 'climbed', (ground(r.x, r.z) - startHeight).toFixed(2), 'grade ahead', ((ground(steep.x - Math.sin(steep.yaw) * 5.2, steep.z - Math.cos(steep.yaw) * 5.2) - ground(steep.x - Math.sin(steep.yaw) * 4, steep.z - Math.cos(steep.yaw) * 4)) / 1.2).toFixed(2), 'moved', Math.hypot(r.x - steep.x, r.z - steep.z).toFixed(1))
    check(seenSteep.has('bump') && ground(r.x, r.z) - startHeight < 3, 'a slope steeper than about 26 degrees stops the rover')
  } else {
    check(false, "no steep slope with a clear run-up was found to test")
  }
  // The modules stop it too: driving at the storm shelter's bags, and at the corridor's end.
  r.x = -2
  r.z = 30
  r.yaw = 0
  r.speed = 0
  for (let t = 0; t < 12; t += 1 / 60) step({ throttle: 1, steer: 0, boost: false })
  check(r.z > 5 + SHELL_OUT + 0.75, `the storm shelter's bags stop it (stopped at z = ${r.z.toFixed(1)})`)
  r.x = 40
  r.z = 0
  r.yaw = Math.PI / 2
  r.speed = 0
  for (let t = 0; t < 14; t += 1 / 60) step({ throttle: 1, steer: 0, boost: false })
  check(r.x > 12 + SHELL_OUT, `the corridor module stops it (stopped at x = ${r.x.toFixed(1)})`)
  r.x = -6
  r.z = -30
  r.yaw = Math.PI
  r.speed = 0
  for (let t = 0; t < 12; t += 1 / 60) step({ throttle: 1, steer: 0, boost: false })
  check(r.z < -7.5 - SHELL_OUT, `the greenhouse module stops it (stopped at z = ${r.z.toFixed(1)})`)
  // Driving away: the home line warning once, then the self-talk once, then a flat battery.
  rover.resetRover(map)
  r = rover.roverState()
  rover.enterRover()
  const seen: string[] = []
  const targets = [[300, -200], [-300, -250], [-300, 250], [250, 250], [300, -200], [-300, -250]]
  for (const [tx, tz] of targets) {
    for (let t = 0; t < 200 && r.battery > 0; t += 1 / 60) {
      const want = Math.atan2(-(tx - r.x), -(tz - r.z))
      let steer = Math.max(-1, Math.min(1, angle(want - r.yaw) * 2))
      const ev = step({ throttle: 1, steer, boost: false })
      seen.push(...ev.filter((e: string) => e !== 'bump' && e !== 'landed'))
      if (ev.includes('bump')) for (let k = 0; k < 60; k++) seen.push(...step({ throttle: -1, steer: 1, boost: false }).filter((e: string) => e !== 'bump' && e !== 'landed'))
      if (Math.hypot(tx - r.x, tz - r.z) < 6) break
    }
    if (r.battery <= 0) break
  }
  console.log('events driving far:', seen.join(' > '))
  check(seen.filter((e) => e === 'home-line').length === 1, 'the safety officer warns at the home line exactly once')
  check(seen.includes('too-far'), 'past the home line, the player says they shouldn\'t go further')
  check(seen.at(-1) === 'flat' && r.battery === 0, 'driving on, the battery runs flat')
  rover.loseRover()
  rover.enterRover()
  check(!r.driving && r.lost, 'a lost rover can\'t be driven again')
}

// ---- Cards and arrival ----
check(map.cards.some((c: any) => c.trigger.kind === 'arrive' && c.body.includes('one-sixth')), 'the first steps card shows on arrival')
check(map.cards.some((c: any) => c.trigger.kind === 'event' && c.trigger.event === 'airlock'), 'the airlock card shows on the first cycle')
check(map.cards.some((c: any) => c.trigger.kind === 'place' && c.trigger.place === 'ice-crater' && c.body.includes('200')), 'the ice crater card shows on first reaching it')
check(getMap('outpost')?.id === 'outpost' && map.gravity === 'moon', 'the outpost is registered, with lunar gravity')
void player

console.log(failed ? `${failed} FAILED` : 'ALL PASSED')
