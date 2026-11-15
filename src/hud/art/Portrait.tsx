import { useEffect, useId, useRef } from 'react'
import type { Emotion } from '../../data/emotions'
import { voiceLevel } from '../../state/lines'
import type { SpeakerId } from '../../state/mission'

/**
 * The five speakers' portraits, drawn in code in the same flat style as the
 * picture kit (no downloaded art): head and shoulders in a circle, with
 * clothes that hint at the role. Matching Shishir's voices, the science
 * officer is a woman and the other four are men. Names stay in CAST
 * (src/state/mission.ts); these are only faces.
 */

interface Look {
  /** Background behind the head. */
  bg: string
  skin: string
  /** Darker skin for the neck and ears. */
  shade: string
  hair: string
  hairStyle: 'short' | 'crop' | 'bun' | 'bald-sides' | 'side'
  /** Clothes: colour, trim, and what's on them. */
  top: string
  trim: string
  kind: 'flight-suit' | 'polo' | 'jacket'
  beard?: boolean
  glasses?: boolean
  headset?: boolean
}

const LOOKS: Record<SpeakerId, Look> = {
  // Veteran commander: grey at the temples, navy flight suit with a command stripe.
  commander: { bg: '#2f4a7a', skin: '#8d5a3b', shade: '#714629', hair: '#3b3b40', hairStyle: 'bald-sides', top: '#22324f', trim: '#ffd166', kind: 'flight-suit', beard: true },
  // Safety and medical officer: neat crop, white flight suit with a red cross patch.
  safety: { bg: '#3d5d5a', skin: '#e2b18c', shade: '#c79570', hair: '#2a1d16', hairStyle: 'crop', top: '#e9edf3', trim: '#ff6b6b', kind: 'flight-suit', glasses: true },
  // Science officer and botanist (the best friend): hair up in a bun, green flight suit.
  science: { bg: '#2f5a43', skin: '#c68863', shade: '#a96d4b', hair: '#6b3a1f', hairStyle: 'bun', top: '#3f7d5a', trim: '#4fd18b', kind: 'flight-suit' },
  // Houston: mission control polo and a headset.
  comms: { bg: '#1d4a66', skin: '#f0c9a6', shade: '#d6a984', hair: '#c9a25a', hairStyle: 'side', top: '#5cc8ff', trim: '#0f2c3d', kind: 'polo', headset: true },
  // Trainer: ground-crew jacket with a hi-vis stripe.
  trainer: { bg: '#5a3d2a', skin: '#5b3a28', shade: '#462c1e', hair: '#151515', hairStyle: 'short', top: '#ff8a2a', trim: '#f4f6fb', kind: 'jacket', beard: false },
}

function Hair({ look }: { look: Look }) {
  const c = look.hair
  switch (look.hairStyle) {
    case 'bun':
      return (
        <g fill={c}>
          <circle cx={50} cy={20} r={9} />
          <path d="M30 42 C29 25 39 19 50 19 C61 19 71 25 70 42 C67 33 60 29 50 29 C40 29 33 33 30 42 Z" />
        </g>
      )
    case 'crop':
      return <path fill={c} d="M32 40 C31 26 40 21 50 21 C60 21 69 26 68 40 C65 31 58 28 50 28 C42 28 35 31 32 40 Z" />
    case 'side':
      return <path fill={c} d="M31 42 C29 25 40 19 52 20 C62 21 70 27 69 40 C64 30 55 27 44 30 C38 32 33 36 31 42 Z" />
    case 'bald-sides':
      return (
        <g fill={c}>
          <path d="M30 44 C29 36 31 31 34 29 L35 44 Z" />
          <path d="M70 44 C71 36 69 31 66 29 L65 44 Z" />
        </g>
      )
    default:
      return <path fill={c} d="M31 40 C31 26 40 20 50 20 C60 20 69 26 69 40 C66 32 58 27 50 27 C42 27 34 32 31 40 Z" />
  }
}

function Clothes({ look }: { look: Look }) {
  return (
    <g>
      <path d="M14 100 C16 80 30 71 50 71 C70 71 84 80 86 100 Z" fill={look.top} />
      {look.kind === 'flight-suit' && (
        <>
          <path d="M44 72 L50 84 L56 72" fill="none" stroke={look.trim} strokeWidth={3} />
          <rect x={60} y={80} width={10} height={7} rx={1.5} fill={look.trim} />
        </>
      )}
      {look.kind === 'polo' && <path d="M42 72 L50 80 L58 72 L55 71 L50 75 L45 71 Z" fill={look.trim} />}
      {look.kind === 'jacket' && (
        <>
          <path d="M20 90 L80 90" stroke={look.trim} strokeWidth={4} />
          <path d="M50 72 L50 100" stroke="#1d2433" strokeWidth={2} />
        </>
      )}
    </g>
  )
}

// ---------- Expressions ----------

/** One face: eyebrows (inner and outer end heights), eyes, mouth and a head tilt. */
interface Expr {
  browInner: number
  browOuter: number
  eyes: 'open' | 'wide' | 'smile' | 'lid' | 'sad'
  /** −1 a deep frown to 1 a big smile. */
  smile: number
  /** 0 closed to 1 wide open. */
  open: number
  /** Mouth width. */
  width: number
  /** Head tilt in degrees (positive leans right). */
  tilt: number
}

export const EXPRESSIONS: Record<Emotion, Expr> = {
  neutral: { browInner: 38, browOuter: 39, eyes: 'open', smile: 0.3, open: 0, width: 12, tilt: 0 },
  happy: { browInner: 36.5, browOuter: 37.5, eyes: 'smile', smile: 0.9, open: 0.15, width: 15, tilt: 2 },
  excited: { browInner: 35, browOuter: 35.5, eyes: 'wide', smile: 1, open: 0.55, width: 16, tilt: 3 },
  worried: { browInner: 35.5, browOuter: 39.5, eyes: 'open', smile: -0.35, open: 0.05, width: 11, tilt: -3 },
  urgent: { browInner: 34.5, browOuter: 35.5, eyes: 'wide', smile: -0.2, open: 0.6, width: 12, tilt: 0 },
  sad: { browInner: 36, browOuter: 40.5, eyes: 'sad', smile: -0.8, open: 0, width: 11, tilt: -5 },
  calm: { browInner: 38, browOuter: 38.5, eyes: 'lid', smile: 0.5, open: 0, width: 12, tilt: 1 },
  proud: { browInner: 37, browOuter: 37, eyes: 'lid', smile: 0.8, open: 0, width: 14, tilt: -3 },
}

function browPath(e: Expr): string {
  return `M38 ${e.browOuter} L46 ${e.browInner} M54 ${e.browInner} L62 ${e.browOuter}`
}

/** The mouth: a top lip curve and, as it opens, a bottom one below it. */
function mouthPath(e: Expr, open: number): string {
  const half = e.width / 2
  const corner = 56.5 - e.smile * 2.5
  const middle = 56.5 + e.smile * 3
  const drop = Math.max(0, open) * 8
  return `M${50 - half} ${corner} Q50 ${middle} ${50 + half} ${corner} Q50 ${middle + drop} ${50 - half} ${corner} Z`
}

function Eyes({ e }: { e: Expr }) {
  const ink = '#1d2433'
  switch (e.eyes) {
    case 'wide':
      return (
        <g>
          {[42, 58].map((x) => (
            <g key={x}>
              <circle cx={x} cy={45} r={3.3} fill="#fff" />
              <circle cx={x} cy={45} r={2.2} fill={ink} />
            </g>
          ))}
        </g>
      )
    case 'smile':
      return <path d="M39 46.5 Q42 42.5 45 46.5 M55 46.5 Q58 42.5 61 46.5" fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" />
    case 'lid':
      return (
        <g fill={ink}>
          <ellipse cx={42} cy={45.6} rx={2.6} ry={1.5} />
          <ellipse cx={58} cy={45.6} rx={2.6} ry={1.5} />
        </g>
      )
    case 'sad':
      return (
        <g>
          <ellipse cx={42} cy={45.8} rx={2.4} ry={1.8} fill={ink} />
          <ellipse cx={58} cy={45.8} rx={2.4} ry={1.8} fill={ink} />
          <path d="M39 43.5 L45 42.5 M55 42.5 L61 43.5" stroke={ink} strokeWidth={1.2} strokeLinecap="round" />
        </g>
      )
    default:
      return (
        <g fill={ink}>
          <circle cx={42} cy={45} r={2.4} />
          <circle cx={58} cy={45} r={2.4} />
        </g>
      )
  }
}

// ---------- Talking ----------

/** A line being said: what, since when (performance.now() in ms), and its id (for a playing voice's loudness). */
export interface Talk {
  text: string
  since: number
  lineId?: string
}

/** Seconds per word while the words appear (matches the Transmission's typing). */
export const WORD_SECONDS = 0.3

function talkingSeconds(text: string): number {
  return text.split(/\s+/).filter(Boolean).length * WORD_SECONDS
}

/** Times (s) of the words that end in "!": the eyebrows rise on them. */
function emphasisTimes(text: string): number[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word, i) => (word.endsWith('!') ? [i * WORD_SECONDS] : []))
}

/** One animation loop for every portrait on screen. */
const ticking = new Set<(now: number) => void>()
let frame = 0
function tick(now: number): void {
  for (const fn of ticking) fn(now)
  frame = ticking.size ? requestAnimationFrame(tick) : 0
}
function subscribe(fn: (now: number) => void): () => void {
  ticking.add(fn)
  if (!frame && typeof requestAnimationFrame !== 'undefined') frame = requestAnimationFrame(tick)
  return () => {
    ticking.delete(fn)
  }
}

/**
 * A speaker's face, as a round portrait, with an expression. While `talk` is
 * set the mouth moves: with the voice's loudness when Shishir's audio is
 * playing it, otherwise while the words appear; then it settles, closed.
 * Every face blinks now and then and bobs gently. `still` turns all
 * movement off (the HUD's crew list). `radio` adds a radio frame (Houston).
 */
export function Portrait({
  speaker,
  size = 48,
  radio = false,
  emotion = 'neutral',
  talk = null,
  still = false,
}: {
  speaker: SpeakerId
  size?: number
  radio?: boolean
  emotion?: Emotion
  talk?: Talk | null
  still?: boolean
}) {
  const look = LOOKS[speaker]
  const e = EXPRESSIONS[emotion]
  const clip = `portrait-clip-${useId().replace(/:/g, '')}`
  const head = useRef<SVGGElement>(null)
  const eyes = useRef<SVGGElement>(null)
  const brows = useRef<SVGPathElement>(null)
  const mouth = useRef<SVGPathElement>(null)
  const talkRef = useRef(talk)
  talkRef.current = talk

  useEffect(() => {
    if (still || reducedMotionNow()) return
    const seed = Math.random() * 10
    let nextBlink = performance.now() + 1500 + Math.random() * 3000
    let shownOpen = e.open
    return subscribe((now) => {
      const t = now / 1000 + seed
      // Blink every few seconds.
      let lid = 1
      if (now > nextBlink) {
        const k = (now - nextBlink) / 140
        lid = k < 1 ? Math.abs(1 - 2 * k) : 1
        if (k >= 1) nextBlink = now + 2500 + Math.random() * 3500
      }
      eyes.current?.setAttribute('transform', `translate(0 45) scale(1 ${Math.max(0.08, lid)}) translate(0 -45)`)
      // Talking: the mouth, a livelier bob and the eyebrows up on "!".
      const current = talkRef.current
      let open = e.open
      let raise = 0
      let talking = false
      if (current) {
        const seconds = (now - current.since) / 1000
        const level = current.lineId ? voiceLevel(current.lineId) : null
        if (level !== null) {
          talking = level > 0.02
          open = Math.max(e.open, level)
        } else if (seconds >= 0 && seconds < talkingSeconds(current.text)) {
          talking = true
          open = Math.max(e.open, 0.15 + 0.75 * Math.abs(Math.sin(seconds * Math.PI * 3.3)))
        }
        for (const at of emphasisTimes(current.text)) if (seconds >= at && seconds < at + 0.45) raise = 2.5
        if (seconds >= 0 && seconds < 0.3) raise = Math.max(raise, 1.2)
      }
      shownOpen += (open - shownOpen) * 0.35
      mouth.current?.setAttribute('d', mouthPath(e, shownOpen))
      brows.current?.setAttribute('transform', `translate(0 ${-raise})`)
      const bob = Math.sin(t * 1.6) * 0.6 + (talking ? Math.sin(t * 5.2) * 0.5 : 0)
      const sway = Math.sin(t * 0.9) * 0.8
      head.current?.setAttribute('transform', `rotate(${e.tilt + sway} 50 70) translate(0 ${bob})`)
    })
  }, [still, e])

  return (
    <svg className="portrait" data-speaker={speaker} data-emotion={emotion} data-radio={radio ? 'true' : undefined} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <circle cx={50} cy={50} r={50} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width={100} height={100} fill={look.bg} />
        <Clothes look={look} />
        <g ref={head} transform={`rotate(${e.tilt} 50 70)`}>
          <rect x={44} y={58} width={12} height={15} rx={4} fill={look.shade} />
          <ellipse cx={30} cy={46} rx={4} ry={6} fill={look.shade} />
          <ellipse cx={70} cy={46} rx={4} ry={6} fill={look.shade} />
          <ellipse cx={50} cy={44} rx={19} ry={22} fill={look.skin} />
          <Hair look={look} />
          {look.beard && <path d="M33 48 C34 62 42 67 50 67 C58 67 66 62 67 48 C63 56 57 59 50 59 C43 59 37 56 33 48 Z" fill={look.hair} opacity={0.85} />}
          <g ref={eyes}>
            <Eyes e={e} />
          </g>
          <path ref={brows} d={browPath(e)} stroke={look.hair} strokeWidth={2.2} strokeLinecap="round" fill="none" />
          <path ref={mouth} d={mouthPath(e, e.open)} fill="#4a1f18" stroke="#5a2a20" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {look.glasses && (
            <g fill="none" stroke="#1d2433" strokeWidth={1.8}>
              <circle cx={42} cy={45} r={5.5} />
              <circle cx={58} cy={45} r={5.5} />
              <path d="M47.5 45 L52.5 45" />
            </g>
          )}
          {look.headset && (
            <g>
              <path d="M28 46 C28 22 72 22 72 46" fill="none" stroke="#1d2433" strokeWidth={4} />
              <rect x={23} y={40} width={9} height={14} rx={3} fill="#1d2433" />
              <rect x={68} y={40} width={9} height={14} rx={3} fill="#1d2433" />
              <path d="M28 52 C30 62 38 64 45 62" fill="none" stroke="#1d2433" strokeWidth={2.5} />
              <circle cx={46} cy={62} r={2.6} fill="#1d2433" />
            </g>
          )}
        </g>
      </g>
      {radio && <circle cx={50} cy={50} r={47} fill="none" stroke="#5cc8ff" strokeWidth={5} strokeDasharray="6 5" />}
    </svg>
  )
}

function reducedMotionNow(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced'
}
