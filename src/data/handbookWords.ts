/**
 * The Mission Handbook's own words, written for ages 7 to 12: every
 * sentence has 12 words or fewer, uses everyday words, and says exactly
 * what happened and why. The handbook builds its cards from these and from
 * the run's real numbers (src/state/handbookStory.ts). The readability
 * check (tools/checks/handbook.mts) holds every sentence to 15 words and
 * keeps vague words out.
 */
import type { Metric } from '../state/handbook'

/** Why each option did what it did: one short sentence. */
export const WHY: Record<string, string> = {
  'c01-a': 'Solar panels are light, but they make no power at night.',
  'c01-b': 'A fuel cell keeps making power in the dark.',
  'c01-c': 'A reactor makes power day and night, but it is heavy.',
  'c03-a': 'A spare part fixed the scrubber that cleans the air.',
  'c03-b': 'The backup cleaned the air, but it used power.',
  'c03-c': 'Stale air gave the crew headaches and made them tired.',
  'c04-a': 'Thick walls blocked most of the radiation.',
  'c04-b': 'The people outside the shelter got more radiation.',
  'c04-c': 'Nobody was in the shelter, so everyone got radiation.',
  'c05-a': 'The ridge gets long hours of sunlight for the panels.',
  'c05-b': 'The crater is close to ice, but gets less sunlight.',
  'c05-c': 'The slope gets half the sun and is halfway to the ice.',
  'c07-a': 'Plants need water now, and they give food later.',
  'c07-b': 'Half the plants need half the water.',
  'c07-c': 'You kept the water, but nothing new will grow.',
  'c08-a': 'Digging the ice took a long time outside in the radiation.',
  'c08-b': 'A small dig is quicker, so it costs less.',
  'c08-c': 'Without new ice, the base must use less water.',
  'c09-a': 'Rest lets tired people get better.',
  'c09-b': 'Easy jobs kept the crew from getting worse.',
  'c09-c': 'The crew built the roof thicker, but got worn out.',
  'c10-a': 'Thick walls blocked most of the radiation.',
  'c10-b': 'The people outside the shelter got more radiation.',
  'c10-c': 'Nobody was in the shelter, so everyone got radiation.',
  'c11-a': 'A walk outside fixes the panel, but uses air.',
  'c11-b': 'The patched panel makes only half its power.',
  'c11-c': 'The broken panel makes no power at all.',
  'c12-a': 'Sleeping saves power, but the plants stop growing.',
  'c12-b': 'Running everything drains power and air in the long dark.',
  'c12-c': 'Less work saves power, but the crew gets worn down.',
}

/** The splits: why the share mattered. */
export const SPLIT_WHY: Record<number, string> = {
  2: 'The rocket can carry only so much, so you had to share.',
  6: 'Every part you switch on uses power every night.',
}

/** An earlier choice coming back: what happened, in one or two short sentences. */
export const BITE_STORY: Record<string, string> = {
  'no-shielding-transit': 'You packed no shielding. More radiation got through the walls.',
  'no-shielding-storm': 'You packed no shielding. More radiation got through the walls.',
  'transit-dose-storm': 'The crew already had radiation from the trip. This storm added more.',
  'no-antenna-storm': 'The antenna had no power. The storm warning came late.',
  'worked-in-storm': 'Your best friend worked outside the shelter and got sick.',
  'no-rover-walk': 'The rover was lost, so the crew had to walk. Walking took longer.',
  'no-rover-patch': 'The rover was lost, so even a short trip took longer.',
  'solar-night': 'Solar panels make no power in the dark. The batteries ran down.',
  'fuel-cell-night': 'The fuel cell made power in the dark, but its fuel ran low.',
  'reactor-night': 'The reactor kept running all through the dark.',
  'greenhouse-dark': 'The greenhouse had no power, so no new food grew.',
  rationing: 'The crew rationed water, so Life Support went down every night.',
  'pushed-on': 'Your best friend pushed on while tired, and wore out sooner.',
  'skipped-planting': 'Nothing was planted, so there was no fresh food at night.',
  'no-spares-pump': 'A water pump broke. There was no spare part to fix it.',
  'few-supplies': 'You packed few supplies, so the food ran low.',
  'rover-tow': 'The rover battery ran flat. Towing it home cost a whole day.',
  'dose-moderate': 'The radiation added up to a worrying level. Everyone felt unwell.',
}

/** Real facts, short: what NASA (or the CSA) says, keyed by reference id. */
export const FACTS: Record<string, string[]> = {
  'rad-brief': ['NASA keeps one storm’s dose under 250 mSv.', 'A whole career must stay under 600 mSv.', 'A storm shelter uses water bags as extra walls.'],
  'moon-facts': ['Most places on the Moon get two weeks of sun.', 'Then they get two weeks of dark.', 'At night it gets colder than −170 °C.'],
  fsp: ['NASA studied a small reactor to power a Moon base.', 'It would make power day and night.'],
  rfc: ['A fuel cell joins hydrogen and oxygen to make power.', 'It could keep a base running through the lunar night.'],
  'co2-brief': ['Too much carbon dioxide gives astronauts headaches.', 'NASA sets a limit for it in every cabin.'],
  plants: ['The space station has a garden called Veggie.', 'Plants grow there under red and blue lights.', 'Fresh food keeps crews healthy and happy.'],
  'csa-food': ['Canada’s space agency studies growing food on the Moon.', 'The same ideas help people in faraway places on Earth.'],
  isru: ['There is frozen water under the Moon’s soil.', 'NASA plans to turn it into water and air.'],
  basecamp: ['Ridges near the south pole get long sunlight.', 'Dark crater floors may hide ice.', 'Planners must pick between sun and ice.'],
  'artemis-sun': ['NASA watches the Sun all day and night during flights.', 'If radiation rises, the crew moves to a shelter.'],
  flares: ['Solar flares are ranked C, M and X.', 'Each letter is ten times stronger than the last.'],
  sleep: ['Astronauts sleep less in space than at home.', 'Tired crews make more mistakes.'],
  'food-hrr': ['Each astronaut eats about 1.8 kg of food a day.', 'All of it has to be launched from Earth.'],
  mass: ['Every kilogram you launch costs money and fuel.', 'So planners count every kilogram.'],
  'iss-logistics': ['The space station keeps spare parts on board.', 'Help from Earth takes a long time to arrive.'],
  'safe-haven': ['Moon soil piled on a roof blocks radiation.', 'Three to seven metres of soil works well.'],
  lunanet: ['Relay satellites will link Moon crews to Earth.', 'They work even where Earth is out of sight.'],
  suit: ['A spacesuit backpack holds the air you breathe.', 'A walk outside uses that air up.'],
  'rover-brief': ['Apollo crews never drove more than 7.6 km away.', 'That way they could walk home if the rover broke.'],
  donki: ['NASA keeps a record of real storms from the Sun.', 'It is called DONKI.', 'Every storm in this game came from it.'],
  osdr: ['NASA shares its space health research for anyone to read.'],
  'comm-delay': ['A radio message from Earth takes about 5.6 seconds.', 'That is why Houston can’t answer straight away.'],
}

/** Science words, explained in one short sentence the first time the handbook uses them. */
export const WORDS: readonly { word: string; match: RegExp; meaning: string }[] = [
  { word: 'Radiation', match: /radiation/i, meaning: 'Tiny fast particles from the Sun and space. Too much makes people sick.' },
  { word: 'mSv', match: /\bmSv\b/, meaning: 'Millisieverts. The unit for how much radiation a body got.' },
  { word: 'Shielding', match: /shield/i, meaning: 'Thick walls that block radiation.' },
  { word: 'Life Support', match: /life support/i, meaning: 'The machines that make air and clean water.' },
  { word: 'Lunar night', match: /lunar night|long dark/i, meaning: 'Night on the Moon. It lasts about two weeks.' },
  { word: 'Solar storm', match: /solar storm|flare/i, meaning: 'A burst from the Sun that throws out radiation.' },
  { word: 'Fuel cell', match: /fuel cell/i, meaning: 'A machine that makes power from hydrogen and oxygen.' },
  { word: 'Reactor', match: /reactor/i, meaning: 'A machine that makes power by splitting atoms.' },
  { word: 'Scrubber', match: /scrubber/i, meaning: 'A machine that takes the breathed-out gas out of the air.' },
  { word: 'Meteoroid', match: /meteoroid/i, meaning: 'A small space rock, often as small as sand.' },
]

/** What each meter means, in one sentence. */
export const METER_MEANING: Record<Metric, string> = {
  power: 'Power runs the lights, heaters and machines.',
  lifeSupport: 'Life Support makes the air and water your crew needs.',
  shielding: 'Shielding is the walls that keep radiation out.',
  foodDays: 'This shows how many days of food are left.',
  dose: 'This shows how much radiation your crew got in total.',
}

export const METER_NAME: Record<Metric, string> = {
  power: 'Power',
  lifeSupport: 'Life Support',
  shielding: 'Shielding',
  foodDays: 'Food',
  dose: 'Radiation',
}

/** Words the handbook never uses: they say nothing exact. */
export const VAGUE_WORDS: readonly string[] = ['some', 'things', 'stuff', 'a bit', 'kind of', 'various', 'etc.']
