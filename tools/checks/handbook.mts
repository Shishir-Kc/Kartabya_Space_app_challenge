/**
 * The Mission Handbook's reasoning, headless: `npx tsx tools/checks/handbook.mts`.
 *
 * - A replay of a run's timeline reproduces it exactly (same seed, hazards, nights).
 * - The ending's main cause always matches the ending type, and the tip
 *   targets that cause (a crew-health ending never gets a food tip).
 * - "Better choices" are suggested only when the replay really ends better.
 * - The luck verdict is right for the four seeded cases: careful choices
 *   with the worst luck, poor choices with no hazards, good choices with
 *   ordinary luck, poor choices with ordinary luck.
 */
const g = globalThis as any
g.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false }), location: { search: '' } }
g.document = { documentElement: { dataset: {} }, pointerLockElement: null, exitPointerLock() {} }

const P = '../../src'
const { useGame } = await import(`${P}/state/store`)
const panel = await import(`${P}/scene/challenges`)
const run = await import(`${P}/scene/run`)
const session = await import(`${P}/scene/session`)
const handbook = await import(`${P}/state/handbook`)
const replay = await import(`${P}/state/replay`)

let failed = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed++
}
const game = () => useGame.getState()
const press = (...codes: string[]) => codes.forEach((code) => panel.challengeKey(code))

type Key = 1 | 2 | 3
interface Plan {
  name: string
  power: Key
  cargo: [number, number, number, number]
  scrubber: Key
  site: Key
  base: [number, number, number, number]
  greenhouse: Key
  rest: Key
  ice: Key
  night: Key
  transit: Key[]
  storms: Key[]
  meteoroids: Key[]
}
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
function continueOn() {
  press('Enter')
  const transition = game().transition
  if (transition) session.finishTransition(transition.after)
  if (game().night) run.runKey('Enter')
}
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
function meet(kind: string, answer: Key) {
  if (game().afterword) return
  run.triggerHazard(kind as any, 1000)
  if (!game().challenge) return
  for (const k of [answer, 1, 2, 3]) {
    press(`Digit${k}`, 'Enter')
    if (game().challenge?.stage === 'result') break
  }
  continueOn()
}
function play(plan: Plan, seed: number) {
  run.setHazardMode('none')
  run.tryAgain()
  useGame.setState({ mission: { ...game().mission, seed } })
  run.resetStorm()
  decide(1, plan.power)
  panel.openDecision(2); placeSplit(plan.cargo); press('Enter'); continueOn()
  useGame.setState({ mapId: 'spacecraft', mode: 'playing', focus: null })
  decide(3, plan.scrubber)
  for (const a of plan.transit) meet('transitStorm', a)
  decide(5, plan.site)
  useGame.setState({ mapId: 'outpost', mode: 'playing', focus: null })
  if (!game().afterword) {
    panel.openDecision(6); placeSplit(plan.base); press('Enter'); continueOn()
  }
  decide(7, plan.greenhouse)
  decide(9, plan.rest)
  for (const a of plan.storms) meet('outpostStorm', a)
  decide(8, plan.ice)
  for (const a of plan.meteoroids) meet('meteoroid', a)
  decide(12, plan.night)
  return game().mission
}

const careful: Plan = {
  name: 'careful',
  power: 3,
  cargo: [3, 2, 0, 2],
  scrubber: 1,
  site: 3,
  base: [2, 2, 1, 1],
  greenhouse: 2,
  rest: 1,
  ice: 1,
  night: 1,
  transit: [],
  storms: [1],
  meteoroids: [1],
}
const poor: Plan = {
  name: 'poor',
  power: 2,
  cargo: [6, 0, 3, 0],
  scrubber: 2,
  site: 3,
  base: [2, 2, 0, 2],
  greenhouse: 2,
  rest: 2,
  ice: 2,
  night: 1,
  transit: [],
  storms: [],
  meteoroids: [],
}

const CASES: { name: string; plan: Plan; seed: number; good: boolean; verdict: string }[] = [
  {
    name: 'careful choices, the worst luck (3 storms in transit, 3 at the outpost, 3 meteoroids)',
    plan: { ...careful, power: 2, cargo: [4, 3, 1, 1], transit: [1, 1, 1], storms: [1, 1, 1], meteoroids: [1, 1, 1] },
    seed: 11,
    good: false,
    verdict: 'unlucky',
  },
  { name: 'poor choices, no hazards at all', plan: poor, seed: 22, good: true, verdict: 'lucky' },
  { name: 'careful choices, ordinary luck', plan: careful, seed: 33, good: true, verdict: 'paid-off' },
  { name: 'poor choices, ordinary luck', plan: { ...poor, transit: [3], storms: [3] }, seed: 44, good: false, verdict: 'choices' },
]

const CAUSE_TIP: Record<string, RegExp> = {
  radiation: /shield|shelter|storm|antenna|drill/i,
  'worn-out': /rest|shelter|life support|crew/i,
  food: /greenhouse|plant|supplies|food/i,
  air: /life support|ice|air/i,
  power: /power|fuel cell|reactor|spare|ridge|solar/i,
  shielding: /shield|drill/i,
  success: /.*/,
}
const ENDING_CAUSES: Record<string, string[]> = {
  'early-return-health': ['radiation', 'worn-out'],
  'early-return-supplies': ['food', 'air', 'power', 'shielding'],
  'outpost-thrives': ['success'],
  'mission-complete': ['success'],
}

const played: any[] = []
for (const c of CASES) {
  const m = play(c.plan, c.seed)
  played.push(m)
  console.log(`  ${c.name}: ${m.ending} (dose ${m.dose.toFixed(1)}, hazards ${m.hazards.transitStorm}/${m.hazards.outpostStorm}/${m.hazards.meteoroid})`)
  check(m.status === 'ended', `${c.name}: the run ends`)
  const again = replay.replay(m.seed, m.timeline)
  check(!!again && again.ending === m.ending && Math.abs(again.dose - m.dose) < 1e-9 && JSON.stringify(again.meters) === JSON.stringify(m.meters) && again.foodDays === m.foodDays, `${c.name}: replaying its timeline reproduces it exactly`)
  check(replay.endingRank(m) >= 2 === c.good, `${c.name}: ends ${c.good ? 'well' : 'early'} (${m.ending})`)
  const cause = handbook.mainCause(m)
  check(ENDING_CAUSES[m.ending!]!.includes(cause.cause), `${c.name}: the main cause (${cause.cause}) matches the ending (${m.ending})`)
  const tip = handbook.nextTip(m)
  check(CAUSE_TIP[cause.cause]!.test(tip), `${c.name}: the tip targets the cause: "${tip}"`)
  const luck = handbook.luckReport(m)
  console.log(`    ${luck.comparison} Without hazards: ${luck.withoutHazards?.ending}; with more: ${luck.withMoreHazards?.ending}. Dose: ${luck.dose.choices.toFixed(0)} mSv choices, ${luck.dose.hazards.toFixed(0)} storms, ${luck.dose.background.toFixed(1)} background.`)
  check(luck.verdict === c.verdict, `${c.name}: the verdict is "${handbook.VERDICT_TEXT[c.verdict as keyof typeof handbook.VERDICT_TEXT]}" (got ${luck.verdict})`)
  // Better choices: every suggestion really ends better in its replay.
  const reviews = handbook.betterChoices(m)
  let honest = true
  for (const r of reviews.filter((x: any) => x.better)) {
    const step = m.timeline[r.index]
    const challenge = r.challenge
    const decision =
      challenge.kind === 'choice'
        ? { kind: 'option', optionId: challenge.options.find((o: any) => o.label === r.better.label).id }
        : { kind: 'split', allocation: challenge.buckets.map((b: any) => Number(r.better.label.split(' · ').find((part: string) => part.startsWith(b.label))!.slice(b.label.length + 1))) }
    const better = replay.replay(m.seed, m.timeline, { swap: { index: r.index, decision } })
    if (!better || replay.outcomeScore(better) <= replay.outcomeScore(m)) honest = false
    void step
  }
  check(honest, `${c.name}: each of its ${reviews.filter((x: any) => x.better).length} "better choice" suggestions really ends better when replayed`)
  check(reviews.length === m.timeline.filter((s: any) => s.kind === 'decision').length, `${c.name}: every decision is reviewed`)
}

// Rishab's case: an early return for crew health must never get a food tip.
{
  const m = play({ ...poor, cargo: [1, 0, 4, 0], base: [2, 0, 2, 2], greenhouse: 3, transit: [3], storms: [3, 3] }, 55)
  const tip = handbook.nextTip(m)
  console.log(`  crew-health case: ${m.ending}, food ${m.foodDays}, tip "${tip}"`)
  check(m.ending === 'early-return-health' && !/food|supplies|plant|greenhouse/i.test(tip), 'a crew-health ending never gets a food tip, even when food was also low')
}

// Captions and real life.
{
  const m = play({ ...careful, storms: [2] }, 66)
  const doseCaptions = handbook.captions(m, 'dose')
  check(doseCaptions.some((c: string) => /solar storm hit/.test(c)), `the dose chart explains its big rise: "${doseCaptions[0] ?? ''}"`)
  const real = handbook.realLife(m)
  check(real.entries.some((e: any) => /class [CMX]\d/.test(e.text)) && real.entries.some((e: any) => /250 mSv/.test(e.text)) && real.entries.some((e: any) => /5\.6 seconds/.test(e.text)), 'Real life names the real flare, NASA’s 250 mSv limit and the 5.6-second delay')
  check(real.entries.some((e: any) => /happened 119 times in 2024/.test(e.text)), 'Real life says how often big radiation storms really happened in 2024')
  check(real.entries.every((e: any) => !e.link || /^https:\/\//.test(e.link.url)), 'every real-life fact links to its source')
}

// HANDBOOK_SAVE=<dir> writes each case's finished mission as JSON, to open its handbook in the browser (__lunar.handbook(mission)).
if (process.env.HANDBOOK_SAVE) {
  const { writeFileSync } = await import('node:fs')
  played.forEach((m, i) => writeFileSync(`${process.env.HANDBOOK_SAVE}/mission-${i}.json`, JSON.stringify(m)))
}

// The book for a 7-year-old: short sentences, no vague words, grouped by day, every link resolves.
{
  const story = await import(`${P}/state/handbookStory`)
  const { VAGUE_WORDS } = await import(`${P}/data/handbookWords`)
  const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter(Boolean)
  const words = (sentence: string) => sentence.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length
  let longest = { n: 0, s: '' }
  const vague: string[] = []
  for (const m of played) {
    for (const text of story.allText(m, 'Rishab')) {
      for (const s of sentences(text)) if (words(s) > longest.n) longest = { n: words(s), s }
      for (const w of VAGUE_WORDS) if (new RegExp(`\\b${w.replace('.', '\\.')}(?![a-z])`, 'i').test(text)) vague.push(`${w}: ${text}`)
    }
  }
  check(longest.n <= 15, `every handbook sentence has 15 words or fewer (longest ${longest.n}: "${longest.s}")`)
  check(vague.length === 0, `no vague words in the handbook${vague.length ? `: ${vague.slice(0, 3).join(' | ')}` : ''}`)

  for (const [i, m] of played.entries()) {
    const days = story.missionStory(m, 'Rishab')
    // HANDBOOK_DUMP=1 prints the whole story of each case, to read it like a child would.
    if (process.env.HANDBOOK_DUMP) {
      console.log(`\n===== ${CASES[i]!.name}`)
      for (const d of days) {
        console.log(`--- ${d.title} (${d.place})${d.quiet ? ' [quiet]' : ''}`)
        for (const c of d.cards) console.log(`  [${c.tag}] ${c.title}\n    happened: ${c.happened.join(' ')}\n    why: ${c.why.join(' ')}\n    changed: ${c.changed.map((r: any) => r.text).join(' | ')}${c.links.map((l: any) => `\n    ${l.direction === 'back' ? '←' : '→'} ${l.text}`).join('')}${c.word ? `\n    word: ${c.word.word}: ${c.word.meaning}` : ''}`)
      }
    }
    const ids = days.map((d: any) => d.id)
    check(ids[0] === 'launch' && ids[1] === 'trip' && ids.slice(2).every((id: string) => id.startsWith('day-') || id === 'last'), `${CASES[i]!.name}: the log runs launch day, the trip, then the outpost days (${ids.join(', ')})`)
    const cards = days.flatMap((d: any) => d.cards)
    const byId = new Map(cards.map((c: any) => [c.id, c]))
    check(cards.every((c: any) => c.links.every((l: any) => byId.has(l.to))), `${CASES[i]!.name}: every link chip leads to a card`)
    const consequences = cards.filter((c: any) => c.tag === 'consequence')
    check(consequences.every((c: any) => c.links.some((l: any) => l.direction === 'back')), `${CASES[i]!.name}: each of its ${consequences.length} consequences links back to its cause`)
    check(cards.filter((c: any) => c.tag === 'choice' || c.tag === 'luck').every((c: any) => c.happened.length > 0 && c.why.length > 0), `${CASES[i]!.name}: every choice and luck card says what happened and why`)
    check(cards.filter((c: any) => c.tag === 'night').every((c: any) => c.happened.length > 0 && c.changed.length > 0), `${CASES[i]!.name}: every night card says what changed`)
    check(cards.at(-1).tag === 'ending', `${CASES[i]!.name}: the log ends with how the mission ended`)
    const meters = story.meterPages(m, days)
    check(meters.length === 5 && meters.every((p: any) => (p.reasons.length >= 1 && p.reasons.length <= 4) || (p.reasons.length === 0 && p.steady)), `${CASES[i]!.name}: each meter gives 1 to 4 dated reasons (or says it never moved)`)
  }
}

// Page breaks: never overflow, keep headers with what follows, meters alone, and balance the log.
{
  const { paginate, fullness } = await import(`${P}/hud/paginate`)
  // Heights measured from a real run at 1366 x 768 (the mission log).
  const log = [126, 49, 318, 344, 155, 49, 284, 217, 155, 49, 313, 370, 49, 217, 274, 49, 188, 303, 49, 313, 274, 303, 49, 313, 49, 284, 218, 303, 153]
  const blocks = log.map((h, i) => ({ section: 'log', keepWithNext: i === 0 || h === 49 }))
  const room = { room: 572, firstExtra: 43, gap: 16 }
  const pages = paginate(blocks, log, room)
  const fill = fullness(pages, log, room, (n: number) => n === 0)
  check(pages.flat().join() === log.map((_, i) => i).join(), 'paginate keeps every block, in order')
  check(fill.every((f: number) => f <= 1), `no page overflows (fullest ${Math.round(Math.max(...fill) * 100)}%)`)
  check(pages.every((p: number[], n: number) => n === pages.length - 1 || !blocks[p.at(-1)!]!.keepWithNext), 'a day header never ends a page')
  // The greedy way, for comparison: fill each page until the next block doesn't fit.
  const greedy: number[] = []
  let used = 0
  let first = true
  for (const h of log) {
    const cap = room.room + (first ? room.firstExtra : 0)
    if (used && used + room.gap + h > cap) {
      greedy.push(used / cap)
      used = 0
      first = false
    }
    used += (used ? room.gap : 0) + h
  }
  const spread = (list: number[]) => Math.max(...list) - Math.min(...list)
  const inner = fill.slice(0, -1)
  console.log(`    log pages: ${fill.map((f: number) => `${Math.round(f * 100)}%`).join(' ')}`)
  check(spread(inner) <= spread(greedy) + 1e-9, `balanced breaks spread the log more evenly than greedy (${Math.round(spread(inner) * 100)} vs ${Math.round(spread(greedy) * 100)} points)`)
  const meters = paginate([{ section: 'meters', keepWithNext: true }, { section: 'meters' }, { section: 'meters', alone: true }, { section: 'meters', alone: true }], [98, 244, 300, 300], room)
  check(meters.length === 3 && meters[1]!.length === 1 && meters[2]!.length === 1, 'each meter gets a page of its own')
  const real = paginate([{ section: 'real', keepWithNext: true }, ...[250, 400, 150, 250, 200].map(() => ({ section: 'real' }))], [98, 250, 400, 150, 250, 200], room)
  check(real.flat().length === 6 && real.every((p: number[]) => p.reduce((s: number, k: number, i: number) => s + [98, 250, 400, 150, 250, 200][k]! + (i ? 16 : 0), 0) <= 615), 'Real life cards fill gaps out of order, without overflowing')
}

console.log(failed ? `${failed} FAILED` : 'All handbook checks passed.')
process.exit(failed ? 1 : 0)
