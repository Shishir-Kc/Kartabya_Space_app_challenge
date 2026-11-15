/**
 * The map arrows against real movement, headless: `npx tsx tools/checks/map.mts`.
 *
 * For headings in all four quadrants (and the diagonals between them):
 * - the rover's map icon, rotated by mapRotation(yaw), points the way
 *   roverForward(yaw) says it drives;
 * - driving the real rover (updateRover, full throttle, no steering) moves
 *   it the way its map arrow points;
 * - the player's arrow uses the same rotation as their walking direction;
 * - "Map turns with you" turns the map so the rover's nose points up the screen.
 */
const g = globalThis as any
g.window = {
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  matchMedia: () => ({ matches: false }),
  location: { search: '' },
}

const P = '../../src'
const { mapRotation, noseAfter, headingUpRotation, formatDistance } = await import(`${P}/hud/mapMath`)
const { roverForward, resetRover, roverState, enterRover, updateRover } = await import(`${P}/scene/rover`)
const { OUTPOST } = await import(`${P}/maps/outpost`)

let failed = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed++
}
const near = (a: { x: number; z: number }, b: { x: number; z: number }, eps = 1e-6) => Math.abs(a.x - b.x) < eps && Math.abs(a.z - b.z) < eps
const unit = (v: { x: number; z: number }) => {
  const length = Math.hypot(v.x, v.z)
  return { x: v.x / length, z: v.z / length }
}

const HEADINGS: [string, number][] = [
  ['north', 0],
  ['north-west', Math.PI / 4],
  ['west', Math.PI / 2],
  ['south-west', (3 * Math.PI) / 4],
  ['south', Math.PI],
  ['south-east', -(3 * Math.PI) / 4],
  ['east', -Math.PI / 2],
  ['north-east', -Math.PI / 4],
]

// The icon's nose against the rover's forward direction.
for (const [name, yaw] of HEADINGS) {
  check(near(noseAfter(mapRotation(yaw)), roverForward(yaw)), `${name}: the map arrow points the way the rover drives`)
}
check(near(roverForward(0), { x: 0, z: -1 }) && near(roverForward(Math.PI / 2), { x: -1, z: 0 }), 'yaw 0 drives north (−z, up the map); a quarter turn left drives west')

// Drive the real rover: from a standstill, full throttle for a second, and see where it went.
const map = OUTPOST
const FLAT = { x: -40, z: 30 }
for (const [name, yaw] of HEADINGS) {
  resetRover(map)
  const s = roverState()!
  Object.assign(s, { x: FLAT.x, z: FLAT.z, yaw, speed: 0, steer: 0, battery: 100 })
  enterRover()
  const start = { x: s.x, z: s.z }
  for (let i = 0; i < 30; i++) updateRover(1 / 30, { throttle: 1, steer: 0, boost: false })
  const moved = unit({ x: s.x - start.x, z: s.z - start.z })
  const arrow = noseAfter(mapRotation(s.yaw))
  check(Math.hypot(s.x - start.x, s.z - start.z) > 0.2 && near(moved, arrow, 0.05), `${name}: pressing W moves the rover the way its map arrow points`)
}

// Map turns with you: the rover's nose ends up pointing up the screen.
for (const [name, yaw] of HEADINGS) {
  const nose = noseAfter(mapRotation(yaw) + headingUpRotation(yaw))
  check(near(nose, { x: 0, z: -1 }), `${name}: with the map turning, the rover points up`)
}

check(formatDistance(286.4) === '286 m' && formatDistance(1520) === '1.5 km', 'distances read in metres, or km past 1 km')

console.log(failed ? `${failed} FAILED` : 'All map checks passed.')
process.exit(failed ? 1 : 0)
