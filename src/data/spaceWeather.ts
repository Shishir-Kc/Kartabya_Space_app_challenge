/**
 * The Sun right now: a live summary of the last 30 days of real space
 * weather from NASA's DONKI, through api.nasa.gov (which browsers may call).
 * It is extra: the game plays the same without it, using the archived storm
 * events in ./donki-archive.json. It is always labelled live, with the time
 * it was fetched, and never shown as live when it came from the cache of an
 * earlier visit older than CACHE_MS.
 *
 * The key: VITE_NASA_API_KEY from .env.local (never committed), or NASA's
 * shared DEMO_KEY. Whatever key is used ends up in the built page, so use a
 * free api.nasa.gov key, never one that matters.
 */

export interface SpaceWeather {
  /** When it was fetched (ISO time). */
  fetchedAt: string
  /** The 30 days covered, YYYY-MM-DD. */
  from: string
  to: string
  /** Coronal mass ejections: clouds of gas thrown out by the Sun. */
  cmes: number
  /** The fastest CME's speed, km/s, when DONKI has one. */
  fastestCmeKmS: number | null
  /** Solar energetic particle events: the radiation storms that send crews to shelter. */
  seps: number
  latestSep: string | null
  /** Geomagnetic storms at Earth, and the strongest Kp index (0 to 9). */
  storms: number
  maxKp: number | null
}

const CACHE_KEY = 'lunar-outpost:space-weather'
/** A fetch is reused for this long (it also saves the key's hourly limit). */
const CACHE_MS = 3 * 60 * 60 * 1000

function apiKey(): string {
  const key = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_NASA_API_KEY
  return key && key.trim() ? key.trim() : 'DEMO_KEY'
}

const day = (date: Date) => date.toISOString().slice(0, 10)

async function donki(type: 'CME' | 'SEP' | 'GST', from: string, to: string): Promise<unknown[]> {
  const url = `https://api.nasa.gov/DONKI/${type}?startDate=${from}&endDate=${to}&api_key=${apiKey()}`
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`DONKI ${type}: ${response.status}`)
  const data: unknown = await response.json()
  return Array.isArray(data) ? data : []
}

interface CmeRecord {
  cmeAnalyses?: { speed?: number | null; isMostAccurate?: boolean }[] | null
}
interface SepRecord {
  eventTime?: string
}
interface GstRecord {
  allKpIndex?: { kpIndex?: number }[] | null
}

/** Turns DONKI's three lists into the summary. Pure, so the checks can test it. */
export function summarize(cmes: unknown[], seps: unknown[], storms: unknown[], from: string, to: string, fetchedAt: string): SpaceWeather {
  const speeds = (cmes as CmeRecord[]).flatMap((cme) =>
    (cme.cmeAnalyses ?? []).filter((a) => a.isMostAccurate && typeof a.speed === 'number').map((a) => a.speed as number),
  )
  const kps = (storms as GstRecord[]).flatMap((storm) => (storm.allKpIndex ?? []).map((kp) => kp.kpIndex ?? 0))
  const sepTimes = (seps as SepRecord[]).map((sep) => sep.eventTime ?? '').filter(Boolean).sort()
  return {
    fetchedAt,
    from,
    to,
    cmes: cmes.length,
    fastestCmeKmS: speeds.length ? Math.max(...speeds) : null,
    seps: seps.length,
    latestSep: sepTimes.at(-1) ?? null,
    storms: storms.length,
    maxKp: kps.length ? Math.max(...kps) : null,
  }
}

function readCache(): SpaceWeather | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as SpaceWeather
    return Date.now() - Date.parse(cached.fetchedAt) < CACHE_MS ? cached : null
  } catch {
    return null
  }
}

function writeCache(weather: SpaceWeather): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(weather))
  } catch {
    // Storage blocked: fetch again next time.
  }
}

let pending: Promise<SpaceWeather | null> | null = null

/**
 * The last 30 days of space weather, or null when NASA can't be reached
 * (offline, the key's limit, a slow answer). One fetch per page at most.
 */
export function getSpaceWeather(): Promise<SpaceWeather | null> {
  if (pending) return pending
  pending = (async () => {
    if (typeof window === 'undefined') return null
    const cached = readCache()
    if (cached) return cached
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
    const now = new Date()
    const to = day(now)
    const from = day(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
    try {
      const [cmes, seps, storms] = await Promise.all([donki('CME', from, to), donki('SEP', from, to), donki('GST', from, to)])
      const weather = summarize(cmes, seps, storms, from, to, now.toISOString())
      writeCache(weather)
      return weather
    } catch (error) {
      console.info('Live space weather unavailable; using the archive only.', error)
      pending = null
      return null
    }
  })()
  return pending
}

/** One or two sentences a child can read. */
export function describeSpaceWeather(weather: SpaceWeather): string[] {
  const clouds = weather.cmes === 1 ? '1 cloud of hot gas' : `${weather.cmes} clouds of hot gas`
  const fastest = weather.fastestCmeKmS ? ` The fastest flew at ${Math.round(weather.fastestCmeKmS).toLocaleString('en')} km every second.` : ''
  const particles =
    weather.seps === 0
      ? 'No radiation storms (solar energetic particle events) were recorded, so a Moon crew could have stayed out of the shelter.'
      : `${weather.seps} radiation ${weather.seps === 1 ? 'storm' : 'storms'} (solar energetic particle ${weather.seps === 1 ? 'event' : 'events'}) ${weather.seps === 1 ? 'was' : 'were'} recorded: a Moon crew would have gone to the shelter.`
  return [`In the last 30 days, the Sun threw out ${clouds} (CMEs).${fastest}`, particles]
}
