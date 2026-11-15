# The NASA data in Lunar Outpost

This page is for judges and teachers. It lists every NASA dataset and document the game uses, what each is used for, and how it is shown. The same information is in the game, on the **MISSION DATA** tab of the menu.

The rule we kept: no invented numbers. Every fact comes from a document someone on the team has opened and read. Archived data is labelled as archived. Live data is labelled as live and shows the time it was fetched.

## Datasets

| Dataset | What we use | Archived or live | Where it shows | How to rebuild |
| --- | --- | --- | --- | --- |
| [NASA DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/) (Space Weather Database Of Notifications, Knowledge, Information), solar flares (FLR) and solar energetic particle events (SEP) | 10 real flares from 2022 to 2025 (3 C, 3 M, 4 X; 4 followed by an SEP). Each run draws one as its solar storm. Its class, and whether particles followed it, set how hard the storm hits. | Archived, retrieved 14 November 2026 | The storm panel ("Solar flare, class X1.7, recorded 22 February 2024. Source: NASA DONKI (archived data)"), the debrief and MISSION DATA | `node tools/fetch-donki.mjs` → `src/data/donki-archive.json` |
| DONKI through [NASA Open APIs](https://api.nasa.gov/): CME, SEP and GST records | The last 30 days of real space weather: clouds of gas thrown out by the Sun (CMEs), radiation storms (SEPs) and the strongest geomagnetic storm (Kp). | **Live**, fetched in the browser, cached for 3 hours. The game plays the same without it. | After the solar storm, in the debrief and on MISSION DATA, labelled "Live" with the date and time | `src/data/spaceWeather.ts` |
| [NASA Open Science Data Repository (OSDR)](https://osdr.nasa.gov/bio/) | 5 real studies: astronaut blood before and after flight (OSD-53), the Inspiration4 crew (OSD-569), space radiation and human cells (OSD-992), leafy greens grown in Veggie on the space station (OSD-412), chile peppers grown in space (OSD-772). | Archived, retrieved 14 November 2026 | The debrief (for the topics that run touched) and MISSION DATA, each with one sentence on why it matters to the game | `node tools/fetch-osdr.mjs` → `src/data/osdr-archive.json` |
| NASA LOLA elevation, LROC and Blue Marble imagery | The ground you walk on, the Moon and the Earth | Archived | The 3D world | See `ASSETS.md` |

We also tried RadLab, the OSDR radiation dosimetry database. Its API returned server errors on 14 November 2026, so the dose figures come from NASA's radiation standard instead (below).

## Documents behind the numbers

The game's meters (Power, Life Support, Shielding) run from 0 to 100 in game units: a child needs "a little", "some" or "a lot", not kilowatt-hours. What is real is the trade-off each choice stands for, and the documents below back every outcome (`src/data/sources.json`). The real figures, and how each one becomes a game number, are in `src/data/science.ts`.

Radiation dose is the one stat in real units. One dose point is 3.125 mSv, chosen so that the mission's "high" level is NASA's real 250 mSv limit for one solar particle event.

| Real figure | Used for | Source |
| --- | --- | --- |
| Career limit 600 mSv; 250 mSv for one solar particle event; shielding cuts solar-storm dose by about half; a storm shelter adds about 10 cm of water; about 0.5 mSv a day on the lunar surface | Dose levels, the shielding curve, "no shielding doubles the dose", the daily background dose, the debrief's dose bar | [NASA-STD-3001 Technical Brief OCHMO-TB-020, Design for Ionizing Radiation Protection](https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf) |
| Two thresholds on Artemis II: a lower one for closer watching, a higher one for shelter; crews shelter behind stowed gear | The moderate and high dose levels; sheltering | [To Protect Artemis II Astronauts, NASA Experts Keep Eyes on Sun](https://science.nasa.gov/missions/artemis/artemis-2/to-protect-artemis-ii-astronauts-nasa-experts-keep-eyes-on-sun/) |
| Each flare class letter is about 10× stronger than the one before | How hard each storm hits | [NASA Science: Solar Storms and Flares](https://science.nasa.gov/sun/solar-storms-and-flares/) |
| About two weeks of sunlight, then two weeks of darkness; 127 °C to −173 °C | The lunar night (challenge 12): solar panels make nothing | [NASA Science: Earth's Moon, Facts](https://science.nasa.gov/moon/facts/) |
| A 40 kW fission reactor gives continuous power, day and night | The reactor option (challenge 1) | [A Deployable 40 kWe Lunar Fission Surface Power Concept (NTRS)](https://ntrs.nasa.gov/citations/20220004670) |
| A regenerative fuel cell carries a base through the nearly two-week night | The fuel cell option | [NASA Fuel Cell Tests Pave Way for Energy Storage on Moon](https://www.nasa.gov/general/nasa-regenerative-fuel-cell-testing/) |
| About 1.8 kg of food and packaging per person per day | Supplies (challenge 2) | [NASA HRP Evidence Report: Risk of Inadequate Food System](https://humanresearchroadmap.nasa.gov/evidence/reports/food.pdf) |
| Every kilogram launched adds cost and energy | The mass blocks (challenge 2) | [NASA: Money Mass-ematics](https://www.nasa.gov/wp-content/uploads/2023/10/money-mass-ematics-1.0-en-508.pdf) |
| 19 of 49 space station astronauts reported headaches; headaches go with higher CO2 | Life support, the scrubber (challenge 3) | [NASA-STD-3001 Technical Brief OCHMO-TB-004, Carbon Dioxide](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf) |
| Regolith 3 to 7 m thick is good shielding | The drill (challenge 6) | [Lunar Safe Haven (NTRS)](https://ntrs.nasa.gov/citations/20210022066) |
| Plants under LED light give fresh food and help crews feel better | The greenhouse (challenges 6 and 7) | [NASA: Growing Plants in Space](https://www.nasa.gov/exploration-research-and-technology/growing-plants-in-space/); [CSA: Food production on the Moon and in remote areas](https://www.asc-csa.gc.ca/eng/youth-educators/toolkits/food-production/) |
| Relays keep south-pole crews in touch with Earth | The antenna (challenge 6) | [NASA: LunaNet](https://www.nasa.gov/communicating-with-missions/lunanet/) |

The full list of 21 references, with the fact each one supports, is on MISSION DATA and in `src/data/sources.json`. Each reference has an owner; the `reviewer` field waits for a second person on the team to check it.

## What is game scale

These numbers are not NASA figures, and we don't claim they are:

- The size of each meter change, apart from dose.
- How much stronger an X flare's storm is than a C flare's. The real difference is about 100×; the game squeezes it into 0.6 to 2 so that sheltering always works.
- The lunar night is played as 3 game nights. The real night is about 14 Earth days.
- The moderate dose level is half of NASA's 250 mSv limit. It stands in for Artemis II's lower threshold, whose value the article doesn't give.
