/**
 * Checks for the menu's logic, run headless with `npx tsx tools/checks/menu.mts`:
 * the skin tone slider's colours, saved astronauts (old and new), the
 * screens and missions in the store, the settings, and the MISSION DATA
 * list against ASSETS.md.
 *
 * What needs a browser (the lobby drawing, memory after quitting to the
 * menu, frame rate) is checked by hand in a dev build, through
 * `window.__lunar` (see src/scene/RenderStatsProbe.tsx).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// A small stand-in for the browser's storage, so saving and loading can be checked.
const stored = new Map<string, string>()
const g = globalThis as any
g.window = {
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  },
  matchMedia: () => ({ matches: false }),
  location: { search: '' },
}

const P = '../../src'
const {
  checkName,
  defaultProfile,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  loadAstronautProfile,
  parseProfile,
  PATCHES,
  randomProfile,
  saveAstronautProfile,
  SKIN_PRESETS,
  skinToneCss,
  skinToneLinear,
  VARIANTS,
  VARIANT_LABELS,
  isVariant,
} = await import(`${P}/state/astronaut`)
const { useGame } = await import(`${P}/state/store`)
const { audioLevels, onAudioLevels, useSettings } = await import(`${P}/state/settings`)
const { CREDIT_GROUPS } = await import(`${P}/data/credits`)
const { dragLobby, faceCamera, lobby, settleLobby } = await import(`${P}/state/lobby`)
const { START_MAP } = await import(`${P}/maps/registry`)

let failed = 0
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed++
}

// ---- Skin tone: a smooth ramp that stays skin-coloured all the way ----
const STEPS = 100
const luminance = ([r, g2, b]: number[]) => 0.2126 * r! + 0.7152 * g2! + 0.0722 * b!
let monotonic = true
let biggestStep = 0
let warm = true
let notGrey = true
let notOrange = true
let previous = skinToneLinear(0)
for (let i = 0; i <= STEPS; i++) {
  const c = skinToneLinear(i / STEPS)
  const [r, g2, b] = c
  if (i > 0) {
    if (luminance(c) >= luminance(previous)) monotonic = false
    biggestStep = Math.max(biggestStep, Math.abs(luminance(c) - luminance(previous)) / luminance(previous))
  }
  // Skin is always more red than green, and more green than blue.
  if (!(r > g2 && g2 > b)) warm = false
  // Not grey: red clearly above blue. Not orange: blue never drops to nothing next to red, green stays under 80% of red.
  if (r / b < 1.5) notGrey = false
  if (b / r < 0.1 || g2 / r > 0.8) notOrange = false
  previous = c
}
check(monotonic, 'skin tone gets steadily darker along the slider')
check(biggestStep < 0.08, `no jump between neighbouring slider steps: each is under 8% darker than the last (largest ${(biggestStep * 100).toFixed(1)}%)`)
check(warm, 'every tone is red > green > blue')
check(notGrey, 'no tone turns grey')
check(notOrange, 'no tone turns orange')
check(luminance(skinToneLinear(0)) / luminance(skinToneLinear(1)) > 12, 'the lightest tone is over twelve times brighter than the darkest')
check(/^#[0-9a-f]{6}$/.test(skinToneCss(0.37)), 'the slider gradient gets hex colours')
check(skinToneCss(-3) === skinToneCss(0) && skinToneCss(9) === skinToneCss(1) && skinToneCss(Number.NaN) === skinToneCss(0.5), 'out-of-range tones are clamped')
check(SKIN_PRESETS.every((t: number) => t >= 0 && t <= 1) && new Set(SKIN_PRESETS.map((t: number) => skinToneCss(t))).size === SKIN_PRESETS.length, 'the quick picks are all different')

// ---- Saved astronauts ----
const ids = (list: { id: string }[]) => list.map((item) => item.id)
check(parseProfile({ name: 'Sam', variant: 'male', skinTone: 'light' })?.skinTone === 0.5, 'an astronaut saved with the old "light" skin loads on the slider')
check(parseProfile({ name: 'Sam', variant: 'male', skinTone: 'dark' })?.skinTone === 0.86, 'an astronaut saved with the old "dark" skin loads on the slider')
check(parseProfile({ name: 'Sam', variant: 'male' })?.skinTone === 0.86, 'an astronaut saved before skin tones existed loads as the dark one it wore')
const old = parseProfile({ name: 'Sam', variant: 'female', skinTone: 'light' })
check(old?.hair === 'long' && old.hairColor === 'brown' && old.eyeColor === 'brown' && old.patch === 'moon', 'an old save gets the look it had: its own hair, brown eyes, the Moon patch')
// The spacesuit was once a body; it is an outfit now. Those saves become Male, every other choice kept.
const wasSuited = parseProfile({ name: 'Sam', variant: 'suited', skinTone: 0.2, hair: 'long', hairColor: 'copper', eyeColor: 'green', patch: 'rocket' })
check(
  wasSuited?.variant === 'male' && wasSuited.name === 'Sam' && wasSuited.skinTone === 0.2 && wasSuited.hair === 'long' && wasSuited.hairColor === 'copper' && wasSuited.eyeColor === 'green' && wasSuited.patch === 'rocket',
  'an astronaut saved with the old "Spacesuit" body loads as Male, keeping name, skin tone and every other choice',
)
// The body can only be Female or Male.
check(JSON.stringify(VARIANTS) === JSON.stringify(['female', 'male']), 'the body choices are exactly Female and Male')
check(Object.keys(VARIANT_LABELS).sort().join() === 'female,male', 'only Female and Male have labels')
check(isVariant('female') && isVariant('male') && !isVariant('suited') && !isVariant('robot'), 'nothing but female and male counts as a body')
{
  let onlyTwo = true
  for (let i = 0; i < 300; i++) if (!isVariant(randomProfile().variant)) onlyTwo = false
  check(onlyTwo, 'Randomise only ever picks Female or Male')
}
check(parseProfile({ name: 'Sam', variant: 'robot' }) === null && parseProfile({ name: '', variant: 'male' }) === null && parseProfile(null) === null, 'a broken save is ignored')
const odd = parseProfile({ name: 'Sam', variant: 'male', skinTone: 7, hair: 'mohawk', hairColor: 'green', eyeColor: 'red', patch: 'skull' })
check(odd?.skinTone === 1 && odd.hair === 'short' && odd.hairColor === 'dark-brown' && odd.eyeColor === 'brown' && odd.patch === 'moon', 'unknown choices in a save fall back to the defaults')
const full = { name: 'Nova', variant: 'female', skinTone: 0.31, hair: 'short', hairColor: 'copper', eyeColor: 'green', patch: 'earth' }
saveAstronautProfile(full)
check(JSON.stringify(loadAstronautProfile()) === JSON.stringify(full), 'a full astronaut saves and loads unchanged')
let randomOk = true
for (let i = 0; i < 200; i++) {
  const p = randomProfile()
  if (!checkName(p.name).ok || p.skinTone < 0 || p.skinTone > 1 || p.hair === 'none') randomOk = false
  if (!ids(HAIR_STYLES).includes(p.hair) || !ids(HAIR_COLORS).includes(p.hairColor) || !ids(EYE_COLORS).includes(p.eyeColor) || !ids(PATCHES).includes(p.patch)) randomOk = false
}
check(randomOk, 'Randomise always gives a valid astronaut with hair')
check(randomProfile('Riley').name === 'Riley', 'Randomise keeps the name')
check(JSON.stringify(parseProfile(defaultProfile('Kim', 'male'))) === JSON.stringify(defaultProfile('Kim', 'male')), 'Reset gives a valid astronaut')
check(PATCHES.length >= 3 && PATCHES.length <= 4 && HAIR_COLORS.length >= 6 && EYE_COLORS.length >= 4, 'three or four patches, and a few natural hair and eye colours')

// ---- Screens and missions ----
const game = () => useGame.getState()
check(game().screen === 'title' && game().mode === 'paused' && !game().started, 'the game opens on the title, with no mission')
game().openMenu()
check(game().screen === 'menu' && game().menuTab === 'play', 'the title leads to the menu, on PLAY')
game().setMenuTab('astronaut')
game().setAstronaut({ ...game().astronaut, skinTone: 0.42 })
check(game().astronautSaved && loadAstronautProfile()?.skinTone === 0.42, 'a change on the ASTRONAUT tab is saved straight away')
game().enterGame(true)
check(game().screen === 'game' && game().mode === 'playing' && game().started && game().runId === 0, 'PLAY starts the first mission where the game already is')
game().markConsoleUsed(1)
game().apply({ power: -20 })
const power = game().mission.meters.power
game().leaveGame()
check(game().screen === 'menu' && game().menuTab === 'play' && game().mode === 'paused' && game().started, 'quitting goes to the menu and keeps the mission')
game().enterGame(false)
check(game().screen === 'game' && game().runId === 0 && game().usedConsoles.length === 1 && game().mission.meters.power === power, 'Continue goes back to the same mission')
game().leaveGame()
game().enterGame(true)
check(
  game().runId === 1 && game().usedConsoles.length === 0 && game().mission.meters.power !== power && game().mapId === START_MAP && game().sequence === null && game().seenCards.length === 0,
  'New mission starts over: a fresh mission on the first map, nothing carried across',
)
game().setView('third')
check(game().view === 'third' && stored.get('lunar-outpost:view') === 'third', 'the view picked in Settings is remembered')

// ---- Settings ----
const settings = () => useSettings.getState()
let heard: { master: number; voices: number; effects: number } | null = null
const stop = onAudioLevels((levels: any) => (heard = levels))
settings().setAudio({ master: 0.5, voices: 0.4 })
check(Math.abs(audioLevels().voices - 0.2) < 1e-9 && audioLevels().effects === 0.5, 'voices and effects come out already scaled by the master volume')
check(heard !== null && (heard as any).master === 0.5, 'audio listeners hear a volume change')
stop()
settings().set({ mouseSensitivity: 1.5, invertY: true, textSize: 'large', reducedMotion: true })
const saved = JSON.parse(stored.get('lunar-outpost:settings') ?? '{}')
check(saved.audio?.master === 0.5 && saved.audio?.voices === 0.4 && saved.mouseSensitivity === 1.5 && saved.invertY === true && saved.textSize === 'large' && saved.reducedMotion === true, 'every setting is saved under lunar-outpost:settings')

// ---- The lobby: dragging turns the astronaut, a change turns them back ----
lobby.yaw = 0
dragLobby(200)
check(lobby.yaw > 1, 'dragging turns the astronaut')
lobby.yaw = 5.5
faceCamera()
for (let i = 0; i < 240; i++) settleLobby(1 / 60, false)
check(lobby.yaw === 0 && !lobby.facing, 'after a change they turn back to face the camera, the short way round')
lobby.yaw = 2
faceCamera()
settleLobby(1 / 60, true)
check(lobby.yaw === 0, 'with less movement on, they face the camera at once')

// ---- MISSION DATA against ASSETS.md ----
const assets = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ASSETS.md'), 'utf8')
const credits = CREDIT_GROUPS.flatMap((group: any) => group.credits)
check(new Set(credits.map((c: any) => c.id)).size === credits.length, 'every credit has its own id')
for (const credit of credits) {
  if (credit.comingSoon) continue
  const names = credit.source.split(' (')[0].split(' and ')
  check(assets.includes(credit.url.replace(/\/$/, '')) || names.every((name: string) => assets.includes(name)), `ASSETS.md lists "${credit.title}" (${names.join(', ')})`)
}
for (const needle of ['SVS 3615', 'SVS 4720', 'LDEM_80S_20MPP_ADJ', 'Barker et al., 2023', 'DONKI', 'Quaternius']) {
  check(credits.some((c: any) => `${c.source} ${c.credit}`.includes(needle)), `MISSION DATA names ${needle}`)
}
check(credits.filter((c: any) => c.comingSoon).length === 0, 'nothing on MISSION DATA is "coming soon": the DONKI storm data is in the game')

// The menu's loading screen (src/state/loading.ts): it waits for both the astronaut and the rocket.
{
  const loading = await import(`${P}/state/loading`)
  const now = () => loading.useLoading.getState()
  check(!now().astronaut && !now().rocket, 'loading: at first neither the astronaut nor the rocket is in place')
  loading.setLobbyReady('astronaut', true)
  check(now().astronaut && !now().rocket, 'loading: the astronaut on the podium, still waiting for the rocket')
  loading.setLobbyReady('rocket', true)
  check(now().astronaut && now().rocket, 'loading: with both in place the screen can leave')
  loading.setLobbyReady('astronaut', false)
  check(!now().astronaut && now().rocket, 'loading: a new body type loading takes the astronaut away again (the small note shows)')
}

console.log(failed === 0 ? '\nAll menu checks passed.' : `\n${failed} menu check(s) FAILED.`)
process.exit(failed === 0 ? 0 : 1)
