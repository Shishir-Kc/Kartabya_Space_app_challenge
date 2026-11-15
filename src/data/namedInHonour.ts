/**
 * Who the crew are named in honour of: each crew name joins two real space
 * pioneers' names, so nobody in the game is a real person. One sentence per
 * pioneer, each checked against the NASA page it links to (opened on
 * 15 November 2026). Shown on the handbook's Real life page and in the
 * guidebook.
 */
import type { SpeakerId } from '../state/mission'

export interface Pioneer {
  name: string
  /** One sentence, as the source says it, for ages 7 to 12. */
  fact: string
  source: { label: string; url: string }
}

export const NAMED_IN_HONOUR: Readonly<Record<SpeakerId, readonly [Pioneer, Pioneer]>> = {
  commander: [
    {
      name: 'Yuri Gagarin',
      fact: 'Yuri Gagarin became the first person in space on 12 April 1961.',
      source: { label: 'NASA: Remembering Yuri Gagarin 50 Years Later', url: 'https://www.nasa.gov/history/remembering-yuri-gagarin-50-years-later/' },
    },
    {
      name: 'Neil Armstrong',
      fact: 'Neil Armstrong was the first person to walk on the Moon, in 1969.',
      source: { label: 'NASA: Neil A. Armstrong', url: 'https://www.nasa.gov/people/neil-a-armstrong/' },
    },
  ],
  safety: [
    {
      name: 'Alexei Leonov',
      fact: 'Alexei Leonov made the first spacewalk, out of Voskhod 2, in 1965.',
      source: { label: 'NASA: Space Station 20th, Spacewalking History', url: 'https://www.nasa.gov/history/space-station-20th-spacewalking-history/' },
    },
    {
      name: 'John Young',
      fact: 'John Young walked on the Moon, then commanded the first Space Shuttle flight.',
      source: { label: 'NASA: Former Astronaut John W. Young', url: 'https://www.nasa.gov/former-astronaut-john-w-young/' },
    },
  ],
  science: [
    {
      name: 'Kalpana Chawla',
      fact: 'Kalpana Chawla, born in Karnal, India, flew on the Space Shuttle in 1997.',
      source: { label: 'NASA: Kalpana Chawla, biographical data', url: 'https://www.nasa.gov/wp-content/uploads/2020/09/chawla_kalpana.pdf' },
    },
    {
      name: 'Sally Ride',
      fact: 'Sally Ride became the first American woman in space, in 1983.',
      source: { label: 'NASA: Former Astronaut Sally Ride', url: 'https://www.nasa.gov/former-astronaut-sally-ride/' },
    },
  ],
  comms: [
    {
      name: 'Gus Grissom',
      fact: 'Gus Grissom was one of NASA’s first seven astronauts, the Mercury 7.',
      source: { label: 'NASA: What Was Project Mercury?', url: 'https://www.nasa.gov/learning-resources/for-kids-and-students/what-was-project-mercury-grades-5-8/' },
    },
    {
      name: 'John Glenn',
      fact: 'John Glenn became the first American to orbit Earth, in 1962.',
      source: { label: 'NASA: John Glenn, the First American to Orbit the Earth', url: 'https://www.nasa.gov/history/60-years-ago-john-glenn-the-first-american-to-orbit-the-earth-aboard-friendship-7/' },
    },
  ],
  trainer: [
    {
      name: 'Ronald McNair',
      fact: 'Ronald McNair, a physicist, was one of NASA’s first African American astronauts.',
      source: { label: 'NASA: Three of the “Thirty-Five New Guys”', url: 'https://www.nasa.gov/image-article/three-of-thirty-five-new-guys/' },
    },
    {
      name: 'Guion Bluford',
      fact: 'Guion Bluford became the first African American to fly in space, in 1983.',
      source: { label: 'NASA: STS-8', url: 'https://www.nasa.gov/mission/sts-8/' },
    },
  ],
}
