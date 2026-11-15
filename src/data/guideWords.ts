/**
 * The guidebook's "Words to know": every technical word the game uses, A to
 * Z, each with a meaning in 12 words or fewer, a picture (src/hud/art/Picture.tsx),
 * and where in the game you meet it. `term` links a word to its explanation
 * in the decision panels (src/data/glossary.ts), so it shows as "seen" once
 * the panel has explained it; the others show as seen once you've been on
 * their map. tools/checks/data.mts checks every glossary word is here.
 */
export interface GuideWord {
  id: string
  word: string
  meaning: string
  picture: string
  where: string
  /** The map you first meet it on. */
  map: 'launch-center' | 'spacecraft' | 'outpost'
  /** Its id in src/data/glossary.ts, if the panels explain it too. */
  term?: string
}

export const GUIDE_WORDS: readonly GuideWord[] = [
  { id: 'airlock', word: 'Airlock', meaning: 'A small room for going outside without losing the air.', picture: 'c06', where: 'Outpost: the airlock', map: 'outpost' },
  { id: 'booster', word: 'Booster (rocket stage)', meaning: 'A part of the rocket that burns, then drops away.', picture: 'c01', where: 'The launch', map: 'launch-center' },
  { id: 'carbon-dioxide', word: 'Carbon dioxide (CO₂)', meaning: 'The gas we breathe out. Too much gives people headaches.', picture: 'c03', where: 'Spacecraft: the scrubber fault', map: 'spacecraft', term: 'carbon-dioxide' },
  { id: 'scrubber', word: 'CO₂ scrubber', meaning: 'A machine that takes breathed-out gas out of the air.', picture: 'c03-a', where: 'Spacecraft: life support', map: 'spacecraft' },
  { id: 'donki', word: 'DONKI', meaning: 'NASA’s record of real storms from the Sun.', picture: 'c04', where: 'Solar storms, and Mission Data', map: 'spacecraft' },
  { id: 'dose', word: 'Dose (radiation dose)', meaning: 'How much radiation your body has soaked up.', picture: 'c10-a', where: 'Storms, and the dose meter', map: 'spacecraft', term: 'dose' },
  { id: 'reactor', word: 'Fission reactor', meaning: 'A machine that makes power by splitting atoms.', picture: 'c01-c', where: 'Launch center: the power source', map: 'launch-center', term: 'reactor' },
  { id: 'fuel-cell', word: 'Fuel cell', meaning: 'Makes power by joining hydrogen and oxygen into water.', picture: 'c01-b', where: 'Launch center: the power source', map: 'launch-center', term: 'fuel-cell' },
  { id: 'hydroponics', word: 'Hydroponics', meaning: 'Growing plants in water instead of soil.', picture: 'c07', where: 'Outpost: the greenhouse', map: 'outpost' },
  { id: 'kpa', word: 'kPa (kilopascal)', meaning: 'A unit for how hard the air presses.', picture: 'c06', where: 'Outpost: the airlock’s gauge', map: 'outpost' },
  { id: 'life-support', word: 'Life Support', meaning: 'The machines that make air to breathe and clean water.', picture: 'c06-life-support', where: 'The meters, and every map', map: 'launch-center', term: 'life-support' },
  { id: 'lola', word: 'LOLA', meaning: 'A laser on a NASA spacecraft that measured the Moon’s hills.', picture: 'c05', where: 'The ground around the outpost', map: 'outpost' },
  { id: 'lunar-night', word: 'Lunar night', meaning: 'Night on the Moon. It lasts about two weeks.', picture: 'c12', where: 'Outpost: the last task', map: 'outpost', term: 'lunar-night' },
  { id: 'max-q', word: 'Max Q', meaning: 'The moment the air pushes hardest on a climbing rocket.', picture: 'c01', where: 'The launch', map: 'launch-center' },
  { id: 'meteoroid', word: 'Meteoroid', meaning: 'A small space rock, often as small as a grain of sand.', picture: 'c11', where: 'Outpost: a broken solar panel', map: 'outpost' },
  { id: 'microgravity', word: 'Microgravity', meaning: 'Floating, because you and your ship fall around Earth together.', picture: 'c03', where: 'The spacecraft', map: 'spacecraft' },
  { id: 'msv', word: 'mSv (millisievert)', meaning: 'The unit for how much radiation a body got.', picture: 'c10-a', where: 'The dose meter and the handbook', map: 'spacecraft' },
  { id: 'shadowed-crater', word: 'Permanently shadowed crater', meaning: 'A crater so deep that sunlight never reaches its floor.', picture: 'c05-b', where: 'Outpost: the ice crater', map: 'outpost' },
  { id: 'radiation', word: 'Radiation', meaning: 'Tiny fast particles from the Sun and deep space.', picture: 'c10', where: 'Solar storms', map: 'spacecraft', term: 'radiation' },
  { id: 'regolith', word: 'Regolith', meaning: 'The Moon’s loose dust and broken rock.', picture: 'c06-drill', where: 'Outpost: the drill and the roof', map: 'outpost' },
  { id: 'rover', word: 'Rover', meaning: 'A car for driving across the Moon.', picture: 'c08', where: 'Outpost: the drive to the ice', map: 'outpost' },
  { id: 'shielding', word: 'Shielding', meaning: 'Thick walls of water, plastic or soil that block radiation.', picture: 'c02-shielding', where: 'The meters, and the cargo', map: 'launch-center', term: 'shielding' },
  { id: 'signal-delay', word: 'Signal delay', meaning: 'Radio from Earth takes seconds to reach the Moon.', picture: 'c06-antenna', where: 'Houston on the radio', map: 'spacecraft', term: 'signal-delay' },
  { id: 'solar-flare', word: 'Solar flare', meaning: 'A sudden, bright burst of energy on the Sun.', picture: 'c04', where: 'Solar storms', map: 'spacecraft' },
  { id: 'solar-storm', word: 'Solar storm (SEP)', meaning: 'Fast particles from the Sun that can harm astronauts.', picture: 'c10', where: 'Spacecraft and outpost: the alarm', map: 'spacecraft', term: 'solar-storm' },
  { id: 'south-pole', word: 'Lunar south pole', meaning: 'The bottom of the Moon, with long sunlight and hidden ice.', picture: 'c05-a', where: 'Where the outpost stands', map: 'outpost' },
  { id: 'tli', word: 'Trans-lunar injection', meaning: 'The engine burn that sends a spacecraft toward the Moon.', picture: 'c01', where: 'The launch', map: 'launch-center' },
  { id: 'water-ice', word: 'Water ice', meaning: 'Frozen water. On the Moon it can become water and air.', picture: 'c08', where: 'Outpost: the ice crater', map: 'outpost' },
]
