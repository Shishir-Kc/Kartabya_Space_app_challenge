/**
 * Makes the crew's voice recordings with ElevenLabs, from the lines as the
 * game says them (so the voice always matches the words on screen).
 *
 *   bun tools/voices.mts --list                 what would be made (no key needed)
 *   bun tools/voices.mts                        makes every recording that's missing or out of date
 *   bun tools/voices.mts --only=p1-trainer-01,p1-science-01
 *   bun tools/voices.mts --force                makes them all again
 *   bun tools/voices.mts --model=eleven_multilingual_v2
 *   bun tools/voices.mts --measure --model=eleven_v4   files made by hand on elevenlabs.io (named
 *                                               <lineId>.mp3 in public/audio/voice/): measures them and
 *                                               records them, without calling ElevenLabs
 *
 * The lines are every line the game can say, in play order: the same list as
 * the voice script (tools/scriptData.mts, docs/SCRIPT.md).
 *
 * The key: ELEVENLABS_API_KEY in .env.local (bun reads it). Never give it a
 * VITE_ prefix: that would put it in the built game.
 *
 * Writes `public/audio/voice/<lineId>.mp3`, `src/data/voiceManifest.ts` (each
 * recording's length, measured with ffprobe) and `tools/voices.lock.json`
 * (the words, voice and model of each recording; tools/checks/data.mts
 * checks the words still match the game's).
 *
 * The voices are the ones Shishir chose for each character (his Phase 1
 * script's cast table). With eleven_v3 and eleven_v4 the script's direction
 * ("warm", or the line's emotion) goes in front of the line as an audio tag,
 * which ElevenLabs acts on and doesn't read out; older models get the words
 * only. A line with the player's name (`{name}`) is spoken with "astronaut"
 * in its place (`spokenText`), since a recording can't know the name; the
 * lock keeps the game's words and notes what was said under `spoken`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CrewLine } from '../src/data/challenges'
import { emotionOf } from '../src/data/emotions'
import { VOICE_DIRECTION } from '../src/data/phase1Lines'
import { VOICE_SECONDS } from '../src/data/voiceManifest'
import { VOICE_CAST } from '../src/data/voiceCast'
import type { SpeakerId } from '../src/state/mission'

// The script's scenes import game modules that touch the browser on load, as in tools/export-script.mts.
const g = globalThis as Record<string, unknown>
g.window ??= { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false }), location: { search: '' } }
g.document ??= { documentElement: { dataset: {} }, pointerLockElement: null, exitPointerLock() {} }
const { buildScript, spokenText } = await import('./scriptData.mts')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public/audio/voice')
const MANIFEST = join(ROOT, 'src/data/voiceManifest.ts')
const LOCK = join(ROOT, 'tools/voices.lock.json')

/** Shishir's cast: the ElevenLabs voice for each speaker (src/data/voiceCast.ts, shared with the voice script). */
const VOICES: Partial<Record<SpeakerId, string>> = Object.fromEntries(Object.entries(VOICE_CAST).map(([id, cast]) => [id, cast.voiceId]))

/** The lines to voice: every line the game can say, in play order (the voice script's list). */
function linesToVoice(): CrewLine[] {
  return buildScript().map((l) => l.line)
}

interface LockEntry {
  /** The line as the game shows it (with `{name}`), which the data check compares. */
  text: string
  /** What the recording says, when that differs from `text` (the player's name spoken as "astronaut"). */
  spoken?: string
  voice: string
  model: string
  direction: string
  seconds: number
}

/** A lock entry for a recording of this line. */
function lockEntry(line: CrewLine, model: string, direction: string, secs: number): LockEntry {
  const spoken = spokenText(line.text)
  return { text: line.text, ...(spoken !== line.text ? { spoken } : {}), voice: VOICES[line.speakerId] ?? '', model, direction, seconds: secs }
}

/** Models that act on an audio tag like "[calm]" instead of reading it out. */
const takesTags = (m: string) => m === 'eleven_v3' || m.startsWith('eleven_v4')

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k!, v ?? 'true'] as const
  }),
)
const only = args.get('only')?.split(',')
let model = args.get('model') ?? 'eleven_v4'
const lock: Record<string, LockEntry> = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : {}
const seconds: Record<string, number> = { ...VOICE_SECONDS }

const direction = (line: CrewLine) => VOICE_DIRECTION[line.lineId] ?? emotionOf(line)
const upToDate = (line: CrewLine) =>
  existsSync(join(OUT, `${line.lineId}.mp3`)) && lock[line.lineId]?.text === line.text && lock[line.lineId]?.voice === VOICES[line.speakerId]

const todo = linesToVoice().filter((line) => (only ? only.includes(line.lineId) : args.has('force') || !upToDate(line)))

if (args.has('measure')) {
  // Recordings made on the ElevenLabs website, with the same voices and directions.
  let found = 0
  for (const line of linesToVoice()) {
    const file = join(OUT, `${line.lineId}.mp3`)
    if (!existsSync(file)) continue
    seconds[line.lineId] = lengthOf(file)
    lock[line.lineId] = lockEntry(line, model, direction(line), seconds[line.lineId]!)
    found++
  }
  save()
  console.log(`${found} recording(s) measured and recorded (${model}).`)
  process.exit(0)
}

if (args.has('list')) {
  for (const line of linesToVoice()) {
    const mark = todo.includes(line) ? 'make' : 'done'
    console.log(`${mark}  ${line.lineId.padEnd(16)} ${line.speakerId.padEnd(9)} [${direction(line)}] ${line.text}`)
  }
  console.log(`\n${todo.length} to make, ${linesToVoice().length} in all, ${todo.reduce((n, l) => n + l.text.length, 0)} characters to make.`)
  process.exit(0)
}

const key = process.env.ELEVENLABS_API_KEY?.trim()
if (!key) {
  console.error('No ELEVENLABS_API_KEY. Add it to .env.local (no VITE_ prefix), then run this again.')
  process.exit(1)
}

/** One recording. Falls back to eleven_multilingual_v2 (words only) if the account can't use the chosen model. */
async function speak(line: CrewLine, voice: string): Promise<Buffer> {
  for (;;) {
    const tagged = takesTags(model)
    const text = tagged ? `[${direction(line)}] ${spokenText(line.text)}` : spokenText(line.text)
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: model,
        // Tag models: the website's defaults the recordings were made with (stability 50%, similarity 75%).
        voice_settings: tagged ? { stability: 0.5, similarity_boost: 0.75 } : { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
      }),
    })
    if (response.ok) return Buffer.from(await response.arrayBuffer())
    const body = await response.text()
    if (tagged && response.status >= 400 && response.status < 500 && /model/i.test(body)) {
      console.warn(`${model} isn't available here (${response.status}); using eleven_multilingual_v2 without directions.`)
      model = 'eleven_multilingual_v2'
      continue
    }
    throw new Error(`${line.lineId}: ElevenLabs said ${response.status}: ${body.slice(0, 300)}`)
  }
}

function lengthOf(file: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  return Math.round(Number(out.trim()) * 100) / 100
}

function save(): void {
  const entries = Object.keys(seconds)
    .sort()
    .map((id) => `  '${id}': ${seconds[id]},`)
    .join('\n')
  writeFileSync(
    MANIFEST,
    `/**
 * Written by \`bun tools/voices.mts\`: do not edit by hand.
 *
 * Every voiced line, by lineId, with the length of its recording in seconds.
 * The recordings are \`public/audio/voice/<lineId>.mp3\`. A line that isn't
 * listed has no recording yet and stays silent.
 */
export const VOICE_SECONDS: Readonly<Record<string, number>> = {${entries ? `\n${entries}\n` : ''}}
`,
  )
  const sorted = Object.fromEntries(Object.keys(lock).sort().map((id) => [id, lock[id]]))
  writeFileSync(LOCK, `${JSON.stringify(sorted, null, 2)}\n`)
}

mkdirSync(OUT, { recursive: true })
let made = 0
for (const line of todo) {
  const voice = VOICES[line.speakerId]
  if (!voice) {
    console.warn(`skip ${line.lineId}: no voice for ${line.speakerId}`)
    continue
  }
  const file = join(OUT, `${line.lineId}.mp3`)
  writeFileSync(file, await speak(line, voice))
  seconds[line.lineId] = lengthOf(file)
  lock[line.lineId] = lockEntry(line, model, takesTags(model) ? direction(line) : '', seconds[line.lineId]!)
  made++
  // Saved after every line, so a stop halfway keeps what was made.
  save()
  console.log(`made ${line.lineId.padEnd(16)} ${String(seconds[line.lineId]).padStart(5)} s  ${line.text}`)
}
console.log(`\n${made} recording(s) made with ${model}.`)
