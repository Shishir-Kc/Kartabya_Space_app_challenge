/**
 * The player's astronaut: a name, a body and how they look (skin tone, hair,
 * eyes, mission patch). Kept in the game store and remembered in this
 * browser only. Nothing leaves the device.
 */

/**
 * The body: female or male, nothing else. Both change suits through the
 * mission; the spacesuit is an outfit (worn on the lunar surface), not a body.
 */
export type AstronautVariant = 'male' | 'female'

export const VARIANTS: readonly AstronautVariant[] = ['female', 'male']

export const VARIANT_LABELS: Record<AstronautVariant, string> = {
  female: 'Female',
  male: 'Male',
}

export function isVariant(value: unknown): value is AstronautVariant {
  return value === 'female' || value === 'male'
}

/**
 * The body a saved astronaut gets. Saves from when "Spacesuit" was a body
 * become Male (that suit was fitted to the male skeleton); anything else
 * unknown is not an astronaut.
 */
function savedVariant(value: unknown): AstronautVariant | null {
  if (isVariant(value)) return value
  if (value === 'suited') return 'male'
  return null
}

/** Hairstyles: the two in the free character pack, or none. */
export type HairStyle = 'short' | 'long' | 'none'

export type PatchId = 'moon' | 'rocket' | 'stars' | 'earth'

/** How an astronaut looks, apart from the body and the suit. */
export interface AstronautLook {
  /** Skin tone, continuous: 0 is the lightest, 1 the darkest. */
  skinTone: number
  hair: HairStyle
  /** An id from HAIR_COLORS. */
  hairColor: string
  /** An id from EYE_COLORS. */
  eyeColor: string
  patch: PatchId
}

export interface AstronautProfile extends AstronautLook {
  name: string
  variant: AstronautVariant
}

export interface Swatch {
  id: string
  label: string
  /** sRGB hex. */
  color: string
}

export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'long', label: 'Long' },
  { id: 'none', label: 'None' },
]

/** Natural hair colours. The pack's hair textures are grey, made to be tinted. */
export const HAIR_COLORS: Swatch[] = [
  { id: 'black', label: 'Black', color: '#1d1a1a' },
  { id: 'dark-brown', label: 'Dark brown', color: '#3a2a20' },
  { id: 'brown', label: 'Brown', color: '#5b3a26' },
  { id: 'auburn', label: 'Auburn', color: '#7a3b22' },
  { id: 'copper', label: 'Copper', color: '#a8552a' },
  { id: 'blonde', label: 'Blonde', color: '#c9a45c' },
  { id: 'grey', label: 'Grey', color: '#8d8f94' },
  { id: 'white', label: 'White', color: '#dcdcd8' },
]

/** Natural eye colours. Brown is the pack's own iris, left untouched. */
export const EYE_COLORS: Swatch[] = [
  { id: 'brown', label: 'Brown', color: '#6b4423' },
  { id: 'dark', label: 'Dark brown', color: '#2e1c10' },
  { id: 'hazel', label: 'Hazel', color: '#8a6a34' },
  { id: 'green', label: 'Green', color: '#4f7a4a' },
  { id: 'blue', label: 'Blue', color: '#4f86b8' },
  { id: 'grey', label: 'Grey', color: '#7f8b94' },
]

export const PATCHES: { id: PatchId; label: string }[] = [
  { id: 'moon', label: 'Moon' },
  { id: 'rocket', label: 'Rocket' },
  { id: 'stars', label: 'Stars' },
  { id: 'earth', label: 'Earth' },
]

export function swatchColor(list: Swatch[], id: string): string {
  return (list.find((item) => item.id === id) ?? list[0]!).color
}

/**
 * The skin tone slider's colours, lightest to darkest, as sRGB hex at even
 * steps. Real skin is not one colour made brighter or darker: lighter tones
 * are pinker and less saturated, the middle ones warmer, the darkest deep
 * and a little cooler, so the ramp goes through hand-picked stops instead
 * of scaling one colour. Values between stops are blended in linear light.
 */
const SKIN_STOPS = ['#deb7a0', '#d3a585', '#c4926e', '#a87550', '#845538', '#5e3a27', '#40271c'] as const

function srgbToLinear(value: number): number {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number): number {
  const v = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
  return Math.round(Math.max(0, Math.min(1, v)) * 255)
}

function hexToLinear(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [srgbToLinear((n >> 16) & 255), srgbToLinear((n >> 8) & 255), srgbToLinear(n & 255)]
}

const SKIN_LINEAR = SKIN_STOPS.map(hexToLinear)

export function clampTone(tone: number): number {
  return Number.isFinite(tone) ? Math.max(0, Math.min(1, tone)) : 0.5
}

/** The skin's base colour at a point on the slider, in linear light (what the shader multiplies by). */
export function skinToneLinear(tone: number): [number, number, number] {
  const t = clampTone(tone) * (SKIN_LINEAR.length - 1)
  const i = Math.min(SKIN_LINEAR.length - 2, Math.floor(t))
  const f = t - i
  const a = SKIN_LINEAR[i]!
  const b = SKIN_LINEAR[i + 1]!
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

/** The same colour as sRGB hex, for swatches and the slider's gradient. */
export function skinToneCss(tone: number): string {
  const [r, g, b] = skinToneLinear(tone)
  return `#${[r, g, b].map((v) => linearToSrgb(v).toString(16).padStart(2, '0')).join('')}`
}

/** Quick picks above the slider, spread evenly along it. */
export const SKIN_PRESETS = [0.04, 0.22, 0.4, 0.58, 0.76, 0.94] as const

export const NAME_MAX_LENGTH = 16

/** Friendly suggestions to prefill the name field. */
export const NAME_SUGGESTIONS = [
  'Alex',
  'Sam',
  'Jordan',
  'Riley',
  'Casey',
  'Morgan',
  'Jamie',
  'Avery',
  'Quinn',
  'Rowan',
  'Skyler',
  'Nova',
  'Orion',
  'Robin',
  'Kim',
  'Ari',
] as const

export function suggestName(previous?: string): string {
  const options = NAME_SUGGESTIONS.filter((name) => name !== previous)
  return options[Math.floor(Math.random() * options.length)] ?? 'Alex'
}

/**
 * A small family-friendly filter. Words in the first list are blocked
 * anywhere in a name; words in the second only as a whole word, so ordinary
 * names that happen to contain them (Cassie, Hancock) still work. It is
 * deliberately short and will miss things; it is a safety net, not moderation.
 */
const BLOCKED_ANYWHERE = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fagg', 'slut', 'whore', 'wank', 'porn', 'bastard', 'nazi', 'rapist']
const BLOCKED_WORDS = ['ass', 'arse', 'cock', 'dick', 'piss', 'crap', 'damn', 'tit', 'tits', 'boob', 'boobs', 'penis', 'vagina', 'sex', 'sexy', 'rape', 'butt', 'poop', 'pee', 'kill', 'die', 'hitler']

function isBlocked(name: string): boolean {
  const letters = name.toLowerCase().replace(/[^a-z]/g, '')
  if (BLOCKED_ANYWHERE.some((word) => letters.includes(word))) return true
  const words = name.toLowerCase().split(/[\s'-]+/)
  return words.some((word) => BLOCKED_WORDS.includes(word))
}

export type NameCheck = { ok: true; name: string } | { ok: false; error: string }

/** Trims and checks a name: 1–16 characters, letters, spaces, hyphens and apostrophes only. */
export function checkName(raw: string): NameCheck {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length === 0) return { ok: false, error: 'Type a name for your astronaut.' }
  if (name.length > NAME_MAX_LENGTH) return { ok: false, error: `Use ${NAME_MAX_LENGTH} characters or fewer.` }
  if (!/^[A-Za-z][A-Za-z' -]*$/.test(name)) {
    return { ok: false, error: "Use letters, spaces, hyphens (-) and apostrophes (') only, starting with a letter." }
  }
  if (isBlocked(name)) return { ok: false, error: 'Please choose a different name.' }
  return { ok: true, name }
}

/** Puts the player's name into a line of crew dialogue: "Good work, {name}." */
export function fillName(line: string, name: string): string {
  return line.replaceAll('{name}', name)
}

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!

/** A fresh astronaut with a suggested name and a random look, for a first visit and for Randomise. */
export function randomProfile(keepName?: string): AstronautProfile {
  const variant: AstronautVariant = pick(VARIANTS)
  return {
    name: keepName ?? suggestName(),
    variant,
    skinTone: Math.round(Math.random() * 100) / 100,
    // Mostly the body's usual style, sometimes the other one.
    hair: Math.random() < 0.7 ? (variant === 'female' ? 'long' : 'short') : pick(['short', 'long'] as const),
    hairColor: pick(HAIR_COLORS).id,
    eyeColor: pick(EYE_COLORS).id,
    patch: pick(PATCHES).id,
  }
}

/** The look a body starts with on Reset. */
export function defaultProfile(name: string, variant: AstronautVariant): AstronautProfile {
  return {
    name,
    variant,
    skinTone: 0.5,
    hair: variant === 'female' ? 'long' : 'short',
    hairColor: variant === 'female' ? 'brown' : 'dark-brown',
    eyeColor: 'brown',
    patch: 'moon',
  }
}

const STORAGE_KEY = 'lunar-outpost:astronaut'

/**
 * Reads a saved astronaut, filling in anything missing or invalid, so
 * astronauts saved by earlier versions still load: before the slider, skin
 * tone was "light" or "dark" (and before that there was only the dark one).
 */
export function parseProfile(value: unknown): AstronautProfile | null {
  // (A body of "suited", from when the spacesuit was a body, loads as Male with every other choice kept.)
  if (!value || typeof value !== 'object') return null
  const saved = value as Record<string, unknown>
  const check = checkName(String(saved.name ?? ''))
  const variant = savedVariant(saved.variant)
  if (!check.ok || !variant) return null
  const base = defaultProfile(check.name, variant)
  const tone = saved.skinTone
  // The two old tones sat about here on the new slider.
  const skinTone = typeof tone === 'number' ? clampTone(tone) : tone === 'light' ? 0.5 : 0.86
  const has = (list: { id: string }[], id: unknown): id is string => typeof id === 'string' && list.some((item) => item.id === id)
  return {
    ...base,
    skinTone,
    hair: has(HAIR_STYLES, saved.hair) ? (saved.hair as HairStyle) : base.hair,
    hairColor: has(HAIR_COLORS, saved.hairColor) ? saved.hairColor : base.hairColor,
    eyeColor: has(EYE_COLORS, saved.eyeColor) ? saved.eyeColor : base.eyeColor,
    patch: has(PATCHES, saved.patch) ? (saved.patch as PatchId) : base.patch,
  }
}

/** The astronaut saved in this browser, if there is a valid one. */
export function loadAstronautProfile(): AstronautProfile | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? parseProfile(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/**
 * Saves the astronaut in this browser. Server saving (Shishir) can hook in
 * here later: this is the one place a profile is written.
 */
export function saveAstronautProfile(profile: AstronautProfile): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Storage blocked: the astronaut just isn't remembered next time.
  }
}
