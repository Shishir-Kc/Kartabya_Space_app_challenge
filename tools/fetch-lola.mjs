/**
 * Fetches a small patch of real lunar south pole elevation data from NASA's
 * Lunar Orbiter Laser Altimeter (LOLA) and writes it as a TypeScript module
 * the terrain can use for its base shape.
 *
 * Source: NASA Planetary Geodesy Data Archive, product 90
 * (https://pgda.gsfc.nasa.gov/products/90), "LDEM_80S_20MPP_ADJ.TIF":
 * heights in metres on a 20 m grid, polar stereographic, for everything
 * south of 80 degrees S. Barker et al., 2023, Planet. Sci. J., 4, 183.
 *
 * The file is 2.7 GB, so this reads only what it needs over HTTP range
 * requests: the TIFF header, then a few 512 x 512 tiles near the chosen
 * spot. It searches those tiles for a window with gentle, walkable relief
 * and writes that window to src/maps/lolaPatch.ts.
 *
 * Usage: node tools/fetch-lola.mjs [centreX_km centreY_km]
 *   (stereographic metres from the pole; defaults to a spot about 30 km from it)
 */
import { writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const URL = 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'maps', 'lolaPatch.ts')
/** Window size in pixels (20 m each): 48 px = 960 m, a little more than the 800 m surface. */
const WINDOW = 48

async function range(start, length) {
  const res = await fetch(URL, { headers: { Range: `bytes=${start}-${start + length - 1}` } })
  if (res.status !== 206) throw new Error(`range request failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// ---- BigTIFF header ----
const head = await range(0, 65536)
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
const offsets = await range(offsetsTag.value, offsetsTag.count * 8)
const counts = await range(countsTag.value, countsTag.count * 4)
console.log(`grid ${width} px at ${scaleX} m, origin (${originX}, ${originY}), tiles ${tilesAcross} x ${tilesAcross}`)

/** One decoded 512 x 512 tile of heights in metres. */
async function tile(tx, ty) {
  const index = ty * tilesAcross + tx
  const offset = Number(offsets.readBigUInt64LE(index * 8))
  const length = counts.readUInt32LE(index * 4)
  const raw = inflateSync(await range(offset, length))
  const heights = new Float32Array(tileSize * tileSize)
  const rowBytes = tileSize * 4
  const bytes = Buffer.alloc(4)
  for (let y = 0; y < tileSize; y++) {
    const row = raw.subarray(y * rowBytes, (y + 1) * rowBytes)
    // Undo the horizontal byte differencing...
    for (let i = 1; i < rowBytes; i++) row[i] = (row[i] + row[i - 1]) & 255
    // ...and the byte shuffle: byte k of sample j sits at k * width + j, most significant first.
    for (let x = 0; x < tileSize; x++) {
      for (let k = 0; k < 4; k++) bytes[k] = row[k * tileSize + x]
      heights[y * tileSize + x] = bytes.readFloatBE(0)
    }
  }
  return heights
}

// ---- Search near the chosen spot for gentle, walkable relief ----
const cx = (Number(process.argv[2] ?? 20) || 20) * 1000
const cy = (Number(process.argv[3] ?? 22) || 22) * 1000
const px = Math.round((cx - originX) / scaleX)
const py = Math.round((originY - cy) / scaleY)
const tx = Math.floor(px / tileSize)
const ty = Math.floor(py / tileSize)
console.log(`centre (${cx} m, ${cy} m) -> pixel (${px}, ${py}), tile (${tx}, ${ty})`)
const heights = await tile(tx, ty)

let best = null
for (let wy = 0; wy + WINDOW <= tileSize; wy += 8) {
  for (let wx = 0; wx + WINDOW <= tileSize; wx += 8) {
    let lo = Infinity
    let hi = -Infinity
    let steepest = 0
    let bad = false
    for (let y = 0; y < WINDOW; y++) {
      for (let x = 0; x < WINDOW; x++) {
        const h = heights[(wy + y) * tileSize + wx + x]
        if (!Number.isFinite(h) || Math.abs(h) > 20000) bad = true
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
        if (x > 0) steepest = Math.max(steepest, Math.abs(h - heights[(wy + y) * tileSize + wx + x - 1]) / scaleX)
        if (y > 0) steepest = Math.max(steepest, Math.abs(h - heights[(wy + y - 1) * tileSize + wx + x]) / scaleY)
      }
    }
    if (bad) continue
    const relief = hi - lo
    const slopeDeg = (Math.atan(steepest) * 180) / Math.PI
    // Walkable and drivable, but not flat: some real shape to it.
    if (slopeDeg > 14 || relief < 12 || relief > 70) continue
    const score = relief - slopeDeg * 2
    if (!best || score > best.score) best = { wx, wy, relief, slopeDeg, score }
  }
}
if (!best) throw new Error('no gentle window in this tile; try another centre')

const values = []
let sum = 0
for (let y = 0; y < WINDOW; y++) for (let x = 0; x < WINDOW; x++) sum += heights[(best.wy + y) * tileSize + best.wx + x]
const mean = sum / (WINDOW * WINDOW)
for (let y = 0; y < WINDOW; y++) {
  for (let x = 0; x < WINDOW; x++) values.push(Math.round((heights[(best.wy + y) * tileSize + best.wx + x] - mean) * 10))
}
const windowX = originX + (tx * tileSize + best.wx) * scaleX
const windowY = originY - (ty * tileSize + best.wy) * scaleY
console.log(`chose window at pixel (${tx * tileSize + best.wx}, ${ty * tileSize + best.wy}), relief ${best.relief.toFixed(1)} m, steepest ${best.slopeDeg.toFixed(1)} deg`)

const rows = []
for (let y = 0; y < WINDOW; y++) rows.push('  ' + values.slice(y * WINDOW, (y + 1) * WINDOW).join(', ') + ',')
writeFileSync(
  OUT,
  `/**
 * Real lunar south pole elevations, for the base shape of the outpost's terrain.
 * Generated by tools/fetch-lola.mjs; do not edit by hand.
 *
 * Source: NASA Lunar Orbiter Laser Altimeter (LOLA), PGDA product 90,
 * LDEM_80S_20MPP_ADJ.TIF (https://pgda.gsfc.nasa.gov/products/90).
 * Barker et al., 2023, Planet. Sci. J., 4, 183.
 *
 * A ${WINDOW} x ${WINDOW} window of 20 m pixels (${WINDOW * 20} m square), whose north-west
 * corner is at polar stereographic (${windowX.toFixed(0)} m, ${windowY.toFixed(0)} m) from the
 * south pole. Relief ${best.relief.toFixed(1)} m; steepest step ${best.slopeDeg.toFixed(1)} degrees.
 * Heights are in decimetres relative to the window's mean (${mean.toFixed(1)} m).
 * Rows and columns are in image order (stereographic -y and +x); the game lays them along +z and +x.
 */
export const LOLA_PATCH = {
  size: ${WINDOW},
  pixelMetres: 20,
  relief: ${best.relief.toFixed(1)},
  decimetres: [
${rows.join('\n')}
  ],
} as const
`,
)
console.log(`wrote ${OUT}`)
