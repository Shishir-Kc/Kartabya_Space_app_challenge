/**
 * Whole runs, headless: `npx tsx tools/checks/run.mts`.
 *
 * The planned mission is nine tasks (1, 2, 3, 5, 6, 7, 8, 9, 12); solar
 * storms in transit (4), solar storms at the outpost (10) and meteoroid
 * hits (11) are hazards that come at random, 0 to 3 of each.
 *
 * Plays whole runs with keys only for several strategies, each with a set
 * list of hazards so its ending is known, and checks all four endings are
 * reachable. Also: every bite fires when its cause is set and not otherwise,
 * the hazard clock (none, maximum, seeded chance, the grace time, spacing,
 * the cap, quiet moments, a different real flare every storm), the gates
 * (boarding, landing, the ice, the lunar night), the daily tick, the ice and
 * the tow, the signal delay, and five Try again runs.
 *
 * Walking, the launch and the landing need the 3D scene; here the player is
 * moved between maps directly.
 */
const g = globalThis as any
const stored = new Map<string, string>()
g.window = {
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  },
  matchMedia: () => ({ matches: false }),
  location: { search: '' },
}
g.document = { documentElement: { dataset: {} }, pointerLockElement: null, exitPointerLock() {} }

const P = '../../src'
const { getChallenge, challengeCleared } = await import(`${P}/data/challenges`)
const { DONKI, stormSeverity } = await import(`${P}/data/donki`)
const archive = (await import(`${P}/data/donki-archive.json`)).default
const mission = await import(`${P}/state/mission`)
const decisions = await import(`${P}/state/decisions`)
const days = await import(`${P}/state/days`)
const hazards = await import(`${P}/state/hazards`)
const { useGame } = await import(`${P}/state/store`)
const panel = await import(`${P}/scene/challenges`)
// The task banner's step (src/scene/objective.ts).
const objective = await import(`${P}/scene/objective`)
const stepNow = (): string | undefined => objective.currentObjective()?.step
const run = await import(`${P}/scene/run`)
const session = await import(`${P}/scene/session`)
const { lineListenerCount, onLine, currentRadioDelay } = await import(`${P}/state/lines`)
const { REAL, radioDelaySeconds, STORMS_PER_GAME_MINUTE } = await import(`${P}/data/science`)
const { getReference } = await import(`${P}/data/sources`)
const transmissions = await import(`${P}/state/transmissions`)
const sequences = await import(`${P}/scene/sequences`)

// On the Moon the ending plays as a short scene first. Headless there is no
// frame loop, so note which endings started one and skip it straight away.
const endingScenes: string[] = []
useGame.subscribe((state: any, before: any) => {
  if (state.sequence?.id === 'ending' && before.sequence?.id !== 'ending') {
    endingScenes.push(state.mission.ending)
    sequences.skipSequence()
  }
})

let failed = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed++
}
const game = () => useGame.getState()
const press = (...codes: string[]) => codes.forEach((code) => panel.challengeKey(code))
const heard: string[] = []
const delays = new Map<string, number>()
onLine((event: any) => {
  heard.push(event.lineId)
  delays.set(event.lineId, event.delaySeconds ?? 0)
})

// ------------------------------------------------------------ the DONKI data
check(archive.events.length >= 15 && archive.events.length <= 20, `the archive has 15 to 20 real events (${archive.events.length})`)
check(['C', 'M', 'X'].every((c) => archive.events.some((e: any) => e.classLetter === c)), 'events of every strength: C, M and X')
check(archive.events.some((e: any) => e.sep), 'some flares were followed by energetic particles (SEP)')
check(
  archive.events.every((e: any) => /^\d{4}-\d\d-\d\dT[\d:]+-FLR-\d+$/.test(e.id) && /^[CMX]\d+(\.\d+)?$/.test(e.classType) && e.link?.includes('DONKI')),
  'every event has a real DONKI id, class and link',
)
check(archive.counts?.['2024']?.SEP === REAL.sepEvents2024 && archive.counts?.['2024']?.M + archive.counts?.['2024']?.X === REAL.flaresMX2024, `the storm rate uses DONKI’s real 2024 count of radiation storms (SEP events: ${REAL.sepEvents2024}), not all ${REAL.flaresMX2024} M and X flares`)
{
  let m = mission.createInitialMission(5)
  const random = hazards.seededRandom(5)
  for (let i = 0; i < 6; i++) m = hazards.startHazard(m, 'outpostStorm', random)
  const withSep = m.usedFlares.filter((id: string) => DONKI.events.find((e: any) => e.id === id)?.sep).length
  check(withSep === Math.min(6, DONKI.events.filter((e: any) => e.sep).length), `storms draw real flares that sent out a radiation storm first (${withSep} of 6 had a linked SEP)`)
}
{
  const x = DONKI.events.find((e: any) => e.classLetter === 'X' && e.sep)
  const c = DONKI.events.find((e: any) => e.classLetter === 'C')
  check(stormSeverity(x).factor > stormSeverity(c).factor, 'a bigger flare makes a bigger storm')
}

// ------------------------------------------------------------- a whole run
type Key = 1 | 2 | 3
interface Strategy {
  name: string
  power: Key
  /** Supplies, shielding, power gear, spares. */
  cargo: [number, number, number, number]
  scrubber: Key
  site: Key
  /** Life support, greenhouse, drill, antenna. */
  base: [number, number, number, number]
  greenhouse: Key
  rest: Key
  ice: Key
  night: Key
  /** The hazards this run meets, and how each is answered (in order). */
  transit: (Key | 'timeout')[]
  storms: (Key | 'timeout')[]
  meteoroids: Key[]
}

/** Places a split with keys; any blocks left over go to the first, then the third bucket. */
function placeSplit(units: number[]) {
  units.forEach((n, i) => {
    press(`Digit${i + 1}`)
    for (let k = 0; k < n; k++) press('Equal')
  })
  for (const bucket of [1, 3]) {
    press(`Digit${bucket}`)
    for (let k = 0; k < 10; k++) press('Equal')
  }
}

/** Continue, through a shelter fade and a night card if there is one. */
function continueOn() {
  press('Enter')
  const transition = game().transition
  if (transition) session.finishTransition(transition.after)
  if (game().night) run.runKey('Enter')
}

/** Opens a task and picks an option (the next one if it's locked), commits and continues. */
function decide(id: number, key: Key) {
  if (game().afterword) return
  panel.openDecision(id)
  if (!game().challenge) return
  for (const k of [key, 1, 2, 3]) {
    press(`Digit${k}`, 'Enter')
    if (game().challenge?.stage === 'result') break
  }
  continueOn()
}

/** A hazard happens now and is answered (a storm can be left to time out). */
function meet(kind: string, answer: Key | 'timeout') {
  if (game().afterword) return
  run.triggerHazard(kind as any, 1000)
  const opened = game().challenge
  if (!opened) return
  if (answer === 'timeout') panel.tickChallenge(opened.deadline! + 1)
  else {
    for (const k of [answer, 1, 2, 3]) {
      press(`Digit${k}`, 'Enter')
      if (game().challenge?.stage === 'result') break
    }
  }
  continueOn()
}

/** The whole run with keys only, the hazards met at their places. */
function play(strategy: Strategy, seed = 7) {
  run.setHazardMode('none')
  run.tryAgain()
  // A fixed seed: the same real flares every time, so each strategy's ending is repeatable.
  useGame.setState({ mission: { ...game().mission, seed } })
  run.resetStorm()
  decide(1, strategy.power)
  panel.openDecision(2)
  placeSplit(strategy.cargo)
  press('Enter')
  continueOn()

  useGame.setState({ mapId: 'spacecraft', mode: 'playing', focus: null })
  decide(3, strategy.scrubber)
  for (const answer of strategy.transit) meet('transitStorm', answer)
  decide(5, strategy.site)

  useGame.setState({ mapId: 'outpost', mode: 'playing', focus: null })
  if (!game().afterword) {
    panel.openDecision(6)
    placeSplit(strategy.base)
    press('Enter')
    continueOn()
  }
  decide(7, strategy.greenhouse)
  decide(9, strategy.rest)
  for (const answer of strategy.storms) meet('outpostStorm', answer)
  decide(8, strategy.ice)
  for (const answer of strategy.meteoroids) meet('meteoroid', answer)
  decide(12, strategy.night)
  return { mission: game().mission, afterword: game().afterword }
}

const STRATEGIES: (Strategy & { expect: string })[] = [
  {
    name: 'careful (reactor, spares, shelter, rest, hibernate), one of each hazard',
    power: 3,
    cargo: [3, 2, 0, 2],
    scrubber: 1,
    site: 3,
    base: [2, 2, 1, 1],
    greenhouse: 2,
    rest: 1,
    ice: 1,
    night: 1,
    transit: [1],
    storms: [1],
    meteoroids: [1],
    expect: 'outpost-thrives',
  },
  {
    name: 'balanced (reactor, two spares, shelter, ice trial, reduce activity), two storms',
    power: 3,
    cargo: [2, 2, 1, 2],
    scrubber: 2,
    site: 3,
    base: [2, 2, 1, 1],
    greenhouse: 2,
    rest: 2,
    ice: 2,
    night: 3,
    transit: [1],
    storms: [1],
    meteoroids: [],
    expect: 'mission-complete',
  },
  {
    name: 'solar only, no shielding, keep working in the storms',
    power: 1,
    cargo: [6, 0, 4, 0],
    scrubber: 2,
    site: 3,
    base: [2, 2, 0, 2],
    greenhouse: 2,
    rest: 3,
    ice: 1,
    night: 2,
    transit: [3],
    storms: [3],
    meteoroids: [],
    expect: 'early-return-health',
  },
  {
    name: 'greedy (no supplies, nothing planted, dark greenhouse), no hazards',
    power: 3,
    cargo: [0, 3, 4, 0],
    scrubber: 2,
    site: 3,
    base: [1, 0, 3, 2],
    greenhouse: 3,
    rest: 2,
    ice: 3,
    night: 2,
    transit: [],
    storms: [],
    meteoroids: [],
    expect: 'early-return-supplies',
  },
]

const describe = (m: any) =>
  `${m.ending} on day ${m.day} (power ${m.meters.power}, life ${m.meters.lifeSupport}, shield ${m.meters.shielding}, food ${m.foodDays}, dose ${m.dose.toFixed(1)}, health ${Object.values(m.crewHealth).join('/')}, hazards ${m.hazards.transitStorm}/${m.hazards.outpostStorm}/${m.hazards.meteoroid})`

const endings = new Set<string>()
for (const strategy of STRATEGIES) {
  endingScenes.length = 0
  const result = play(strategy)
  const m = result.mission
  endings.add(m.ending)
  console.log(`  ${strategy.name}: ${describe(m)}`)
  check(m.status === 'ended' && m.ending === strategy.expect, `${strategy.name} ends in ${strategy.expect}`)
  check(endingScenes.length === 1 && endingScenes[0] === m.ending, `${strategy.name}: its ending scene plays once, then is skippable`)
  check(game().sequence === null, `${strategy.name}: after the scene the cinematic is over`)
  check(result.afterword === 'ending', `${strategy.name}: the ending card shows`)
  run.runKey('Enter')
  check(game().afterword === 'debrief', `${strategy.name}: Enter goes on to the handbook`)
  check(m.log.every((s: any) => s.power >= 0 && s.power <= 100 && s.foodDays >= 0), `${strategy.name}: the meters are logged over time, within bounds`)
}
check(endings.size === 4, `all four endings are reachable over the full run (${[...endings].join(', ')})`)
{
  const full = play({ ...STRATEGIES[0]!, transit: [], storms: [], meteoroids: [] }).mission
  check([1, 2, 3, 5, 6, 7, 8, 9, 12].every((id) => mission.isDone(full, id)) && ![4, 10, 11].some((id) => mission.isDone(full, id)), 'with no hazards a run plays the nine planned tasks, and nothing else')
  check(full.status === 'ended' && full.ending !== null, 'and still reaches an ending')
}

// ------------------------------------------------------------------ bites
const baseline: Strategy = {
  name: 'baseline',
  power: 2,
  cargo: [4, 3, 1, 1],
  scrubber: 2,
  site: 3,
  base: [2, 2, 1, 1],
  greenhouse: 2,
  rest: 1,
  ice: 1,
  night: 1,
  transit: [1],
  storms: [1],
  meteoroids: [2],
}
const BITES: { id: string; cause: Partial<Strategy>; line?: string }[] = [
  { id: 'solar-night', cause: { power: 1 }, line: 'bite-solar-night' },
  { id: 'no-shielding-storm', cause: { cargo: [4, 0, 4, 1] }, line: 'bite-no-shielding' },
  { id: 'no-shielding-transit', cause: { cargo: [4, 0, 4, 1] }, line: 'bite-no-shielding-transit' },
  { id: 'few-supplies', cause: { cargo: [1, 3, 4, 1], base: [2, 0, 2, 2] }, line: 'bite-few-supplies' },
  { id: 'no-spares-pump', cause: { cargo: [4, 3, 2, 0] }, line: 'bite-no-spares' },
  { id: 'no-antenna-storm', cause: { base: [2, 2, 2, 0] }, line: 'bite-no-antenna' },
  { id: 'greenhouse-dark', cause: { base: [3, 0, 1, 2] } },
  { id: 'worked-in-storm', cause: { storms: [3] }, line: 'bite-worked-in-storm' },
  { id: 'transit-dose-storm', cause: { transit: [3] }, line: 'bite-transit-dose' },
  { id: 'pushed-on', cause: { rest: 3 }, line: 'bite-pushed-on' },
  { id: 'skipped-planting', cause: { greenhouse: 3 }, line: 'bite-skipped-planting' },
  { id: 'rationing', cause: { ice: 3 }, line: 'bite-rationing' },
]
{
  heard.length = 0
  const clean = play(baseline).mission
  const fired = clean.bites.filter((b: any) => BITES.some((x) => x.id === b.id)).map((b: any) => b.id)
  check(fired.length === 0 && !heard.some((id) => id.startsWith('bite-')), `a careful run triggers no bite and no bite line (${fired.join(', ') || 'none'})`)
}
for (const bite of BITES) {
  heard.length = 0
  const m = play({ ...baseline, ...bite.cause, name: bite.id }).mission
  const record = m.bites.find((b: any) => b.id === bite.id)
  check(!!record, `${bite.id} fires when its cause is set`)
  if (bite.line) check(heard.includes(bite.line), `${bite.id}: its crew line (${bite.line}) is spoken`)
}
{
  const a = play({ ...baseline, power: 1 }).mission
  const b = play({ ...baseline, power: 3 }).mission
  check(a.meters.power < b.meters.power, `the lunar night hits a solar-only base harder than a reactor (${a.meters.power} vs ${b.meters.power})`)
  const one = play({ ...baseline, storms: [2] }).mission
  const three = play({ ...baseline, storms: [2, 2, 2] }).mission
  check(three.dose > one.dose, `repeated storms add up: three storms give more dose than one (${three.dose.toFixed(1)} vs ${one.dose.toFixed(1)})`)
  const planted = play({ ...baseline, greenhouse: 1 }).mission
  const skipped = play({ ...baseline, greenhouse: 3 }).mission
  check(planted.foodDays > skipped.foodDays, `planting everything brings more food by the end than planting nothing (${planted.foodDays} vs ${skipped.foodDays})`)
  // Two spares: the water pump takes one, the first meteoroid the other, so the second panel can't be replaced.
  heard.length = 0
  const spares = play({ ...baseline, cargo: [3, 3, 1, 2], scrubber: 2, meteoroids: [1, 1] }).mission
  const answers = spares.history.filter((r: any) => r.challenge === 11).map((r: any) => r.outcomeId)
  check(answers.length === 2 && answers[0] === 'c11-a' && answers[1] !== 'c11-a' && heard.includes('c11-line-1b'), `with the last spare gone, the first meteoroid's panel is replaced but not the second (${answers.join(', ')}); the second hit has fresh crew lines`)
}

// ------------------------------------------------------------ the hazard clock
/** Plays up to the spacecraft with no hazards. */
function toSpacecraft() {
  run.setHazardMode('none')
  run.tryAgain()
  decide(1, 2)
  panel.openDecision(2); placeSplit([4, 3, 1, 1]); press('Enter'); continueOn()
  useGame.setState({ mapId: 'spacecraft', mode: 'playing', focus: null })
}
/** Answers whatever hazard is open (shelter everyone, or patch the panel). */
function answerOpen() {
  if (!game().challenge) return
  press('Digit1', 'Enter')
  if (game().challenge?.stage !== 'result') press('Digit2', 'Enter')
  continueOn()
}
{
  // None: never, however long.
  toSpacecraft()
  run.setHazardMode('none')
  for (let t = 0; t < 1200; t++) run.stormTick(1, 1000 + t * 1000)
  check(!game().challenge && game().mission.hazards.transitStorm === 0, 'hazards set to none: twenty minutes on the spacecraft, no storm')

  // Maximum: as soon as the fairness rules allow, up to 3, with Houston's delayed warning first.
  toSpacecraft()
  run.setHazardMode('max')
  heard.length = 0
  run.stormTick(25, 1000)
  check(!game().challenge && !run.hazardClock().warning, 'no hazard in the first 30 seconds on a map')
  run.stormTick(6, 2000)
  check(run.hazardClock().warning === 'transitStorm' && heard.includes('c04-houston') && delays.get('c04-houston') === REAL.voiceDelaySeconds, `then Houston warns of a storm, late by the real signal delay (${REAL.voiceDelaySeconds} s)`)
  run.stormTick(run.WARNING_LEAD, 3000)
  check(!game().challenge, 'the alarm waits for the delayed warning to arrive')
  run.stormTick(currentRadioDelay() + 0.01, 4000)
  check(game().challenge?.id === 4 && game().alarm && game().challenge?.deadline === 4000 + 15_000, 'then the alarm, and the storm’s panel opens by itself with 15 seconds')
  const first = game().mission.activeFlareId
  answerOpen()
  run.stormTick(30, 5000)
  check(game().mission.hazards.transitStorm === 1 && !run.hazardClock().warning, 'no second storm within 60 seconds of the first')
  for (let t = 0; t < 1200; t++) {
    run.stormTick(1, 6000 + t * 1000)
    answerOpen()
  }
  const flares = game().mission.usedFlares
  check(game().mission.hazards.transitStorm === 3, `at most 3 storms in transit (${game().mission.hazards.transitStorm})`)
  check(new Set(flares).size === flares.length && flares[0] === first, `every storm is a different real flare (${flares.length} storms, ${new Set(flares).size} flares)`)

  // Quiet moments: no hazard during a card, an elevator ride, a fade, the pause menu.
  for (const [label, quiet] of [
    ['a teaching card', { card: { id: 'x', eyebrow: '', title: '', body: '' } }],
    ['an elevator ride', { elevatorPanel: 'crew' }],
    ['a fade', { transition: { message: '', after: { kind: 'load', mapId: 'spacecraft' } } }],
    ['the pause menu', { mode: 'paused' }],
  ] as const) {
    toSpacecraft()
    run.setHazardMode('max')
    useGame.setState(quiet as any)
    for (let t = 0; t < 120; t++) run.stormTick(1, 2000 + t * 1000)
    check(!run.hazardClock().warning && !game().challenge && run.hazardClock().total === 0, `no hazard (and no clock) during ${label}`)
    useGame.setState({ card: null, elevatorPanel: null, transition: null, mode: 'playing' } as any)
  }

  // Seeded chance: the same seed gives the same hazards at the same moments.
  const timings = (seed: number) => {
    run.setHazardMode('random')
    run.tryAgain()
    useGame.setState({ mission: mission.createInitialMission(seed), mapId: 'outpost', mode: 'playing' })
    run.resetStorm()
    const at: number[] = []
    for (let t = 0; t < 1800; t++) {
      run.stormTick(1, t * 1000)
      if (game().challenge) {
        at.push(t)
        answerOpen()
      }
    }
    return at
  }
  const a = timings(1234)
  const b = timings(1234)
  const c = timings(99)
  check(a.length > 0 && JSON.stringify(a) === JSON.stringify(b), `the same seed gives the same hazards at the same moments (${a.join(', ')} s)`)
  check(JSON.stringify(a) !== JSON.stringify(c), 'another seed gives other hazards')
  run.setHazardMode('none')

  check(hazards.ratePerMinute('outpostStorm', { day: 6 }) > hazards.ratePerMinute('outpostStorm', { day: 1 }), 'the longer the mission, the more likely a hazard')
  check(Math.abs(hazards.ratePerMinute('transitStorm', { day: 1 }) - STORMS_PER_GAME_MINUTE) < 1e-12 && STORMS_PER_GAME_MINUTE > 0.1 && STORMS_PER_GAME_MINUTE < 0.13, `storms come at 2024’s real radiation-storm rate, sped up: ${STORMS_PER_GAME_MINUTE.toFixed(3)} per minute of play`)
  const typical = hazards.expectedHazards(3, 12, 7)
  console.log(`  expected hazards in a typical 20-minute run (3 min in transit, 12 at the outpost, 7 days): ${typical.transitStorm.toFixed(2)} storms in transit, ${typical.outpostStorm.toFixed(2)} at the outpost, ${typical.meteoroid.toFixed(2)} meteoroids`)
  check(typical.transitStorm + typical.outpostStorm > 0.5 && typical.transitStorm + typical.outpostStorm < 4, 'a typical run usually sees a storm or two, sometimes none')
}

// ---------------------------------------------------- the ice and the tow
{
  const base = { ...mission.createInitialMission(), powerSplit: { 'c06-life-support': 2, 'c06-greenhouse': 2, 'c06-drill': 1, 'c06-antenna': 1 }, remembered: { choseFuelCell: true } }
  const lifeAfter = (flag: string) => days.nightTick({ ...base, remembered: { ...base.remembered, [flag]: true } }).state.meters.lifeSupport
  const plain = days.nightTick(base).state.meters.lifeSupport
  check(lifeAfter('iceExtracted') > lifeAfter('iceTrial') && lifeAfter('iceTrial') > plain && plain > lifeAfter('rationingWater'), 'every night: extracted ice gives the most water, a trial some, rationing drains Life Support faster')
  const tow = days.towNight(base)
  check(tow.state.day === base.day + 1 && tow.state.remembered.lostRover === true && tow.state.dose > base.dose, 'the tow costs a mission day (with its dose) and sets lostRover')
  check(tow.state.timeline.at(-1)?.kind === 'tow', 'the tow is written to the timeline as one step')
  const c11 = getChallenge(11)
  const onFoot = { ...base, spares: 1, remembered: { ...base.remembered, lostRover: true } }
  const walk = decisions.effectiveEffects(c11, c11.options[0], onFoot).effects
  const drive = decisions.effectiveEffects(c11, c11.options[0], { ...onFoot, remembered: { ...onFoot.remembered, lostRover: false } }).effects
  check(walk.dose > drive.dose && walk.lifeSupport < drive.lifeSupport, 'with the rover lost, the moonwalk to the panel costs more dose and air')
}

// --------------------------------------------------- the communication delay
{
  check(radioDelaySeconds('launch-center') === 0 && radioDelaySeconds('spacecraft') === REAL.voiceDelaySeconds && radioDelaySeconds('outpost') === REAL.voiceDelaySeconds, 'Houston has no delay on Earth, and the real Artemis voice delay in space and on the Moon')
  check(REAL.voiceDelaySeconds === 5.6 && /5\.6 seconds/.test(getReference('comm-delay')?.fact ?? '') && /ntrs\.nasa\.gov/.test(getReference('comm-delay')?.url ?? ''), 'the delay is NASA’s 5.6 s one-way voice estimate, from its technical report')
  const { newTerms } = await import(`${P}/data/glossary`)
  check(newTerms(['signal delay'], []).some((t: any) => t.id === 'signal-delay'), 'a one-time glossary line explains the signal delay')
}

// ------------------------------------------------------------------ gates
{
  run.setHazardMode('none')
  run.tryAgain()
  const left = decisions.unfinishedOn('launch-center', game().mission)
  check(left.map((c: any) => c.id).join() === '1,2', 'the rocket waits for tasks 1 and 2')
  useGame.setState({ mode: 'playing', focus: { id: 'board-spacecraft', kind: 'marker', prompt: 'Board the spacecraft' } })
  heard.length = 0
  session.activateFocus()
  check(game().transition === null && heard.includes('c01-reminder'), 'boarding early: the trainer says what is left, and nothing happens')
  decide(1, 1)
  panel.openDecision(2); placeSplit([4, 3, 2, 1]); press('Enter'); continueOn()
  useGame.setState({ transition: null, mapId: 'spacecraft', mode: 'playing' })
  check(decisions.unfinishedOn('spacecraft', game().mission).map((c: any) => c.id).join() === '3,5', 'the landing waits for 3 and 5 only (storms are luck, not tasks)')
  check(!challengeCleared(5, game().usedConsoles), 'the landing prompt waits for the landing site (5)')
  decide(3, 1)
  decide(5, 1)
  check(decisions.unfinishedOn('spacecraft', game().mission).length === 0, 'with 3 and 5 done, nothing holds the landing')
  transmissions.clearTransmissions()
  heard.length = 0
  panel.openDecision(4)
  check(game().challenge === null && heard.includes('c04-reminder'), 'a storm can’t be opened from its console: Houston says there’s none right now')

  useGame.setState({ mapId: 'outpost', mode: 'playing' })
  transmissions.clearTransmissions()
  heard.length = 0
  panel.openDecision(12)
  check(game().challenge === null && heard.includes('c06-reminder'), 'the lunar night cannot start before the base is woken')
  panel.openDecision(6); placeSplit([2, 2, 1, 1]); press('Enter'); continueOn()
  transmissions.clearTransmissions()
  heard.length = 0
  panel.openDecision(8)
  check(game().challenge === null && heard.includes('c08-reminder'), 'the ice cannot start before the commander’s briefing')
  decide(7, 2)
  heard.length = 0
  decide(9, 1)
  check(heard.includes('c08-briefing') && game().mission.remembered.iceBriefed === true, 'the briefing comes on the night card after the tired crew (9)')
  check(!!decisions.blockedBy(getChallenge(12), game().mission), 'the lunar night still waits for the ice (8)')
  decide(8, 2)
  check(game().mission.status === 'running' && !decisions.blockedBy(getChallenge(12), game().mission), 'with 6, 7, 8 and 9 done, the lunar night opens; no hazard is required')
  game().clearToast()
}

// ------------------------------------------------ the daily tick and failure
{
  const start = mission.createInitialMission()
  const powered = { ...start, powerSplit: { 'c06-life-support': 2, 'c06-greenhouse': 2, 'c06-drill': 1, 'c06-antenna': 1 }, remembered: { choseFuelCell: true } }
  const night = days.nightTick(powered)
  check(night.state.day === 2 && night.report.day === 2 && night.state.timeline.at(-1)?.kind === 'night', 'a night moves the day on, and is written to the timeline')
  check(night.state.foodDays === start.foodDays + 2 * days.DAILY.foodPerGreenhouseUnit - days.DAILY.foodEaten, 'food: eaten, and grown by the powered greenhouse')
  const harvest = days.lunarNight({ ...powered, harvestDays: 6 }).state
  const none = days.lunarNight({ ...powered, harvestDays: 0 }).state
  check(harvest.foodDays === none.foodDays + 6 && harvest.harvestDays === 0, 'the harvest planted in 7 comes in during the lunar night')
  let starving = { ...start, foodDays: 3, powerSplit: { 'c06-life-support': 2, 'c06-greenhouse': 0, 'c06-drill': 2, 'c06-antenna': 2 }, remembered: { greenhouseUnpowered: true } }
  for (let i = 0; i < 5 && starving.status !== 'ended'; i++) starving = days.nightTick(starving).state
  check(starving.status === 'ended' && starving.ending === 'early-return-supplies' && starving.foodDays === 0, 'food running out ends the mission at once (early return: supplies)')
  const dosed = mission.checkFailure({ ...start, dose: mission.DOSE_THRESHOLDS.high })
  check(dosed.status === 'ended' && dosed.ending === 'early-return-health', 'a high dose ends it at once (early return: crew health)')
}

// --------------------------------------------- no free choice, ready ones
for (const id of [1, 3, 4, 5, 7, 8, 9, 10, 11, 12]) {
  const c = getChallenge(id)
  if (c.kind === 'choice') check(decisions.freeChoices(c).length === 0, `challenge ${id} still has no free choice`)
}

// ------------------------------------------------ five Try again runs
{
  const listeners = lineListenerCount()
  for (let i = 0; i < 5; i++) play(STRATEGIES[i % STRATEGIES.length]!)
  run.tryAgain()
  const m = game().mission
  check(m.history.length === 0 && m.day === 1 && m.bites.length === 0 && m.log.length === 1 && m.timeline.length === 0 && m.usedFlares.length === 0 && Object.values(m.hazards).every((n: any) => n === 0), 'Try again resets meters, flags, days, hazards, flares, the timeline and challenges')
  check(game().usedConsoles.length === 0 && game().night === null && game().afterword === null && !game().alarm, 'and the consoles, cards and alarm')
  check(run.hazardClock().total === 0 && !run.hazardClock().warning, 'and the hazard clock')
  check(lineListenerCount() === listeners, 'no listeners pile up over five runs')
}

// ---- The story beats: the launch center's every run, the others once per profile; skippable, clean hand-over ----
{
  const beats = await import(`${P}/scene/beats`)
  const { useSettings } = await import(`${P}/state/settings`)
  const { onCue } = await import(`${P}/state/lines`)
  const heard: any[] = []
  const cues: string[] = []
  const offLine = onLine((e: any) => heard.push(e))
  const offCue = onCue((c: string) => cues.push(c))
  // Time passes; each transmission is read and closes (headless, no clock runs them).
  const step = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) {
      beats.updateBeat(0.05)
      transmissions.finishTransmission()
    }
  }
  const ids = beats.BEAT_LINES.map((l: any) => l.lineId)
  check(new Set(ids).size === ids.length && beats.BEAT_LINES.every((l: any) => l.speakerId && /^(beat|p1)-/.test(l.lineId)), `every beat line has a speaker and its own lineId (${ids.join(', ')})`)
  check(Object.values(beats.BEATS).every((b: any) => b.duration <= 15), 'each beat is short (15 s at most)')

  // Without the 3D scene a beat never starts, so the headless runs above are unchanged.
  run.tryAgain()
  useSettings.getState().set({ beatsSeen: [] })
  check(!beats.startBeat('night-before'), 'no scene, no beat')

  beats.setBeatHost(true)
  run.tryAgain()
  useGame.setState({ mapId: 'launch-center', mode: 'playing', focus: null, card: null })
  heard.length = 0
  beats.maybeStartBeats()
  check((game().card as any)?.id === 'lc-move' && beats.beatActive() === null, 'right after Play, first the trainer’s welcome card ("Welcome, mission engineer!"), before any scene')
  check(stepNow() === 'Listen to your trainer' && objective.currentObjective()?.task === 1, `the task banner says to listen to the trainer, on the way to task 1 (${stepNow()})`)
  beats.maybeStartBeats()
  check(beats.beatActive() === null, 'the opening waits while the card is up and he is saying it')
  // Closed with Got it (or Enter): the opening starts; another card on screen waits until it's over.
  useGame.getState().hideCard()
  useGame.setState({ card: { id: 'test-card' } as any })
  beats.maybeStartBeats()
  check(beats.beatActive()?.id === 'night-before' && game().card === null, 'once it closes, the night before launch, and any other teaching card waits')
  // The opening may carry on over two beats (it's timed by its voices); it ends by itself.
  for (let t = 0; t < 40 && beats.beatActive(); t += 0.5) step(0.5)
  check(beats.beatActive() === null && heard.slice(0, 2).map((e) => e.lineId).join() === 'p1-trainer-01,p1-science-01', 'the trainer speaks from the doorway, then Kal, then control returns')
  check(heard.slice(2, 5).map((e) => e.lineId).join() === 'p1-trainer-02,p1-trainer-03,p1-commander-01', 'then the trainer talks on the walk, and the commander teases him')
  check(heard.slice(2, 5).every((e) => e.inPerson), 'in person: the crew walk with the player to the briefing room')
  check(stepNow() === 'Follow the trainer to the briefing room', `then the banner says to follow the trainer to the briefing room, not the console's task (${stepNow()})`)
  check(heard.every((e) => !e.text.includes('{name}')), 'no line shows a {name} placeholder')
  check((game().card as any)?.id === 'test-card', 'and the teaching card comes back after it')
  useGame.setState({ card: null })
  beats.maybeStartBeats()
  check(beats.beatActive() === null, 'it plays once a run')
  // The walk ends in the briefing room: "Here we are", then the briefing starts by itself, then the first panel.
  {
    const { player } = await import(`${P}/state/player`)
    transmissions.clearTransmissions()
    heard.length = 0
    Object.assign(player, { x: -4.5, z: -4.0, level: 'ground' })
    beats.maybeStartBeats()
    step(0.1)
    check(heard.map((e) => e.lineId).join() === 'p1-trainer-04' && heard[0]?.inPerson, '"Guilty. Here we are." on walking into the briefing room, in person')
    check(stepNow() === 'Wait for the briefing to start', `in the briefing room the banner says to wait for the briefing (${stepNow()})`)
    beats.maybeStartBeats()
    check(beats.beatActive()?.id === 'briefing' && game().challenge === null, 'then the briefing starts by itself, without the console')
    check(stepNow() === 'Listen to the briefing', `and to listen while it plays (${stepNow()})`)
    for (let t = 0; t < 120 && beats.beatActive(); t += 0.25) step(0.25)
    check(game().challenge?.id === 1, 'and the power-source panel opens after it')
    // A new run starts with the opening again, even on a profile that has seen it: the trainer always comes for the player.
    run.tryAgain()
    useGame.setState({ mapId: 'launch-center', mode: 'playing', focus: null, card: null })
    check(beats.beatSeen('night-before') && beats.beatSeen('briefing'), '(this profile has seen the opening and the briefing)')
    beats.maybeStartBeats()
    check((game().card as any)?.id === 'lc-move' && beats.beatActive() === null, 'a new run starts with the welcome card again')
    // Left alone, the card closes once he has said it, and the opening starts.
    const realNow = performance.now.bind(performance)
    performance.now = () => realNow() + 9500
    beats.maybeStartBeats()
    performance.now = realNow
    check(beats.beatActive()?.id === 'night-before' && game().card === null, 'and once he has said it, the card closes by itself and the opening plays again')
    beats.skipBeat()
    check(beats.beatActive() === null, 'and Skip still ends it at once')
    // "Yes, start again" from the menu (not Try again): the story starts over as well.
    const session = await import(`${P}/scene/session`)
    check(beats.sceneHappened('opening') && beats.sceneHappened('walk'), '(the opening and the walk have happened on this run)')
    session.startMission(true)
    check(!beats.sceneHappened('opening') && !beats.sceneHappened('walk'), 'a new mission started from the menu plays the opening and the walk again')
    transmissions.clearTransmissions()
  }

  // Shishir's Phase 1 script: the briefing before challenge 1, the talk after 1 and 2, the goodbye at the elevator.
  {
    const { player } = await import(`${P}/state/player`)
    const playThrough = () => {
      for (let t = 0; t < 120 && beats.beatActive(); t += 0.25) step(0.25)
    }
    const ids = () => heard.map((e) => e.lineId)
    run.tryAgain()
    useSettings.getState().set({ beatsSeen: ['night-before'] })
    useGame.setState({ mapId: 'launch-center', mode: 'playing', focus: null, card: null })
    heard.length = 0
    panel.openDecision(1)
    check(beats.beatActive()?.id === 'briefing' && game().challenge === null && cues.includes('beat-briefing'), 'using the challenge 1 console before the briefing has played starts it, before the panel')
    playThrough()
    const order = ['p1-trainer-05', 'p1-trainer-06', 'p1-trainer-07', 'p1-trainer-08', 'p1-trainer-09', 'p1-trainer-10', 'p1-safety-01', 'p1-commander-02', 'p1-trainer-11']
    check(game().challenge?.id === 1 && ids().slice(0, order.length).join() === order.join(), 'the briefing plays every line in the script’s order, then challenge 1’s panel opens')
    const parts = Object.values(beats.BEATS).filter((b: any) => /^briefing(-\d+)?$/.test(b.id))
    check(parts.length >= 2 && parts.every((b: any) => b.duration <= 15), `the long briefing carries on over ${parts.length} short beats`)
    press('Digit2', 'Enter')
    heard.length = 0
    continueOn()
    check(ids().join() === 'p1-trainer-12', 'after the choice, the trainer says "Good"')
    check(stepNow() === 'Listen to your trainer' && objective.currentObjective()?.task === 2, `the banner says to listen while he says where to go next (${stepNow()})`)
    step(1)
    check(ids().join() === 'p1-trainer-12,p1-trainer-13,p1-science-02', 'then he sends the player to the communications officer, and Kal teases')
    check(stepNow() === 'Meet Houston at the communications building', `then it says to meet Houston at the communications building (${stepNow()})`)

    // Scene 4: Houston at the communications building's door, with the player's answer.
    heard.length = 0
    transmissions.transmit({ speakerId: 'trainer', lineId: 'test-still-talking', text: 'Still talking.' })
    Object.assign(player, { x: 0.5, z: -12.5, level: 'ground' })
    beats.maybeStartBeats()
    check(beats.beatActive() === null, 'Houston waits while someone is still talking')
    transmissions.clearTransmissions()
    heard.length = 0
    beats.maybeStartBeats()
    check(beats.beatActive()?.id === 'comms-visit' && cues.includes('beat-comms-visit'), 'walking up to the communications building, Houston meets the player at the door')
    playThrough()
    check(ids().join() === 'p1-comms-01,p1-comms-02,p1-comms-03' && heard.every((e) => e.inPerson && e.delaySeconds === 0), 'he says hello and asks about the cargo, face to face (no radio, no delay)')
    check(beats.useBeat.getState().asking && beats.beatActive() !== null, 'then the scene waits for the player’s answer')
    heard.length = 0
    beats.answerBeat(0)
    check(beats.beatActive()?.id === 'comms-no', '"Not yet, sir." gets his answer to that')
    playThrough()
    check(ids().join() === 'p1-comms-04a,p1-comms-05' && beats.beatActive() === null && beats.beatSeen('comms-yes'), 'he sends the player to the hangar, and the other answer counts as seen')
    check(beats.spokenSeconds({ ...heard[0], inPerson: true }) < beats.spokenSeconds({ ...heard[0], inPerson: false }), 'in person, his lines have no radio crackle to wait for')

    // Skipping the briefing ends the whole scene, and the panel opens once.
    // This profile met Houston (with both answers) and heard the trainer's goodbye on earlier runs: both play again on this one.
    run.tryAgain()
    useSettings.getState().set({ beatsSeen: ['night-before', 'comms-visit', 'comms-no', 'comms-yes', 'farewell'] })
    useGame.setState({ mapId: 'launch-center', mode: 'playing', focus: null, card: null })
    panel.openDecision(1)
    step(1)
    beats.skipBeat()
    check(beats.beatActive() === null && game().challenge?.id === 1, 'skipping the briefing ends it at once and opens challenge 1’s panel')
    check(parts.every((b: any) => beats.beatSeen(b.id)), 'and the rest of the briefing counts as seen')
    press('Digit2', 'Enter')
    heard.length = 0
    continueOn()
    step(1)
    check(ids().join() === 'p1-trainer-12,p1-trainer-13,p1-science-02', 'Houston met on an earlier run: the trainer still sends the player to him, and Kal teases')
    check(game().toast?.includes('communications building'), 'and a toast points to the communications building')
    panel.openDecision(1)
    check(beats.beatActive() === null, 'the briefing plays once a run (not again after the choice)')

    // Houston at the door again on this run, and the answer he gets plays even though both were heard before.
    useGame.setState({ challenge: null, mode: 'playing', toast: null })
    transmissions.clearTransmissions()
    heard.length = 0
    Object.assign(player, { x: 0.5, z: -12.5, level: 'ground' })
    beats.maybeStartBeats()
    check(beats.beatActive()?.id === 'comms-visit', 'Houston meets the player at the door on every run')
    check(stepNow() === 'Talk to Houston', `the banner says to talk to Houston (${stepNow()})`)
    playThrough()
    check(ids().join() === 'p1-comms-01,p1-comms-02,p1-comms-03' && beats.useBeat.getState().asking, 'he says hello and asks about the cargo again')
    check(stepNow() === 'Answer Houston', `then to answer him (${stepNow()})`)
    heard.length = 0
    beats.answerBeat(1)
    check(beats.beatActive()?.id === 'comms-yes', '"Yes, sir!" gets his answer, though this profile heard it before')
    playThrough()
    check(ids().join() === 'p1-comms-04b,p1-comms-05' && beats.beatActive() === null, 'he sends the player to the cargo hangar')
    check(game().toast === 'Next: the cargo hangar', 'and a toast points to the cargo hangar')
    check(stepNow() === 'Go to the cargo hangar', `and the banner says to go to the cargo hangar (${stepNow()})`)
    // Walking away and back: he has met the player on this run.
    Object.assign(player, { x: 0.5, z: -5, level: 'ground' })
    beats.maybeStartBeats()
    Object.assign(player, { x: 0.5, z: -12.5, level: 'ground' })
    beats.maybeStartBeats()
    check(beats.beatActive() === null, 'Houston’s scene plays once a run (not again on walking back to him)')

    // The cargo hangar, then the goodbye at the elevator.
    useGame.setState({ challenge: null, mode: 'playing' })
    transmissions.clearTransmissions()
    heard.length = 0
    Object.assign(player, { x: 5, z: 6, level: 'ground' })
    beats.maybeStartBeats()
    step(0.1)
    check(ids()[0] === 'p1-science-03', 'Kal talks on first walking into the cargo hangar')
    check(stepNow() === 'Pack the cargo', `in the hangar the banner says to pack the cargo (${stepNow()})`)
    panel.openDecision(2)
    // Kal's "It's full!": not when one shelf is at its limit, only when the whole pallet is.
    transmissions.setTransmissionHost(true)
    heard.length = 0
    press('Digit1')
    for (let k = 0; k < 12; k++) press('Equal')
    const shelfFull = ids().includes('p1-science-04')
    placeSplit([4, 3, 1, 1])
    press('Digit1', 'Equal')
    check(!shelfFull && ids().filter((id) => id === 'p1-science-04').length === 1, 'Kal says "It\u2019s full!" once, when a block won\u2019t fit on a full pallet (not when one shelf is at its limit)')
    transmissions.setTransmissionHost(false)
    press('Enter')
    heard.length = 0
    continueOn()
    step(1)
    check(ids().join() === 'p1-science-05,p1-comms-06,p1-comms-07', 'after packing, Kal, then Houston on the radio')
    // Straight to the elevator while Houston is still talking: the goodbye waits for him to finish.
    transmissions.transmit({ speakerId: 'comms', lineId: 'test-houston', text: 'Still talking.' })
    Object.assign(player, { x: 9.5, z: 0, level: 'ground' })
    beats.maybeStartBeats()
    check(beats.beatActive() === null, 'the goodbye waits while Houston is still talking')
    transmissions.clearTransmissions()
    check(stepNow() === 'Meet your trainer at the crew elevator' && objective.currentObjective()?.task === 3, `with the cargo packed, the banner says to meet the trainer at the crew elevator, on the way to task 3 (${stepNow()})`)
    transmissions.clearTransmissions()
    beats.maybeStartBeats()
    check(beats.beatActive()?.id === 'farewell' && cues.includes('beat-farewell'), 'then walking up to the trainer at the elevator plays his goodbye, even on a profile that heard it on an earlier run')
    heard.length = 0
    playThrough()
    check(ids().join() === 'p1-trainer-14,p1-trainer-15' && beats.beatActive() === null, 'he says goodbye, and control returns')
    check(stepNow() === 'Take the crew elevator down', `then it says to take the crew elevator down (${stepNow()})`)
    Object.assign(player, { x: 30, z: -3.3, level: 'tunnel' })
    check(stepNow() === 'Walk through the crew tunnel', `in the tunnel, to walk through it (${stepNow()})`)
    Object.assign(player, { x: 42, z: -10, level: 'tunnel' })
    check(stepNow() === 'Take the tower elevator up', `at the pad, to take the tower elevator up (${stepNow()})`)
    Object.assign(player, { x: 46, z: -3, level: 'arm' })
    check(stepNow() === 'Board the spacecraft', `and at the top, to board the spacecraft (${stepNow()})`)
    Object.assign(player, { x: 9.5, z: 0, level: 'ground' })
    transmissions.clearTransmissions()
    // Walking away and back: he has said goodbye on this run.
    Object.assign(player, { x: 0, z: 6, level: 'ground' })
    beats.maybeStartBeats()
    Object.assign(player, { x: 9.5, z: 0, level: 'ground' })
    beats.maybeStartBeats()
    check(beats.beatActive() === null, 'the goodbye plays once a run (not again on walking back to him)')
  }

  // The mouse: a captured mouse stays captured through a scene (Enter skips; capturing it again without a click
  // can be refused by the browser, which left the cursor on screen). Only a question frees it, for its answer
  // buttons, and answering (a click or a key) captures it again.
  {
    const lock = await import(`${P}/scene/pointerLock`)
    const doc = g.document as any
    const canvas: any = {
      requestPointerLock: () => {
        doc.pointerLockElement = canvas
        return Promise.resolve()
      },
    }
    doc.exitPointerLock = () => {
      doc.pointerLockElement = null
    }
    lock.setLockElement(canvas)
    transmissions.clearTransmissions()
    useGame.setState({ mapId: 'outpost', mode: 'playing', challenge: null, night: null, afterword: null, card: null })
    useSettings.getState().set({ beatsSeen: [] })
    await lock.requestLock()
    check(lock.isLocked() && beats.startBeat('arrival') && lock.isLocked(), 'a scene keeps the captured mouse while it plays (no cursor popping up)')
    for (let t = 0; t < 20 && beats.beatActive(); t += 0.25) step(0.25)
    check(beats.beatActive() === null && lock.isLocked(), 'and it is still captured when the scene ends by itself, so looking around works straight away')
    useSettings.getState().set({ beatsSeen: [] })
    beats.startBeat('arrival')
    beats.skipBeat()
    check(lock.isLocked(), 'and when it is skipped')
    // Houston's question: its answers are buttons.
    useGame.setState({ mapId: 'launch-center' })
    check(beats.playScene('comms-visit') && lock.isLocked(), 'Houston’s scene keeps the mouse captured while he talks')
    for (let t = 0; t < 60 && !beats.useBeat.getState().asking; t += 0.25) step(0.25)
    check(beats.useBeat.getState().asking && !lock.isLocked(), 'his question frees it for the answer buttons')
    beats.answerBeat(1)
    check(beats.beatActive()?.id === 'comms-yes' && lock.isLocked(), 'and answering (a click or a key) captures it again')
    beats.skipBeat()
    useGame.setState({ mapId: 'outpost' })
    lock.releaseLock()
    useSettings.getState().set({ beatsSeen: [] })
    beats.startBeat('arrival')
    beats.skipBeat()
    check(!lock.isLocked(), 'playing without mouse look (not captured), a scene doesn’t capture the mouse')
    lock.setLockElement(null)
    doc.exitPointerLock = () => {}
    transmissions.clearTransmissions()
  }

  // Skipping: Enter or Skip ends it at once, and what follows still happens.
  useGame.setState({ mapId: 'outpost', mode: 'playing' })
  let afterward = 0
  check(beats.startBeat('lunar-night', () => afterward++), 'before the lunar night, the commander’s story starts')
  beats.skipBeat()
  check(beats.beatActive() === null && afterward === 1, 'skipping it hands over at once, exactly once')

  // The first storm: the panel (and its timer) waits for the 3 s beat; the hazard clock doesn't run meanwhile.
  run.setHazardMode('none')
  useGame.setState({ mapId: 'outpost', mode: 'playing', challenge: null, focus: null })
  run.triggerHazard('outpostStorm')
  check(beats.beatActive()?.id === 'first-storm' && game().challenge === null && cues.includes('beat-first-storm'), 'the first outpost storm plays its alarm beat before the panel')
  const before = run.hazardClock().mapSeconds
  run.stormTick(1)
  check(run.hazardClock().mapSeconds === before, 'no hazard clock runs during a beat')
  step(3.1)
  check(beats.beatActive() === null && game().challenge?.id === 10, 'then the storm panel opens')
  panel.backOut?.()
  useGame.setState({ challenge: null, mode: 'playing' })
  run.triggerHazard('outpostStorm')
  check(beats.beatActive() === null && game().challenge?.id === 10, 'the next storm opens its panel straight away')

  // Lunar night through the real panel opener: not while challenge 12 is still locked, then before its panel.
  run.tryAgain()
  useSettings.getState().set({ beatsSeen: ['night-before', 'arrival', 'first-storm'] })
  useGame.setState({ mapId: 'outpost', mode: 'playing', challenge: null })
  panel.openDecision(12)
  check(beats.beatActive() === null, 'the commander’s story waits while the lunar night is still locked')
  // Every task before it done (as the replay would have them), so challenge 12 can open.
  const done = [1, 2, 3, 5, 6, 7, 8, 9].map((c) => ({ challenge: c, outcomeId: `c${String(c).padStart(2, '0')}-a`, day: 2 }))
  useGame.setState({ mission: { ...game().mission, history: done, currentChallenge: 12 } })
  check(!decisions.blockedBy(getChallenge(12), game().mission), 'with every task done, challenge 12 is open')
  panel.openDecision(12)
  const waiting = beats.beatActive()?.id === 'lunar-night' && game().challenge === null
  step(12.1)
  check(waiting && game().challenge?.id === 12, 'challenge 12’s panel opens after the commander’s story')
  beats.setBeatHost(false)
  offLine()
  offCue()
  run.tryAgain()
}

// ---- Transmissions: one at a time, held behind panels, Enter closes, onLine when shown ----
{
  const T = transmissions
  const { onCue: _onCue } = await import(`${P}/state/lines`)
  void _onCue
  run.tryAgain()
  useGame.setState({ mapId: 'outpost', mode: 'playing', challenge: null, night: null, afterword: null })
  const shown: string[] = []
  const off = onLine((e: any) => shown.push(e.lineId))
  const a = { speakerId: 'commander', lineId: 't-a', text: 'First message.' }
  const b = { speakerId: 'comms', lineId: 't-b', text: 'Houston here. Second message.' }
  T.transmit(a)
  T.transmit(b)
  check(T.useTransmissions.getState().current?.line.lineId === 't-a' && T.useTransmissions.getState().queue.length === 1, 'messages queue: one shows, the next waits')
  check(shown.join() === 't-a', 'onLine fires when a message appears, not when it is queued')
  check(!T.transmit(a), 'the same line is never queued twice')
  check(T.useTransmissions.getState().current?.style === 'hologram' && T.styleFor(b as any) === 'radio', 'crew elsewhere come as holograms, Houston over the radio')
  check(T.styleFor({ ...a, inPerson: true } as any) === 'in-person' && T.styleFor({ ...b, inPerson: true } as any) === 'in-person', 'someone in the room speaks in person (Houston too, at his door)')
  T.finishTransmission()
  check(T.useTransmissions.getState().current?.line.lineId === 't-b' && shown.join() === 't-a,t-b', 'closing one (Enter) shows the next')
  check(T.useTransmissions.getState().current!.delay > 0, 'away from Earth, Houston’s words wait for the signal delay')
  T.finishTransmission()
  // Held behind a panel.
  useGame.setState({ challenge: { id: 6 } as any })
  T.transmit(a)
  check(T.useTransmissions.getState().current === null, 'nothing shows over an open panel')
  useGame.setState({ challenge: null })
  check(T.useTransmissions.getState().current?.line.lineId === 't-a', 'it shows as soon as the panel closes')
  check(T.holdFor({ speakerId: 'safety', lineId: 'x', text: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen' } as any, 0) > T.holdFor(a as any, 0), 'a longer line stays up longer')
  T.clearTransmissions()
  check(T.useTransmissions.getState().current === null && T.useTransmissions.getState().queue.length === 0, 'Try again clears them')
  off()
  run.tryAgain()
}

// ---- The guidebook's task table matches the real gates ----
{
  const guide = await import(`${P}/state/guide`)
  run.setHazardMode('none')
  run.tryAgain()
  /** At this moment, a "Go here now" task really opens and a locked one really doesn't. */
  const gatesMatch = (label: string) => {
    const mapId = game().mapId
    const rows = guide.taskRows(game().mission, mapId)
    const wrong: string[] = []
    for (const row of rows) {
      if (row.status === 'done') continue
      if (row.map !== mapId) {
        if (row.status !== 'locked') wrong.push(`${row.id} should be locked (another map)`)
        continue
      }
      useGame.setState({ challenge: null, mode: 'playing' })
      transmissions.clearTransmissions()
      panel.openDecision(row.id)
      const opened = game().challenge?.id === row.id
      if (opened) panel.backOut()
      useGame.setState({ challenge: null, mode: 'playing' })
      if ((row.status === 'go') !== opened) wrong.push(`${row.id} says ${row.status} but ${opened ? 'opens' : 'does not open'}`)
    }
    check(wrong.length === 0, `guidebook tasks match the gates ${label}${wrong.length ? `: ${wrong.join('; ')}` : ''}`)
    return rows
  }
  let rows = gatesMatch('at the start')
  check(rows.filter((r: any) => r.status === 'go').map((r: any) => r.id).join() === '1,2', '1 and 2 can be done in either order at the start')
  check(rows.find((r: any) => r.id === 3)?.unlock?.includes('Board the rocket'), 'spacecraft tasks say to board the rocket first')
  panel.openDecision(2)
  placeSplit([2, 2, 1, 2])
  press('Enter')
  continueOn()
  gatesMatch('with only 2 done')
  decide(1, 3)
  useGame.setState({ mapId: 'spacecraft', mode: 'playing', focus: null })
  rows = gatesMatch('on the spacecraft')
  check(rows.filter((r: any) => r.status === 'done').length === 2 && rows.find((r: any) => r.id === 6)?.unlock?.includes('Land on the Moon'), 'launch tasks show done; outpost tasks say to land first')
  // The task banner on the spacecraft: life support at the back, the cockpit, then strap in.
  const { player } = await import(`${P}/state/player`)
  transmissions.clearTransmissions()
  useGame.setState({ outdoors: false, driving: false })
  Object.assign(player, { x: 11, z: 0, level: 'ground' })
  check(stepNow() === 'Go to life support' && objective.currentObjective()?.task === 3, `on the spacecraft the banner says to go to life support (${stepNow()})`)
  Object.assign(player, { x: 1.5, z: 0, level: 'ground' })
  check(stepNow() === 'Help fix the air scrubber', `and there, to help fix the scrubber (${stepNow()})`)
  decide(3, 1)
  transmissions.clearTransmissions()
  check(stepNow() === 'Go up to the cockpit' && objective.currentObjective()?.task === 5, `then to go up to the cockpit (${stepNow()})`)
  decide(5, 1)
  transmissions.clearTransmissions()
  check(stepNow() === 'Strap in for the landing', `then to strap in for the landing (${stepNow()})`)
  useGame.setState({ mapId: 'outpost', mode: 'playing', focus: null })
  rows = gatesMatch('at the outpost')
  // At the outpost: in through the airlock, then the power bay.
  transmissions.clearTransmissions()
  useGame.setState({ outdoors: true })
  Object.assign(player, { x: -40, z: 10, level: 'ground' })
  check(stepNow() === 'Go in through the airlock' && objective.currentObjective()?.task === 6, `at the outpost the banner says to go in through the airlock (${stepNow()})`)
  useGame.setState({ outdoors: false })
  Object.assign(player, { x: 0, z: 0, level: 'ground' })
  check(stepNow() === 'Go to the power bay', `then to go to the power bay (${stepNow()})`)
  Object.assign(player, { x: -9, z: -4, level: 'ground' })
  check(stepNow() === 'Wake the base', `and there, to wake the base (${stepNow()})`)
  check(rows.find((r: any) => r.id === 8)?.status === 'locked' && rows.find((r: any) => r.id === 12)?.status === 'locked', 'the ice waits for the briefing, the lunar night for the rest')
  check(rows.find((r: any) => r.id === 8)?.place === 'Ice crater' && rows.find((r: any) => r.id === 1)?.place === 'Briefing room', 'each task names its place (Briefing room, Ice crater)')
  run.tryAgain()
}

console.log(failed ? `${failed} FAILED` : 'All run checks passed.')
process.exit(failed ? 1 : 0)
