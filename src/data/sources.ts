/**
 * The source table (./sources.json) as typed data: the real NASA (and
 * partner agency) references, and for every outcome which of them back it.
 * An entry counts as filled only when it has a title and a link; until then
 * the result screen says "Source: coming soon".
 */
import table from './sources.json'

/** One real document, checked by opening it. `fact` repeats only what it says. */
export interface Reference {
  id: string
  title: string
  publisher: string
  url: string
  retrieved: string
  fact: string
}

export interface SourceEntry {
  outcomeId: string
  title: string | null
  url: string | null
  retrieved: string | null
  owner: string | null
  /** Null until a second person has checked it. */
  reviewer: string | null
  /** Reference ids, the main one first. */
  refs?: string[]
  /** What it teaches in this game, one sentence. */
  why?: string
}

export const REFERENCES: readonly Reference[] = table.references as Reference[]
export const SOURCES: readonly SourceEntry[] = table.sources as SourceEntry[]

export function getReference(id: string): Reference | undefined {
  return REFERENCES.find((ref) => ref.id === id)
}

export function getSource(id: string): SourceEntry | undefined {
  return SOURCES.find((entry) => entry.outcomeId === id)
}

/** The filled sources among `ids`, in order, without repeats. */
export function filledSources(ids: readonly string[]): SourceEntry[] {
  const seen = new Set<string>()
  const out: SourceEntry[] = []
  for (const id of ids) {
    const entry = getSource(id)
    if (!entry || seen.has(id) || !entry.title || !entry.url) continue
    seen.add(id)
    out.push(entry)
  }
  return out
}

/** The references behind some outcomes, in order, without repeats. */
export function referencesFor(ids: readonly string[]): Reference[] {
  const seen = new Set<string>()
  const out: Reference[] = []
  for (const id of ids) {
    for (const refId of getSource(id)?.refs ?? []) {
      const ref = getReference(refId)
      if (!ref || seen.has(refId)) continue
      seen.add(refId)
      out.push(ref)
    }
  }
  return out
}
