/**
 * Textures drawn with the 2D canvas: the shared decal atlas, the briefing
 * room's mission screen, and the console screens. Text uses the self-hosted
 * Inter and JetBrains Mono fonts; each canvas is drawn once with a fallback
 * font, then redrawn when the web fonts finish loading.
 *
 * Everything here is fictional: no logos, insignia or brand names.
 */
import { CanvasTexture, SRGBColorSpace } from 'three'
import { hash2 } from './noise'

const ATLAS_SIZE = 1024

export const CRATE_LABELS = ['SUPPLIES', 'SHIELDING', 'POWER', 'SPARES'] as const
export const FLOOR_LABELS = ['BAY 1', 'BAY 2', 'BAY 3', 'BAY 4'] as const

interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

/** Where each decal lives in the atlas, in pixels. */
const CELLS: Record<string, PixelRect> = {
  hazard: { x: 0, y: 0, w: 1024, h: 96 },
  'paint-yellow': { x: 4, y: 100, w: 56, h: 24 },
  'paint-white': { x: 68, y: 100, w: 56, h: 24 },
  earth: { x: 768, y: 128, w: 256, h: 256 },
  extinguisher: { x: 768, y: 400, w: 128, h: 192 },
  intercom: { x: 896, y: 400, w: 128, h: 192 },
  fusebox: { x: 768, y: 600, w: 128, h: 192 },
  'call-panel': { x: 896, y: 600, w: 128, h: 192 },
  // Spacecraft placards and small screens (Phase 2).
  'water-label': { x: 0, y: 600, w: 256, h: 96 },
  'stowage-label': { x: 256, y: 600, w: 256, h: 96 },
  'co2-panel': { x: 512, y: 600, w: 256, h: 192 },
  'rack-panel': { x: 0, y: 704, w: 256, h: 192 },
  'laptop-screen': { x: 256, y: 704, w: 256, h: 160 },
  'galley-panel': { x: 512, y: 800, w: 256, h: 160 },
}
CRATE_LABELS.forEach((label, i) => {
  CELLS[`crate:${label}`] = { x: 0, y: 128 + i * 112, w: 512, h: 112 }
})
FLOOR_LABELS.forEach((label, i) => {
  CELLS[`floor:${label}`] = { x: 512, y: 128 + i * 112, w: 256, h: 112 }
})

/** Metres of hazard stripe the hazard cell covers before it would repeat. */
export const HAZARD_CELL_METRES = 2.5

export interface UvRect {
  u0: number
  u1: number
  v0: number
  v1: number
}

/** The UV rectangle of a named atlas cell, or undefined if there is none. */
export function atlasCell(name: string): UvRect | undefined {
  const cell = CELLS[name]
  if (!cell) return undefined
  // Canvas textures are flipped, so v = 1 is the top row of the canvas.
  return {
    u0: cell.x / ATLAS_SIZE,
    u1: (cell.x + cell.w) / ATLAS_SIZE,
    v0: 1 - (cell.y + cell.h) / ATLAS_SIZE,
    v1: 1 - cell.y / ATLAS_SIZE,
  }
}

const UI_FONT = 'Inter, system-ui, sans-serif'
const MONO_FONT = '"JetBrains Mono", ui-monospace, monospace'

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas is not available')
  return { canvas, context }
}

function canvasTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** Redraws once the web fonts are ready, so text doesn't stay in the fallback font. */
function afterFonts(redraw: () => void): void {
  if (typeof document === 'undefined' || !document.fonts) return
  Promise.all([
    document.fonts.load(`600 48px ${UI_FONT}`),
    document.fonts.load(`600 32px ${MONO_FONT}`),
  ])
    .then(redraw)
    .catch(() => undefined)
}

/** Scuffs paint off a region at random, for worn stencils. */
function wear(context: CanvasRenderingContext2D, rect: PixelRect, amount: number, seed: number): void {
  context.save()
  context.globalCompositeOperation = 'destination-out'
  const count = Math.round(rect.w * rect.h * amount * 0.002)
  for (let i = 0; i < count; i++) {
    const x = rect.x + hash2(i, 1, seed) * rect.w
    const y = rect.y + hash2(i, 2, seed) * rect.h
    const r = 0.6 + hash2(i, 3, seed) * 2.2
    context.globalAlpha = 0.4 + hash2(i, 4, seed) * 0.6
    context.beginPath()
    context.arc(x, y, r, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function drawHazard(context: CanvasRenderingContext2D): void {
  const { x, y, w, h } = CELLS.hazard!
  context.fillStyle = '#e8b10a'
  context.fillRect(x, y, w, h)
  context.fillStyle = '#16171a'
  for (let sx = x - h; sx < x + w + h; sx += 64) {
    context.beginPath()
    context.moveTo(sx, y + h)
    context.lineTo(sx + 32, y + h)
    context.lineTo(sx + 32 + h, y)
    context.lineTo(sx + h, y)
    context.closePath()
    context.fill()
  }
  wear(context, { x, y, w, h }, 3, 5)
}

function drawStencil(context: CanvasRenderingContext2D, label: string, rect: PixelRect, seed: number): void {
  context.save()
  context.fillStyle = '#16181d'
  context.font = `600 64px ${UI_FONT}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  if ('letterSpacing' in context) context.letterSpacing = '8px'
  context.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 2, rect.w - 24)
  // Stencil bridges: thin cuts through every letter.
  context.globalCompositeOperation = 'destination-out'
  context.fillRect(rect.x, rect.y + rect.h / 2 - 2, rect.w, 4)
  context.restore()
  wear(context, rect, 4, seed)
}

function drawFloorLabel(context: CanvasRenderingContext2D, label: string, rect: PixelRect, seed: number): void {
  context.save()
  context.strokeStyle = '#f0c030'
  context.lineWidth = 6
  context.strokeRect(rect.x + 8, rect.y + 8, rect.w - 16, rect.h - 16)
  context.fillStyle = '#f0c030'
  context.font = `600 52px ${UI_FONT}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 2, rect.w - 40)
  context.restore()
  wear(context, rect, 5, seed)
}

/** A stylised Earth from space, for the framed picture in crew quarters. */
export function drawEarth(context: CanvasRenderingContext2D, rect: PixelRect): void {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const r = Math.min(rect.w, rect.h) * 0.4
  context.save()
  context.fillStyle = '#04060d'
  context.fillRect(rect.x, rect.y, rect.w, rect.h)
  for (let i = 0; i < 40; i++) {
    context.fillStyle = `rgba(255,255,255,${0.3 + hash2(i, 9, 3) * 0.6})`
    context.fillRect(rect.x + hash2(i, 1, 3) * rect.w, rect.y + hash2(i, 2, 3) * rect.h, 1.5, 1.5)
  }
  context.beginPath()
  context.arc(cx, cy, r, 0, Math.PI * 2)
  context.clip()
  const ocean = context.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r)
  ocean.addColorStop(0, '#3f8fd6')
  ocean.addColorStop(1, '#0d2f66')
  context.fillStyle = ocean
  context.fillRect(rect.x, rect.y, rect.w, rect.h)
  // Land and clouds as soft blobs.
  for (let i = 0; i < 26; i++) {
    const bx = cx + (hash2(i, 5, 7) - 0.5) * r * 1.6
    const by = cy + (hash2(i, 6, 7) - 0.5) * r * 1.6
    const br = r * (0.1 + hash2(i, 8, 7) * 0.2)
    context.fillStyle = i % 3 === 0 ? 'rgba(170,140,90,0.85)' : 'rgba(70,130,70,0.85)'
    context.beginPath()
    context.ellipse(bx, by, br, br * 0.7, hash2(i, 9, 7) * Math.PI, 0, Math.PI * 2)
    context.fill()
  }
  for (let i = 0; i < 30; i++) {
    const bx = cx + (hash2(i, 11, 13) - 0.5) * r * 1.8
    const by = cy + (hash2(i, 12, 13) - 0.5) * r * 1.8
    context.fillStyle = 'rgba(255,255,255,0.55)'
    context.beginPath()
    context.ellipse(bx, by, r * 0.18, r * 0.05, hash2(i, 14, 13) * Math.PI, 0, Math.PI * 2)
    context.fill()
  }
  // Night side.
  const shade = context.createLinearGradient(cx - r, cy, cx + r, cy)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(0.6, 'rgba(0,0,0,0.1)')
  shade.addColorStop(1, 'rgba(0,0,0,0.75)')
  context.fillStyle = shade
  context.fillRect(rect.x, rect.y, rect.w, rect.h)
  context.restore()
  // Thin atmosphere rim.
  context.strokeStyle = 'rgba(120,180,255,0.6)'
  context.lineWidth = 3
  context.beginPath()
  context.arc(cx, cy, r, 0, Math.PI * 2)
  context.stroke()
}

function plate(context: CanvasRenderingContext2D, rect: PixelRect, fill: string): void {
  context.fillStyle = fill
  context.fillRect(rect.x, rect.y, rect.w, rect.h)
  context.strokeStyle = 'rgba(0,0,0,0.35)'
  context.lineWidth = 4
  context.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4)
}

function caption(context: CanvasRenderingContext2D, text: string, rect: PixelRect, y: number, color: string): void {
  context.fillStyle = color
  context.font = `600 18px ${UI_FONT}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, rect.x + rect.w / 2, rect.y + y, rect.w - 12)
}

function drawEquipment(context: CanvasRenderingContext2D): void {
  const ext = CELLS.extinguisher!
  plate(context, ext, '#b8251c')
  context.fillStyle = '#ffffff'
  context.beginPath()
  context.roundRect(ext.x + 46, ext.y + 52, 36, 90, 10)
  context.fill()
  context.fillRect(ext.x + 56, ext.y + 38, 16, 16)
  context.fillRect(ext.x + 70, ext.y + 40, 26, 6)
  caption(context, 'FIRE', ext, 168, '#ffffff')

  const intercom = CELLS.intercom!
  plate(context, intercom, '#5d636b')
  context.fillStyle = '#2a2d33'
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      context.beginPath()
      context.arc(intercom.x + 34 + col * 15, intercom.y + 40 + row * 15, 4, 0, Math.PI * 2)
      context.fill()
    }
  }
  context.fillStyle = '#4fd18b'
  context.beginPath()
  context.arc(intercom.x + 64, intercom.y + 138, 12, 0, Math.PI * 2)
  context.fill()
  caption(context, 'INTERCOM', intercom, 172, '#e8ecf2')

  const fuse = CELLS.fusebox!
  plate(context, fuse, '#7b828c')
  context.fillStyle = '#f0c030'
  context.beginPath()
  context.moveTo(fuse.x + 64, fuse.y + 40)
  context.lineTo(fuse.x + 104, fuse.y + 110)
  context.lineTo(fuse.x + 24, fuse.y + 110)
  context.closePath()
  context.fill()
  context.fillStyle = '#16181d'
  context.font = `600 44px ${UI_FONT}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('!', fuse.x + 64, fuse.y + 88)
  caption(context, 'POWER', fuse, 150, '#16181d')

  const call = CELLS['call-panel']!
  plate(context, call, '#8a9099')
  context.fillStyle = '#2a2d33'
  context.beginPath()
  context.roundRect(call.x + 34, call.y + 40, 60, 112, 12)
  context.fill()
  context.fillStyle = '#ffb547'
  context.beginPath()
  context.moveTo(call.x + 64, call.y + 58)
  context.lineTo(call.x + 82, call.y + 84)
  context.lineTo(call.x + 46, call.y + 84)
  context.closePath()
  context.fill()
  context.fillStyle = '#5d636b'
  context.beginPath()
  context.moveTo(call.x + 64, call.y + 134)
  context.lineTo(call.x + 82, call.y + 108)
  context.lineTo(call.x + 46, call.y + 108)
  context.closePath()
  context.fill()
}

/** Spacecraft placards and screens. No real agency marks: plain words only. */
function drawSpacecraft(context: CanvasRenderingContext2D): void {
  const water = CELLS['water-label']!
  plate(context, water, '#2c6db3')
  context.fillStyle = '#ffffff'
  context.font = `700 34px ${UI_FONT}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('WATER', water.x + water.w / 2, water.y + 38)
  context.font = `600 16px ${UI_FONT}`
  context.fillText('DRINKING · RADIATION SHIELD', water.x + water.w / 2, water.y + 72, water.w - 16)

  const stowage = CELLS['stowage-label']!
  plate(context, stowage, '#e9e4d6')
  context.fillStyle = '#2b2f36'
  context.font = `700 30px ${MONO_FONT}`
  context.fillText('STOWAGE', stowage.x + stowage.w / 2, stowage.y + 38)
  context.font = `600 16px ${MONO_FONT}`
  context.fillText('SOFT BAG · SECURE STRAPS', stowage.x + stowage.w / 2, stowage.y + 72, stowage.w - 16)

  const co2 = CELLS['co2-panel']!
  plate(context, co2, '#0c1624')
  context.fillStyle = '#9fd4ff'
  context.font = `600 22px ${MONO_FONT}`
  context.textAlign = 'left'
  context.fillText('CO\u2082 SCRUBBER', co2.x + 18, co2.y + 30)
  context.fillStyle = '#5fe39b'
  context.font = `600 18px ${MONO_FONT}`
  context.fillText('STATUS  NOMINAL', co2.x + 18, co2.y + 62)
  // A small bar chart of the last few readings: shape only, no numbers.
  const heights = [34, 38, 36, 40, 37, 35, 39, 36, 38, 37]
  heights.forEach((h, i) => {
    context.fillStyle = '#3aa874'
    context.fillRect(co2.x + 20 + i * 22, co2.y + 168 - h * 1.8, 14, h * 1.8)
  })
  context.fillStyle = '#28425f'
  context.fillRect(co2.x + 16, co2.y + 170, co2.w - 32, 2)

  const rack = CELLS['rack-panel']!
  plate(context, rack, '#d8dbe0')
  context.fillStyle = '#1b2230'
  context.fillRect(rack.x + 18, rack.y + 18, 140, 70)
  context.fillStyle = '#62d0ff'
  context.font = `600 16px ${MONO_FONT}`
  context.textAlign = 'left'
  context.fillText('FAN  A  ON', rack.x + 28, rack.y + 42)
  context.fillText('FAN  B  STBY', rack.x + 28, rack.y + 66)
  const switches = ['PWR', 'FLOW', 'HTR', 'VLV']
  switches.forEach((label, i) => {
    const x = rack.x + 30 + i * 56
    context.fillStyle = '#2b2f36'
    context.fillRect(x, rack.y + 110, 16, 36)
    context.fillStyle = '#2b2f36'
    context.font = `600 13px ${UI_FONT}`
    context.textAlign = 'center'
    context.fillText(label, x + 8, rack.y + 166)
  })

  const laptop = CELLS['laptop-screen']!
  context.fillStyle = '#0d1a2c'
  context.fillRect(laptop.x, laptop.y, laptop.w, laptop.h)
  context.fillStyle = '#1f3a5c'
  context.fillRect(laptop.x, laptop.y, laptop.w, 22)
  context.fillStyle = '#cfe6ff'
  context.font = `600 13px ${MONO_FONT}`
  context.textAlign = 'left'
  context.fillText('PROCEDURES', laptop.x + 10, laptop.y + 12)
  for (let row = 0; row < 6; row++) {
    context.fillStyle = row === 1 ? '#3b6ea8' : '#29435f'
    context.fillRect(laptop.x + 12, laptop.y + 34 + row * 20, 150 + ((row * 37) % 70), 10)
  }

  const galley = CELLS['galley-panel']!
  plate(context, galley, '#c9ccd2')
  context.fillStyle = '#1b2230'
  context.fillRect(galley.x + 16, galley.y + 16, 110, 46)
  context.fillStyle = '#ffb547'
  context.font = `600 22px ${MONO_FONT}`
  context.textAlign = 'center'
  context.fillText('WARM', galley.x + 71, galley.y + 40)
  const buttons = ['#4fd18b', '#ffb547', '#e35b4f']
  buttons.forEach((color, i) => {
    context.fillStyle = color
    context.beginPath()
    context.arc(galley.x + 160 + i * 30, galley.y + 40, 10, 0, Math.PI * 2)
    context.fill()
  })
  context.fillStyle = '#2b2f36'
  context.font = `600 15px ${UI_FONT}`
  context.fillText('HOT WATER   COLD WATER', galley.x + galley.w / 2, galley.y + 118, galley.w - 16)
}

function drawAtlas(context: CanvasRenderingContext2D): void {
  context.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE)
  drawHazard(context)
  const yellow = CELLS['paint-yellow']!
  context.fillStyle = '#e9b81a'
  context.fillRect(yellow.x, yellow.y, yellow.w, yellow.h)
  const white = CELLS['paint-white']!
  context.fillStyle = '#e8eaee'
  context.fillRect(white.x, white.y, white.w, white.h)
  CRATE_LABELS.forEach((label, i) => drawStencil(context, label, CELLS[`crate:${label}`]!, 30 + i))
  FLOOR_LABELS.forEach((label, i) => drawFloorLabel(context, label, CELLS[`floor:${label}`]!, 40 + i))
  drawEarth(context, CELLS.earth!)
  drawEquipment(context)
  drawSpacecraft(context)
}

let atlas: CanvasTexture | null = null

/** The shared decal atlas, created once. */
export function decalAtlas(): CanvasTexture {
  if (atlas) return atlas
  const { canvas, context } = makeCanvas(ATLAS_SIZE, ATLAS_SIZE)
  drawAtlas(context)
  const texture = canvasTexture(canvas)
  afterFonts(() => {
    drawAtlas(context)
    texture.needsUpdate = true
  })
  atlas = texture
  return texture
}

/** The briefing room's wall screen: an Earth-to-Moon trajectory and the title. */
export function missionBriefingTexture(): CanvasTexture {
  const { canvas, context } = makeCanvas(1024, 512)
  const draw = () => {
    const bg = context.createRadialGradient(512, 300, 60, 512, 256, 640)
    bg.addColorStop(0, '#0f2a4a')
    bg.addColorStop(1, '#040a16')
    context.fillStyle = bg
    context.fillRect(0, 0, 1024, 512)

    context.strokeStyle = 'rgba(92,200,255,0.08)'
    context.lineWidth = 1
    for (let x = 0; x <= 1024; x += 64) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, 512)
      context.stroke()
    }
    for (let y = 0; y <= 512; y += 64) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(1024, y)
      context.stroke()
    }

    drawEarth(context, { x: 120, y: 220, w: 240, h: 240 })

    // The Moon.
    const moon = context.createRadialGradient(830, 170, 6, 840, 180, 46)
    moon.addColorStop(0, '#e8e6e0')
    moon.addColorStop(1, '#8d8b86')
    context.fillStyle = moon
    context.beginPath()
    context.arc(840, 180, 44, 0, Math.PI * 2)
    context.fill()

    // Trajectory: out from Earth, around the Moon.
    context.strokeStyle = '#ffb547'
    context.lineWidth = 4
    context.setLineDash([14, 10])
    context.beginPath()
    context.moveTo(330, 300)
    context.bezierCurveTo(480, 120, 700, 60, 880, 120)
    context.bezierCurveTo(940, 150, 920, 250, 850, 240)
    context.stroke()
    context.setLineDash([])
    context.fillStyle = '#ffffff'
    context.beginPath()
    context.arc(610, 112, 7, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = '#ffffff'
    context.font = `600 56px ${UI_FONT}`
    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    context.fillText('MISSION BRIEFING', 48, 88)
    context.fillStyle = '#8fdcff'
    context.font = `400 24px ${MONO_FONT}`
    context.fillText('EARTH  >  LUNAR OUTPOST', 52, 130)
    context.fillStyle = '#b4bdd0'
    context.font = `400 20px ${MONO_FONT}`
    context.fillText('CREW 4   |   PRE-LAUNCH   |   T-MINUS 06:00:00', 52, 476)
  }
  draw()
  const texture = canvasTexture(canvas)
  afterFonts(() => {
    draw()
    texture.needsUpdate = true
  })
  return texture
}

export interface ConsoleScreen {
  texture: CanvasTexture
  /**
   * Redraws the screen with the cursor on or off; `done` turns it green with
   * a tick; `launch` ("Preparing for launch", "Launching") shows that in
   * amber in place of the task, during the launch.
   */
  draw: (cursorOn: boolean, done?: boolean, launch?: string | null) => void
}

/** A console screen: header, title, three status bars and a blinking cursor (green once its challenge is done, amber during the launch). */
export function consoleScreen(title: string, number: number): ConsoleScreen {
  const { canvas, context } = makeCanvas(512, 320)
  const bars = [0.35, 0.6, 0.85].map((base, i) => base * (0.6 + hash2(number, i, 211) * 0.5))
  const labels = ['PWR', 'LIFE', 'SHLD']

  const draw = (cursorOn: boolean, done = false, launch: string | null = null) => {
    if (launch) done = false
    const bg = context.createLinearGradient(0, 0, 0, 320)
    bg.addColorStop(0, done ? '#0a2a1c' : '#0a1c30')
    bg.addColorStop(1, done ? '#04180f' : '#04101d')
    context.fillStyle = bg
    context.fillRect(0, 0, 512, 320)

    context.fillStyle = done ? 'rgba(79,209,139,0.28)' : launch ? 'rgba(255,209,102,0.24)' : 'rgba(92,200,255,0.18)'
    context.fillRect(0, 0, 512, 40)
    context.fillStyle = done ? '#8ff0b8' : launch ? '#ffd98a' : '#8fdcff'
    context.font = `600 20px ${MONO_FONT}`
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.fillText(`CONSOLE ${String(number).padStart(2, '0')}`, 20, 21)
    context.textAlign = 'right'
    context.fillText(done ? 'DONE' : launch ? 'LAUNCH' : 'ONLINE', 492, 21)

    context.fillStyle = launch ? '#ffd166' : '#ffffff'
    context.font = `600 34px ${UI_FONT}`
    context.textAlign = 'left'
    context.fillText(launch ?? title, 20, 86, 472)

    labels.forEach((label, i) => {
      const y = 140 + i * 44
      context.fillStyle = '#b4bdd0'
      context.font = `400 18px ${MONO_FONT}`
      context.fillText(label, 20, y)
      context.fillStyle = 'rgba(255,255,255,0.12)'
      context.fillRect(96, y - 9, 380, 18)
      context.fillStyle = i === 0 ? '#ffd166' : i === 1 ? '#5cc8ff' : '#b79cff'
      context.fillRect(96, y - 9, 380 * (bars[i] ?? 0.5), 18)
    })

    context.fillStyle = launch ? '#ffd166' : '#4fd18b'
    context.font = `400 22px ${MONO_FONT}`
    const status = done ? '> DONE \u2713' : launch === 'Launching' ? '> IGNITION' : launch ? '> COUNTDOWN' : '> READY'
    context.fillText(cursorOn ? `${status}_` : status, 20, 290)
  }

  draw(true)
  const texture = canvasTexture(canvas)
  afterFonts(() => {
    draw(true)
    texture.needsUpdate = true
  })
  return { texture, draw }
}
