/**
 * The real data and the free assets the game uses, each named and credited.
 * One list feeds the menu's MISSION DATA tab now and the dataset page and
 * in-game credits later, so they can't drift apart. Keep it in step with
 * ASSETS.md: every row here has a row there (except "coming soon" ones,
 * which have no file yet). Never invent a source.
 */
export interface Credit {
  id: string
  /** What it is in the game, in a child's words. */
  title: string
  /** The source's own name. */
  source: string
  /** Who to credit. */
  credit: string
  /** Where it shows up in the game. */
  usedFor: string
  url: string
  /** Not in the game yet. */
  comingSoon?: boolean
}

export interface CreditGroup {
  id: string
  title: string
  note: string
  credits: Credit[]
}

export const CREDIT_GROUPS: CreditGroup[] = [
  {
    id: 'nasa',
    title: 'Real NASA data',
    note: 'Pictures and measurements from NASA missions. NASA does not endorse this game.',
    credits: [
      {
        id: 'earth',
        title: 'Earth',
        source: 'Blue Marble: Next Generation (NASA SVS 3615)',
        credit: 'NASA Goddard Space Flight Center Scientific Visualization Studio; Blue Marble data courtesy of Reto Stöckli (NASA/GSFC) and NASA’s Earth Observatory',
        usedFor: 'Earth through the spacecraft’s windows and in the launch.',
        url: 'https://svs.gsfc.nasa.gov/3615',
      },
      {
        id: 'moon',
        title: 'The Moon',
        source: 'LROC colour mosaic, from the CGI Moon Kit (NASA SVS 4720)',
        credit: 'NASA Goddard Space Flight Center Scientific Visualization Studio (Ernie Wright); Lunar Reconnaissance Orbiter Camera data',
        usedFor: 'The Moon growing ahead on the way there.',
        url: 'https://svs.gsfc.nasa.gov/4720',
      },
      {
        id: 'lola',
        title: 'The ground at the lunar south pole',
        source: 'LOLA south pole elevation model, LDEM_80S_20MPP_ADJ (NASA PGDA product 90)',
        credit: 'NASA Goddard Space Flight Center, Lunar Orbiter Laser Altimeter team; Barker et al., 2023, Planetary Science Journal, 4, 183',
        usedFor: 'The hills and craters round the outpost, and the landscape you land on.',
        url: 'https://pgda.gsfc.nasa.gov/products/90',
      },
      {
        id: 'donki',
        title: 'Solar storms',
        source: 'DONKI, the Space Weather Database Of Notifications, Knowledge, Information',
        credit: 'NASA Goddard Space Flight Center, Community Coordinated Modeling Center',
        usedFor: 'The solar storm: each run faces one real archived solar flare (classes C, M and X, 2022 to 2025), shown with its date and class.',
        url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
      },
      {
        id: 'donki-live',
        title: 'The Sun right now',
        source: 'DONKI through api.nasa.gov (NASA Open APIs)',
        credit: 'NASA Goddard Space Flight Center, Community Coordinated Modeling Center; api.nasa.gov',
        usedFor: 'A live summary of the last 30 days of real space weather (coronal mass ejections, radiation storms, geomagnetic storms), shown after the storm, in the debrief and here. Labelled live; the game plays without it.',
        url: 'https://api.nasa.gov/',
      },
      {
        id: 'osdr',
        title: 'Astronaut health and space food research',
        source: 'NASA Open Science Data Repository (OSDR)',
        credit: 'NASA Ames Research Center, Open Science Data Repository',
        usedFor: 'Five real studies (OSD-53, OSD-569, OSD-992, OSD-412, OSD-772) linked to the crew’s health, the radiation dose and the greenhouse, here and in the debrief.',
        url: 'https://osdr.nasa.gov/bio/',
      },
      {
        id: 'nasa-docs',
        title: 'The science behind every choice',
        source: 'NASA-STD-3001 technical briefs, NASA Human Research Program evidence reports, NASA and NTRS documents, Canadian Space Agency',
        credit: 'NASA; Canadian Space Agency',
        usedFor: 'The real facts behind each option (radiation limits, the lunar night, food, air, power), shown on every result screen and listed above.',
        url: 'https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf',
      },
    ],
  },
  {
    id: 'assets',
    title: 'Free art and type',
    note: 'Shared by their makers for anyone to use.',
    credits: [
      {
        id: 'moon-suit',
        title: 'The Moon suit',
        source: '"astronaut" on Sketchfab',
        credit: 'omarkamel140, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changed: rigged to each body so it walks, simplified, gold visor and glowing helmet lamps, the game’s own name tag and patch.',
        usedFor: 'The spacesuit your astronaut wears outside on the Moon, walking with the body’s own animations.',
        url: 'https://sketchfab.com/3d-models/astronaut-7736b318582f447c9b8194e9c23d1347',
      },
      {
        id: 'characters',
        title: 'The astronauts',
        source: 'Universal Base Characters (free Standard version)',
        credit: 'Quaternius, CC0 1.0 (public domain)',
        usedFor: 'Bodies, hair and eyes of your astronaut and of the crew (their glasses, beard, bun and suit stripes are drawn in code).',
        url: 'https://quaternius.com/packs/universalbasecharacters.html',
      },
      {
        id: 'rover',
        title: 'The lunar rover',
        source: 'Lunar Rover, on Sketchfab',
        credit: 'Versal, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changed: screws removed, simplified, coloured part by part, wheels made to steer and spin.',
        usedFor: 'The rover you drive to the ice crater.',
        url: 'https://sketchfab.com/3d-models/lunar-rover-82cab6e9ada74d12a98bd6a342e83048',
      },
      {
        id: 'saturn-v',
        title: 'The Saturn V rocket',
        source: 'Saturn V - NASA, on Sketchfab',
        credit: 'Stanley Creative, CC BY-ND 4.0 (https://creativecommons.org/licenses/by-nd/4.0/). Not changed: shown as made, at real size (only compressed for the web).',
        usedFor: 'The rocket on the launch pad and in the launch.',
        url: 'https://sketchfab.com/3d-models/saturn-v-nasa-7a2c9709ff8144c8b3b18ec84b5e112e',
      },
      {
        id: 'lunar-module',
        title: 'The lunar module',
        source: 'Apollo Lunar Module, on Sketchfab',
        credit: 'jgut028, CC BY-NC 4.0 (https://creativecommons.org/licenses/by-nc/4.0/), used non-commercially. Changed: scaled to real size, a stray antenna copy removed, merged into one piece.',
        usedFor: 'The lander that takes you down to the Moon, and lifts off in the ending scenes.',
        url: 'https://sketchfab.com/3d-models/apollo-lunar-module-e7458d5b149b482d9829ff90ea6bc233',
      },
      {
        id: 'voices',
        title: 'The crew’s voices',
        source: 'ElevenLabs text to speech',
        credit: 'Voices made with ElevenLabs (elevenlabs.io), from its Voice Library: Justin Time, Ellen, Jack John, David and Patrick. Used non-commercially; the words are the team’s.',
        usedFor: 'What the trainer, Kal, Houston, the commander and the safety officer say in the launch center.',
        url: 'https://elevenlabs.io',
      },
      {
        id: 'animations',
        title: 'How they move',
        source: 'Universal Animation Library (free Standard version)',
        credit: 'Quaternius, CC0 1.0 (public domain)',
        usedFor: 'Standing, walking, running, jumping and sneaking.',
        url: 'https://quaternius.com/packs/universalanimationlibrary.html',
      },
      {
        id: 'display-font',
        title: 'The big letters',
        source: 'Barlow Semi Condensed',
        credit: 'The Barlow Project Authors (Jeremy Tribby), SIL Open Font License 1.1',
        usedFor: 'The game’s title, the tabs and the big buttons.',
        url: 'https://github.com/jpt/barlow',
      },
      {
        id: 'text-fonts',
        title: 'The small letters and numbers',
        source: 'Inter and JetBrains Mono',
        credit: 'The Inter Project Authors and The JetBrains Mono Project Authors, SIL Open Font License 1.1',
        usedFor: 'Everything else you read, and the numbers on the gauges.',
        url: 'https://rsms.me/inter/',
      },
    ],
  },
  {
    id: 'code',
    title: 'Free code, and what we drew ourselves',
    note: 'Open-source libraries the game is built on, and everything else made for this game.',
    credits: [
      {
        id: 'pbr-textures',
        title: 'Real metal, rubber, fabric and concrete',
        source: 'ambientCG',
        credit: 'Lennart Demes, CC0 1.0 (public domain). Changed: turned to grey detail so the game’s colours show through, with lighter wear.',
        usedFor: 'The surfaces of the consoles, racks, crates, furniture and floors.',
        url: 'https://ambientcg.com',
      },
      {
        id: 'hdri',
        title: 'The light reflected in shiny things',
        source: 'Poly Haven: The Sky Is On Fire, Studio Small 09',
        credit: 'Greg Zaal and Sergej Majboroda, CC0 1.0 (public domain)',
        usedFor: 'Reflections and soft light: a twilight sky outside the launch center, a studio inside.',
        url: 'https://polyhaven.com/a/the_sky_is_on_fire',
      },
      {
        id: 'libraries',
        title: 'The 3D engine and the screens',
        source: 'three.js, React, React Three Fiber, drei and zustand',
        credit: 'The three.js authors, Meta Platforms and the React contributors, Poimandres; MIT License',
        usedFor: 'Drawing the 3D worlds, and every menu, panel and card.',
        url: 'https://threejs.org/',
      },
      {
        id: 'made-here',
        title: 'Pictures, icons and crew faces',
        source: 'Made in code (for this game)',
        credit: 'The Lunar Outpost team (no outside art: see ASSETS.md, Made in code)',
        usedFor: 'The decision pictures, the meter icons, the crew portraits, the walls, the Moon’s rocks and the handbook.',
        url: 'https://github.com/MrRishabThapa/lunarOutpost',
      },
    ],
  },
]
