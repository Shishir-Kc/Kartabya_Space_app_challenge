/**
 * Canvas textures worn on the suit: the chest name tag and the mission
 * patch (four original designs to pick from). No real agency insignia.
 */
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { PatchId } from '../state/astronaut'

const UI_FONT = 'Inter, system-ui, sans-serif'

function canvasTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export interface NameTag {
  texture: CanvasTexture
  setName: (name: string) => void
}

/** A dark tag with the player's name in white capitals, redrawn when the name changes. */
export function createNameTag(name: string): NameTag {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 160
  const context = canvas.getContext('2d')
  const texture = canvasTexture(canvas)
  let current = name

  const draw = () => {
    if (!context) return
    context.clearRect(0, 0, 512, 160)
    context.fillStyle = '#16233a'
    context.beginPath()
    context.roundRect(4, 4, 504, 152, 22)
    context.fill()
    context.strokeStyle = '#c9d3e6'
    context.lineWidth = 6
    context.stroke()
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    let size = 84
    context.font = `600 ${size}px ${UI_FONT}`
    const text = current.toUpperCase()
    while (context.measureText(text).width > 440 && size > 30) {
      size -= 4
      context.font = `600 ${size}px ${UI_FONT}`
    }
    context.fillText(text, 256, 84)
    texture.needsUpdate = true
  }

  draw()
  document.fonts?.load(`600 84px ${UI_FONT}`).then(draw).catch(() => undefined)
  return {
    texture,
    setName: (next) => {
      current = next
      draw()
    },
  }
}

type Context = CanvasRenderingContext2D

function disc(context: Context, x: number, y: number, r: number, color: string): void {
  context.fillStyle = color
  context.beginPath()
  context.arc(x, y, r, 0, Math.PI * 2)
  context.fill()
}

function star(context: Context, x: number, y: number, r: number, color: string): void {
  context.fillStyle = color
  context.beginPath()
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const radius = i % 2 === 0 ? r : r * 0.45
    context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
  }
  context.closePath()
  context.fill()
}

function rocket(context: Context, x: number, y: number, angle: number, scale: number): void {
  context.save()
  context.translate(x, y)
  context.rotate(angle)
  context.scale(scale, scale)
  context.fillStyle = '#ffffff'
  context.beginPath()
  context.moveTo(0, -46)
  context.quadraticCurveTo(14, -24, 12, 26)
  context.lineTo(-12, 26)
  context.quadraticCurveTo(-14, -24, 0, -46)
  context.fill()
  // Fins and a window.
  context.fillStyle = '#c9d3e6'
  context.beginPath()
  context.moveTo(-12, 8)
  context.lineTo(-24, 30)
  context.lineTo(-12, 26)
  context.moveTo(12, 8)
  context.lineTo(24, 30)
  context.lineTo(12, 26)
  context.fill()
  disc(context, 0, -12, 6, '#2a4f8f')
  context.fillStyle = '#e8692a'
  context.beginPath()
  context.moveTo(-10, 28)
  context.lineTo(0, 54)
  context.lineTo(10, 28)
  context.fill()
  context.restore()
}

/** The four patch designs, each drawn inside a 256 px round badge. All fictional. */
const PATCH_ART: Record<PatchId, { field: string; draw: (context: Context) => void }> = {
  // The Moon, a rocket climbing past it and a few stars.
  moon: {
    field: '#132447',
    draw: (context) => {
      disc(context, 160, 150, 48, '#d9d6cf')
      for (const [x, y, r] of [
        [150, 140, 9],
        [178, 168, 7],
        [170, 128, 5],
      ] as const) {
        disc(context, x, y, r, '#b4b0a8')
      }
      rocket(context, 96, 120, -0.5, 1)
      for (const [x, y] of [
        [70, 64],
        [190, 74],
        [120, 52],
        [60, 170],
      ] as const) {
        disc(context, x, y, 5, '#ffd166')
      }
    },
  },
  // A big rocket lifting off over a curved horizon.
  rocket: {
    field: '#3a1d5c',
    draw: (context) => {
      context.fillStyle = '#ff9a52'
      context.beginPath()
      context.ellipse(128, 262, 150, 70, 0, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#ffd166'
      context.beginPath()
      context.ellipse(128, 268, 110, 52, 0, 0, Math.PI * 2)
      context.fill()
      rocket(context, 128, 122, 0, 1.55)
      for (const [x, y] of [
        [58, 84],
        [198, 70],
        [204, 150],
        [50, 150],
      ] as const) {
        disc(context, x, y, 4, '#ffffff')
      }
    },
  },
  // One big star with a ring of small ones.
  stars: {
    field: '#0f3a4a',
    draw: (context) => {
      star(context, 128, 128, 58, '#ffd166')
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 + 0.39
        star(context, 128 + Math.cos(angle) * 86, 128 + Math.sin(angle) * 86, 11, '#f4f6fb')
      }
    },
  },
  // Earth seen from the Moon: a blue world over a grey horizon.
  earth: {
    field: '#0b1020',
    draw: (context) => {
      disc(context, 128, 108, 54, '#3b82c4')
      context.fillStyle = '#58b368'
      for (const [x, y, w, h, turn] of [
        [108, 92, 24, 16, -0.4],
        [146, 118, 20, 26, 0.5],
        [118, 136, 14, 9, 0.2],
      ] as const) {
        context.beginPath()
        context.ellipse(x, y, w, h, turn, 0, Math.PI * 2)
        context.fill()
      }
      context.fillStyle = 'rgb(255 255 255 / 0.75)'
      for (const [x, y, w] of [
        [100, 116, 20],
        [150, 90, 16],
      ] as const) {
        context.beginPath()
        context.ellipse(x, y, w, 5, -0.2, 0, Math.PI * 2)
        context.fill()
      }
      context.fillStyle = '#b9b6ae'
      context.beginPath()
      context.ellipse(128, 262, 170, 78, 0, 0, Math.PI * 2)
      context.fill()
      disc(context, 92, 214, 12, '#9c9992')
      disc(context, 168, 222, 8, '#9c9992')
      for (const [x, y] of [
        [52, 70],
        [206, 62],
        [210, 150],
      ] as const) {
        disc(context, x, y, 3.5, '#ffffff')
      }
    },
  },
}

/** Draws a patch into a 256 px canvas: a pale rim, the field, the art clipped to it. */
export function drawPatch(canvas: HTMLCanvasElement, id: PatchId): void {
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) return
  const art = PATCH_ART[id]
  disc(context, 128, 128, 124, '#e9ecf2')
  disc(context, 128, 128, 112, art.field)
  context.save()
  context.beginPath()
  context.arc(128, 128, 112, 0, Math.PI * 2)
  context.clip()
  art.draw(context)
  context.restore()
}

const patches = new Map<PatchId, CanvasTexture>()

/** A round mission patch for the shoulder. Drawn once per design and shared by every astronaut. */
export function missionPatchTexture(id: PatchId = 'moon'): CanvasTexture {
  let texture = patches.get(id)
  if (!texture) {
    const canvas = document.createElement('canvas')
    drawPatch(canvas, id)
    texture = canvasTexture(canvas)
    patches.set(id, texture)
  }
  return texture
}
