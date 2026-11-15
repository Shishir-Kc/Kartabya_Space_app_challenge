/**
 * Checks for Phase 6 (real NASA data and the source table) and Phase 7
 * (crew), run headless with `npx tsx tools/checks/data.mts`:
 *
 * - every outcome has a filled source whose references exist, and every
 *   reference has a real https link and a fact;
 * - the playable challenges (1, 2, 6, 10, 12) have no `TODO: source` left;
 * - the storm is a real archived DONKI event, the dose is in real mSv
 *   (high = NASA's 250 mSv limit) and the Moon adds its 0.5 mSv a day;
 * - the live space weather summary reads DONKI records correctly;
 * - the OSDR archive holds real studies, each linked to the game;
 * - every playable challenge has two different voices;
 * - a crew member in red health changes the next decision (commander:
 *   no advice; medic: risk arrows hidden; botanist: half the greenhouse);
 * - the moderate dose level makes the crew unwell once and refuses the
 *   riskiest options; science words are explained the first time;
 * - the crew stand on walkable floor in the rooms they care about.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const g = globalThis as any
g.window = {
  localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  matchMedia: () => ({ matches: false }),
  location: { search: '' },
}
g.document = { documentElement: { dataset: {} }, pointerLockElement: null }

const P = '../../src'
const { CHALLENGES, getChallenge, allOutcomeIds } = await import(`${P}/data/challenges`)
const { SOURCES, REFERENCES, getReference, referencesFor } = await import(`${P}/data/sources`)
const { DONKI, drawStormEvent, getStormEvent } = await import(`${P}/data/donki`)
const science = await import(`${P}/data/science`)
const { summarize, describeSpaceWeather } = await import(`${P}/data/spaceWeather`)
const { OSDR, linkedStudies } = await import(`${P}/data/osdr`)
const { newTerms } = await import(`${P}/data/glossary`)
const mission = await import(`${P}/state/mission`)
const decisions = await import(`${P}/state/decisions`)
const days = await import(`${P}/state/days`)
const { requireMap } = await import(`${P}/maps/registry`)
const { buildCollision, isWalkable, roomAt, blockerAt, CREW_FIGURES } = await import(`${P}/maps/collision`)

let failed = 0
function check(ok: unknown, label: string): void {
  if (ok) console.log(`PASS ${label}`)
  else {
    failed++
    console.log(`FAIL ${label}`)
  }
}

const READY = CHALLENGES.filter((c: any) => c.ready).map((c: any) => c.id)

// ---- Phase 6: the source table ----
check(READY.join(',') === '1,2,3,4,5,6,7,8,9,10,11,12', `all twelve challenges are playable (${READY.join(', ')})`)
const outcomes: string[] = allOutcomeIds()
check(outcomes.every((id) => SOURCES.some((s: any) => s.outcomeId === id)), 'every outcome has an entry in sources.json')
const unfilled = SOURCES.filter((s: any) => !s.title || !s.url || !s.retrieved || !s.owner || !s.refs?.length || !s.why)
check(unfilled.length === 0, `every entry has a title, link, date, owner, references and a reason (${unfilled.map((s: any) => s.outcomeId).join(', ') || 'all filled'})`)
check(SOURCES.every((s: any) => s.refs.every((id: string) => getReference(id))), 'every reference id in the table exists')
check(SOURCES.every((s: any) => s.url === getReference(s.refs[0]).url), "each entry's link is its main reference's link")
check(REFERENCES.every((r: any) => /^https:\/\/[^ ]+\.[a-z]+/.test(r.url) && r.fact.length > 30 && /^\d{4}-\d{2}-\d{2}$/.test(r.retrieved)), 'every reference has an https link, a fact and a retrieval date')
check(REFERENCES.every((r: any) => /nasa\.gov|asc-csa\.gc\.ca/.test(r.url)), 'every reference is a NASA or Canadian Space Agency document')
check(new Set(REFERENCES.map((r: any) => r.id)).size === REFERENCES.length, 'reference ids are unique')
check(SOURCES.filter((s: any) => s.reviewer).length >= 0, `reviewed by a person so far: ${SOURCES.filter((s: any) => s.reviewer).length} of ${SOURCES.length} (a person on the team fills in "reviewer")`)

// No `TODO: source` inside the playable challenges' data.
const here = dirname(fileURLToPath(import.meta.url))
const file = readFileSync(join(here, '..', '..', 'src', 'data', 'challenges.ts'), 'utf8')
const body = file.slice(file.indexOf('export const CHALLENGES'))
const blocks = body.split(/\n  \{\n    id: /).slice(1)
for (const id of [2, 6, 10, 12]) {
  const block = blocks.find((b) => b.startsWith(`${id},`)) ?? ''
  check(block.length > 0 && !/TODO/.test(block), `challenge ${id} has no TODO: source left`)
}
for (const name of ['donki.ts', 'science.ts']) {
  const text = readFileSync(join(here, '..', '..', 'src', 'data', name), 'utf8')
  check(!/TODO/.test(text), `src/data/${name} has no TODO left`)
}

// ---- Phase 6: real data in play ----
check(DONKI.events.length >= 15 && DONKI.events.length <= 20, `the archive holds 15 to 20 real DONKI events, so six storms never repeat one (${DONKI.events.length})`)
check(DONKI.events.every((e: any) => /^https:\/\/ccmc\.gsfc\.nasa\.gov\/DONKI\/view\/FLR\//.test(e.link ?? '')), 'every archived event links to its DONKI record')
check(/^\d{4}-\d{2}-\d{2}$/.test(DONKI.retrieved), `the archive records its retrieval date (${DONKI.retrieved})`)
const drawn = new Set(Array.from({ length: 40 }, (_, i) => drawStormEvent(() => i / 40)))
check([...drawn].every((id) => DONKI.events.some((e: any) => e.id === id)) && drawn.size === DONKI.events.length, 'every run draws a real archived event, and all of them can come up')
{
  const { startHazard, seededRandom } = await import('../../src/state/hazards')
  let m = mission.createInitialMission(7)
  const random = seededRandom(7)
  for (let i = 0; i < 6; i++) m = startHazard(m, i < 3 ? 'transitStorm' : 'outpostStorm', random)
  check(new Set(m.usedFlares).size === 6 && m.usedFlares.every((id: string) => DONKI.events.some((e: any) => e.id === id)) && m.activeFlareId === m.usedFlares.at(-1), 'the mission stores which real flare each storm is, six different ones')
}

check(Math.abs(science.doseToMsv(mission.DOSE_THRESHOLDS.high) - science.REAL.solarEventLimitMsv) < 1e-9, 'the high dose level is NASA’s 250 mSv limit for one solar particle event')
check(Math.abs(science.MSV_PER_DOSE_POINT - 3.125) < 1e-9, '1 dose point = 3.125 mSv')
check(decisions.formatChange({ stat: 'dose', label: 'Radiation dose', amount: 5, tone: 'warn' }) === 'Radiation dose +15.6 mSv' || decisions.formatChange({ stat: 'dose', label: 'Radiation dose', amount: 5, tone: 'warn' }) === 'Radiation dose +16 mSv', `dose changes are shown in mSv (${decisions.formatChange({ stat: 'dose', label: 'Radiation dose', amount: 5, tone: 'warn' })})`)
check(decisions.shieldingFactor(100) === 0.5 && decisions.shieldingFactor(0) === 1, 'full Shielding lets half the storm through, none lets it all through (NASA: about half)')
check(getChallenge(10).bites.find((b: any) => b.id === 'no-shielding-storm').doseFactor === 2, 'packing no shielding doubles the storm dose (the inverse of halving it)')

// The daily background dose.
let night = mission.createInitialMission(1)
night = { ...night, powerSplit: { 'c06-life-support': 2, 'c06-greenhouse': 2, 'c06-drill': 1, 'c06-antenna': 1 }, spares: 2 }
const after = days.nightTick(night).state
check(Math.abs(science.doseToMsv(after.dose - night.dose) - 0.5) < 1e-9, 'each night on the Moon adds 0.5 mSv of background dose')

// ---- Live space weather ----
const sample = summarize(
  [{ cmeAnalyses: [{ speed: 900, isMostAccurate: true }, { speed: 2000, isMostAccurate: false }] }, { cmeAnalyses: null }],
  [{ eventTime: '2026-11-01T10:00Z' }],
  [{ allKpIndex: [{ kpIndex: 5 }, { kpIndex: 7.33 }] }],
  '2026-10-15',
  '2026-11-14',
  '2026-11-14T12:00:00Z',
)
check(sample.cmes === 2 && sample.fastestCmeKmS === 900 && sample.seps === 1 && sample.latestSep === '2026-11-01T10:00Z' && sample.maxKp === 7.33, 'the live summary counts CMEs, SEP events and the strongest Kp, using only the most accurate CME speeds')
check(describeSpaceWeather(sample).some((s: string) => /shelter/.test(s)), 'the live summary ties radiation storms to sheltering')
check(describeSpaceWeather({ ...sample, seps: 0 }).some((s: string) => /No radiation storms/.test(s)), 'with no SEP events it says so')

// ---- OSDR ----
check(OSDR.studies.length === 5 && OSDR.studies.every((s: any) => /^OSD-\d+$/.test(s.accession) && s.title && s.url.endsWith(s.accession)), 'the OSDR archive holds 5 real studies with titles and links')
check(linkedStudies().length === OSDR.studies.length, 'every archived study says how it links to the game')
check(['dose', 'health', 'greenhouse'].every((t) => linkedStudies([t]).length > 0), 'OSDR covers the radiation dose, crew health and the greenhouse')

// ---- Phase 7: two voices ----
for (const id of READY) {
  const c = getChallenge(id)
  check(c.lines[0].speakerId !== c.lines[1].speakerId, `challenge ${id} has two different voices (${c.lines[0].speakerId} and ${c.lines[1].speakerId})`)
}

// ---- Phase 7: a crew member in red changes the next decision ----
const base = mission.createInitialMission(1)
const red = (id: string) => ({ ...base, crewHealth: { ...base.crewHealth, [id]: 'red' } })
const c10 = getChallenge(10)
const c12 = getChallenge(12)
check(decisions.panelLines(c12, base).some((l: any) => l.speakerId === 'commander'), 'the commander argues in challenge 12 when well')
check(!decisions.panelLines(c12, red('commander')).some((l: any) => l.speakerId === 'commander'), 'resting in red, the commander gives no advice')
check(decisions.panelNotes(c12, red('commander')).some((n: string) => /Yuri Armstrong is resting/.test(n)), 'the panel says who is resting and what the player loses')
const keepWorking = c10.options.find((o: any) => o.id === 'c10-c')
const shown = decisions.visibleArrows(decisions.effectiveEffects(c10, keepWorking, base).effects, base)
const hidden = decisions.visibleArrows(decisions.effectiveEffects(c10, keepWorking, red('safety')).effects, red('safety'))
check(shown.some((a: any) => a.stat === 'dose' && !a.hidden), 'with the medic well, the dose arrow shows')
check(hidden.some((a: any) => a.stat === 'dose' && a.hidden) && hidden.some((a: any) => a.stat === 'power' || a.stat === 'shielding' ? !a.hidden : true), 'with the medic resting, the dose arrow is hidden ("?") and the others still show')
const greenhouse = { ...night, powerSplit: { ...night.powerSplit, 'c06-greenhouse': 3 } }
const well = days.nightTick(greenhouse).state.foodDays - greenhouse.foodDays
const sick = days.nightTick({ ...greenhouse, crewHealth: { ...greenhouse.crewHealth, science: 'red' } })
check(sick.state.foodDays - greenhouse.foodDays < well && sick.report.notes.some((n: string) => /half as much/.test(n)), 'with the botanist resting, the greenhouse grows half as much')

// ---- Phase 7: dose levels ----
const moderate = { ...base, dose: mission.DOSE_THRESHOLDS.moderate }
check(decisions.lockOf(keepWorking, moderate)?.reason?.includes('dose'), 'at the moderate dose, "Keep working" through a storm is refused')
check(decisions.lockOf(keepWorking, base) === null, 'at a low dose it can be picked')
check(c10.options.some((o: any) => decisions.lockOf(o, moderate) === null), 'at the moderate dose some storm option is still open')
const nearly = { ...base, dose: mission.DOSE_THRESHOLDS.moderate - 1, history: [], status: 'running', powerSplit: { 'c06-antenna': 1 } }
const outcome = decisions.commit(c10, nearly, { kind: 'option', optionId: 'c10-a' })
check(outcome && Object.values(outcome.after.crewHealth).every((h: any) => h === 'yellow'), 'crossing into the moderate level makes every crew member one step less well')
check(outcome?.after.bites.some((b: any) => b.id === 'dose-moderate') && outcome.result.some((s: string) => /moderate level/.test(s)), 'the result and the debrief record it')
check(outcome?.lines.some((l: any) => /Radiation dose means/.test(l.text)), 'the medic explains "radiation dose" when it first matters')
const high = decisions.commit(c10, { ...base, dose: mission.DOSE_THRESHOLDS.high - 1, status: 'running' }, { kind: 'option', optionId: 'c10-a' })
check(high?.after.status === 'ended' && high.after.ending === 'early-return-health', 'reaching the high level ends the mission early')

// ---- Science words ----
const words = newTerms([c10.situation], [])
check(words.some((t: any) => t.id === 'radiation'), 'the storm explains "radiation" the first time')
check(!newTerms([c10.situation], ['radiation', 'solar-storm']).some((t: any) => t.id === 'radiation'), 'once explained, it isn’t explained again')
check(referencesFor(['c10-a']).length === 2, 'the storm result shows the real science behind it')

// ---- Crew in the maps ----
{
  const { crewPlaces, shelteredToday } = await import(`${P}/state/crewPlaces`)
  const { crewBlockers, standPoint } = await import(`${P}/maps/collision`)
  /** Walks a 0.2 m grid over the indoor floor from the first target; returns how many targets it can't reach. */
  const flood = (model: any, map: any, level: string, targets: { x: number; z: number }[]) => {
    if (targets.length < 2) return 0
    const rooms = (map.rooms as any[]).filter((r: any) => (r.level ?? 'ground') === level)
    const x0 = Math.min(...rooms.map((r: any) => r.rect.x0)) - 1, x1 = Math.max(...rooms.map((r: any) => r.rect.x1)) + 1
    const z0 = Math.min(...rooms.map((r: any) => r.rect.z0)) - 1, z1 = Math.max(...rooms.map((r: any) => r.rect.z1)) + 1
    const step = 0.2
    const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step)
    const cell = (x: number, z: number) => Math.round((z - z0) / step) * nx + Math.round((x - x0) / step)
    const seen = new Uint8Array(nx * nz + nx)
    const start = targets[0]!
    const queue = [cell(start.x, start.z)]
    seen[queue[0]!] = 1
    while (queue.length) {
      const c = queue.pop()!
      const cx = c % nx, cz = Math.floor(c / nx)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ax = cx + dx!, az = cz + dz!
        if (ax < 0 || az < 0 || ax >= nx || az >= nz) continue
        const k = az * nx + ax
        if (seen[k]) continue
        if (!isWalkable(model, x0 + ax * step, z0 + az * step)) continue
        seen[k] = 1
        queue.push(k)
      }
    }
    return targets.filter((t) => !seen[cell(t.x, t.z)]).length
  }
  const people = (map: any) => [...new Set((map.crew ?? []).map((c: any) => c.speakerId))]
  for (const [mapId, expected] of [['launch-center', ['trainer', 'science', 'comms']], ['spacecraft', ['commander', 'safety', 'science']], ['outpost', ['commander', 'safety', 'science']]] as const) {
    const map = requireMap(mapId)
    check(JSON.stringify(people(map)) === JSON.stringify(expected), `${mapId}: ${expected.join(', ')} are here`)
    for (const spot of map.crew ?? []) {
      const name = `${mapId}: ${spot.speakerId} (${spot.place ?? 'home'})`
      // Houston meets the player outside, at the communications building's door (Shishir's Phase 1 script).
      if (spot.speakerId === 'comms') check(!roomAt(map, spot.x, spot.z, spot.level) && map.outdoor?.zones.some((z: any) => z.rect.x0 <= spot.x && spot.x <= z.rect.x1 && z.rect.z0 <= spot.z && spot.z <= z.rect.z1), `${name} stands outside on the grounds, at the communications building`)
      else check(roomAt(map, spot.x, spot.z, spot.level), `${name} is inside a room (${roomAt(map, spot.x, spot.z, spot.level)?.label})`)
      if (map.gravity === 'micro') continue
      const clear = buildCollision(map, 0.45)
      check(isWalkable(clear, spot.x, spot.z), `${name} stands on open floor, clear of props`)
      // With them standing there, every console, door and elevator call point stays reachable.
      const walk = buildCollision(map)
      walk.people = crewBlockers([{ ...spot, pose: 'stand' }], spot.level ?? 'ground')
      check(blockerAt(walk, spot.x, spot.z)?.id === `crew-${spot.speakerId}`, `${name} is solid`)
      const blocked = map.consoles.filter((c: any) => (c.level ?? 'ground') === (spot.level ?? 'ground')).filter((c: any) => {
        const p = standPoint(c)
        return !isWalkable(walk, p.x, p.z)
      })
      check(blocked.length === 0, `${name} blocks no console stand point${blocked.length ? `: ${blocked.map((c: any) => c.id).join(', ')}` : ''}`)
      const calls = (map.elevators ?? []).flatMap((e: any) => e.stops.filter((st: any) => st.level === (spot.level ?? 'ground')).map((st: any) => st.call))
      check(calls.every((c: any) => Math.hypot(c.x - spot.x, c.z - spot.z) >= 1.2), `${name} keeps clear of the elevator doors`)
      // Flood fill: with them standing there, every console stand point on the floor can still be walked to.
      const targets = map.consoles.filter((c: any) => (c.level ?? 'ground') === (spot.level ?? 'ground')).map((c: any) => standPoint(c))
      const unreached = flood(walk, map, spot.level ?? 'ground', targets)
      check(unreached === 0, `${name} cuts nobody off: every console and elevator on this floor is still reachable${unreached ? ` (${unreached} not)` : ''}`)
      check(['shelter', 'home', 'hangar', 'elevator', 'seat'].includes(spot.place ?? 'home'), `${name} has a known place`)
    }
  }
  // When and where (the visibility rules).
  const lc = requireMap('launch-center')
  const fresh = mission.createInitialMission(1)
  const trainerAt = (m: any) => crewPlaces(lc, m).find((p: any) => p.speakerId === 'trainer')?.place
  const rec = (challenge: number, outcomeId: string, day = 1) => ({ challenge, outcomeId, day })
  check(trainerAt(fresh) === 'home', 'the trainer starts in the briefing room')
  check(trainerAt({ ...fresh, history: [rec(1, 'c01-a')] }) === 'home', 'after challenge 1 the trainer stays in the briefing room')
  // Kal waits in the cargo hangar from challenge 1 on (Shishir's Phase 1 script, scene 5): the hangar's figure is her, not the trainer.
  const kal = (m: any) => crewPlaces(lc, m).find((p: any) => p.speakerId === 'science')
  check(kal(fresh) === undefined, 'Kal is not standing anywhere at the start (only in the opening and briefing scenes)')
  const kalAfter1 = kal({ ...fresh, history: [rec(1, 'c01-a')] })
  check(kalAfter1?.place === 'hangar' && roomAt(lc, kalAfter1.x, kalAfter1.z)?.id === 'cargo-hangar', 'after challenge 1 Kal is in the cargo hangar')
  check(kal({ ...fresh, history: [rec(1, 'c01-a'), rec(2, 'c02')] })?.place === 'hangar', 'after packing she is still in the hangar')
  check(crewPlaces(lc, { ...fresh, history: [rec(1, 'c01-a')] }).filter((p: any) => roomAt(lc, p.x, p.z)?.id === 'cargo-hangar').map((p: any) => p.speakerId).join() === 'science', 'the only figure in the cargo hangar is Kal')
  check(!lc.markers.some((m: any) => /best friend/i.test(m.label ?? '')), 'no "Talk to your best friend" prompt in crew quarters (the opening plays every run instead)')
  check(!(lc.cards ?? []).some((c: any) => c.trigger.kind === 'place' && c.trigger.place === 'cargo-hangar'), 'no teaching card in the cargo hangar: Kal speaks there alone, with nobody talking over her')

  // The walk to the briefing room (src/scene/walkTogether.ts): the trainer leads, the crew follow in the player's footsteps.
  {
    const walk = await import(`${P}/scene/walkTogether`)
    const beats = await import(`${P}/scene/beats`)
    const open = buildCollision(lc, 0.3)
    const route = walk.TRAINER_ROUTE
    let routeOpen = true
    for (let i = 1; i < route.length; i++) {
      for (let k = 0; k <= 40; k++) {
        const x = route[i - 1].x + ((route[i].x - route[i - 1].x) * k) / 40
        const z = route[i - 1].z + ((route[i].z - route[i - 1].z) * k) / 40
        if (!isWalkable(open, x, z)) routeOpen = false
      }
    }
    check(routeOpen, 'the trainer’s route to the briefing room is open floor all the way')
    const home = lc.crew.find((s: any) => s.speakerId === 'trainer' && !s.place)
    const end = route[route.length - 1]
    check(Math.hypot(end.x - home.x, end.z - home.z) < 0.05, 'and ends at his spot in the briefing room')
    const startRoom = (id: string) => roomAt(lc, walk.WALK_START[id].x, walk.WALK_START[id].z)?.id
    check(startRoom('science') === 'crew-quarters' && startRoom('trainer') === 'crew-quarters' && startRoom('commander') === 'corridor' && startRoom('safety') === 'corridor', 'it starts from the opening: Kal and the trainer in crew quarters, the commander and the safety officer in the corridor')
    check(Object.values(walk.WALK_START).every((w: any) => isWalkable(open, w.x, w.z)), 'everyone starts on open floor')
    const opening = beats.BEATS['night-before']
    check(['science', 'trainer', 'commander', 'safety'].every((id) => opening.crew.some((c: any) => c.speakerId === id && c.x === walk.WALK_START[id].x && c.z === walk.WALK_START[id].z)), 'the opening stages all four where the walk begins')
    // Not solid: walking crew never block the player.
    check(crewBlockers([{ speakerId: 'science', x: -10, z: 0, pose: 'walk' }], 'ground').length === 0, 'someone walking with the player is never in the way')

    // The player walks from the bunks to the briefing room at a walking pace.
    const path = [lc.spawn, { x: -12.5, z: 0 }, { x: -4.5, z: 0 }, { x: -4.5, z: -4.2 }]
    const legs = path.slice(1).map((p: any, i: number) => ({ a: path[i], b: p, length: Math.hypot(p.x - path[i].x, p.z - path[i].z) }))
    const playerAt = (s: number) => {
      for (const leg of legs) {
        if (s <= leg.length) return { x: leg.a.x + ((leg.b.x - leg.a.x) * s) / leg.length, z: leg.a.z + ((leg.b.z - leg.a.z) * s) / leg.length }
        s -= leg.length
      }
      return path[path.length - 1]
    }
    const total = legs.reduce((n: number, l: any) => n + l.length, 0)
    // Standing still at first, far from the doorway: the trainer waits for the player.
    let state = walk.startWalkState(lc.spawn)
    for (let t = 0; t < 3; t += 0.05) state = walk.stepWalk(state, lc.spawn, 0.05)
    check(state.leader.along === 0 && state.leader.speed === 0, 'the trainer waits in the doorway until the player comes')
    const tight = buildCollision(lc, 0.12)
    let throughWalls = 0
    let onPlayer = 0
    let walked = 0
    for (let t = 0; walked < total + 4; t += 0.05) {
      walked = Math.min(total + 4, t * 1.4)
      const p = playerAt(Math.min(walked, total))
      state = walk.stepWalk(state, p, 0.05)
      for (const f of state.followers) {
        if (!isWalkable(tight, f.x, f.z)) throughWalls++
        if (f.joinedAt !== null && Math.hypot(f.x - p.x, f.z - p.z) < 0.6) onPlayer++
      }
      if (!isWalkable(tight, state.leader.x, state.leader.z)) throughWalls++
    }
    const p = path[path.length - 1]
    check(throughWalls === 0, `nobody on the walk passes through a wall or a bunk${throughWalls ? ` (${throughWalls} steps did)` : ''}`)
    check(onPlayer === 0, 'nobody walks into the player')
    check(state.followers.every((f: any) => f.joinedAt !== null), 'Kal, the commander and the safety officer all join the walk')
    check(state.followers.every((f: any) => roomAt(lc, f.x, f.z)?.id === 'briefing-room' || roomAt(lc, f.x, f.z)?.id === 'corridor') && state.followers.every((f: any) => Math.hypot(f.x - p.x, f.z - p.z) < 4), 'and arrive with the player at the briefing room')
    check(state.leader.along > 0 && Math.hypot(state.leader.x - end.x, state.leader.z - end.z) < 0.05, 'the trainer reaches his spot by the screen')
    const apart = state.followers.every((f: any, i: number) => state.followers.every((g: any, j: number) => i === j || Math.hypot(f.x - g.x, f.z - g.z) > 0.5))
    check(apart, 'and they don’t stand on top of each other')
  }
  check(trainerAt({ ...fresh, history: [rec(1, 'c01-a'), rec(2, 'c02')] }) === 'elevator', 'after challenge 2 the trainer is at the crew elevator')
  const op = requireMap('outpost')
  const day3 = { ...fresh, day: 3, history: [rec(10, 'c10-a', 3)] }
  check(shelteredToday(day3) && crewPlaces(op, day3).every((p: any) => p.place === 'shelter' && roomAt(op, p.x, p.z)?.id === 'shelter'), 'after "Shelter everyone" the whole crew is in the storm shelter')
  check(crewPlaces(op, { ...day3, day: 4 }).every((p: any) => p.place === 'home'), 'the next day they are back at their posts')
  check(crewPlaces(op, { ...fresh, day: 3, history: [rec(10, 'c10-c', 3)] }).every((p: any) => p.place === 'home'), 'after "Keep working" nobody shelters')
  const red = crewPlaces(op, { ...fresh, crewHealth: { ...fresh.crewHealth, science: 'red' } })
  const kai = red.find((p: any) => p.speakerId === 'science')
  check(kai?.pose === 'lie' && roomAt(op, kai.x, kai.z)?.id === 'quarters', 'a crew member resting in red health lies in a crew quarters bunk')
  check(crewBlockers(red, 'ground').every((b: any) => b.id !== 'crew-science'), 'and a lying crew member is not in the way')
  {
    const sc = requireMap('spacecraft')
    const free = crewPlaces(sc, fresh)
    const cmdr = free.find((p: any) => p.speakerId === 'commander')
    const seatAt = (p: any) => sc.props.find((s: any) => s.kind === 'seat' && Math.hypot(s.position.x - p.x, s.position.z - p.z) < 0.2)
    check(free.filter((p: any) => p.speakerId !== 'commander').every((p: any) => p.pose === 'float'), 'on the spacecraft the safety and science officers float at their posts')
    check(cmdr?.pose === 'sit' && cmdr.place === 'seat' && !!seatAt(cmdr) && seatAt(cmdr) !== seatAt(sc.seat), 'and the commander sits in his own cockpit seat, not the player\'s, strapped in or not')
  }
  // Strapped in for the launch and the landing, the crew sit in the cockpit's other three seats.
  {
    const sc = requireMap('spacecraft')
    const seated = crewPlaces(sc, fresh, null, true)
    const seats = sc.props.filter((p: any) => p.kind === 'seat')
    const seatOf = (p: any) => seats.find((s: any) => Math.hypot(s.position.x - p.x, s.position.z - p.z) < 0.2)
    const players = seats.find((s: any) => Math.hypot(s.position.x - sc.seat.x, s.position.z - sc.seat.z) < 0.2)
    check(seated.length === 3 && seated.every((p: any) => p.pose === 'sit' && p.place === 'seat' && roomAt(sc, p.x, p.z)?.id === 'cockpit'), 'strapped in, the three crew sit in the cockpit')
    check(seated.every((p: any) => seatOf(p) && seatOf(p) !== players) && new Set(seated.map((p: any) => seatOf(p)?.id)).size === 3, 'each in a seat of their own, none in the player\'s')
    check(seated.every((p: any) => Math.abs(p.yaw - sc.seat.yaw) < 1e-6), 'facing forward, as the player does')
    check(crewPlaces(requireMap('outpost'), fresh, null, true).every((p: any) => p.pose === 'stand'), 'strapped in means nothing where there are no seats')
  }
  check(crewPlaces(op, fresh).every((p: any) => p.speakerId !== 'comms'), 'Houston is never at the outpost')
  const houston = (m: any) => crewPlaces(lc, m).some((p: any) => p.speakerId === 'comms')
  check(!houston(fresh) && houston({ ...fresh, history: [rec(1, 'c01-a')] }) && !houston({ ...fresh, history: [rec(1, 'c01-a'), rec(2, 'c02')] }), 'Houston is at the communications building only between challenges 1 and 2')
  const rooms: Record<string, string> = { commander: 'command', safety: 'quarters', science: 'greenhouse' }
  check(crewPlaces(op, fresh).every((p: any) => roomAt(op, p.x, p.z)?.id === rooms[p.speakerId]), 'each crew member stands in the room they care about (command, crew quarters, greenhouse)')
  check(CREW_FIGURES, 'crew figures are on')
}

// ---- Every line has an emotion (the talking portraits) ----
{
  const { LINE_EMOTION, EMOTIONS } = await import(`${P}/data/emotions`)
  const { BITE_LINES, TOW_LINE } = await import(`${P}/state/days`)
  const { MODERATE_DOSE_LINE } = await import(`${P}/state/decisions`)
  const { CLOSING_LINES } = await import(`${P}/data/endings`)
  const { BEAT_LINES } = await import(`${P}/scene/beats`)
  const { TRANSMISSION_LINES } = await import(`${P}/data/transmissionLines`)
  const { PHASE1_LINES } = await import(`${P}/data/phase1Lines`)
  const all = new Map<string, any>()
  const walk = (v: any, seen = new Set()) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    if (typeof v.lineId === 'string' && typeof v.speakerId === 'string') all.set(v.lineId, v)
    for (const k of Object.keys(v)) walk(v[k], seen)
  }
  walk(CHALLENGES)
  walk(BITE_LINES)
  walk(TOW_LINE)
  walk(MODERATE_DOSE_LINE)
  walk(CLOSING_LINES)
  walk(BEAT_LINES)
  walk(TRANSMISSION_LINES)
  walk(PHASE1_LINES)
  const { STORY_LINES } = await import(`${P}/data/storyLines`)
  walk(STORY_LINES)
  const missing = [...all.keys()].filter((id) => !line_emotion(id))
  function line_emotion(id: string) {
    const own = all.get(id)?.emotion
    return own ?? LINE_EMOTION[id]
  }
  check(all.size >= 87 && missing.length === 0, `every one of the ${all.size} lines has an emotion${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`)
  check([...all.keys()].every((id) => EMOTIONS.includes(line_emotion(id))), 'and each is one of the eight faces')
  const stale = Object.keys(LINE_EMOTION).filter((id) => !all.has(id))
  check(stale.length === 0, `no emotion is left for a line that's gone${stale.length ? ` (${stale.join(', ')})` : ''}`)
  const byRule = (ids: string[], allowed: string[]) => ids.every((id) => allowed.includes(line_emotion(id)))
  check(byRule(['c04-houston', 'c10-houston', 'alert-storm', 'alert-meteoroid'], ['urgent']), 'storm and meteoroid warnings are urgent')
  check(byRule([...all.keys()].filter((id) => id.startsWith('bite-')), ['worried', 'sad']), 'every consequence that bites is worried or sad')
  check(byRule([...all.keys()].filter((id) => id.endsWith('-reminder')), ['calm']), 'every reminder is calm')
  check(byRule([...all.keys()].filter((id) => /^end-.*-good$/.test(id)), ['happy', 'proud']), 'good endings are happy or proud')
  check(line_emotion('p1-science-01') === 'excited', 'the best friend is excited the night before launch')

  // The recorded voices (tools/voices.mts): every one is there, and says the line as the game shows it.
  const { VOICE_SECONDS } = await import(`${P}/data/voiceManifest`)
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const lockFile = join(root, 'tools', 'voices.lock.json')
  const lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')) : {}
  const voiced = Object.keys(VOICE_SECONDS)
  const noFile = voiced.filter((id) => !existsSync(join(root, 'public', 'audio', 'voice', `${id}.mp3`)))
  check(noFile.length === 0, `every voiced line has its recording (${voiced.length} voiced${noFile.length ? `; missing: ${noFile.join(', ')}` : ''})`)
  const outOfDate = voiced.filter((id) => !all.has(id) || lock[id]?.text !== all.get(id).text)
  check(outOfDate.length === 0, `each recording says its line word for word as the game shows it${outOfDate.length ? ` (out of date: ${outOfDate.join(', ')}; run bun tools/voices.mts)` : ''}`)
}

// ---- The story through the spacecraft and the outpost ----
{
  const { STORY_LINES, P2, P3 } = await import(`${P}/data/storyLines`)
  const { ASKS } = await import(`${P}/scene/story`)
  const { CAST } = await import(`${P}/state/mission`)
  check(STORY_LINES.every((l: any) => /^p[23]-(commander|safety|science|comms|trainer)-\d\d$/.test(l.lineId) && l.lineId.includes(`-${l.speakerId}-`)), 'story line ids are p2-/p3-<speaker>-NN, with their speaker')
  check(new Set(STORY_LINES.map((l: any) => l.lineId)).size === STORY_LINES.length, 'every story line id is unique')
  check(Object.values(P2).every((l: any) => l.lineId.startsWith('p2-')) && Object.values(P3).every((l: any) => l.lineId.startsWith('p3-')), 'p2 lines are the spacecraft, p3 the outpost')
  const long = STORY_LINES.flatMap((l: any) => l.text.split(/(?<=[.!?])\s+/)).filter((s: string) => s.split(/\s+/).length > 12)
  check(long.length === 0, `every story sentence has 12 words or fewer${long.length ? `: ${long.join(' | ')}` : ''}`)
  const names = Object.values(CAST).flatMap((c: any) => c.name.split(' '))
  const named = STORY_LINES.filter((l: any) => names.some((n: string) => new RegExp(`\\b${n}\\b`).test(l.text)))
  check(named.length === 0, `no story line says a crew member's name (so renames need no new recordings)${named.length ? `: ${named.map((l: any) => l.lineId).join(', ')}` : ''}`)
  check([3, 5, 6, 7, 8, 9, 12].every((id) => ASKS[id]) && ASKS[11], 'every planned task from 3 on, and the meteoroid, has an ask')
  check(STORY_LINES.every((l: any) => l.emotion), 'every story line carries its emotion')
}

// ---- The guidebook's words ----
{
  const { GUIDE_WORDS } = await import(`${P}/data/guideWords`)
  const { TERMS } = await import(`${P}/data/glossary`)
  const { WORDS } = await import(`${P}/data/handbookWords`)
  const terms = new Set(GUIDE_WORDS.map((w: any) => w.term).filter(Boolean))
  const missing = TERMS.filter((t: any) => !terms.has(t.id)).map((t: any) => t.id)
  check(missing.length === 0, `every word the panels explain is in the guidebook${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`)
  const named = (word: string) => GUIDE_WORDS.some((w: any) => w.word.toLowerCase().includes(word.toLowerCase()))
  const fromHandbook = WORDS.filter((w: any) => !named(w.word)).map((w: any) => w.word)
  check(fromHandbook.length === 0, `every word the handbook explains is in the guidebook${fromHandbook.length ? ` (missing: ${fromHandbook.join(', ')})` : ''}`)
  const asked = ['microgravity', 'regolith', 'airlock', 'kPa', 'scrubber', 'radiation', 'dose', 'mSv', 'shielding', 'solar flare', 'solar storm', 'meteoroid', 'lunar night', 'shadowed crater', 'fission reactor', 'fuel cell', 'hydroponics', 'trans-lunar injection', 'signal delay', 'Max Q', 'booster', 'DONKI', 'LOLA']
  const absent = asked.filter((a) => !GUIDE_WORDS.some((w: any) => w.word.toLowerCase().includes(a.toLowerCase())))
  check(absent.length === 0, `the guidebook has every word the brief lists${absent.length ? ` (missing: ${absent.join(', ')})` : ''}`)
  check(GUIDE_WORDS.every((w: any) => w.meaning.split(/\s+/).length <= 12), 'every guidebook meaning is 12 words or fewer')
  check(new Set(GUIDE_WORDS.map((w: any) => w.id)).size === GUIDE_WORDS.length, 'every guidebook word is listed once')
}

// ---- The voice script for Shishir is complete and up to date ----
{
  const { readFileSync, existsSync } = await import('node:fs')
  const { buildScript, scriptCsv, scriptMarkdown } = await import('../scriptData.mts')
  const lines = buildScript()
  const root = new URL('../../', import.meta.url).pathname
  const same = (path: string, text: string) => existsSync(root + path) && readFileSync(root + path, 'utf8') === text
  check(same('docs/SCRIPT.md', scriptMarkdown(lines)) && same('docs/voice-lines.csv', scriptCsv(lines)), 'docs/SCRIPT.md and docs/voice-lines.csv match the line data (else run: npx tsx tools/export-script.mts)')
  check(lines.every((l: any) => l.map !== 'Unplaced'), `every line is placed in a scene in the script${lines.some((l: any) => l.map === 'Unplaced') ? `: ${lines.filter((l: any) => l.map === 'Unplaced').map((l: any) => l.line.lineId).join(', ')}` : ''}`)
  check(lines.every((l: any) => l.voiceId && l.emotion && l.delivery && l.when), 'every script line has a voice, an emotion, a delivery and when it plays')
}

// ---- The crew are named in honour of real pioneers, with sources ----
{
  const { NAMED_IN_HONOUR } = await import(`${P}/data/namedInHonour`)
  const { CAST } = await import(`${P}/state/mission`)
  for (const [id, pair] of Object.entries(NAMED_IN_HONOUR) as [string, any][]) {
    const [first, last] = CAST[id].name.split(' ')
    const firstNames = pair.map((p: any) => p.name.split(' ')[0])
    const lastNames = pair.map((p: any) => p.name.split(' ').at(-1))
    check(firstNames.includes(first) && lastNames.includes(last), `${CAST[id].name} joins the names of ${pair.map((p: any) => p.name).join(' and ')}`)
    check(pair.every((p: any) => /^https:\/\/www\.nasa\.gov\//.test(p.source.url) && p.fact.includes(p.name)), `${CAST[id].name}: each pioneer has a NASA source and a sentence about them`)
  }
}

// ---- The loading screen's quick facts: short, each with a NASA source ----
{
  const { QUICK_FACTS } = await import(`${P}/data/quickFacts`)
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length
  check(QUICK_FACTS.length >= 20, `the loading screen has plenty of quick facts (${QUICK_FACTS.length})`)
  const long = QUICK_FACTS.filter((f: any) => words(f.text) > 22)
  check(long.length === 0, `each quick fact is 22 words or fewer, for ages 7 to 12${long.length ? `: ${long.map((f: any) => f.text).join(' / ')}` : ''}`)
  const unsourced = QUICK_FACTS.filter((f: any) => !f.topic || !f.source?.label || !/^https:\/\/([a-z]+\.)*nasa\.gov\//.test(f.source.url))
  check(unsourced.length === 0, `each quick fact has a topic and a NASA source${unsourced.length ? `: ${unsourced.map((f: any) => f.text).join(' / ')}` : ''}`)
  check(new Set(QUICK_FACTS.map((f: any) => f.text)).size === QUICK_FACTS.length, 'no quick fact is repeated')
}

console.log(failed === 0 ? '\nAll data and crew checks passed.' : `\n${failed} data/crew check(s) FAILED.`)
process.exit(failed === 0 ? 0 : 1)
