/**
 * Quick facts for the main menu's loading screen (src/hud/menu/LobbyLoading.tsx):
 * one short sentence each, for ages 7 to 12, about the Moon, the Sun, NASA
 * and life in space. Each says only what its source says. The new ones were
 * checked against the NASA page they link to (opened on 15 November 2026);
 * the others reuse the game's checked references (./sources.json) and the
 * space pioneers the crew are named after (./namedInHonour.ts).
 * Never invent a source.
 */
import { NAMED_IN_HONOUR } from './namedInHonour'
import { getReference } from './sources'

export interface QuickFact {
  /** A word or two over the fact ("The Moon"). */
  topic: string
  text: string
  source: { label: string; url: string }
}

const MOON = { label: 'NASA Science: Earth’s Moon, Facts', url: 'https://science.nasa.gov/moon/facts/' }
const SUN = { label: 'NASA Science: Sun, Facts', url: 'https://science.nasa.gov/sun/facts/' }
const STATION = { label: 'NASA: Space Station Facts and Figures', url: 'https://www.nasa.gov/international-space-station/space-station-facts-and-figures/' }
const SATURN_V = { label: 'NASA: What Was the Saturn V?', url: 'https://www.nasa.gov/learning-resources/for-kids-and-students/what-was-the-saturn-v-grades-5-8/' }
const APOLLO_11 = { label: 'NASA: Apollo 11 Mission Overview', url: 'https://www.nasa.gov/history/apollo-11-mission-overview/' }
const ARTEMIS = { label: 'NASA: Artemis', url: 'https://www.nasa.gov/humans-in-space/artemis/' }

/** One of the game's checked references (./sources.json), as a fact's source. */
function reference(id: string): QuickFact['source'] {
  const ref = getReference(id)
  if (!ref) throw new Error(`No reference "${id}" in sources.json`)
  return { label: `${ref.publisher}: ${ref.title}`, url: ref.url }
}

const CHECKED: readonly QuickFact[] = [
  { topic: 'The Moon', text: 'The Moon is about 384,400 kilometres from Earth, on average.', source: MOON },
  { topic: 'The Moon', text: 'Gravity on the Moon is only one-sixth of Earth’s.', source: MOON },
  { topic: 'The Moon', text: 'The same side of the Moon always faces Earth.', source: MOON },
  { topic: 'The Moon', text: 'The Moon likely formed after a Mars-sized body crashed into Earth, billions of years ago.', source: MOON },
  { topic: 'The Moon', text: 'The Moon’s air is so thin it is called an exosphere, and nobody can breathe it.', source: MOON },
  { topic: 'The Moon', text: 'The Moon’s surface reaches about 127 °C in sunlight and about −173 °C in the dark.', source: reference('moon-facts') },
  { topic: 'The Moon', text: 'Some Moon soil holds frozen water: one impact found nearly five percent of the soil it hit was water.', source: reference('isru') },
  { topic: 'The Sun', text: 'It would take 1.3 million Earths to fill the Sun.', source: SUN },
  { topic: 'The Sun', text: 'The Sun is a star, about 150 million kilometres from Earth.', source: SUN },
  { topic: 'The Sun', text: 'Solar flares are ranked C, M and X, and an X flare is 100 times stronger than a C flare.', source: reference('flares') },
  { topic: 'Space station', text: 'The space station goes round Earth 16 times a day, so its crew see 16 sunrises and sunsets.', source: STATION },
  { topic: 'Space station', text: 'People have lived on the space station without a break since November 2000.', source: STATION },
  { topic: 'Space station', text: 'The space station is 109 metres long, almost as long as an American football field.', source: STATION },
  { topic: 'Space station', text: 'Plants on the space station grow under red and blue lights, in a garden called Veggie.', source: reference('plants') },
  { topic: 'Saturn V', text: 'The Saturn V was 111 metres tall, about as tall as a 36-storey building.', source: SATURN_V },
  { topic: 'Saturn V', text: 'Fully fuelled, the Saturn V weighed about as much as 400 elephants.', source: SATURN_V },
  { topic: 'Apollo 11', text: 'Apollo 11’s lander, Eagle, touched down in the Moon’s Sea of Tranquility.', source: APOLLO_11 },
  { topic: 'Apollo', text: 'Apollo crews never drove their Moon rover more than 7.6 km away, so they could always walk back.', source: reference('rover-brief') },
  { topic: 'Artemis', text: 'NASA plans a Moon Base near the Moon’s South Pole, where astronauts will live, work and explore.', source: ARTEMIS },
  { topic: 'Artemis', text: 'On Artemis, a voice from Earth takes about 5.6 seconds to reach the crew.', source: reference('comm-delay') },
  { topic: 'Spacesuits', text: 'A spacesuit’s backpack holds the oxygen the astronaut breathes.', source: reference('suit') },
]

/** The space pioneers the crew are named after, one fact each. */
const PIONEERS: readonly QuickFact[] = Object.values(NAMED_IN_HONOUR)
  .flat()
  .map((pioneer) => ({ topic: 'Space pioneers', text: pioneer.fact, source: pioneer.source }))

export const QUICK_FACTS: readonly QuickFact[] = [...CHECKED, ...PIONEERS]
