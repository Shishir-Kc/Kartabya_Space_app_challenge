/**
 * Science words, explained in one short sentence for ages 7 to 12. The
 * decision panel shows a word's explanation the first time it appears on a
 * run (in the situation, the crew's lines or the options), then never again.
 */
export interface Term {
  id: string
  /** The word as shown. */
  word: string
  /** Finds the word in a sentence. */
  match: RegExp
  explain: string
}

export const TERMS: readonly Term[] = [
  {
    id: 'signal-delay',
    word: 'Signal delay',
    match: /signal delay/i,
    explain: 'Radio is fast, but the Moon is far away: NASA expects a message from Earth to take about 5.6 seconds to arrive, so Houston can’t answer straight away.',
  },
  {
    id: 'radiation',
    word: 'Radiation',
    match: /radiation/i,
    explain: 'Tiny, fast particles from the Sun and deep space. Too much of it can make people sick, so astronauts hide behind thick walls.',
  },
  {
    id: 'dose',
    word: 'Radiation dose',
    match: /\bdose\b/i,
    explain: 'How much radiation your body has soaked up. It adds up over a mission and is measured in millisieverts (mSv).',
  },
  {
    id: 'shielding',
    word: 'Shielding',
    match: /shield/i,
    explain: 'Thick walls of water, plastic or Moon soil that block radiation.',
  },
  {
    id: 'lunar-night',
    word: 'Lunar night',
    match: /night on the Moon|lunar night|night will last/i,
    explain: 'The Moon turns slowly, so night lasts about two Earth weeks and gets colder than −170 °C.',
  },
  {
    id: 'solar-storm',
    word: 'Solar storm',
    match: /solar storm|flare/i,
    explain: 'A burst from the Sun that can throw out clouds of fast particles. NASA records real ones in a database called DONKI.',
  },
  {
    id: 'fuel-cell',
    word: 'Fuel cell',
    match: /fuel cell/i,
    explain: 'A machine that joins hydrogen and oxygen into water and makes electricity while it does.',
  },
  {
    id: 'reactor',
    word: 'Fission reactor',
    match: /reactor/i,
    explain: 'A machine that makes heat by splitting atoms and turns it into electricity, day and night.',
  },
  {
    id: 'carbon-dioxide',
    word: 'Carbon dioxide',
    match: /carbon dioxide/i,
    explain: 'The gas we breathe out. In a closed cabin it builds up and gives people headaches unless a machine removes it.',
  },
  {
    id: 'life-support',
    word: 'Life support',
    match: /life support/i,
    explain: 'The machines that give the crew air to breathe and clean water to drink.',
  },
]

/** The terms that appear in any of these texts and aren't in `seen`, in list order. */
export function newTerms(texts: readonly string[], seen: readonly string[]): Term[] {
  const all = texts.join(' ')
  return TERMS.filter((term) => !seen.includes(term.id) && term.match.test(all))
}
