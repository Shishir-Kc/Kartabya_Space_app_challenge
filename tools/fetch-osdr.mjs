#!/usr/bin/env node
/**
 * Rebuilds src/data/osdr-archive.json: a few real studies from NASA's Open
 * Science Data Repository (OSDR), the archive of space biology and astronaut
 * health research. The game links each one to the choice it explains
 * (src/data/osdr.ts) on the MISSION DATA tab and in the debrief.
 *
 *   node tools/fetch-osdr.mjs
 *
 * The OSDR search API needs no key. Titles and descriptions are copied
 * unchanged; the game never calls OSDR while it runs (archived data).
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The studies, by accession. Change the list here, then rerun. */
const STUDIES = ['OSD-53', 'OSD-569', 'OSD-992', 'OSD-412', 'OSD-772']
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/data/osdr-archive.json')

async function study(accession) {
  const url = `https://osdr.nasa.gov/osdr/data/search?term=${encodeURIComponent(accession)}&size=10&type=cgene`
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error(`${response.status} ${url}`)
      const data = await response.json()
      const hit = data.hits.hits.map((h) => h._source).find((s) => s.Accession === accession)
      if (!hit) throw new Error(`${accession} not found`)
      const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()
      return {
        accession,
        title: clean(hit['Study Title']),
        description: clean(hit['Study Description']).slice(0, 600),
        organism: clean(hit.organism) || null,
        projectType: clean(hit['Project Type']) || null,
        flightProgram: clean(hit['Flight Program']) || null,
        url: `https://osdr.nasa.gov/bio/repo/data/studies/${accession}`,
      }
    } catch (error) {
      console.warn(`  ${accession} (try ${attempt}): ${error.message}`)
      if (attempt === 3) throw error
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt))
    }
  }
}

const studies = []
for (const accession of STUDIES) {
  studies.push(await study(accession))
  console.log(`  ${accession}: ${studies.at(-1).title}`)
}

const archive = {
  note: 'Archived real studies from NASA OSDR (Open Science Data Repository), rebuilt by tools/fetch-osdr.mjs. Titles and descriptions are copied unchanged. This is archived data, not a live query.',
  source: 'NASA Open Science Data Repository (OSDR)',
  sourceUrl: 'https://osdr.nasa.gov/bio/',
  retrieved: new Date().toISOString().slice(0, 10),
  studies,
}
writeFileSync(OUT, `${JSON.stringify(archive, null, 2)}\n`)
console.log(`Wrote ${studies.length} studies to ${OUT}`)
