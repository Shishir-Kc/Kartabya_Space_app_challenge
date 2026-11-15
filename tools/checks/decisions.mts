/**
 * Checks for the challenges and the decision panel, run headless with
 * `npx tsx tools/checks/decisions.mts`:
 *
 * - the challenge data: maps, consoles, speakers, line ids, effects, flags,
 *   requirements, timers, splits and sources all point at things that exist;
 * - the brief's main rule, "no free choice": in every choice challenge, no
 *   option is at least as good as every other option on every stat;
 * - the cast matches Shishir's final table;
 * - challenges 1 and 2 play start to finish with the keyboard alone;
 * - effects apply exactly once, a done challenge can't be redone, a locked
 *   option can't be committed, a timed challenge applies its timeout option;
 * - the mouse is captured again after Continue;
 * - nothing piles up after opening and closing the panel many times.
 *
 * What needs a browser (the drawing, the ghost bars, frame rate, GPU memory)
 * is checked by hand through `window.__lunar` (src/scene/RenderStatsProbe.tsx).
 */

// Stand-ins for the browser: storage, and pointer lock on a fake canvas.
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
g.document = {
  documentElement: { dataset: {} },
  pointerLockElement: null as unknown,
  exitPointerLock() {
    g.document.pointerLockElement = null
  },
}
let lockRequests = 0
const canvas = {
  requestPointerLock() {
    lockRequests++
    g.document.pointerLockElement = canvas
    return Promise.resolve()
  },
}

const P = '../../src'
const { CHALLENGES, getChallenge, allOutcomeIds } = await import(`${P}/data/challenges`)
const { SOURCES } = await import(`${P}/data/sources`)
const mission = await import(`${P}/state/mission`)
const decisions = await import(`${P}/state/decisions`)
const { useGame } = await import(`${P}/state/store`)
const panel = await import(`${P}/scene/challenges`)
const { onLine, onStopVoice, lineListenerCount } = await import(`${P}/state/lines`)
const { setLockElement } = await import(`${P}/scene/pointerLock`)
const { requireMap } = await import(`${P}/maps/registry`)

const {
  CAST,
  CHOICE_FLAGS,
  CREW_IDS,
  SPEAKER_IDS,
  STAT_IDS,
  createInitialMission,
  isDone,
} = mission

let failed = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed++
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const game = () => useGame.getState()
const press = (...codes: string[]) => codes.forEach((code) => panel.challengeKey(code))

setLockElement(canvas as any)

// ---------------------------------------------------------------- the cast
check(
  JSON.stringify([...SPEAKER_IDS].sort()) === JSON.stringify(['commander', 'comms', 'safety', 'science', 'trainer']),
  'the speakers are exactly the five voiced characters (no player voice)',
)
check(JSON.stringify(CREW_IDS) === JSON.stringify(['commander', 'safety', 'science']), 'three crew fly and have health faces')
check(
  JSON.stringify(Object.keys(createInitialMission().crewHealth).sort()) === JSON.stringify(['commander', 'safety', 'science']),
  'crew health is kept for those three only',
)
check(CAST.comms.radio === true && CAST.comms.where.includes('Earth'), 'comms is mission control on Earth, radio only')
check(CAST.trainer.where.toLowerCase().includes('launch center'), 'the trainer is in the launch center only')
check(SPEAKER_IDS.every((id: string) => CAST[id].name && CAST[id].initials), 'every speaker has a name and initials in one place')

// ---------------------------------------------------------------- the data
const VALID_EFFECT_KEYS = new Set<string>([...STAT_IDS, 'health', 'remember'])
const sourceIds = new Set(SOURCES.map((entry: any) => entry.outcomeId))
const lineIds = new Set<string>()
const effectProblems = (effects: any): string[] => {
  const problems: string[] = []
  for (const key of Object.keys(effects)) if (!VALID_EFFECT_KEYS.has(key)) problems.push(`unknown meter "${key}"`)
  for (const key of Object.keys(effects.health ?? {})) if (!CREW_IDS.includes(key)) problems.push(`health for "${key}"`)
  for (const key of Object.keys(effects.remember ?? {})) if (!CHOICE_FLAGS.includes(key)) problems.push(`unknown flag "${key}"`)
  for (const key of STAT_IDS) if (effects[key] !== undefined && !Number.isFinite(effects[key])) problems.push(`${key} not a number`)
  return problems
}
const lineProblems = (line: any): string[] => {
  const problems: string[] = []
  if (!SPEAKER_IDS.includes(line.speakerId)) problems.push(`speaker "${line.speakerId}" is not in the cast`)
  if (!line.lineId || lineIds.has(line.lineId)) problems.push(`line id "${line.lineId}" missing or repeated`)
  lineIds.add(line.lineId)
  if (!line.text?.trim()) problems.push(`line ${line.lineId} has no text`)
  return problems
}

check(CHALLENGES.length === mission.TOTAL_CHALLENGES, `there are ${mission.TOTAL_CHALLENGES} challenges`)
check(
  CHALLENGES.every((c: any, i: number) => c.id === i + 1),
  'challenges are numbered 1 to 12 in order',
)
for (const c of CHALLENGES as any[]) {
  const problems: string[] = []
  const map = requireMap(c.map)
  if (map.id !== c.map) problems.push(`map "${c.map}" not built`)
  const at =
    map.consoles.find((item: any) => item.id === c.consoleId) ??
    map.markers.find((marker: any) => marker.id === c.consoleId && marker.kind === 'challenge')
  if (!at) problems.push(`no console or marker "${c.consoleId}" on ${c.map}`)
  else if (at.challengeId !== c.id) problems.push(`"${c.consoleId}" opens challenge ${at.challengeId}`)
  if (!c.title || !c.situation) problems.push('title or situation missing')
  if (c.lines.length < 2) problems.push('needs two crew lines')
  for (const line of c.lines) problems.push(...lineProblems(line))
  if (c.map === 'launch-center' && c.lines.some((l: any) => !['trainer', 'comms'].includes(l.speakerId))) {
    problems.push('only the trainer (or mission control by radio) speaks in the launch center')
  }
  if (c.map !== 'launch-center' && c.lines.some((l: any) => l.speakerId === 'trainer')) problems.push('the trainer speaks outside the launch center')
  if (c.timerSeconds !== undefined) {
    if (!(c.timerSeconds > 0)) problems.push('timer must be positive')
    if (c.kind !== 'choice' || !c.options.some((o: any) => o.id === c.timeoutOption)) problems.push('timer needs a timeoutOption that is one of its options')
  } else if (c.timeoutOption) problems.push('timeoutOption without a timer')
  if (c.kind === 'choice') {
    if (c.options.length !== 3) problems.push('a choice has three options')
    for (const o of c.options) {
      if (!o.label || !o.description || !o.result) problems.push(`${o.id}: label, description and result needed`)
      if (/\d/.test(o.description)) problems.push(`${o.id}: no numbers in the description (arrows only before committing)`)
      problems.push(...effectProblems(o.effects).map((p) => `${o.id}: ${p}`))
      if (!o.sourceIds.length || o.sourceIds.some((id: string) => !sourceIds.has(id))) problems.push(`${o.id}: source ids missing from sources.json`)
      if (o.requires) {
        const r = o.requires
        if (!r.reason) problems.push(`${o.id}: a lock needs a reason`)
        for (const f of [...(r.flags ?? []), ...(r.withoutFlags ?? [])]) if (!CHOICE_FLAGS.includes(f)) problems.push(`${o.id}: requires unknown flag ${f}`)
        for (const k of Object.keys(r.min ?? {})) if (!STAT_IDS.includes(k)) problems.push(`${o.id}: requires unknown meter ${k}`)
        if (r.line) problems.push(...lineProblems(r.line))
      }
      if (o.ruledOut) {
        if (!o.ruledOut.reason) problems.push(`${o.id}: a ruled-out option needs a reason`)
        problems.push(...lineProblems(o.ruledOut.line))
      }
    }
    if (c.options.every((o: any) => o.ruledOut)) problems.push('at least one option must be allowed')
  } else {
    const least = c.buckets.reduce((s: number, b: any) => s + b.min, 0)
    const most = c.buckets.reduce((s: number, b: any) => s + b.max, 0)
    if (!(least <= c.units && c.units <= most)) problems.push(`units ${c.units} must fit between the buckets' minimums (${least}) and maximums (${most})`)
    for (const b of c.buckets) {
      if (!(b.unitSize >= 1) || b.min < 0 || b.max < b.min) problems.push(`${b.id}: unit size, min or max wrong`)
      problems.push(...effectProblems(b.effectsPerUnit).map((p) => `${b.id}: ${p}`))
      if (b.ifEmpty && !CHOICE_FLAGS.includes(b.ifEmpty.remember)) problems.push(`${b.id}: unknown flag ${b.ifEmpty.remember}`)
      if (!b.sourceIds.length || b.sourceIds.some((id: string) => !sourceIds.has(id))) problems.push(`${b.id}: source ids missing from sources.json`)
    }
  }
  check(problems.length === 0, `challenge ${c.id} (${c.title}) data is valid${problems.length ? `: ${problems.join('; ')}` : ''}`)
}
check(allOutcomeIds().every((id: string) => sourceIds.has(id)), 'every outcome has an entry in sources.json')

// ------------------------------------------------- the "no free choice" rule
for (const c of CHALLENGES as any[]) {
  if (c.kind !== 'choice') continue
  const free = decisions.freeChoices(c)
  check(free.length === 0, `challenge ${c.id}: no free choice${free.length ? ` (${free.join(', ')} is never worse)` : ''}`)
}
{
  // The rule itself catches a free choice.
  const cheat = { ...getChallenge(1), options: [
    { id: 'x-a', effects: { power: 10 } },
    { id: 'x-b', effects: { power: 5, dose: 5 } },
    { id: 'x-c', effects: { power: -5 } },
  ] }
  check(JSON.stringify(decisions.freeChoices(cheat)) === '["x-a"]', 'the rule flags an option that is never worse than the others')
}

// ------------------------------------------------------------ preview arrows
{
  const arrows = decisions.previewArrows(getChallenge(1).options[2].effects)
  const power = arrows.find((a: any) => a.stat === 'power')
  const cargo = arrows.find((a: any) => a.stat === 'cargoBlocks')
  check(power?.direction === 'up' && power.size === 3 && power.tone === 'good', 'reactor preview: power up, large, green')
  check(cargo?.direction === 'down' && cargo.size === 3 && cargo.tone === 'bad', 'reactor preview: cargo down, large, red')
  const dose = decisions.previewArrows({ dose: 10 })[0]
  check(dose?.direction === 'up' && dose.tone === 'warn', 'more dose is an orange up arrow (dose going up is bad)')
  check(arrows.every((a: any) => !/\d/.test(a.label)), 'arrows carry no numbers')
}

// ------------------------------------------- challenge 1 by keyboard alone
const heard: string[] = []
const stopListening = onLine((event: any) => heard.push(event.lineId))
{
  game().enterGame(true)
  const before = game().mission
  check(panel.openDecision(1), 'E at the briefing room console opens challenge 1')
  check(game().mode === 'panel' && game().challenge?.stage === 'choose', 'the panel is open in the choose stage')
  check(g.document.pointerLockElement === null, 'opening the panel releases the mouse')
  check(heard.includes('c01-line-1') && heard.includes('c01-line-2'), 'onLine fires for both trainer lines')
  press('Enter')
  check(game().challenge?.stage === 'choose', 'Enter with nothing picked does nothing')
  press('Digit2')
  check(game().challenge?.selected === 1, 'key 2 picks the second option')
  check(JSON.stringify(panel.previewEffects(game().challenge)) === JSON.stringify(getChallenge(1).options[1].effects), 'the picked option is what the ghost bars preview')
  panel.hoverOption(2)
  check(panel.previewEffects(game().challenge) === getChallenge(1).options[2].effects, 'hovering an option previews it instead')
  check(decisions.ghostMeters(before, { power: 50 }).power === 100, 'ghost bars are clamped to the meter')
  panel.hoverOption(null)
  press('ArrowLeft')
  check(game().challenge?.selected === 0, 'the arrows move the pick too')
  press('Digit2', 'Enter')
  const after = game().mission
  check(game().challenge?.stage === 'result', 'Enter commits')
  check(after.cargoBlocks === before.cargoBlocks - 1 && after.meters.power === before.meters.power, 'the fuel cell takes one cargo block')
  check(after.history.length === 1 && after.history[0].outcomeId === 'c01-b', 'the decision is recorded once')
  const changes = game().challenge?.outcome?.changes ?? []
  check(changes.some((c: any) => c.stat === 'cargoBlocks' && c.amount === -1), 'the result shows the exact change (Cargo blocks −1)')
  check(game().challenge?.outcome?.result.length === 1, 'the result says what happened and why')
  press('Enter', 'Enter')
  check(game().challenge === null && game().mode === 'playing', 'Continue closes the panel')
  await flush()
  check(lockRequests === 1 && g.document.pointerLockElement === canvas, 'the mouse is captured again after Continue')
  check(game().usedConsoles.includes(1), 'the console is marked done (it turns green)')
  check(isDone(game().mission, 1) && game().mission.currentChallenge === 2, 'the banner moves on to challenge 2')
  check(game().mission.history.length === 1, 'pressing Enter again changed nothing')

  // Done once per run.
  check(panel.openDecision(1) && game().challenge === null, 'a done challenge does not open again')
  check(decisions.commit(getChallenge(1), game().mission, { kind: 'option', optionId: 'c01-a' }) === null, 'a done challenge cannot be committed again')
  game().clearToast()
}

// ------------------------------------------- challenge 2 by keyboard alone
{
  const before = game().mission
  check(panel.openDecision(2), 'E at the cargo hangar console opens challenge 2')
  const session = game().challenge
  check(session?.total === 9, 'after the fuel cell, there are 9 blocks to place (one fewer)')
  press('Enter')
  check(game().challenge?.stage === 'choose', 'Commit stays off until every block is placed')
  press('Digit1', 'Equal', 'Equal', 'Equal', 'Equal', 'Equal', 'Equal', 'Equal')
  check(game().challenge?.allocation[0] === 6, 'supplies stop at their maximum (6)')
  press('Minus', 'Minus')
  check(game().challenge?.allocation[0] === 4, 'minus takes blocks away')
  press('ArrowRight', 'Equal', 'Equal', 'Equal')
  press('ArrowRight', 'Equal', 'Equal', 'Equal')
  check(game().challenge?.allocation[2] === 2, 'the power gear only takes the 2 blocks left')
  check(decisions.placed(game().challenge!.allocation) === 9, 'nine blocks placed')
  press('ArrowRight', 'Equal')
  check(game().challenge?.allocation[3] === 0, 'no block can be placed past the total')
  press('Digit4', 'Minus')
  check(game().challenge?.allocation[3] === 0, 'no bucket goes below its minimum')
  check(panel.previewEffects(game().challenge)?.lifeSupport === 20, 'the split previews live as blocks move')
  press('Enter')
  const after = game().mission
  check(game().challenge?.stage === 'result', 'Enter commits the split once every block is placed')
  check(after.meters.lifeSupport === before.meters.lifeSupport + 20, 'supplies raise Life Support (4 blocks)')
  check(after.foodDays === before.foodDays + 4, 'supplies add food (4 blocks)')
  check(after.meters.shielding === before.meters.shielding + 30, 'shielding blocks raise Shielding (3 blocks)')
  check(after.meters.power === Math.min(100, before.meters.power + 10), 'power gear raises Power (2 blocks, the last of the nine)')
  check(after.spares === 0 && after.remembered.packedNoSpares === true, 'no spares packed: packedNoSpares is remembered')
  check(!after.remembered.packedNoShielding, 'shielding was packed: packedNoShielding is not set')
  check(game().challenge?.outcome?.result.some((s: string) => s.includes('spare parts')), 'the result says the spares were left behind')
  check(after.history.at(-1)?.allocation?.['c02-spares'] === 0, 'the split is recorded for the debrief')
  press('Enter')
  check(game().challenge === null && game().usedConsoles.includes(2), 'challenge 2 is done')
}

// ------------------------- the cargo dependency: challenge 1 sets the blocks
{
  game().enterGame(true)
  check(decisions.splitTotal(getChallenge(2), game().mission) === 10, 'with challenge 1 not done, there are 10 blocks')
  panel.openDecision(1)
  press('Digit3', 'Enter', 'Enter')
  check(decisions.splitTotal(getChallenge(2), game().mission) === 7, 'after the reactor, 7 blocks (heavier power source)')
  check(game().mission.remembered.choseReactor === true, 'the reactor is remembered')
  game().enterGame(true)
  panel.openDecision(1)
  press('Digit1', 'Enter', 'Enter')
  check(game().mission.remembered.choseSolarOnly === true && decisions.splitTotal(getChallenge(2), game().mission) === 10, 'solar only: choseSolarOnly is set, 10 blocks')
  // Packing no shielding is remembered too.
  panel.openDecision(2)
  press('Digit1', 'Equal', 'Equal', 'Equal', 'Equal', 'Equal', 'Equal', 'Digit3', 'Equal', 'Equal', 'Digit4', 'Equal', 'Equal', 'Enter')
  check(game().mission.remembered.packedNoShielding === true && game().mission.spares === 2, 'no shielding packed is remembered; two spares are on board')
  press('Enter')
}

// --------------------------------------------- locked options (challenge 3)
{
  const c3 = getChallenge(3) as any
  const wasReady = c3.ready
  c3.ready = true
  game().enterGame(true)
  const noSpares = game().mission
  check(decisions.lockOf(c3.options[0], noSpares)?.reason === 'No spare parts packed', 'with no spares, repairing is locked with its reason')
  check(decisions.commit(c3, noSpares, { kind: 'option', optionId: 'c03-a' }) === null, 'a locked option cannot be committed')
  heard.length = 0
  panel.openDecision(3)
  press('Digit1')
  check(game().challenge?.selected === 0 && heard.includes('c03-a-locked'), 'picking it shows the crew line that explains the lock')
  check(!panel.canCommit(game().challenge, game().mission), 'Commit is off for a locked option')
  check(panel.previewEffects(game().challenge, game().mission) === null, 'a locked option draws no ghost bars')
  press('Enter')
  check(game().challenge?.stage === 'choose' && game().mission.history.length === 0, 'Enter does not commit it')
  press('Escape')
  check(game().challenge === null && game().mode === 'playing', 'Esc backs out without choosing')
  check(game().mission.history.length === 0 && !isDone(game().mission, 3), 'backing out records nothing')
  // With a spare on board it unlocks, and repairing uses it.
  useGame.setState({ mission: { ...game().mission, spares: 1 } })
  panel.openDecision(3)
  press('Digit1', 'Enter')
  check(game().mission.spares === 0 && game().mission.history[0]?.outcomeId === 'c03-a', 'with a spare, the repair commits and uses the spare')
  press('Enter')
  c3.ready = wasReady
}

// ------------------------- ruled-out options (challenge 5: the outpost is on the slope)
{
  game().enterGame(true)
  const c5 = getChallenge(5) as any
  const start = game().mission
  for (const option of c5.options.slice(0, 2)) {
    check(decisions.commit(c5, start, { kind: 'option', optionId: option.id }) === null, `${option.label} can never be committed`)
  }
  heard.length = 0
  panel.openDecision(5)
  press('Digit1')
  check(heard.includes('c05-a-ruled-out') && !panel.canCommit(game().challenge, game().mission), 'picking the sunny ridge brings the crew line saying why not, and Commit is off')
  const stopped: (string | undefined)[] = []
  const offStop = onStopVoice((id?: string) => stopped.push(id))
  press('Digit2')
  check(heard.includes('c05-b-ruled-out') && !panel.canCommit(game().challenge, game().mission), 'picking the crater rim does the same')
  check(stopped.includes('c05-a-ruled-out') && !stopped.includes('c05-b-ruled-out'), 'and the ridge line, now out of date, is stopped (lines queue)')
  press('Enter')
  check(game().challenge?.stage === 'choose' && game().mission.history.length === 0, 'Enter lands on neither')
  stopped.length = 0
  press('Digit3', 'Enter')
  check(game().mission.history[0]?.outcomeId === 'c05-c' && game().mission.remembered.landedSlope === true, 'the slope between, where the outpost stands, commits')
  check(stopped.includes('c05-b-ruled-out'), 'and no "why not" line plays on over the result')
  offStop()
  press('Enter')
}

// ---------------------------------------------- the timer (challenge 10)
{
  game().enterGame(true)
  const before = game().mission
  check(panel.openDecision(10, 0) && game().challenge === null, 'the storm does not open from its console (it is an event)')
  game().clearToast()
  panel.openDecision(10, 0, { event: true })
  check(game().challenge?.deadline === 15_000, 'the storm gives fifteen seconds with the antenna powered (warned by Houston)')
  press('Escape')
  check(game().challenge?.stage === 'choose', 'Esc does not back out of a timed challenge')
  panel.tickChallenge(14_999)
  check(game().challenge?.stage === 'choose', 'nothing happens before time runs out')
  check(panel.secondsLeft(game().challenge, 4_000) === 11, 'eleven seconds left after four')
  panel.tickChallenge(15_000)
  const outcome = game().challenge?.outcome
  check(outcome?.timedOut === true && outcome.outcomeId === 'c10-a', 'when time runs out, the timeout option happens')
  check(outcome?.result[0] === 'You ran out of time, so the commander decided.', 'the result says the commander decided')
  check(game().mission.meters.power === before.meters.power - 10, 'the timeout option\'s effects apply')
  panel.tickChallenge(30_000)
  check(game().mission.history.length === 1 && game().mission.history[0].timedOut === true, 'it applies once, marked as timed out')
}

// ------------------------------------- not ready yet: the "coming soon" panel
{
  // Every challenge is playable now; switch one off to check the "coming soon" path still works.
  const c8 = getChallenge(8) as any
  c8.ready = false
  check(panel.openDecision(8) === false, 'a challenge that is not ready yet does not open the decision panel')
  c8.ready = true
}

// ------------------------------------------------------- memory stays flat
{
  game().enterGame(true)
  const listeners = lineListenerCount()
  const requests = lockRequests
  for (let i = 0; i < 500; i++) {
    panel.openDecision(2)
    press('Digit1', 'Equal', 'Digit2', 'Equal', 'Escape')
  }
  await flush()
  check(game().challenge === null && game().mode === 'playing', 'after 500 opens and closes the panel is closed')
  check(lineListenerCount() === listeners, `no line listeners pile up (${lineListenerCount()})`)
  check(game().mission.history.length === 0 && game().usedConsoles.length === 0, 'opening and closing records nothing')
  check(lockRequests >= requests, 'backing out asks for the mouse again each time')
  stopListening()
  check(lineListenerCount() === listeners - 1, 'onLine unsubscribes')
}

console.log(failed ? `${failed} FAILED` : 'All decision checks passed.')
process.exit(failed ? 1 : 0)
