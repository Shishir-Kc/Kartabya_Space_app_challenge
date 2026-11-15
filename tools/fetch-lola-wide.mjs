/**
 * Fetches the real lunar south pole elevations round the outpost's window,
 * coarser and much wider, so the landscape seen while coming down to land
 * is real terrain too. Writes src/maps/lolaWide.ts.
 *
 * Source: the same file as tools/fetch-lola.mjs, NASA PGDA product 90
 * (https://pgda.gsfc.nasa.gov/products/90), "LDEM_80S_20MPP_ADJ.TIF": LOLA
 * heights on a 20 m polar stereographic grid. Barker et al., 2023, Planet.
 * Sci. J., 4, 183.
 *
 * It reads only the TIFF header and the few 512 x 512 tiles that cover a
 * 12.8 km square centred on the outpost's 960 m window (HTTP range
 * requests), and averages each 8 x 8 block of 20 m pixels into one 160 m
 * pixel. Heights are relative to the outpost window's own mean, so the two
 * line up.
 *
 * Usage: node tools/fetch-lola-wide.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const URL = 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'maps', 'lolaWide.ts')
/** Output: 80 x 80 pixels of 160 m (8 x 8 source pixels each): 12.8 km square. */
const SIZE = 80
const BLOCK = 8

// The outpost window's corner and mean, from the header lolaPatch.ts was written with.
const patch = readFileSync(join(ROOT, 'src', 'maps', 'lolaPatch.ts'), 'utf8')
const corner = /corner is at polar stereographic \((-?\d+) m, (-?\d+) m\)/.exec(patch)
const meanMatch = /window's mean \((-?[\d.]+) m\)/.exec(patch)
const patchSize = Number(/size: (\d+)/.exec(patch)?.[1])
if (!corner || !meanMatch || !patchSize) throw new Error('could not read the window from src/maps/lolaPatch.ts')
const patchMean = Number(meanMatch[1])
const centreX = Number(corner[1]) + (patchSize * 20) / 2
const centreY = Number(corner[2]) - (patchSize * 20) / 2

async function range(start, length) {
  const res = await fetch(URL, { headers: { Range: `bytes=${start}-${start + length - 1}` } })
  if (res.status !== 206) throw new Error(`range request failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

let requests = 0
let bytes = 0
async function counted(start, length) {
  requests++
  bytes += length
  return range(start, length)
}

// ---- BigTIFF header (as in fetch-lola.mjs) ----
const head = await counted(0, 65536)
if (head.toString('ascii', 0, 2) !== 'II' || head.readUInt16LE(2) !== 43) throw new Error('expected a little-endian BigTIFF')
const ifd = Number(head.readBigUInt64LE(8))
const entries = Number(head.readBigUInt64LE(ifd))
const tags = new Map()
for (let i = 0; i < entries; i++) {
  const e = ifd + 8 + i * 20
  tags.set(head.readUInt16LE(e), { type: head.readUInt16LE(e + 2), count: Number(head.readBigUInt64LE(e + 4)), value: Number(head.readBigUInt64LE(e + 12)) })
}
const width = tags.get(256).value
const tileSize = tags.get(322).value
const tilesAcross = Math.ceil(width / tileSize)
if (tags.get(259).value !== 8 || tags.get(317).value !== 3 || tags.get(339).value !== 3) throw new Error('expected Deflate, floating-point predictor, float samples')
const doubles = (tag) => {
  const t = tags.get(tag)
  return Array.from({ length: t.count }, (_, i) => head.readDoubleLE(t.value + i * 8))
}
const [scaleX, scaleY] = doubles(33550)
const tie = doubles(33922)
const originX = tie[3] - tie[0] * scaleX
const originY = tie[4] + tie[1] * scaleY
const offsetsTag = tags.get(324)
const countsTag = tags.get(325)

/** One decoded tile of heights in metres (reading only its own offset and length entries). */
const tiles = new Map()
async function tile(tx, ty) {
  const key = `${tx},${ty}`
  if (tiles.has(key)) return tiles.get(key)
  const index = ty * tilesAcross + tx
  const offset = Number((await counted(offsetsTag.value + index * 8, 8)).readBigUInt64LE(0))
  const length = (await counted(countsTag.value + index * 4, 4)).readUInt32LE(0)
  const raw = inflateSync(await counted(offset, length))
  const heights = new Float32Array(tileSize * tileSize)
  const rowBytes = tileSize * 4
  const four = Buffer.alloc(4)
  for (let y = 0; y < tileSize; y++) {
    const row = raw.subarray(y * rowBytes, (y + 1) * rowBytes)
    for (let i = 1; i < rowBytes; i++) row[i] = (row[i] + row[i - 1]) & 255
    for (let x = 0; x < tileSize; x++) {
      for (let k = 0; k < 4; k++) four[k] = row[k * tileSize + x]
      heights[y * tileSize + x] = four.readFloatBE(0)
    }
  }
  tiles.set(key, heights)
  return heights
}

async function pixel(px, py) {
  const heights = await tile(Math.floor(px / tileSize), Math.floor(py / tileSize))
  return heights[(py % tileSize) * tileSize + (px % tileSize)]
}

// ---- Average 8 x 8 blocks over the square ----
const span = SIZE * BLOCK
const left = Math.round((centreX - originX) / scaleX) - span / 2
const top = Math.round((originY - centreY) / scaleY) - span / 2
console.log(`centre (${centreX} m, ${centreY} m); reading ${span} x ${span} pixels from (${left}, ${top})`)
const values = []
let lo = Infinity
let hi = -Infinity
for (let by = 0; by < SIZE; by++) {
  for (let bx = 0; bx < SIZE; bx++) {
    let sum = 0
    let n = 0
    for (let y = 0; y < BLOCK; y++) {
      for (let x = 0; x < BLOCK; x++) {
        const h = await pixel(left + bx * BLOCK + x, top + by * BLOCK + y)
        if (!Number.isFinite(h) || Math.abs(h) > 20000) continue
        sum += h
        n++
      }
    }
    const h = n ? sum / n : patchMean
    lo = Math.min(lo, h)
    hi = Math.max(hi, h)
    values.push(Math.round(h - patchMean))
  }
}
console.log(`relief ${(hi - lo).toFixed(0)} m; ${requests} range requests, ${(bytes / 1e6).toFixed(2)} MB`)

const rows = []
for (let y = 0; y < SIZE; y++) rows.push('    ' + values.slice(y * SIZE, (y + 1) * SIZE).join(', ') + ',')
writeFileSync(
  OUT,
  `/**
 * Real lunar south pole elevations round the outpost, coarse and wide: the
 * landscape seen while coming down to land. Generated by
 * tools/fetch-lola-wide.mjs; do not edit by hand.
 *
 * Source: NASA Lunar Orbiter Laser Altimeter (LOLA), PGDA product 90,
 * LDEM_80S_20MPP_ADJ.TIF (https://pgda.gsfc.nasa.gov/products/90).
 * Barker et al., 2023, Planet. Sci. J., 4, 183.
 *
 * ${SIZE} x ${SIZE} pixels of ${BLOCK * 20} m (each the mean of ${BLOCK} x ${BLOCK} 20 m pixels), a
 * ${(SIZE * BLOCK * 20) / 1000} km square centred on the outpost's window (src/maps/lolaPatch.ts), at
 * polar stereographic (${centreX} m, ${centreY} m) from the south pole. Relief ${(hi - lo).toFixed(0)} m.
 * Heights are in metres relative to the outpost window's mean (${patchMean} m).
 * Rows and columns are in image order (stereographic -y and +x); the game lays them along +z and +x.
 */
export const LOLA_WIDE = {
  size: ${SIZE},
  pixelMetres: ${BLOCK * 20},
  metres: [
${rows.join('\n')}
  ],
} as const
`,
)
console.log(`wrote ${OUT}`)
