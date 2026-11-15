import type { StatId } from '../../state/mission'

/**
 * One icon per meter, drawn in code (24 x 24, 2 px strokes, no fill), so
 * effects read as pictures before words: lightning for Power, air for Life
 * Support, a shield for Shielding, a leaf for food, the radiation sign for
 * dose, a heart for crew health, a wrench for spare parts, a crate for cargo
 * blocks and a sprout for the harvest still growing.
 */
const PATHS: Record<StatId, string[]> = {
  power: ['M13 2 4 14h7l-1 8 9-12h-7l1-8Z'],
  lifeSupport: ['M3 8h11a3 3 0 1 0-3-3', 'M3 12h16a3 3 0 1 1-3 3', 'M3 16h7'],
  shielding: ['M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5l-8-3Z'],
  foodDays: ['M5 19c0-8 5-14 15-15-1 10-7 15-15 15Z', 'M5 19c3-4 6-7 10-10'],
  dose: [
    'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    'M10.5 9.5 7 3.5A10 10 0 0 0 2.5 11h7',
    'M13.5 9.5 17 3.5a10 10 0 0 1 4.5 7.5h-7',
    'M10.3 14.4 7 20.4a10 10 0 0 0 10 0l-3.3-6',
  ],
  crewHealth: ['M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11Z'],
  spares: ['M14.5 6.5a4 4 0 0 0-5.3 5.3L3 18l3 3 6.2-6.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5Z'],
  cargoBlocks: ['M3 8l9-5 9 5v8l-9 5-9-5V8Z', 'M3 8l9 5 9-5', 'M12 13v8'],
  harvestDays: ['M12 21V11', 'M12 14c-4 0-7-3-7-7 4 0 7 3 7 7Z', 'M12 11c0-4 3-7 7-7 0 4-3 7-7 7Z', 'M6 21h12'],
}

export function StatIcon({ stat, size = 24 }: { stat: StatId; size?: number }) {
  return (
    <svg className="stat-icon" data-stat={stat} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[stat].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
