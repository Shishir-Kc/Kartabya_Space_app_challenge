// Headless checks for the launch and landing cinematics.  Run: npx tsx tools/checks/cinematic.mts
const P = new URL('../../src', import.meta.url).pathname
const { Texture } = await import('three')
const timeline = await import(`${P}/scene/cinematic/timeline`)
const launch = await import(`${P}/scene/cinematic/launchScript`)
const { TOWER_HEIGHT } = await import(`${P}/scene/kit/exterior`)
const landing = await import(`${P}/scene/cinematic/landingScript`)
const { ParticleField } = await import(`${P}/scene/cinematic/particles`)
const { SPACECRAFT } = await import(`${P}/maps/spacecraft`)
const sequences = await import(`${P}/scene/sequences`)
const { useGame } = await import(`${P}/state/store`)
const { flight } = await import(`${P}/state/flight`)
const { cinematic, onCue } = await import(`${P}/state/cinematic`)
const { player } = await import(`${P}/state/player`)

let failed = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed++
}

// ---- Both scripts are well formed ----
for (const script of [launch.LAUNCH_SCRIPT, landing.LANDING_SCRIPT]) {
  const shots = script.shots
  let contiguous = shots[0].from === 0
  for (let i = 1; i < shots.length; i++) contiguous &&= Math.abs(shots[i].from - shots[i - 1].to) < 1e-9
  check(contiguous && shots[shots.length - 1].to >= script.duration, `${script.id}: shots run back to back from 0 to the end (${script.duration} s)`)
  const times = script.events.map((e: any) => e.at)
  check(times.every((t: number, i: number) => i === 0 || t >= times[i - 1]) && times.every((t: number) => t > 0 && t <= script.duration), `${script.id}: events are in order and inside the script`)
  check(new Set(script.events.map((e: any) => e.id)).size === script.events.length, `${script.id}: every event has its own id (for its sound hook)`)
  check(script.events.every((e: any) => e.caption === undefined), `${script.id}: no sentence captions`)
  const labels = script.events.filter((e: any) => e.label).map((e: any) => e.label)
  check(labels.length > 0 && labels.every((l: string) => { const words = l.split(' ').length; return words >= 1 && words <= 4 && !/[.!?]/.test(l) }), `${script.id}: only short labels (${labels.join(', ')})`)
  for (const shot of shots.filter((s: any) => s.scene !== 'cockpit')) {
    let ok = true
    for (let t = shot.from; t < Math.min(shot.to, script.duration); t += 0.25) {
      const c = timeline.cameraAt(script, shot, t)
      ok &&= [...c.position, ...c.target, c.fov].every(Number.isFinite) && c.fov > 5 && c.fov < 90
    }
    check(ok, `${script.id}: the ${shot.id} shot's camera is valid all through`)
  }
}

// ---- The launch ----
const LT = launch.LAUNCH_TIMES
const L = launch.LAUNCH_SCRIPT
check(timeline.shotAt(L, LT.liftoff - 0.05).scene === 'cockpit' && launch.countdownAt(LT.liftoff - 0.05) === 1, 'launch: the countdown runs in the cockpit right down to T-1')
check(launch.countdownAt(LT.countdown + 0.01) === 10 && launch.countdownAt(LT.liftoff) === 0, 'launch: 10 down to 0')
// The cockpit consoles: "Preparing for launch" through the countdown, "Launching" once the engines start, then their tasks again.
{
  const at = (t: number, step = t < LT.liftoff ? 'countdown' : t < LT.cutIn ? 'ascent' : 'cutoff') => launch.launchConsoleTitle({ id: 'launch', step, countdown: t < LT.liftoff ? launch.countdownAt(t) : null })
  check(at(0) === 'Preparing for launch' && at(LT.countdown + 0.01) === 'Preparing for launch' && at(LT.ignition - 0.05) === 'Preparing for launch', 'launch: strapped in and counting down, the consoles say "Preparing for launch"')
  check(at(LT.ignition) === 'Launching' && at(LT.liftoff - 0.05) === 'Launching' && at(LT.liftoff + 1) === 'Launching', 'launch: from the engines starting (T-6), they say "Launching"')
  check(at(LT.cutIn + 0.5) === null && at(LT.unbuckle + 1, 'unbuckle') === null, 'launch: back in the cockpit, weightless, the consoles show their tasks again')
  check(launch.launchConsoleTitle(null) === null && launch.launchConsoleTitle({ id: 'landing', step: 'descent', countdown: null }) === null, 'launch: outside the launch, the consoles show their tasks')
}
check(timeline.shotAt(L, LT.liftoff + 0.01).scene === 'launch-pad', 'launch: cut outside at T-0')
check(launch.launchShake(LT.ignition - 0.1) === 0 && launch.launchShake(LT.ignition + 0.5) > 0 && LT.liftoff - LT.ignition === 6, 'launch: a rumble through the seat from engine start at T-6')
{
  const before = launch.launchEffects(LT.liftoff - 0.2)
  const starting = launch.launchEffects(LT.ignition + 1).first
  check(launch.launchEffects(LT.ignition - 0.1).first === 0 && starting > 0.2 && starting < before.first && before.first > 0.9, 'launch: the F-1s start at T-6 and build up to full thrust by T-0')
  check(launch.launchEffects(LT.liftoff + 0.5).first === 1 && L.events.some((e: any) => e.id === 'hold-downs-release' && e.at >= LT.liftoff), 'launch: at full thrust as the hold-down arms let go')
  check(before.steam > 0.5 && before.vent > 0.5, 'launch: steam and venting vapour before liftoff')
}
check(L.events.find((e: any) => e.id === 'liftoff')?.banner === 'LIFTOFF', 'launch: "LIFTOFF" shows at T-0')
const pad = launch.PAD
const h = (s: number) => launch.rocketHeight(LT.liftoff + s)
check(h(0) === 0 && h(2) < 6, `launch: slow at first (${h(2).toFixed(1)} m in 2 s)`)
check(h(9) + launch.ROCKET_BASE > TOWER_HEIGHT && L.events.find((e: any) => e.id === 'tower-clear').at - LT.liftoff >= 8, `launch: clears the ${TOWER_HEIGHT} m service tower in about 9 s (its base ${(h(9) + launch.ROCKET_BASE).toFixed(0)} m up)`)
check(launch.rocketPose(LT.liftoff + 4).tilt === 0 && launch.rocketPose(LT.liftoff + 16).tilt > 0.3 && launch.rocketPose(LT.liftoff + 18).base[0] > pad[0] + 30, 'launch: pitches over toward the ocean in the east')
check(launch.rocketPose(LT.liftoff + 10).roll > 0.5, 'launch: the roll program')
{
  // The order of events, all in one outside cinematic.
  const order = [LT.liftoff, LT.firstCutoff, LT.firstSeparation, LT.secondIgnition, LT.interstageJettison, LT.towerJettison, LT.secondCutoff, LT.secondSeparation, LT.thirdIgnition, LT.tliStart, LT.spacecraftSeparation, LT.cutIn]
  check(order.every((t, i) => i === 0 || t > order[i - 1]), 'launch: liftoff, first stage, interstage, escape tower, second stage, third stage, trans-lunar burn, spacecraft separation, in the Saturn V\'s order')
  let outside = true
  for (let t = LT.liftoff + 0.01; t < LT.cutIn; t += 0.1) outside &&= timeline.shotAt(L, t).scene === 'launch-pad'
  check(outside && LT.cutIn - LT.liftoff >= 50 && LT.cutIn - LT.liftoff <= 70, `launch: one continuous outside cinematic, ${LT.cutIn - LT.liftoff} s`)
  for (const [id, label] of [
    ['first-stage-separation', 'First stage separation'],
    ['tower-jettison', 'Escape tower jettison'],
    ['second-stage-separation', 'Second stage separation'],
    ['tli-start', 'Trans-lunar injection'],
    ['spacecraft-separation', 'Spacecraft separation'],
  ]) check(L.events.find((e: any) => e.id === id)?.label === label, `launch: "${label}" labels its event`)
  check(L.events.some((e: any) => e.fade?.text === 'Later, in Earth orbit' && e.at < LT.tliStart), 'launch: a fade, "Later, in Earth orbit", before the trans-lunar burn')
  const shotAt = (t: number) => timeline.shotAt(L, t)
  check([LT.firstSeparation, LT.interstageJettison, LT.towerJettison, LT.secondSeparation, LT.tliStart, LT.spacecraftSeparation].every((t) => shotAt(t).set === 'space'), 'launch: everything after the climb is seen high up, in space')
  check(launch.skyBlackness(LT.firstSeparation) < 0.6 && launch.skyBlackness(LT.secondSeparation) === 1, 'launch: the sky deep blue at first stage separation, black by second stage separation')
  check(launch.altitudeKm(LT.firstSeparation) > 40 && launch.altitudeKm(LT.tliStart) >= 180, `launch: Earth's curve below, from ${launch.altitudeKm(LT.firstSeparation).toFixed(0)} km up to orbit at ${launch.altitudeKm(LT.tliStart).toFixed(0)} km`)
}
{
  const at = (t: number) => launch.launchEffects(t)
  const m = (t: number) => launch.partMotion(t)
  check(at(LT.firstCutoff - 0.3).first > 0.9 && at(LT.firstSeparation).first === 0 && at(LT.firstSeparation).second === 0 && at(LT.secondIgnition + 1).second > 0.9, 'launch: the F-1s stop, the first stage separates, then the second stage\'s J-2s light')
  const f = m(LT.firstSeparation + 3).first
  check(m(LT.firstSeparation - 0.05).first.offset[1] === 0 && f.offset[1] < -20 && Math.abs(f.spin[2]) > 0.15, 'launch: the empty first stage falls back and tumbles')
  check(m(LT.interstageJettison - 0.05).interstage.offset[1] === 0 && m(LT.interstageJettison + 3).interstage.offset[1] < -10 && LT.interstageJettison - LT.firstSeparation >= 3, 'launch: the interstage ring drops away a while after the first stage')
  check(at(LT.towerJettison + 0.5).towerMotor > 0.9 && m(LT.towerJettison + 2).tower.offset[1] > 40 && m(LT.towerJettison - 0.1).tower.offset[1] === 0, 'launch: the tower\'s motor fires and it shoots forward, pulling the shroud off')
  check(launch.shroudAt(LT.towerJettison - 0.1) === 1 && launch.shroudAt(LT.towerJettison + 0.1) === 0, 'launch: in the cockpit, the windows are covered until the tower goes')
  check(at(LT.secondCutoff + 0.2).second === 0 && m(LT.secondSeparation + 3).second.offset[1] < -10 && at(LT.thirdIgnition + 1).third > 0.9, 'launch: the second stage stops and drops back; the third stage lights')
  check(at((LT.tliStart + LT.tliEnd) / 2).third > 0.9 && at(LT.tliEnd + 0.5).third === 0, 'launch: the trans-lunar burn on the third stage, then it shuts down')
  check(m(LT.orbitFade + 0.5).second.visible && !m(LT.tliStart).second.visible, 'launch: the second stage is gone after the jump to Earth orbit')
  const sep = m(LT.spacecraftSeparation + 4)
  check(sep.spacecraft.offset[1] > 2 && sep.third.offset[1] < -1, 'launch: the spacecraft drifts ahead, the empty third stage falls behind')
  check(at(LT.panelsStart - 0.1).panels === 0 && at(LT.panelsEnd).panels === 1 && LT.panelsStart > LT.spacecraftSeparation, 'launch: the adapter\'s panels open on the lunar module after separation')
}
{
  // Every outside camera keeps its distance from the stack: never inside the rocket.
  let closest = Infinity
  for (let t = LT.space; t < LT.cutIn; t += 0.1) {
    const c = timeline.cameraAt(L, timeline.shotAt(L, t), t).position
    const s = launch.launchSubject(t)
    closest = Math.min(closest, Math.hypot(c[0] - s[0], c[1] - s[1], c[2] - s[2]))
  }
  check(closest > 35, `launch: the chase cameras stay clear of the 111 m rocket (closest ${closest.toFixed(1)} m)`)
}

// ---- The landing ----
const DT = landing.LANDING_TIMES
const D = landing.LANDING_SCRIPT
{
  let monotone = true
  for (let t = 0.1; t <= DT.touchdown; t += 0.05) monotone &&= landing.landerAltitude(t) <= landing.landerAltitude(t - 0.05) + 1e-6
  check(monotone, 'landing: always coming down')
  const a0 = landing.landerAltitude(0)
  const aPitch = landing.landerAltitude(DT.pitchOverStart)
  const aCut = landing.landerAltitude(DT.cutOut)
  check(a0 >= 14000 && aPitch > 1500 && aPitch < 2500 && aCut > 400 && aCut < 600, `landing: from 15 km; pitch-over at about 2 km (${aPitch.toFixed(0)} m); cut outside at about 500 m (${aCut.toFixed(0)} m)`)
  check(landing.landerPitch(5) > 0.8 && landing.landerPitch(DT.pitchOverEnd + 0.5) < 0.6, 'landing: tipped over while braking, upright-ish after the pitch-over')
  check(timeline.shotAt(D, DT.cutOut - 0.05).scene === 'cockpit' && timeline.shotAt(D, DT.cutOut + 0.05).scene === 'landing-site' && timeline.shotAt(D, DT.groundShot + 0.1).id === 'ground', 'landing: cockpit, then the chase view, then from the ground')
  const touch = landing.landerPose(DT.touchdown)
  check(Math.hypot(touch.base[0] - landing.LANDING_PAD.x, touch.base[2] - landing.LANDING_PAD.z) < 0.01 && Math.abs(touch.base[1] - landing.padHeight()) < 0.01, 'landing: touches down on the pad')
  check(landing.descentRate(DT.touchdown - 0.15) < 3, `landing: gently (${landing.descentRate(DT.touchdown - 0.15).toFixed(1)} m/s just before touchdown)`)
  const hover = landing.descentRate(26)
  const sideways = Math.abs(landing.landerPose(24.5).base[2] - landing.landerPose(27.5).base[2])
  check(hover < 4 && sideways > 3, `landing: a near-hover (${hover.toFixed(1)} m/s) with a sideways step (${sideways.toFixed(1)} m)`)
  check(landing.engineThrust(DT.touchdown - 0.1) > 0 && landing.engineThrust(DT.touchdown + 0.01) === 0, 'landing: the engine stops at touchdown')
  check(D.events.find((e: any) => e.id === 'touchdown')?.banner === 'TOUCHDOWN', 'landing: "TOUCHDOWN" shows')
  check(landing.fuelLeft(DT.touchdown) > 0 && landing.fuelLeft(0) === 100, 'landing: fuel left over at touchdown')
}

// ---- The landing site and its surroundings are one place ----
{
  const { OUTPOST } = await import(`${P}/maps/outpost`)
  const { lunarTerrain } = await import(`${P}/scene/kit/lunar`)
  const lights = await import(`${P}/scene/kit/lunarLight`)
  const t = lunarTerrain(OUTPOST)
  let worst = 0
  for (let a = -390; a <= 390; a += 13) for (const [x, z] of [[a, -390], [a, 390], [-390, a], [390, a]]) worst = Math.max(worst, Math.abs(t.height(x, z) - t.surface(x, z)))
  check(worst < 0.6, `the walkable site and the landscape round it share one height function (worst ${worst.toFixed(2)} m apart at the site's edge)`)
  check(Math.abs(t.surface(5000, 3000) - t.surface(5000.5, 3000)) < 2, 'the landscape is continuous kilometres out')
  const site = lights.siteLight(OUTPOST)
  const mid = lights.wideLight(OUTPOST, lights.MID_LIGHT.extent, lights.MID_LIGHT.size)
  const far = lights.wideLight(OUTPOST, lights.FAR_LIGHT.extent, lights.FAR_LIGHT.size)
  const mean = (light: any, from: number, to: number, step: number) => {
    let sum = 0
    let n = 0
    for (let x = -to; x <= to; x += step) for (let z = -to; z <= to; z += step) {
      const d = Math.max(Math.abs(x), Math.abs(z))
      if (d < from || d > to) continue
      const tx = light.extent / light.size
      sum += light.data[Math.floor((z - light.origin) / tx) * light.size + Math.floor((x - light.origin) / tx)]
      n++
    }
    return sum / n
  }
  const a = mean(site, 0, 390, 5)
  const b = mean(mid, 0, 390, 5)
  const c = mean(mid, 600, 3000, 40)
  const d = mean(far, 600, 3000, 40)
  check(Math.abs(a - b) / a < 0.05 && Math.abs(c - d) / c < 0.08, `the site and the landscape are lit alike where they meet (site ${a.toFixed(3)} vs ${b.toFixed(3)}; near ${c.toFixed(3)} vs far ${d.toFixed(3)})`)
  check(site.size * 1.25 >= 799 && site.extent / site.size <= 1.25 + 1e-9, `the site's light map is finer than its 2.5 m grid (${(site.extent / site.size).toFixed(2)} m texels)`)
  // No regular banding: the light along a line has no strong repeat at the 20 m LOLA pixel size.
  let ripple = 0
  let total = 0
  for (let z = -300; z <= 300; z += 1.25) {
    const v = lights.lightAt(OUTPOST, 120, z)
    ripple += v * Math.cos((2 * Math.PI * z) / 20)
    total += Math.abs(v)
  }
  check(Math.abs(ripple) / total < 0.03, `no 20 m banding in the baked light (${(Math.abs(ripple) / total).toFixed(3)})`)
  // The lander that comes down is the one that stands on the pad afterwards.
  const parked = OUTPOST.props.find((p: any) => p.kind === 'lander')
  const touch = landing.landerPose(landing.LANDING_TIMES.touchdown + 1)
  check(Math.hypot(parked.position.x - touch.base[0], parked.position.z - touch.base[2]) < 0.01 && Math.abs((parked.yaw ?? 0) - landing.LANDER_YAW) < 1e-9, 'the landing lander comes down exactly where, and facing how, the parked lander stands')
}

// ---- Dust: flat, straight, and straight back down (no air) ----
{
  const dust = new ParticleField(16, { texture: new Texture() })
  dust.emit({ position: [0, 0.1, 0], velocity: [30, 1, 0], life: 5, size: [0.3, 0.3], alpha: 1, gravity: 1.62, tint: [1, 1, 1], floor: 0 })
  let lastX = 0
  let straight = true
  let landedAt = -1
  for (let t = 0; t < 3; t += 1 / 60) {
    dust.update(1 / 60)
    const alive = dust.alive()
    if (!alive && landedAt < 0) landedAt = t
    if (alive) {
      const x = (dust as any).position[0]
      straight &&= Math.abs(x - lastX - 30 / 60) < 1e-6 && (dust as any).position[2] === 0
      lastX = x
    }
  }
  const flight = (2 * 1) / 1.62
  check(straight, 'dust: flies out at a steady speed in a straight line (no air to slow it)')
  check(landedAt > 0 && Math.abs(landedAt - flight) < 0.1, `dust: drops back and is gone on landing (${landedAt.toFixed(2)} s, ballistic ${flight.toFixed(2)} s)`)
  const steam = new ParticleField(4, { texture: new Texture() })
  steam.emit({ position: [0, 1, 0], velocity: [20, 0, 0], life: 10, size: [1, 1], alpha: 1, drag: 0.5, tint: [1, 1, 1] })
  for (let t = 0; t < 2; t += 1 / 60) steam.update(1 / 60)
  check(Math.abs((steam as any).velocity[0]) < 8, 'steam (in air) slows down, unlike the dust')
}

// ---- The sequences, driven for real ----
const cues: string[] = []
onCue((id: string) => cues.push(id))
function run(seconds: number, step = 1 / 30): void {
  for (let t = 0; t < seconds; t += step) {
    if (!useGame.getState().sequence) return
    sequences.updateSequence(step)
  }
}
useGame.setState({ mode: 'playing' })
sequences.arrive(SPACECRAFT)
check(useGame.getState().sequence?.id === 'launch' && player.seated && useGame.getState().cinematicStage === 'launch-pad', 'boarding starts the launch, strapped in, with the pad stage being built')
check(flight.shroud === 1, 'the windows are covered from the start')
run(LT.liftoff - 0.5)
check(!cinematic.outside && useGame.getState().sequence?.countdown === 1 && flight.shake > 0, 'in the cockpit at T-1, feeling the engines')
run(1)
check(cinematic.outside && useGame.getState().sequence?.outside === true, 'outside after T-0, with letterbox bars')
run(LT.cutIn - LT.liftoff)
check(!cinematic.outside && flight.sinceCutoff > 5 && flight.shroud === 0 && flight.ascent === 1, 'back in the cockpit, already weightless, the windows open onto Earth')
run(LT.unbuckle - LT.cutIn + 0.5)
check(useGame.getState().sequence?.step === 'unbuckle', 'then Unbuckle')
check(['engines-ignite', 'liftoff', 'first-stage-separation', 'interstage-jettison', 'tower-jettison', 'second-stage-separation', 'tli-start', 'spacecraft-separation', 'adapter-panels-open'].every((id) => cues.includes(id)), 'every launch event called its sound hook')
sequences.unbuckle()
check(!useGame.getState().sequence && useGame.getState().cinematicStage === null && !player.seated, 'unbuckling ends it: the stage is taken down, the player floats')

// Skip at any moment lands in the same end state.
for (const at of [0.5, 7, 15, 34, 47, 52, 62, 68.5]) {
  sequences.arrive(SPACECRAFT)
  run(at)
  sequences.skipSequence()
  const s = useGame.getState()
  check(!s.sequence && s.cinematicStage === null && !player.seated && flight.ascent === 1 && flight.shroud === 0 && !cinematic.outside, `skipping the launch at ${at} s: floating free, windows open, stage gone`)
}

// The landing, to the end, then skipped part way.
for (const skipAt of [null, 3, 12, 20, 29]) {
  useGame.setState({ mode: 'playing', transition: null, sequence: null })
  cues.length = 0
  sequences.startSequence('landing')
  check(useGame.getState().cinematicStage === 'landing-site' && flight.descent, `landing${skipAt === null ? '' : ` (skipped at ${skipAt} s)`}: starts strapped in, the landing site stage built`)
  if (skipAt === null) {
    run(DT.end + 1)
    check(['pitch-over', 'dust', 'touchdown'].every((id) => cues.includes(id)), 'landing: every event called its sound hook')
  } else {
    run(skipAt)
    sequences.skipSequence()
  }
  const s = useGame.getState()
  check(!s.sequence && s.cinematicStage === null && !flight.descent && s.transition?.after.kind === 'load' && (s.transition.after as any).mapId === 'outpost', `landing${skipAt === null ? '' : ` (skipped at ${skipAt} s)`}: ends on the way to the outpost`)
}

// ---------- The ending scenes ----------
{
  const ending = await import(`${P}/scene/cinematic/endingScript`)
  for (const id of ['outpost-thrives', 'mission-complete', 'early-return-supplies'] as const) {
    const scene = ending.endingScene(id)
    const d = scene.script.duration
    check(d >= 10 && d <= 15, `ending ${id}: lasts ${d} s (10 to 15)`)
    check(scene.script.stage === 'landing-site', `ending ${id}: plays on the landing-site stage`)
    const start = scene.pose(0).base[1]
    const end = scene.pose(d).base[1]
    if (id === 'outpost-thrives') {
      check(start > end + 20 && Math.abs(end - landing.padHeight()) < 0.01, `ending ${id}: a second lander comes down onto the pad`)
      check(scene.script.events.some((e: any) => e.banner === 'THE OUTPOST THRIVES'), `ending ${id}: says so`)
    } else {
      check(Math.abs(start - landing.padHeight()) < 0.01 && end > start + 50, `ending ${id}: the lander lifts off and climbs away`)
    }
    let ok = true
    for (let t = 0; t <= d; t += 0.25) for (const v of scene.pose(t).base) if (!Number.isFinite(v)) ok = false
    check(ok, `ending ${id}: the lander's path is finite throughout`)
  }
  const early = ending.endingScene('early-return-health').script
  check(early.events.some((e: any) => e.fade && /powers down/.test(e.fade.text)), 'early return: the outpost powers down')
  check(ending.endingScene('mission-complete').script.events.find((e: any) => e.banner)!.at > early.events.find((e: any) => e.banner)!.at, 'mission complete lifts off later (on schedule) than an early return')

  // Played, then skipped: the lander motion is handed back and the card follows.
  let after = 0
  useGame.setState({ mode: 'playing', sequence: null })
  sequences.startEndingScene('mission-complete', () => after++)
  check(useGame.getState().sequence?.id === 'ending' && landing.landerMotion.override !== null, 'an ending scene starts and takes over the lander')
  sequences.skipSequence()
  const st = useGame.getState()
  check(st.sequence === null && st.cinematicStage === null && landing.landerMotion.override === null && after === 1, 'skipping it ends the cinematic, frees the lander and goes on once')
  sequences.startEndingScene('outpost-thrives', () => after++)
  for (let i = 0; i < 16 * 30; i++) sequences.updateSequence(1 / 30)
  check(useGame.getState().sequence === null && after === 2, 'left to play, it ends by itself and goes on once')
}

// ---- Sound effects (src/audio/sfx.ts): every sound hangs on a real event, and every engine stops ----
{
  const { CINEMATIC_SFX, ONE_SHOTS } = await import(`${P}/audio/sfx`)
  const { endingScene } = await import(`${P}/scene/cinematic/endingScript`)
  const endings = ['outpost-thrives', 'mission-complete', 'early-return-supplies', 'early-return-health']
  const scripts: [string, any][] = [
    ['launch', launch.LAUNCH_SCRIPT],
    ['landing', landing.LANDING_SCRIPT],
    ...endings.map((e): [string, any] => [`ending (${e})`, endingScene(e as any).script]),
  ]
  const fired = new Set(scripts.flatMap(([, s]) => s.events.map((e: any) => e.id)))
  const unknown = Object.keys(CINEMATIC_SFX).filter((id) => !fired.has(id))
  check(unknown.length === 0, `sound: every cinematic sound is on an event the scripts fire${unknown.length ? ` (never fired: ${unknown.join(', ')})` : ''}`)
  const actions = Object.values(CINEMATIC_SFX).flat() as any[]
  check(actions.every((a) => a.do !== 'play' || ONE_SHOTS.includes(a.sound)), 'sound: every one-off sound exists')
  check(actions.every((a) => a.do === 'play' || a.do === 'off' || (a.level > 0 && a.level <= 1)), 'sound: engine levels are between 0 and 1')
  for (const [name, script] of scripts) {
    let on = false
    for (const event of script.events) for (const a of (CINEMATIC_SFX[event.id] ?? []) as any[]) on = a.do === 'engine' ? true : a.do === 'off' ? false : on
    check(!on, `sound: ${name}: every engine it starts has stopped by its end`)
  }
  const plays = (id: string, sound: string) => ((CINEMATIC_SFX[id] ?? []) as any[]).some((a) => a.do === 'play' && a.sound === sound)
  check(['first-stage-separation', 'second-stage-separation'].every((id) => plays(id, 'pyro')), 'sound: staging bangs at both stage separations')
  check(CINEMATIC_SFX['engines-ignite']?.[0]?.do === 'engine' && launch.LAUNCH_TIMES.ignition < launch.LAUNCH_TIMES.liftoff, 'sound: the F-1s start before liftoff (muffled in the cockpit)')
  check(plays('touchdown', 'touchdown') && CINEMATIC_SFX['powered-descent']?.[0]?.do === 'engine', 'sound: the descent engine runs from powered descent, and touchdown thuds')
}

console.log(failed ? `${failed} FAILED` : 'ALL PASSED')
process.exit(failed ? 1 : 0)
