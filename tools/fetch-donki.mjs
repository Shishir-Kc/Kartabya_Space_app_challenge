#!/usr/bin/env node
/**
 * Rebuilds src/data/donki-archive.json: a small archive of real solar
 * events from NASA's DONKI (Space Weather Database Of Notifications,
 * Knowledge, Information), for the solar storm challenge.
 *
 *   node tools/fetch-donki.mjs                          (uses DEMO_KEY)
 *   node --env-file=.env.local tools/fetch-donki.mjs    (NASA_API_KEY from .env.local)
 *
 * Solar flares (FLR) and Solar Energetic Particle events (SEP) are read
 * month by month (DONKI allows at most 60 days per request) for each year in
 * YEARS, from the CCMC's own DONKI web service, which needs no key, with
 * api.nasa.gov as the fallback (DEMO_KEY allows only about 30 requests an
 * hour, and on 14 Nov 2026 it answered 404 for FLR). A flare counts as
 * followed by an SEP when either event lists the other in its linkedEvents.
 *
 * It keeps PER_CLASS events of each class (C, M, X), spread evenly over the
 * years, preferring for M and X flares the ones an SEP followed, so the
 * game has storms of every strength and a run with six storms never repeats
 * one. It also counts every flare by class and every SEP event per year
 * (`counts`), which sets how often storms happen in the game
 * (src/data/science.ts). The values are copied, never changed.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const YEARS = [2022, 2023, 2024, 2025]
const PER_CLASS = { C: 5, M: 6, X: 7 }
const KEY = process.env.NASA_API_KEY || 'DEMO_KEY'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/data/donki-archive.json')

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json()
}

/** One DONKI type for one date range: the CCMC service, then api.nasa.gov. */
async function donki(type, start, end) {
  const urls = [
    `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/${type}?startDate=${start}&endDate=${end}`,
    `https://api.nasa.gov/DONKI/${type}?startDate=${start}&endDate=${end}&api_key=${KEY}`,
  ]
  // Three tries each, a few seconds apart: the service drops the odd request.
  for (const url of urls) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const data = await getJson(url)
        return { data: Array.isArray(data) ? data : [], via: new URL(url).host }
      } catch (error) {
        console.warn(`  ${type} ${start} (try ${attempt}): ${error.message}`)
        if (String(error.message).startsWith('404')) break
        await new Promise((resolve) => setTimeout(resolve, 3000 * attempt))
      }
    }
  }
  throw new Error(`Could not read DONKI ${type} for ${start} to ${end}`)
}

function evenly(list, count) {
  if (list.length <= count) return list
  return Array.from({ length: count }, (_, i) => list[Math.floor(((i + 0.5) * list.length) / count)])
}

const flares = []
const seps = []
const hosts = new Set()
const pad = (n) => String(n).padStart(2, '0')
for (const year of YEARS) {
  console.log(`Reading ${year}...`)
  for (let month = 1; month <= 12; month++) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const start = `${year}-${pad(month)}-01`
    const end = `${year}-${pad(month)}-${pad(last)}`
    const f = await donki('FLR', start, end)
    const s = await donki('SEP', start, end)
    flares.push(...f.data)
    seps.push(...s.data)
    hosts.add(f.via)
    hosts.add(s.via)
  }
}
console.log(`${flares.length} flares, ${seps.length} SEP events`)

const linked = (a, id) => (a.linkedEvents ?? []).some((event) => event.activityID === id)
function sepAfter(flare) {
  return seps.find((sep) => linked(sep, flare.flrID) || linked(flare, sep.sepID)) ?? null
}

const events = []
for (const [letter, count] of Object.entries(PER_CLASS)) {
  const ofClass = flares
    .filter((flare) => flare.classType?.startsWith(letter) && flare.peakTime)
    .sort((a, b) => a.peakTime.localeCompare(b.peakTime))
  const withSep = ofClass.filter((flare) => sepAfter(flare))
  const pickSep = letter === 'C' ? [] : evenly(withSep, Math.ceil(count / 2))
  const rest = evenly(ofClass.filter((flare) => !pickSep.includes(flare)), count - pickSep.length)
  for (const flare of [...pickSep, ...rest]) {
    const sep = sepAfter(flare)
    events.push({
      id: flare.flrID,
      kind: 'FLR',
      classType: flare.classType,
      classLetter: letter,
      beginTime: flare.beginTime,
      peakTime: flare.peakTime,
      sourceLocation: flare.sourceLocation || null,
      activeRegion: flare.activeRegionNum ?? null,
      link: flare.link ?? null,
      sep: sep ? { id: sep.sepID, eventTime: sep.eventTime, link: sep.link ?? null } : null,
    })
  }
}
events.sort((a, b) => a.peakTime.localeCompare(b.peakTime))

// How often the real Sun flared: every flare by class, and every SEP event, per year.
const counts = {}
for (const year of YEARS) {
  const inYear = (time) => time?.startsWith(String(year))
  const ofYear = flares.filter((flare) => inYear(flare.peakTime ?? flare.beginTime))
  counts[year] = {
    days: new Date(Date.UTC(year, 11, 31)).getUTCDate() === 31 && year % 4 === 0 ? 366 : 365,
    C: ofYear.filter((flare) => flare.classType?.startsWith('C')).length,
    M: ofYear.filter((flare) => flare.classType?.startsWith('M')).length,
    X: ofYear.filter((flare) => flare.classType?.startsWith('X')).length,
    SEP: seps.filter((sep) => inYear(sep.eventTime)).length,
  }
}

const archive = {
  note:
    'Archived real events from NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information), rebuilt by tools/fetch-donki.mjs. Values are copied unchanged. This is archived data, not live space weather.',
  source: 'NASA DONKI, Community Coordinated Modeling Center, NASA Goddard Space Flight Center',
  sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
  retrieved: new Date().toISOString().slice(0, 10),
  via: [...hosts],
  years: YEARS,
  counts,
  events,
}
writeFileSync(OUT, `${JSON.stringify(archive, null, 2)}\n`)
console.log(`Wrote ${events.length} events to ${OUT}`)
for (const event of events) console.log(`  ${event.peakTime}  ${event.classType.padEnd(5)} ${event.sep ? 'SEP' : ''}`)
