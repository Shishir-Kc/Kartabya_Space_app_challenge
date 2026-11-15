/**
 * The Mission Handbook's page breaks, from measured block heights (pure, so
 * the checks can test it without a browser).
 *
 * - Each section starts on a new page; a block never splits.
 * - A block marked `keepWithNext` (a page header, a day header) never ends a page.
 * - A block marked `alone` (a meter and its chart) gets a page to itself.
 * - Where the order matters (the mission log), the breaks are chosen
 *   together, so the pages come out evenly full instead of one full page and
 *   one half-empty one: the sum of each page's empty space squared is kept
 *   as small as possible. The last page of a section may be emptier.
 * - Where the order doesn't matter (better choices, real life), a later
 *   card that fits fills a gap the next card leaves.
 */
export interface PageBlock {
  section: string
  keepWithNext?: boolean
  alone?: boolean
}

export interface PageRoom {
  /** Height a page holds. */
  room: number
  /** Extra height on a section's first page (later pages carry a small "continued" header). */
  firstExtra: number
  /** Space between blocks. */
  gap: number
}

/** Sections whose cards can go in any order. */
export const REORDER = new Set(['better', 'real'])

export function paginate(blocks: readonly PageBlock[], heights: readonly number[], { room, firstExtra, gap }: PageRoom): number[][] {
  const pages: number[][] = []
  let start = 0
  while (start < blocks.length) {
    let end = start
    while (end < blocks.length && blocks[end]!.section === blocks[start]!.section) end++
    const section = blocks[start]!.section
    if (REORDER.has(section)) {
      // Cards in any order: whichever leaves less empty space, gap-filling or balanced breaks.
      const filled = greedyFill(start, end)
      const even = balanced(start, end)
      pages.push(...(emptiness(filled) <= emptiness(even) ? filled : even))
    } else {
      pages.push(...balanced(start, end))
    }
    start = end
  }
  return pages

  /** The sum of each page's empty space squared (the last page counts a quarter). */
  function emptiness(list: number[][]): number {
    return list.reduce((sum, page, n) => {
      const h = page.reduce((s, k, i) => s + heights[k]! + (i ? gap : 0), 0)
      const empty = Math.max(0, room + (n === 0 ? firstExtra : 0) - h)
      return sum + (n === list.length - 1 ? 0.25 : 1) * empty * empty
    }, 0)
  }

  function used(from: number, to: number): number {
    let sum = 0
    for (let k = from; k < to; k++) sum += heights[k]! + (k > from ? gap : 0)
    return sum
  }

  /** The best breaks for blocks [a, b): fewest squared gaps. */
  function balanced(a: number, b: number): number[][] {
    const best: number[] = new Array(b - a + 1).fill(Infinity)
    const from: number[] = new Array(b - a + 1).fill(-1)
    best[0] = 0
    const penalty = (room * 0.05) ** 2
    for (let j = a + 1; j <= b; j++) {
      // A page may not end on a block that must stay with the next one.
      if (j < b && blocks[j - 1]!.keepWithNext) continue
      for (let i = j - 1; i >= a; i--) {
        if (best[i - a] === Infinity) continue
        const capacity = room + (i === a ? firstExtra : 0)
        const h = used(i, j)
        const single = j - i === 1
        if (h > capacity && !single) break
        if (!single && blocks.slice(i, j).some((block) => block.alone)) continue
        const empty = Math.max(0, capacity - h)
        const cost = best[i - a]! + (j === b ? 0.25 : 1) * empty * empty + penalty
        if (cost < best[j - a]!) {
          best[j - a] = cost
          from[j - a] = i
        }
      }
    }
    const out: number[][] = []
    let j = b
    while (j > a) {
      const i = from[j - a]!
      if (i < 0) {
        // Nothing valid (a header taller than a page): one block per page.
        return Array.from({ length: b - a }, (_, k) => [a + k])
      }
      out.unshift(Array.from({ length: j - i }, (_, k) => i + k))
      j = i
    }
    return out
  }

  /** In order, but a later card that fits may fill the gap the next one leaves. */
  function greedyFill(a: number, b: number): number[][] {
    const out: number[][] = []
    const placed = new Set<number>()
    let page: number[] = []
    let filled = 0
    let capacity = room + firstExtra
    const flush = () => {
      if (page.length) out.push(page)
      page = []
      filled = 0
      capacity = room
    }
    const need = (k: number) => {
      let n = heights[k]! + (page.length ? gap : 0)
      if (blocks[k]!.keepWithNext && k + 1 < b) n += gap + heights[k + 1]!
      return n
    }
    const put = (k: number) => {
      filled += heights[k]! + (page.length ? gap : 0)
      page.push(k)
      placed.add(k)
    }
    for (let k = a; k < b; k++) {
      if (placed.has(k)) continue
      if (page.length && filled + need(k) > capacity) {
        // The section's last block stays last.
        for (let m = k + 1; m < b - 1; m++) if (!placed.has(m) && filled + need(m) <= capacity) put(m)
        flush()
      }
      put(k)
    }
    flush()
    return out
  }
}

/** How full each page is, 0 to 1, for checks. */
export function fullness(pages: readonly number[][], heights: readonly number[], { room, firstExtra, gap }: PageRoom, firstOfSection: (page: number) => boolean): number[] {
  return pages.map((page, n) => {
    const h = page.reduce((sum, k, i) => sum + heights[k]! + (i ? gap : 0), 0)
    return h / (room + (firstOfSection(n) ? firstExtra : 0))
  })
}
