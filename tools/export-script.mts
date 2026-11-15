/**
 * Writes the voice script for Shishir from the game's line data:
 *
 *   npx tsx tools/export-script.mts          writes docs/SCRIPT.md and docs/voice-lines.csv
 *   npx tsx tools/export-script.mts --check  only checks they're up to date (exit 1 if not)
 *
 * Run it after changing any line. tools/checks/data.mts runs the check too.
 */
const g = globalThis as Record<string, unknown>
g.window ??= { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false }), location: { search: '' } }
g.document ??= { documentElement: { dataset: {} }, pointerLockElement: null, exitPointerLock() {} }

const { existsSync, mkdirSync, readFileSync, writeFileSync } = await import('node:fs')
const { dirname, join } = await import('node:path')
const { fileURLToPath } = await import('node:url')
const { buildScript, scriptCsv, scriptMarkdown } = await import('./scriptData.mts')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const lines = buildScript()
const files = { 'docs/SCRIPT.md': scriptMarkdown(lines), 'docs/voice-lines.csv': scriptCsv(lines) }

if (process.argv.includes('--check')) {
  const stale = Object.entries(files).filter(([path, text]) => !existsSync(join(ROOT, path)) || readFileSync(join(ROOT, path), 'utf8') !== text)
  if (stale.length) {
    console.log(`Out of date: ${stale.map(([p]) => p).join(', ')}. Run: npx tsx tools/export-script.mts`)
    process.exit(1)
  }
  console.log('The voice script is up to date.')
} else {
  mkdirSync(join(ROOT, 'docs'), { recursive: true })
  for (const [path, text] of Object.entries(files)) writeFileSync(join(ROOT, path), text)
  const count = (s: string) => lines.filter((l) => l.status === s).length
  console.log(`${lines.length} lines: ${count('recorded')} recorded, ${count('re-record')} to re-record, ${count('to record')} to record.`)
  const unplaced = lines.filter((l) => l.map === 'Unplaced')
  if (unplaced.length) console.log(`Not placed in a scene yet: ${unplaced.map((l) => l.line.lineId).join(', ')}`)
}
