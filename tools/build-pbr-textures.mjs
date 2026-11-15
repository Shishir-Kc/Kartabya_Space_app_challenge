// Turns CC0 PBR texture sets from ambientCG (1K-JPG downloads, unzipped) into
// the game's surface textures in public/textures/pbr/:
//
//   <surface>-color.webp   grey detail, normalized brightness (the props'
//                          vertex tints give the colour, as with the
//                          procedural textures they replace)
//   <surface>-normal.webp  OpenGL normal map
//   <surface>-orm.webp     R ambient occlusion, G roughness, B metalness
//
// Usage: node tools/build-pbr-textures.mjs <folder with the unzipped sets>
// Sources and licences: ASSETS.md.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

/**
 * surface: [ambientCG id, size in px, mean brightness of the grey colour map
 * (0-1, the same as the procedural texture it replaces, so every prop keeps
 * its tint's colour), how much of the scan's contrast to keep (subtle wear),
 * how much of its metalness to keep, how much of its roughness variation]
 * Painted metal keeps little of its chipped-paint metalness: bare chips
 * reflecting a dark room read as black blotches, not wear.
 */
const SETS = {
  brushed: ['Metal032', 1024, 0.72, 0.8, 1, 1],
  painted: ['PaintedMetal004', 1024, 0.94, 0.3, 0.2, 0.35],
  rubber: ['Rubber004', 512, 0.18, 0.6, 1, 0.8],
  fabric: ['Fabric026', 512, 0.86, 0.6, 1, 0.8],
  concrete: ['Concrete034', 512, 0.66, 0.7, 1, 0.8],
}

const source = process.argv[2]
if (!source) throw new Error('Usage: node tools/build-pbr-textures.mjs <folder>')
const out = join(process.cwd(), 'public/textures/pbr')
mkdirSync(out, { recursive: true })

const file = (id, map) => join(source, id, `${id}_1K-JPG_${map}.jpg`)
const grey = async (path, size) =>
  sharp(path)
    .resize(size, size)
    .greyscale()
    .raw()
    .toBuffer()
    .catch(() => null)

for (const [surface, [id, size, mean, contrast, metalKeep, roughKeep]] of Object.entries(SETS)) {
  // Colour: luminance only, scaled so its average is `mean`, with some of its contrast.
  const lum = await grey(file(id, 'Color'), size)
  let sum = 0
  for (const v of lum) sum += v
  const avg = sum / lum.length / 255
  const color = Buffer.alloc(lum.length)
  for (let i = 0; i < lum.length; i++) {
    const v = lum[i] / 255
    color[i] = Math.max(0, Math.min(255, Math.round((mean + (v - avg) * contrast) * 255)))
  }
  await sharp(color, { raw: { width: size, height: size, channels: 1 } })
    .toColourspace('srgb')
    .webp({ quality: 82 })
    .toFile(join(out, `${surface}-color.webp`))

  await sharp(file(id, 'NormalGL')).resize(size, size).webp({ quality: 90 }).toFile(join(out, `${surface}-normal.webp`))

  // ORM: occlusion (white if the set has none), roughness, metalness (black if none).
  const ao = await grey(file(id, 'AmbientOcclusion'), size)
  const rough = await grey(file(id, 'Roughness'), size)
  const metal = await grey(file(id, 'Metalness'), size)
  const orm = Buffer.alloc(size * size * 3)
  let roughMean = 200
  if (rough) {
    let total = 0
    for (const v of rough) total += v
    roughMean = total / rough.length
  }
  for (let i = 0; i < size * size; i++) {
    orm[i * 3] = ao ? ao[i] : 255
    orm[i * 3 + 1] = rough ? Math.round(roughMean + (rough[i] - roughMean) * roughKeep) : 200
    orm[i * 3 + 2] = metal ? Math.round(metal[i] * metalKeep) : 0
  }
  await sharp(orm, { raw: { width: size, height: size, channels: 3 } })
    .webp({ quality: 88 })
    .toFile(join(out, `${surface}-orm.webp`))
  console.log(`${surface}: ${id} at ${size} px (colour mean ${avg.toFixed(2)} -> ${mean})`)
}
