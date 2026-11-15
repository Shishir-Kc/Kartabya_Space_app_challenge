// Regression checks for the launch center after the Phase 2 format changes.
const P = new URL('../../src', import.meta.url).pathname
const { LAUNCH_CENTER: map } = await import(`${P}/maps/launchCenter`)
const { buildCollision, contains, isWalkable, listLevels, standPoint, roomAt, levelOf } = await import(`${P}/maps/collision`)
const { findFocus, listTargets } = await import(`${P}/maps/targets`)
const { planRoute } = await import(`${P}/maps/navigation`)
const { buildMap } = await import(`${P}/scene/kit/buildMap`)
let failed = 0
const check = (ok: boolean, label: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failed++ }
const warn = console.warn; const errors: string[] = []
console.warn = (...a: unknown[]) => { errors.push(String(a[0])); warn(...a) }
const origError = console.error
console.error = (...a: unknown[]) => { errors.push(String(a[0])); origError(...a) }
const built = buildMap(map)
check(errors.length === 0, `launch center builds without merge errors (${errors.length})`)
const keys = built.parts.map((p: any) => p.key)
for (const k of ['wall', 'floor', 'ceiling', 'painted', 'brushed', 'terrain', 'concrete']) check(keys.includes(k), `bucket ${k} present`)
for (const level of listLevels(map)) {
  const model = buildCollision(map, undefined, level.id)
  for (const room of map.rooms.filter((r: any) => levelOf(r) === level.id)) {
    let any = false
    for (let x = room.rect.x0; x <= room.rect.x1 && !any; x += 0.1) for (let z = room.rect.z0; z <= room.rect.z1 && !any; z += 0.1) if (isWalkable(model, x, z)) any = true
    check(any, `${level.id}: room ${room.id} has walkable floor`)
  }
}
const ground = buildCollision(map)
check(isWalkable(ground, map.spawn.x, map.spawn.z), 'spawn is walkable')
const targets = listTargets(map)
for (const item of map.consoles) {
  const p = standPoint(item)
  const yaw = Math.atan2(-(item.position.x - p.x), -(item.position.z - p.z))
  const focus = findFocus(targets, roomAt(map, p.x, p.z, levelOf(item))?.id, p.x, p.z, yaw)
  check(focus?.id === item.id, `console ${item.challengeId} prompts`)
}
for (const room of map.rooms.filter((r: any) => levelOf(r) === 'ground')) check(planRoute(map, map.spawn, room.id) !== null, `route to ${room.id}`)
// The access arm reaches the Saturn V's command module: same height as the tower's arm, the hatch on the capsule's side, the clean room clear of the service module.
{
  const { ARM_FLOOR, ROCKET_BASE } = await import(`${P}/scene/kit/exterior`)
  const { SATURN_V } = await import(`${P}/scene/saturnLayout`)
  const { launchPad } = await import(`${P}/maps/types`)
  const pad = launchPad(map)
  const arm = map.levels.find((l: any) => l.id === 'arm')
  check(arm?.y === ARM_FLOOR, `the access arm level (${arm?.y} m) matches the tower's arm (${ARM_FLOOR} m)`)
  const hatch = map.props.find((p: any) => p.id === 'hatch')
  const bottom = arm.y + (hatch.elevation ?? 0) - ROCKET_BASE
  const top = bottom + hatch.size.h
  check(bottom >= SATURN_V.capsuleBase - 0.05 && top <= SATURN_V.capsuleTop, `the hatch opens onto the command module's side (${bottom.toFixed(2)} to ${top.toFixed(2)} m up the rocket)`)
  const clean = map.rooms.find((r: any) => r.id === 'clean-room')
  const gap = pad.z - clean.rect.z1
  check(gap > SATURN_V.serviceRadius && gap < SATURN_V.capsuleBaseRadius + 0.6, `the clean room stands just clear of the service module (${gap.toFixed(2)} m from the rocket's axis)`)
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED')
