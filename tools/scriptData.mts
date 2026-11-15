/**
 * The voice script, built from the game's own line data (so it can't go out
 * of date): every line, in play order by map and scene, with who says it,
 * Shishir's voice for them, the emotion and direction, how it's delivered,
 * when it plays, and whether its recording exists and still matches.
 *
 * Used by tools/export-script.mts (writes docs/SCRIPT.md and
 * docs/voice-lines.csv) and tools/checks/data.mts (fails if they're stale).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHALLENGES, type Challenge, type CrewLine } from '../src/data/challenges'
import { emotionOf } from '../src/data/emotions'
import { CLOSING_LINES } from '../src/data/endings'
import { P1, TEACHING_CARD_LINES, VOICE_DIRECTION } from '../src/data/phase1Lines'
import { NIGHT_LINES, P2, P3 } from '../src/data/storyLines'
import { ALERT_METEOROID, ALERT_STORM, ROVER_LOW_BATTERY } from '../src/data/transmissionLines'
import { VOICE_CAST } from '../src/data/voiceCast'
import { BEATS } from '../src/scene/beats'
import { BITE_LINES, TOW_LINE } from '../src/state/days'
import { MODERATE_DOSE_LINE } from '../src/state/decisions'
import { CAST } from '../src/state/mission'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The word a recording says where the game puts the player's name. */
export const SPOKEN_NAME = 'astronaut'

/**
 * The words a recording says: the game fills in `{name}` with the player's
 * name, which a recording can't know, so it says "astronaut" there (as the
 * launch center's "Hold on, astronaut." does).
 */
export function spokenText(text: string): string {
  return text.replace(/(^|[.!?]\s+)\{name\}/g, (_, start: string) => start + SPOKEN_NAME[0]!.toUpperCase() + SPOKEN_NAME.slice(1)).replaceAll('{name}', SPOKEN_NAME)
}

export interface ScriptLine {
  order: number
  map: string
  scene: string
  when: string
  delivery: string
  line: CrewLine
  character: string
  voice: string
  voiceId: string
  emotion: string
  direction: string
  status: 'recorded' | 're-record' | 'to record'
  /** Why it needs a recording, when it does. */
  note: string
}

interface Entry {
  line: CrewLine
  when: string
  delivery: string
}

interface Scene {
  map: string
  scene: string
  entries: Entry[]
}

const inPerson = 'in person'
const story = 'in person, or hologram if they’re elsewhere'
const radio = 'radio'
const panel = (line: CrewLine) => (line.speakerId === 'comms' ? 'radio, in the decision panel' : 'in the decision panel')
const e = (line: CrewLine, when: string, delivery = inPerson): Entry => ({ line, when, delivery })

/** Every spoken line of a challenge, with when it plays. */
function challengeLines(id: number): Entry[] {
  const c = CHALLENGES.find((x) => x.id === id) as Challenge & Record<string, any>
  const out: Entry[] = []
  for (const extra of c.extraLines ?? []) out.push(e(extra.line, extra.line.speakerId === 'comms' ? 'Houston’s warning (or call) before the panel' : 'In the panel, when it applies', extra.line.speakerId === 'comms' ? radio : 'in the decision panel'))
  for (const line of c.lines ?? []) out.push(e(line, `Task panel: ${c.title} (advice)`, panel(line)))
  ;(c.hazard?.repeatLines ?? []).forEach((pair: CrewLine[], i: number) => {
    for (const line of pair) out.push(e(line, `Task panel: ${c.title}, ${i === 0 ? 'second' : 'third'} time`, panel(line)))
  })
  for (const option of c.options ?? []) {
    if (option.requires?.line) out.push(e(option.requires.line, `On the locked option “${option.label}”`, 'in the decision panel'))
    if (option.ruledOut) out.push(e(option.ruledOut.line, `On picking “${option.label}”, which the crew rules out`, 'in the decision panel'))
  }
  if (c.reminder) out.push(e(c.reminder, 'If you try this task too early, or ask what’s left', c.reminder.speakerId === 'comms' ? radio : story))
  for (const bite of c.bites ?? []) if (bite.line) out.push(e(bite.line, 'In the result, when an earlier choice comes back', 'in the result screen'))
  for (const option of c.options ?? []) for (const bite of option.bites ?? []) if (bite.line) out.push(e(bite.line, `In the result of “${option.label}”, when an earlier choice comes back`, 'in the result screen'))
  return out
}

const beatLines = (id: string) => (BEATS[id]?.lines ?? []).map((l) => l.line)

/** The whole mission, in play order. */
function scenes(): Scene[] {
  const card = TEACHING_CARD_LINES
  return [
    { map: 'Launch center', scene: 'Scene 1: crew quarters (after Play)', entries: [e(card['lc-move']!, 'Teaching card, right after Play, before the opening', 'on a teaching card'), e(P1.trainer01, 'The opening scene, once the welcome card has closed'), e(P1.science01, 'The opening scene')] },
    { map: 'Launch center', scene: 'Scene 2: the walk to the briefing room', entries: [e(P1.trainer02, 'Walking to the briefing room, the crew walking along'), e(P1.trainer03, 'Walking to the briefing room, the crew walking along'), e(P1.commander01, 'Walking to the briefing room, the crew walking along'), e(card['lc-guide']!, 'Teaching card, on first reaching the corridor', 'on a teaching card'), e(P1.trainer04, 'On reaching the briefing room')] },
    {
      map: 'Launch center',
      scene: 'Scene 3: the briefing, then task 1',
      entries: [
        ...[P1.trainer05, P1.trainer06, P1.trainer07, P1.trainer08, P1.trainer09, P1.trainer10, P1.safety01, P1.commander02, P1.trainer11].map((l) => e(l, 'The briefing scene, starting by itself after “Here we are” (before task 1)')),
        ...challengeLines(1),
        e(P1.trainer12, 'After task 1'),
        e(P1.trainer13, 'After task 1'),
        e(P1.science02, 'After task 1'),
      ],
    },
    { map: 'Launch center', scene: 'Scene 4: Houston at the communications building', entries: [P1.comms01, P1.comms02, P1.comms03, P1.comms04a, P1.comms04b, P1.comms05].map((l) => e(l, l === P1.comms04a ? 'If you say you haven’t checked the cargo' : l === P1.comms04b ? 'If you say you have' : 'At his door')) },
    { map: 'Launch center', scene: 'Scene 5: the cargo hangar, task 2', entries: [e(P1.science03, 'On first walking into the hangar'),...challengeLines(2), e(P1.science04, 'In the cargo panel, when a block won’t fit', 'in the decision panel'), e(P1.science05, 'After packing')] },
    { map: 'Launch center', scene: 'Scene 6: Houston’s call and the goodbye', entries: [e(P1.comms06, 'After packing', radio), e(P1.comms07, 'After packing', radio), e(P1.trainer14, 'The goodbye at the crew elevator'), e(P1.trainer15, 'The goodbye at the crew elevator')] },
    { map: 'Spacecraft', scene: 'After unbuckling', entries: [e(P2.welcome1, 'After unbuckling, once per run', story), e(P2.welcome2, 'After unbuckling, once per run', story)] },
    { map: 'Spacecraft', scene: 'Task 3: the scrubber fault', entries: [e(P2.ask3, 'Before the panel (the ask)', story), ...challengeLines(3), e(P2.good3, 'After a good choice', story), e(P2.risky3, 'After a risky choice', story), e(P2.next3, 'The hand-off to the cockpit', story)] },
    {
      map: 'Spacecraft',
      scene: 'The storm in transit (random)',
      entries: [e(ALERT_STORM, 'The alert, with no warning first', 'alert'), ...challengeLines(4), e(P2.stormSheltered, 'After sheltering everyone', story), e(P2.stormPart, 'After sheltering part of the crew', story), e(P2.stormWorked, 'After working through it', story)],
    },
    { map: 'Spacecraft', scene: 'Task 5: the landing site', entries: [e(P2.ask5, 'Before the panel (the ask)', story), ...challengeLines(5), e(P2.after5, 'After choosing, before the landing', story)] },
    { map: 'Outpost', scene: 'Arrival', entries: [...beatLines('arrival').map((l) => e(l, 'Off the lander (a scene, once per profile)')), e(P3.welcome, 'Inside, after the airlock', story)] },
    { map: 'Outpost', scene: 'Task 6: wake the base', entries: [e(P3.ask6, 'Before the panel (the ask)', story), ...challengeLines(6), e(P3.after6, 'After the task', story), e(P3.next6, 'The hand-off to the greenhouse', story)] },
    { map: 'Outpost', scene: 'Task 7: the greenhouse', entries: [e(P3.ask7, 'Before the panel (the ask)', story), ...challengeLines(7), e(P3.good7, 'After planting', story), e(P3.risky7, 'After saving the water', story), e(P3.next7, 'The hand-off to crew quarters', story)] },
    { map: 'Outpost', scene: 'Task 9: the tired crew', entries: [e(P3.ask9, 'Before the panel (the ask)', story), ...challengeLines(9), e(P3.good9, 'After resting', story), e(P3.risky9, 'After pushing on', story)] },
    {
      map: 'Outpost',
      scene: 'Night cards',
      entries: [
        ...NIGHT_LINES.map((l) => e(l, 'On a night card, about the day (in turn)', l.speakerId === 'comms' ? radio : 'on the night card')),
        ...Object.values(BITE_LINES).map((l) => e(l, l.lineId === 'c08-briefing' ? 'On the night card: the briefing that opens task 8' : 'On the night card, when an earlier choice comes back', 'on the night card')),
        e(MODERATE_DOSE_LINE, 'When the radiation dose reaches the moderate level', 'in the result or on the night card'),
      ],
    },
    {
      map: 'Outpost',
      scene: 'Task 8: the rover and the ice',
      entries: [e(ROVER_LOW_BATTERY, 'On the drive, at the home line', 'hologram'), e(TOW_LINE, 'If the rover’s battery runs flat (the tow)', 'on the night card'), e(P3.ask8, 'At the crater, before the panel', 'hologram'), ...challengeLines(8), e(P3.good8, 'After taking ice', story), e(P3.risky8, 'After leaving it', story), e(P3.next8, 'The hand-off back to base', story)],
    },
    {
      map: 'Outpost',
      scene: 'The storm at the outpost (random)',
      entries: [...challengeLines(10), e(P3.stormSheltered, 'After sheltering everyone', story), e(P3.stormExposed, 'After not sheltering everyone', story)],
    },
    { map: 'Outpost', scene: 'The meteoroid (random)', entries: [e(ALERT_METEOROID, 'The alert', 'alert'), e(P3.ask11, 'After the alert, before the panel', story), ...challengeLines(11), e(P3.replaced11, 'After replacing the part', story), e(P3.patched11, 'After patching it', story), e(P3.left11, 'After leaving it', story)] },
    { map: 'Outpost', scene: 'Task 12: the lunar night', entries: [...beatLines('lunar-night').map((l) => e(l, 'The commander’s story at the window (a scene, once per profile)')), e(P3.ask12, 'After the story, before the panel', story), ...challengeLines(12)] },
    {
      map: 'The ending',
      scene: 'The closing line (from whoever’s advice you followed most)',
      entries: Object.values(CLOSING_LINES).flatMap((pair) => [e(pair.good, 'Good endings', 'on the ending card'), e(pair.early, 'Early returns', 'on the ending card')]),
    },
  ]
}

/** Every line the game says (from all its sources), to make sure the script misses none. */
function everyLine(): CrewLine[] {
  const all = new Map<string, CrewLine>()
  const walk = (v: unknown, seen = new Set<unknown>()) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    const line = v as CrewLine
    if (typeof line.lineId === 'string' && typeof line.speakerId === 'string') all.set(line.lineId, line)
    for (const value of Object.values(v as object)) walk(value, seen)
  }
  for (const source of [CHALLENGES, P1, TEACHING_CARD_LINES, P2, P3, NIGHT_LINES, BITE_LINES, TOW_LINE, MODERATE_DOSE_LINE, CLOSING_LINES, ROVER_LOW_BATTERY, ALERT_STORM, ALERT_METEOROID, Object.values(BEATS).map((b) => b.lines)]) walk(source)
  return [...all.values()]
}

const lock: Record<string, { text: string; voice: string }> = (() => {
  const file = join(ROOT, 'tools/voices.lock.json')
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
})()

const crewNames = Object.values(CAST).flatMap((member) => member.name.split(' '))

export function buildScript(): ScriptLine[] {
  const out: ScriptLine[] = []
  const placed = new Set<string>()
  const add = (map: string, scene: string, entry: Entry) => {
    if (placed.has(entry.line.lineId)) return
    placed.add(entry.line.lineId)
    const line = entry.line
    const cast = VOICE_CAST[line.speakerId]
    const recorded = existsSync(join(ROOT, 'public/audio/voice', `${line.lineId}.mp3`))
    const locked = lock[line.lineId]
    const status: ScriptLine['status'] = !recorded ? 'to record' : locked && locked.text !== line.text ? 're-record' : 'recorded'
    const notes: string[] = []
    if (status === 're-record') notes.push('the words changed since it was recorded')
    if (line.text.includes('{name}')) notes.push(`says the player’s name ({name}); the recording says “${SPOKEN_NAME}” there`)
    const saysCrew = crewNames.filter((n) => new RegExp(`\\b${n}\\b`).test(line.text))
    if (saysCrew.length) notes.push(`says a crew name (${saysCrew.join(', ')})`)
    out.push({
      order: out.length + 1,
      map,
      scene,
      when: entry.when,
      delivery: entry.delivery,
      line,
      character: CAST[line.speakerId].name,
      voice: cast.voice,
      voiceId: cast.voiceId,
      emotion: emotionOf(line),
      direction: VOICE_DIRECTION[line.lineId] ?? '',
      status,
      note: notes.join('; '),
    })
  }
  for (const scene of scenes()) for (const entry of scene.entries) add(scene.map, scene.scene, entry)
  // Anything the game says that the scenes above don't place: listed at the end so it's never lost.
  for (const line of everyLine()) add('Unplaced', 'Lines not yet placed in a scene', e(line, '(not placed yet)', line.speakerId === 'comms' ? radio : story))
  return out
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v))

export function scriptCsv(lines: readonly ScriptLine[]): string {
  const head = ['order', 'map', 'scene', 'when', 'lineId', 'speakerId', 'character', 'voice', 'voiceId', 'emotion', 'direction', 'delivery', 'status', 'note', 'text']
  const rows = lines.map((l) => [l.order, l.map, l.scene, l.when, l.line.lineId, l.line.speakerId, l.character, l.voice, l.voiceId, l.emotion, l.direction, l.delivery, l.status, l.note, l.line.text].map(csvCell).join(','))
  return [head.join(','), ...rows].join('\n') + '\n'
}

export function scriptMarkdown(lines: readonly ScriptLine[]): string {
  const out: string[] = []
  out.push('# Voice script')
  out.push('')
  out.push('Generated by `npx tsx tools/export-script.mts` from the game’s line data. Do not edit by hand: `tools/checks/data.mts` fails when this file is out of date. The same lines, in columns, are in `docs/voice-lines.csv`.')
  out.push('')
  out.push('**Status:** *recorded* means `public/audio/voice/<lineId>.mp3` exists and its words still match; *re-record* means the words changed since; *to record* means there is no recording yet. `{name}` is the player’s name.')
  out.push('')
  out.push('## Summary')
  out.push('')
  out.push('| Character | Voice | Lines | Recorded | Re-record | To record |')
  out.push('| --- | --- | --- | --- | --- | --- |')
  const ids = Object.keys(VOICE_CAST) as (keyof typeof VOICE_CAST)[]
  for (const id of ids) {
    const mine = lines.filter((l) => l.line.speakerId === id)
    out.push(`| ${CAST[id].name} (${CAST[id].shortRole}) | ${VOICE_CAST[id].voice} \`${VOICE_CAST[id].voiceId}\` | ${mine.length} | ${mine.filter((l) => l.status === 'recorded').length} | ${mine.filter((l) => l.status === 're-record').length} | ${mine.filter((l) => l.status === 'to record').length} |`)
  }
  out.push(`| **All** | | **${lines.length}** | **${lines.filter((l) => l.status === 'recorded').length}** | **${lines.filter((l) => l.status === 're-record').length}** | **${lines.filter((l) => l.status === 'to record').length}** |`)
  out.push('')
  let map = ''
  let scene = ''
  for (const l of lines) {
    if (l.map !== map) {
      map = l.map
      scene = ''
      if (out.at(-1) !== '') out.push('')
      out.push(`## ${map}`)
      out.push('')
    }
    if (l.scene !== scene) {
      scene = l.scene
      if (out.at(-1) !== '') out.push('')
      out.push(`### ${scene}`)
      out.push('')
    }
    const status = l.status === 'recorded' ? 'recorded' : `**${l.status}**`
    const direction = l.direction ? `, direction “${l.direction}”` : ''
    out.push(`- \`${l.line.lineId}\` · **${l.character}** (voice ${l.voice}) · ${l.emotion}${direction} · ${l.delivery} · ${status}${l.note ? ` (${l.note})` : ''}`)
    out.push(`  - When: ${l.when}`)
    out.push(`  - “${l.line.text}”`)
    if (spokenText(l.line.text) !== l.line.text) out.push(`  - Recorded as: “${spokenText(l.line.text)}”`)
  }
  out.push('')
  return out.join('\n')
}
