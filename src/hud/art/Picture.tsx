import type { ReactNode } from 'react'

/**
 * The game's flat illustrations, drawn in code in one style (no downloaded
 * art): a 160 x 100 scene on a deep blue sky, simple shapes in the HUD's own
 * colours. Every challenge has a header picture (`c01`…`c12`) and every
 * option and split item has its own (by outcome id), so a card explains
 * itself before its text does.
 */

const C = {
  sky: '#121a33',
  skyNight: '#0a0f22',
  ground: '#3a4152',
  groundLight: '#59617a',
  moon: '#c8ccd6',
  line: '#e8ecf6',
  dark: '#1c2534',
  power: '#ffd166',
  life: '#5cc8ff',
  shield: '#b79cff',
  food: '#4fd18b',
  warn: '#ffa94d',
  crit: '#ff6b6b',
  metal: '#8b95ab',
  panel: '#2f6fd1',
  suit: '#eef1f7',
} as const

// ---------- Pieces (each drawn round its own origin, placed with at()) ----------

const at = (x: number, y: number, s: number, children: ReactNode, key?: string) => (
  <g key={key} transform={`translate(${x} ${y}) scale(${s})`}>
    {children}
  </g>
)

const Stars = () => (
  <g fill={C.line} opacity={0.7}>
    {[
      [12, 10],
      [30, 22],
      [52, 8],
      [78, 16],
      [104, 6],
      [124, 20],
      [146, 12],
      [64, 28],
    ].map(([x, y]) => (
      <circle key={`${x}-${y}`} cx={x} cy={y} r={0.9} />
    ))}
  </g>
)

const Ground = ({ y = 78, color = C.ground }: { y?: number; color?: string }) => (
  <path d={`M0 ${y} Q40 ${y - 5} 80 ${y} T160 ${y - 2} V100 H0 Z`} fill={color} />
)

const Sun = ({ r = 9, rays = true }: { r?: number; rays?: boolean }) => (
  <g>
    {rays &&
      Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4
        return (
          <line
            key={i}
            x1={Math.cos(a) * (r + 3)}
            y1={Math.sin(a) * (r + 3)}
            x2={Math.cos(a) * (r + 7)}
            y2={Math.sin(a) * (r + 7)}
            stroke={C.power}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )
      })}
    <circle r={r} fill={C.power} />
  </g>
)

/** A flare: the Sun with a big bright burst off one side. */
const Flare = () => (
  <g>
    <path d="M6 -4 Q30 -24 44 -6 Q30 -12 14 2 Z" fill={C.warn} opacity={0.9} />
    <path d="M8 -2 Q26 -16 36 -6 Q26 -8 14 2 Z" fill={C.power} />
    <circle r={14} fill={C.power} />
    <circle r={14} fill="none" stroke={C.warn} strokeWidth={3} opacity={0.6} />
  </g>
)

const SolarPanel = () => (
  <g>
    <line x1={0} y1={6} x2={0} y2={20} stroke={C.metal} strokeWidth={2} />
    <path d="M-16 6 L-10 -10 L16 -10 L10 6 Z" fill={C.panel} stroke={C.line} strokeWidth={1} />
    <path d="M-13 -2 L13 -2 M-3 -10 L-6 6 M6 -10 L3 6" stroke={C.line} strokeWidth={0.8} opacity={0.7} />
  </g>
)

const Battery = ({ level = 1, color = C.power }: { level?: number; color?: string }) => (
  <g>
    <rect x={-7} y={-12} width={14} height={24} rx={2} fill={C.dark} stroke={C.line} strokeWidth={1.4} />
    <rect x={-3} y={-15} width={6} height={3} rx={1} fill={C.line} />
    <rect x={-5} y={10 - 20 * level} width={10} height={20 * level} rx={1} fill={color} />
  </g>
)

const FuelCell = () => (
  <g>
    <rect x={-10} y={-14} width={20} height={28} rx={9} fill={C.metal} stroke={C.line} strokeWidth={1.2} />
    <rect x={-10} y={-2} width={20} height={4} fill={C.life} />
    <path d="M0 -9 C-3 -5 -3 -3 0 -2 C3 -3 3 -5 0 -9 Z" fill={C.life} />
    <path d="M-3 6 L3 6 M0 3 L0 9" stroke={C.power} strokeWidth={1.6} strokeLinecap="round" />
  </g>
)

const Reactor = () => (
  <g>
    <circle cy={-2} r={22} fill={C.life} opacity={0.12} />
    <path d="M-18 10 A18 18 0 0 1 18 10 Z" fill={C.metal} stroke={C.line} strokeWidth={1.2} />
    <circle cy={0} r={6} fill={C.life} />
    <circle cy={0} r={9} fill="none" stroke={C.life} strokeWidth={1.4} opacity={0.6} />
    <rect x={-22} y={10} width={44} height={5} rx={1.5} fill={C.dark} />
  </g>
)

const Crate = ({ color = C.warn }: { color?: string }) => (
  <g>
    <rect x={-8} y={-8} width={16} height={16} rx={1.5} fill={color} stroke={C.dark} strokeWidth={1} />
    <path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke={C.dark} strokeWidth={1} opacity={0.45} />
  </g>
)

const ShieldShape = () => (
  <path d="M0 -14 L-11 -9 V-1 C-11 7 -5 12 0 14 C5 12 11 7 11 -1 V-9 Z" fill={C.shield} stroke={C.line} strokeWidth={1.2} />
)

const Wrench = () => (
  <g fill={C.metal} stroke={C.line} strokeWidth={1}>
    <path d="M6 -12 A7 7 0 0 0 -2 -4 L-12 6 L-8 10 L2 0 A7 7 0 0 0 10 -8 L6 -4 L2 -5 L1 -9 Z" />
  </g>
)

const Gear = ({ color = C.metal }: { color?: string }) => (
  <g>
    {Array.from({ length: 8 }, (_, i) => (
      <rect key={i} x={-2} y={-11} width={4} height={5} fill={color} transform={`rotate(${i * 45})`} />
    ))}
    <circle r={8} fill={color} />
    <circle r={3} fill={C.dark} />
  </g>
)

const Astronaut = ({ pose = 'stand' }: { pose?: 'stand' | 'work' | 'rest' }) =>
  pose === 'rest' ? (
    <g>
      <rect x={-16} y={-2} width={30} height={9} rx={4} fill={C.suit} />
      <circle cx={-18} cy={1} r={6} fill={C.suit} />
      <rect x={-21} y={-1} width={6} height={4} rx={1.5} fill={C.panel} />
    </g>
  ) : (
    <g>
      <rect x={-7} y={-6} width={14} height={18} rx={5} fill={C.suit} />
      <rect x={-9} y={-4} width={4} height={10} rx={2} fill={C.metal} />
      <circle cy={-12} r={7} fill={C.suit} />
      <rect x={-4} y={-15} width={8} height={5} rx={2} fill={C.panel} />
      {pose === 'work' && <path d="M6 -2 L16 -8" stroke={C.suit} strokeWidth={4} strokeLinecap="round" />}
      <rect x={-6} y={12} width={5} height={7} rx={2} fill={C.suit} />
      <rect x={1} y={12} width={5} height={7} rx={2} fill={C.suit} />
    </g>
  )

const Dome = ({ glow = false, lit = true }: { glow?: boolean; lit?: boolean }) => (
  <g>
    {glow && <circle cy={-2} r={26} fill={C.life} opacity={0.1} />}
    <path d="M-24 10 A24 24 0 0 1 24 10 Z" fill={C.metal} stroke={C.line} strokeWidth={1.2} />
    <path d="M-16 10 A16 16 0 0 1 16 10" fill="none" stroke={C.dark} strokeWidth={1} opacity={0.5} />
    {[-8, 0, 8].map((x) => (
      <rect key={x} x={x - 2} y={-6} width={4} height={4} rx={1} fill={lit ? C.power : C.dark} />
    ))}
  </g>
)

const Plant = ({ grown = 1 }: { grown?: number }) => (
  <g>
    <rect x={-8} y={4} width={16} height={6} rx={1.5} fill={C.warn} opacity={0.75} />
    {grown > 0 && (
      <g transform={`scale(${0.5 + grown * 0.5})`}>
        <path d="M0 4 V-8" stroke={C.food} strokeWidth={2} />
        <path d="M0 -2 C-8 -4 -10 -10 -8 -12 C-2 -12 0 -6 0 -2 Z" fill={C.food} />
        <path d="M0 -5 C8 -7 10 -13 8 -15 C2 -15 0 -9 0 -5 Z" fill={C.food} />
      </g>
    )}
  </g>
)

const Drop = ({ color = C.life }: { color?: string }) => <path d="M0 -12 C-8 -2 -8 4 0 8 C8 4 8 -2 0 -12 Z" fill={color} />

const Drill = () => (
  <g>
    <rect x={-10} y={-14} width={20} height={10} rx={2} fill={C.warn} />
    <path d="M-4 -4 H4 L2 10 L0 14 L-2 10 Z" fill={C.metal} stroke={C.line} strokeWidth={0.8} />
    <path d="M-3 0 L3 2 M-3 5 L3 7" stroke={C.dark} strokeWidth={1} />
  </g>
)

const Antenna = () => (
  <g>
    <line x1={0} y1={0} x2={0} y2={18} stroke={C.metal} strokeWidth={2.4} />
    <path d="M-14 -6 A16 16 0 0 0 12 6 Z" fill={C.line} transform="rotate(-25)" />
    <line x1={-1} y1={-1} x2={-7} y2={-9} stroke={C.metal} strokeWidth={1.5} />
    <path d="M10 -16 a8 8 0 0 1 8 8 M12 -22 a14 14 0 0 1 12 12" fill="none" stroke={C.life} strokeWidth={1.6} strokeLinecap="round" />
  </g>
)

const Ice = () => (
  <g stroke={C.life} strokeWidth={2} strokeLinecap="round">
    <path d="M0 -9 V9 M-8 -4.5 L8 4.5 M-8 4.5 L8 -4.5" />
    <circle r={2.5} fill={C.line} stroke="none" />
  </g>
)

const Bed = () => (
  <g>
    <rect x={-20} y={0} width={40} height={8} rx={2} fill={C.metal} />
    <rect x={-20} y={-6} width={10} height={6} rx={2} fill={C.line} />
    <rect x={-10} y={-4} width={30} height={5} rx={2} fill={C.life} opacity={0.7} />
    <path d="M-22 8 V14 M22 8 V14" stroke={C.metal} strokeWidth={2} />
  </g>
)

const Zz = ({ color = C.line }: { color?: string }) => (
  <g fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M0 0 H6 L0 6 H6" />
    <path d="M9 -8 H13 L9 -4 H13" />
  </g>
)

const WarnLight = () => (
  <g>
    <circle r={14} fill={C.crit} opacity={0.18} />
    <path d="M-7 6 A7 7 0 0 1 7 6 Z" fill={C.crit} />
    <rect x={-9} y={6} width={18} height={4} rx={1} fill={C.dark} />
  </g>
)

const Vent = ({ haze = false }: { haze?: boolean }) => (
  <g>
    <rect x={-14} y={-12} width={28} height={24} rx={3} fill={C.dark} stroke={C.metal} strokeWidth={1.4} />
    {[-6, 0, 6].map((y) => (
      <line key={y} x1={-9} x2={9} y1={y} y2={y} stroke={C.metal} strokeWidth={2} />
    ))}
    {haze && <path d="M-16 -18 Q-8 -24 0 -18 T16 -18" fill="none" stroke={C.warn} strokeWidth={2} opacity={0.7} />}
  </g>
)

const Crack = () => <path d="M-6 -8 L0 -1 L-3 3 L4 9" fill="none" stroke={C.crit} strokeWidth={1.8} strokeLinejoin="round" />

const Rock = () => <circle r={3} fill={C.groundLight} />

const Ridge = () => <path d="M-40 20 L-10 -14 L6 2 L18 -8 L44 20 Z" fill={C.groundLight} />

const Crater = () => (
  <g>
    <ellipse rx={30} ry={10} fill={C.dark} />
    <ellipse rx={30} ry={10} fill="none" stroke={C.groundLight} strokeWidth={2} />
    <path d="M-12 2 h6 M2 4 h8 M-4 -2 h5" stroke={C.life} strokeWidth={2} strokeLinecap="round" />
  </g>
)

const Spacecraft = () => (
  <g>
    <path d="M-30 -8 H18 L30 0 L18 8 H-30 Z" fill={C.metal} stroke={C.line} strokeWidth={1.2} />
    {[-20, -10, 0].map((x) => (
      <circle key={x} cx={x} cy={0} r={2.5} fill={C.life} />
    ))}
    <rect x={-40} y={-20} width={8} height={40} rx={1} fill={C.panel} />
  </g>
)

const Pallet = ({ children }: { children?: ReactNode }) => (
  <g>
    {children}
    <rect x={-30} y={10} width={60} height={4} fill={C.metal} />
    <rect x={-28} y={14} width={4} height={3} fill={C.metal} />
    <rect x={-2} y={14} width={4} height={3} fill={C.metal} />
    <rect x={24} y={14} width={4} height={3} fill={C.metal} />
  </g>
)

const PowerCell = ({ on = true }: { on?: boolean }) => (
  <g>
    <rect x={-6} y={-10} width={12} height={20} rx={2} fill={on ? C.power : C.dark} stroke={C.line} strokeWidth={1} />
    <path d="M1 -6 L-3 1 H0 L-1 6 L3 -1 H0 Z" fill={on ? C.dark : C.metal} />
  </g>
)

const Thermo = () => (
  <g>
    <rect x={-3} y={-14} width={6} height={22} rx={3} fill={C.line} />
    <circle cy={10} r={5} fill={C.life} />
    <rect x={-1.2} y={-4} width={2.4} height={14} fill={C.life} />
  </g>
)

// ---------- Scenes ----------

function scene(children: ReactNode, night = false): ReactNode {
  return (
    <>
      <rect width={160} height={100} fill={night ? C.skyNight : C.sky} />
      <Stars />
      {children}
    </>
  )
}

const PICTURES: Record<string, () => ReactNode> = {
  // 1. Power source
  c01: () =>
    scene(
      <>
        {at(130, 74, 1, <Sun r={10} rays={false} />)}
        <Ground y={76} />
        {at(56, 72, 1, <Dome lit={false} />)}
        {at(100, 70, 0.9, <SolarPanel />)}
      </>,
      true,
    ),
  'c01-a': () =>
    scene(
      <>
        {at(132, 22, 0.9, <Sun />)}
        <Ground />
        {at(60, 64, 1.5, <SolarPanel />)}
        {at(112, 66, 1.1, <Battery level={0.6} />)}
      </>,
    ),
  'c01-b': () =>
    scene(
      <>
        {at(132, 22, 0.9, <Sun />)}
        <Ground />
        {at(56, 64, 1.4, <SolarPanel />)}
        {at(110, 62, 1.2, <FuelCell />)}
      </>,
    ),
  'c01-c': () =>
    scene(
      <>
        <Ground />
        {at(80, 64, 1.6, <Reactor />)}
      </>,
      true,
    ),
  // 2. Cargo
  c02: () =>
    scene(
      <>
        <Ground />
        {at(80, 58, 1.3, (
          <Pallet>
            {at(-16, 2, 1, <Crate color={C.food} />)}
            {at(2, 2, 1, <Crate color={C.shield} />)}
            {at(20, 2, 1, <Crate color={C.power} />)}
            {at(-7, -14, 1, <Crate />)}
            {at(11, -14, 1, <Crate color={C.life} />)}
          </Pallet>
        ))}
      </>,
    ),
  'c02-supplies': () => scene(<>{at(80, 56, 2, <Crate color={C.food} />)}{at(80, 56, 1.1, <Drop color={C.line} />)}</>),
  'c02-shielding': () => scene(at(80, 52, 2.4, <ShieldShape />)),
  'c02-power-gear': () => scene(<>{at(62, 52, 1.8, <Battery level={0.9} />)}{at(102, 52, 1.6, <PowerCell />)}</>),
  'c02-spares': () => scene(<>{at(64, 54, 2, <Wrench />)}{at(106, 50, 1.4, <Gear />)}</>),
  // 3. Scrubber fault
  c03: () => scene(<>{at(56, 52, 1.8, <Vent haze />)}{at(116, 40, 1.4, <WarnLight />)}</>),
  'c03-a': () => scene(<>{at(60, 54, 1.6, <Vent />)}{at(108, 50, 1.8, <Wrench />)}</>),
  'c03-b': () => scene(<>{at(58, 54, 1.4, <Vent />)}{at(108, 54, 1.6, <Battery level={0.4} color={C.warn} />)}</>),
  'c03-c': () => scene(<>{at(80, 62, 1.6, <Bed />)}{at(110, 36, 1.4, <Zz />)}</>),
  // 4. Storm in transit
  c04: () => scene(<>{at(36, 30, 0.9, <Flare />)}{at(100, 60, 1.2, <Spacecraft />)}</>),
  'c04-a': () =>
    scene(
      <>
        {at(30, 24, 0.7, <Flare />)}
        {at(96, 66, 1.6, <Dome />)}
      </>,
    ),
  'c04-b': () =>
    scene(
      <>
        {at(30, 24, 0.7, <Flare />)}
        {at(104, 70, 1.2, <Dome />)}
        {at(56, 64, 1.2, <Astronaut pose="work" />)}
      </>,
    ),
  'c04-c': () =>
    scene(
      <>
        {at(30, 24, 0.9, <Flare />)}
        {at(80, 62, 1.4, <Astronaut pose="work" />)}
        {at(112, 62, 1.4, <Astronaut pose="work" />)}
      </>,
    ),
  // 5. Landing site
  c05: () =>
    scene(
      <>
        <Ground y={70} />
        {at(40, 64, 0.9, <Ridge />)}
        {at(118, 82, 0.9, <Crater />)}
      </>,
      true,
    ),
  'c05-a': () => scene(<>{at(124, 22, 0.8, <Sun />)}<Ground y={84} />{at(80, 66, 1.3, <Ridge />)}</>),
  'c05-b': () => scene(<><Ground y={60} />{at(80, 76, 1.6, <Crater />)}</>, true),
  'c05-c': () =>
    scene(
      <>
        {at(140, 18, 0.6, <Sun />)}
        <path d="M0 50 L160 86 V100 H0 Z" fill={C.groundLight} />
        {at(60, 58, 1, <Dome />)}
        {at(130, 90, 0.7, <Crater />)}
      </>,
    ),
  // 6. Wake the base
  c06: () =>
    scene(
      <>
        <Ground />
        {at(80, 66, 1.4, <Dome lit={false} />)}
        {[40, 120].map((x) => at(x, 60, 1.1, <PowerCell />, String(x)))}
      </>,
      true,
    ),
  'c06-life-support': () => scene(<>{at(64, 54, 1.8, <Vent />)}{at(110, 52, 1.6, <Drop />)}</>),
  'c06-greenhouse': () => scene(<>{[48, 80, 112].map((x) => at(x, 60, 1.6, <Plant />, String(x)))}</>),
  'c06-drill': () => scene(<><Ground y={74} />{at(80, 54, 2, <Drill />)}{at(118, 76, 1, <Rock />)}</>),
  'c06-antenna': () => scene(<>{at(132, 18, 0.5, <circle r={10} fill={C.life} />)}<Ground />{at(70, 54, 1.6, <Antenna />)}</>),
  // 7. Greenhouse
  c07: () => scene(<>{[40, 80, 120].map((x) => at(x, 62, 1.5, <Plant grown={x === 80 ? 1 : 0.5} />, String(x)))}{at(80, 20, 1, <rect x={-50} y={-2} width={100} height={4} rx={2} fill={C.power} />)}</>),
  'c07-a': () => scene(<>{[36, 64, 92, 120].map((x) => at(x, 62, 1.4, <Plant />, String(x)))}{at(140, 30, 1, <Drop />)}</>),
  'c07-b': () => scene(<>{[36, 64].map((x) => at(x, 62, 1.4, <Plant />, String(x)))}{[92, 120].map((x) => at(x, 62, 1.4, <Plant grown={0} />, String(x)))}</>),
  'c07-c': () => scene(<>{at(56, 56, 1.8, <rect x={-12} y={-18} width={24} height={36} rx={4} fill={C.life} opacity={0.85} />)}{[100, 128].map((x) => at(x, 66, 1.3, <Plant grown={0} />, String(x)))}</>),
  // 8. Ice
  c08: () => scene(<><Ground y={60} />{at(80, 76, 1.6, <Crater />)}{at(80, 36, 1.2, <Ice />)}</>, true),
  'c08-a': () => scene(<><Ground y={74} />{at(60, 52, 1.8, <Drill />)}{[100, 120, 140].map((x) => at(x, 60, 1, <Ice />, String(x)))}</>, true),
  'c08-b': () => scene(<><Ground y={74} />{at(70, 56, 1.3, <Drill />)}{at(116, 60, 1.2, <Ice />)}</>, true),
  'c08-c': () => scene(<><Ground />{at(70, 56, 1.4, <Drop />)}{at(110, 56, 1.4, <Drop color={C.metal} />)}</>, true),
  // 9. Tired crew
  c09: () => scene(<>{at(58, 62, 1.3, <Astronaut />)}{at(102, 62, 1.3, <Astronaut />)}{at(78, 30, 1.6, <Zz />)}</>),
  'c09-a': () => scene(<>{at(80, 62, 1.8, <Bed />)}{at(116, 32, 1.4, <Zz />)}</>),
  'c09-b': () => scene(<>{at(56, 66, 1.2, <Bed />)}{at(116, 60, 1.3, <Astronaut pose="work" />)}</>),
  'c09-c': () => scene(<><Ground />{at(70, 60, 1.4, <Astronaut pose="work" />)}{at(110, 52, 1.4, <ShieldShape />)}</>),
  // 10. Solar storm
  c10: () =>
    scene(
      <>
        {at(40, 30, 1.1, <Flare />)}
        <Ground />
        {at(110, 70, 1.2, <Dome />)}
        {at(110, 40, 1, <WarnLight />)}
      </>,
    ),
  'c10-a': () => scene(<>{at(30, 24, 0.7, <Flare />)}<Ground />{at(96, 68, 1.6, <Dome />)}</>),
  'c10-b': () => scene(<>{at(30, 24, 0.7, <Flare />)}<Ground />{at(108, 70, 1.2, <Dome />)}{at(54, 64, 1.2, <Astronaut pose="work" />)}</>),
  'c10-c': () => scene(<>{at(30, 24, 0.9, <Flare />)}<Ground />{at(82, 62, 1.3, <Astronaut pose="work" />)}{at(118, 62, 1.3, <Astronaut pose="work" />)}</>),
  // 11. Broken panel
  c11: () => scene(<><Ground />{at(80, 60, 2, <SolarPanel />)}{at(76, 52, 1.4, <Crack />)}{at(124, 24, 1, <Rock />)}</>, true),
  'c11-a': () => scene(<><Ground />{at(108, 60, 1.6, <SolarPanel />)}{at(56, 62, 1.3, <Astronaut pose="work" />)}</>, true),
  'c11-b': () => scene(<><Ground />{at(80, 60, 1.8, <SolarPanel />)}{at(80, 52, 1, <rect x={-8} y={-3} width={16} height={6} rx={1} fill={C.power} opacity={0.9} />)}</>, true),
  'c11-c': () => scene(<><Ground />{at(80, 56, 2, <Battery level={0.2} color={C.crit} />)}</>, true),
  // 12. Lunar night
  c12: () => scene(<><Ground />{at(60, 70, 1.2, <Dome />)}{at(118, 52, 1.2, <Thermo />)}</>, true),
  'c12-a': () => scene(<><Ground />{at(76, 70, 1.5, <Dome lit={false} />)}{at(112, 34, 1.4, <Zz />)}</>, true),
  'c12-b': () => scene(<><Ground />{at(80, 68, 1.6, <Dome glow />)}</>, true),
  'c12-c': () => scene(<><Ground />{at(64, 70, 1.2, <Dome lit={false} />)}{at(116, 62, 1.2, <Astronaut />)}{at(126, 36, 1, <Zz />)}</>, true),
}

/** The small item drawn in a split's slots: a crate on the pallet, a power cell in its slot. */
const ITEMS: Record<string, () => ReactNode> = {
  'c02-supplies': () => <Crate color={C.food} />,
  'c02-shielding': () => <Crate color={C.shield} />,
  'c02-power-gear': () => <Crate color={C.power} />,
  'c02-spares': () => <Crate color={C.metal} />,
}

export function hasPicture(id: string): boolean {
  return id in PICTURES
}

/**
 * A challenge's, option's or split item's illustration (by id), or an empty
 * sky. `contain` shows the whole scene in a short frame instead of filling it.
 */
export function Picture({ id, className, contain = false }: { id: string; className?: string; contain?: boolean }) {
  const draw = PICTURES[id]
  return (
    <svg className={className ?? 'picture'} viewBox="0 0 160 100" preserveAspectRatio={contain ? 'xMidYMid meet' : 'xMidYMid slice'} aria-hidden="true">
      {draw ? draw() : scene(<Ground />)}
    </svg>
  )
}

/** One unit of a split: a crate (cargo) or a power cell (base power), filled or an empty slot. */
export function SplitItem({ bucketId, filled }: { bucketId: string; filled: boolean }) {
  const item = ITEMS[bucketId]
  return (
    <svg className="split-item" data-filled={filled ? 'true' : undefined} viewBox="-10 -10 20 20" aria-hidden="true">
      {filled ? (item ? item() : <PowerCell />) : <rect x={-8} y={-8} width={16} height={16} rx={2} fill="none" stroke={C.metal} strokeDasharray="2 2" />}
    </svg>
  )
}
