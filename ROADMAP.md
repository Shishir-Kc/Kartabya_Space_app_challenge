# Lunar Outpost: Development Roadmap (Phase 0 to Phase 12)

NASA Space Apps Challenge 2026, "Build a Junior Astronaut Mission Trainer". Hackathon: 14–15 November 2026.

Finishing Phase 12 means the game is ready to show to judges. Each phase ends with a "done when" check; a phase isn't finished until its check passes.

## Rules for every phase

- **One commit per file, always.** Message format: `<type>: <what changed> (<file>)`.
- **No invented NASA data.** Any number without a source is marked `TODO: source` until someone finds one.
- **Maps first, as greybox.** Phases 1–3 build the maps from plain boxes with placeholder consoles. Art comes in Phase 10.
- **Mechanics before looks.** The brief says a simple game that teaches a real constraint beats a beautiful one that doesn't.
- **Every decision costs something.** No option may be best on every meter.
- **Keep it light.** Low graphics preset by default; check the frame rate on the dev laptop (i7-1165G7, Iris Xe, 8 GB RAM).

## Timeline at a glance

| Phase | Name | Proposed target | Can run in parallel with |
| --- | --- | --- | --- |
| 0 | Project setup | 11 Nov (done) | — |
| 1 | Pre-launch map | 12 Nov | 4, 6 |
| 2 | Spacecraft map | 12 Nov | 4, 6 |
| 3 | Lunar outpost and surface maps | 12–13 Nov | 4, 6 |
| 4 | Decision panel and first playable challenge | 12 Nov | 1–3, 6 |
| 5 | Core loop: four challenges, endings, debrief | 13 Nov | 6 |
| 6 | Real NASA data and source table | 12–13 Nov (done 14 Nov) | 1–5, 7 |
| 7 | Crew | 13 Nov (done 14 Nov) | 6, 8 |
| 8 | All remaining decision challenges | 13–14 Nov | 7 |
| 9 | Rover drive | 14 Nov | 10 |
| 10 | Art, cutscenes and sound | 14 Nov | 9 |
| 11 | Playtest, balance and performance | 14–15 Nov | — |
| 12 | Judge-ready submission | 15 Nov | — |

The team says building before 14 November is allowed but a grey area. Get the local lead to confirm before relying on these dates.

## The maps at a glance

| Map | Phase | Rooms or zones | Challenges and scenes there |
| --- | --- | --- | --- |
| 1. Launch center | Pre-launch | Briefing room, cargo hangar, crew quarters, launch tower | 1 (power source), 2 (pack cargo), night-before talk, launch cutscene |
| 2. Spacecraft | Transit | Cockpit, life support bay, storm shelter, galley and bunks | 3 (scrubber fault), 4 (storm in transit), 5 (landing site), crew talk |
| 3. Outpost interior | Lunar outpost | Airlock, power bay, greenhouse, crew quarters, storm shelter, command | 6 (wake the base), 7 (greenhouse), 8 starts at the airlock, 9 (tired crew), 10 (solar storm), 12 (lunar night) |
| 4. Lunar surface | Lunar outpost | Landing pad, solar field, regolith site, ice crater, battery range ring | Arrival, 8 (rover and ice), 11 (broken solar panel) |

---

## Phase 0: Project setup (done)

**Goal:** a clean repo the whole team can build on.

- Vite, React 19, TypeScript, three.js, React Three Fiber and zustand scaffold.
- Placeholder HUD: three meters, food counter, four crew faces, challenge counter.
- Mission state (`src/state/mission.ts`), twelve challenge definitions (`src/data/challenges.ts`), empty source table (`src/data/sources.json`).
- Low graphics preset as default; dev-only frame-rate counter.
- README and ASSETS files.

**Done when:** `npm run build` passes and all files are on `main` in `MrRishabThapa/lunarOutpost`. *Status: done, 23 commits pushed.*

## Phase 1: Pre-launch map (launch center)

**Goal:** the first walkable map, plus the shared building blocks every later map reuses.

- **Map data format:** one file per map listing rooms, walls, doors, consoles and props in metres. The 3D rooms, collision and minimap are all generated from it, so changing a layout means editing numbers.
- **Shared kit:** wall, floor, ceiling, door, window and console pieces as plain greybox shapes. All three indoor maps use the same kit.
- **Player:** first-person movement (W A S D, mouse look, arrow keys to turn) plus click-to-walk for younger players.
- **Collision:** the player can't walk through walls, consoles or props. No physics engine.
- **Console interaction:** walking up to a console shows a "Press E" prompt. For now it opens an empty placeholder panel.
- **Minimap:** drawn from the map data, showing rooms, doors, consoles and the player.
- **Launch center layout:** a short corridor with four rooms.
  - Briefing room: console for challenge 1 (power source).
  - Cargo hangar: console for challenge 2 (pack the cargo).
  - Crew quarters: marker for the night-before-launch cutscene.
  - Launch tower: exit to the spacecraft, with a marker for the launch cutscene.
- **Map loader:** a way to switch between maps, so Phase 2 can plug straight in.

**Done when:** a player walks the launch center, can't pass through walls, reaches both challenge consoles, and the frame rate stays above 30 on the dev laptop.

## Phase 2: Spacecraft map

**Goal:** the transit map, built from the Phase 1 kit.

- **Layout:** a compact module with four areas.
  - Cockpit: console for challenge 5 (pick the landing site).
  - Life support bay: console for challenge 3 (scrubber fault).
  - Storm shelter: console for challenge 4 (storm in transit), the best-shielded spot on the ship.
  - Galley and bunks: where crew talk happens.
- **Windows:** at least one window with a simple view of Earth shrinking and the Moon growing.
- **Transition in:** leaving the launch tower loads the spacecraft (a fade for now; the launch cutscene comes in Phase 10).
- **Transition out:** after challenge 5, the ship lands and loads the outpost (a fade for now).

**Done when:** a player goes from the launch center to the spacecraft, walks it, and reaches all three challenge consoles.

## Phase 3: Lunar outpost and surface maps

**Goal:** the outpost interior and the lunar surface outside it, where most of the game happens.

- **Outpost interior:** a corridor with six rooms.
  - Airlock: the door to the surface and the rover (challenge 8 starts here).
  - Power bay: console for challenge 6 (wake the base).
  - Greenhouse: console for challenge 7.
  - Crew quarters: console for challenge 9 (tired crew).
  - Storm shelter: console for challenge 10 (solar storm).
  - Command: console for challenge 12 (lunar night), plus the antenna controls.
- **Base lighting hook:** lights read the Power meter, dimming when low and turning red when critical.
- **Lunar surface (greybox):** ground from a height function with a few craters and rocks, and a flat pad under the outpost.
  - Landing pad, next to the outpost.
  - Solar field, next to the outpost (challenge 11).
  - Regolith site, close by.
  - Ice crater, near the edge of the battery range (challenge 8).
  - Battery range ring, shown on the surface map.
- **Airlock transition:** going through the airlock loads the surface. Walking on the surface is enough for now; the rover comes in Phase 9.
- **Surface minimap:** zoomed out, with pings on the ice crater and regolith site.

**Done when:** a player walks the outpost, reaches all five challenge consoles, steps out through the airlock onto the surface and back, and the frame rate holds on both maps.

## Phase 4: Decision panel and first playable challenge

**Goal:** one challenge a player can actually play, start to finish. Can run alongside Phases 1–3.

- Build one shared decision panel that reads a challenge definition from data.
- Show three options, each with a preview of which meters go up or down and roughly how much.
- Show the exact result after the player commits, then apply it through the store.
- Build the "split" variant for challenges where the player divides an amount.
- Wire up challenge 2, pack the cargo (ten mass blocks across supplies, shielding, power gear, spare parts), to the cargo hangar console.
- Add a timer option for timed decisions, used later by the solar storm.

**Done when:** a player walks to the cargo hangar console, packs the cargo, sees the preview, commits, and watches the meters change.

## Phase 5: Core loop with four challenges, endings and debrief

**Goal:** a short but complete run that already teaches the main idea. If everything after this fails, this is the fallback demo.

- Wire up challenges 6 (wake the base), 10 (solar storm) and 12 (lunar night) to their outpost consoles, using placeholder storm data for now.
- Make remembered choices work: later challenges check earlier ones, and a crew line explains the link ("We'd fix this if we'd packed spares").
- Confirm the six remembered choices with Rishab: packed no spares, packed no shielding, chose solar only, worked through the transit storm, skipped planting, lost the rover.
- Build the four endings: outpost thrives, mission complete, early return for supplies, early return for crew health.
- Build the debrief: the chain of choices and what each one cost, plus dose against the mission limit.
- Add "Try again" that starts a fresh run.

**Done when:** a player can go from challenge 2 to an ending, and two different strategies produce two different endings.

## Phase 6: Real NASA data and source table (done)

**Goal:** every number in the game is traceable to a real source. This is what judges check for validity. Research can start now, alongside the map phases.

- Fetch a small set of real solar flare and storm events from NASA's DONKI API (5–10 events, with dates and strengths). Record the retrieval date.
- Embed them as a JSON file. The storm shows the event's real date and "Source: NASA DONKI (archived data)". Never call it live.
- Research real values for power sources, scrubbers, radiation dose limits, lunar night length, water ice and food production.
- Fill `sources.json`: every outcome gets a NASA source, an owner and a reviewer.
- Replace placeholder numbers in `challenges.ts` as sources come in, starting with challenges 2, 6, 10 and 12.
- Show sources in the game (on the debrief or a "Where these numbers come from" screen).

**Done when:** challenges 2, 6, 10 and 12 have no `TODO: source` left, and the storm uses a real DONKI event. *Status: done 14 Nov. All 38 outcomes have references (21 NASA and CSA documents, each opened and read), dose is in real mSv against NASA's 250 mSv limit, the storm is a real archived DONKI flare, the Sun's last 30 days show live from DONKI, and five OSDR studies are linked. Still open: a second person to fill in `reviewer` in `src/data/sources.json`; first-guess sizes in challenges 3, 4, 5, 7, 8, 9 and 11. Checked by `tools/checks/data.mts`; see `docs/DATASETS.md`.*

## Phase 7: Crew (done)

**Goal:** four crew members whose disagreements carry the decisions.

- The veteran commander, the safety and medical officer, the science officer (the player's best friend since primary school) and the communications officer.
- Place crew in the maps as simple standing figures near the rooms they care about.
- Write each crew member's lines for every challenge: two crew argue opposite sides, and the player decides.
- Crew health faces (green, yellow, red) driven by dose, food, air and overwork.
- A crew member in red must rest, and the player loses their help (no hints, no risk numbers, half greenhouse yield, or no messages from Earth).
- Three dose levels: low (recorded only), moderate (health drops, some options unavailable), high (mission ends early).
- No separate tutorial: the crew teaches the controls in character in the launch center, during challenge 1.
- Keep every line to one or two short sentences, written for ages 7–12. Explain terms like "radiation dose" the first time they appear.

**Done when:** every challenge built so far has two crew voices, and a crew member going red visibly changes the next decision. *Status: done 14 Nov. Challenges 1 and 2 pair the trainer with Houston by radio (only they speak in the launch center); crew stand in their rooms and lie in a bunk while resting; resting removes the commander's advice, hides the medic's dose and health arrows, or halves the greenhouse; the moderate dose level makes everyone unwell once and refuses high-dose options; the trainer teaches the controls on cards; science words are explained the first time. Lines for challenges 3 to 11 come with Phase 8. Checked by `tools/checks/data.mts`.*

## Phase 8: All remaining decision challenges

**Goal:** the full twelve-challenge run, minus the rover drive.

- Challenge 1: choose the power source (briefing room).
- Challenge 3: scrubber fault (spacecraft life support bay).
- Challenge 4: storm in transit (spacecraft storm shelter).
- Challenge 5: pick the landing site (cockpit).
- Challenge 7: greenhouse.
- Challenge 9: tired crew (crew quarters).
- Challenge 11: broken solar panel (solar field).
- Add the antenna as a power user that unlocks messages from Earth.
- Source the numbers for each, as in Phase 6.

**Done when:** a full run plays from challenge 1 to an ending across all four maps, with challenge 8 temporarily replaced by a simple decision.

## Phase 9: Rover drive

**Goal:** challenge 8 as free driving across the lunar surface built in Phase 3.

- First-person driving from the rover seat, following the terrain height. No physics engine.
- Battery percentage that drains while driving, with a "home line" showing the charge needed to get back.
- At the home line: one hologram warning from the safety officer. If the player keeps going: a self-talk notification ("I really shouldn't go further").
- If the battery runs out: the crew fetches the player, it costs a day and adds dose, and the rover is lost for challenge 11.
- At the ice crater: extract now, run a small trial, or delay and ration.

**Done when:** a player drives from the airlock to the ice and back, and running the battery flat has the planned consequences.

**If behind schedule:** fall back to a set route with three stops and the same battery gauge.

## Phase 10: Art, cutscenes and sound

**Goal:** dress the greybox maps so the game looks and feels finished.

- Settle the art style first: semi-realistic, or low-poly flat-shaded.
- Replace greybox pieces in the shared kit with finished ones; every map updates at once.
- Lighting, textures and props for all four maps. Keep the low preset fast.
- Crew portraits in one consistent style, generated with Higgsfield (needs credits or the free trial).
- One shared suited, low-poly crew body in four suit colours, visors down.
- Cutscenes, 10–20 seconds each and skippable:
  - Crew quarters, before 1: the night-before-launch talk with the best friend (illustrated panels).
  - Launch tower, before 3: rocket launch (real NASA footage, or a generated clip).
  - Landing pad, before 6: arrival walk through the airlock with the veteran (in-engine).
  - Greenhouse, before 7: the empty greenhouse (in-engine).
  - Airlock, before 8: the airlock opens and the rover rolls out (in-engine).
  - Storm shelter, before 10: storm alarm, crew runs for the shelter (in-engine).
  - Command, before 12: the veteran's story of a call he got wrong (illustrated panels).
  - Ending: Earthrise with the crew.
- Optional sound: alarm, base hum, rover. Use free CC0 sounds only.
- Record every asset's source and licence in `ASSETS.md`.

**Done when:** every map is dressed, every cutscene plays, every asset is in `ASSETS.md`, and the frame rate still holds.

**If behind schedule:** keep only the cutscenes before 6, 8 and 10; turn the rest into one line of dialogue.

## Phase 11: Playtest, balance and performance

**Goal:** the game works for real kids and on judges' laptops.

- Play the full run several times with different strategies. Check that no option is best on every meter and that every ending is reachable.
- If possible, have a child aged 7–12 play it. Watch where they get stuck, get lost in a map, or stop reading.
- Cut any text that's too long. Check every science term is explained.
- Performance: test on the dev laptop with the browser and other apps closed. Add an automatic drop in quality if the frame rate falls below 30.
- Test in Chrome and Firefox, at least.
- Test the offline demo build (`npm run build`, then `npm run preview`) with the network switched off.
- Fix bugs. Freeze new features at the start of this phase.

**Done when:** three full runs in a row finish with no bugs, and the offline build runs smoothly.

## Phase 12: Judge-ready submission

**Goal:** everything judges need, ready to show. Completing this phase means we're ready for the judges.

- **Make the repository public.** It's currently private; the submission needs a public repo.
- **Deploy** the game to a static host so it plays from one link with no download or login.
- **Dataset note:** one page explaining which NASA datasets we used (DONKI and others) and why.
- **Sources page:** in the game and in the repo, listing every NASA source behind the numbers.
- **Demo video:** short, showing one decision, one consequence coming back, and the debrief.
- **Slides:** problem, our game, the trade-off mechanic, the real data, what a player learns.
- **Five-minute demo script:** the first challenges must show a real trade-off on their own, since judges may not play the whole run.
- **Final README:** what it is, how to play, how to run it, data sources, team.
- **Check this year's rules:** 2026 judging criteria and submission requirements. Past years judged impact, creativity, validity, relevance and presentation.
- **Name one owner** for the submission package.

**Done when:** a judge can open one link and play, open the repo and read the code, and see exactly which NASA data the game uses. **The game is ready to show to judges.**

---

## Cut order if time runs out

Drop features in this order. The debrief, the real data and the dataset note always stay.

1. Sound.
2. Cutscenes except before 6, 8 and 10.
3. Free-driving rover (use the set route instead).
4. 3D crew bodies (keep portraits only).
5. Map dressing beyond the outpost interior (keep the other maps greybox with basic lighting).
6. Challenges 1, 3, 4, 5, 7, 9 and 11 (fall back to the Phase 5 run).

## Decisions still needed

| Decision | Needed before |
| --- | --- |
| Confirm the map layouts and room list | Phase 1 |
| Confirm the six remembered choices | Phase 5 |
| Confirm how the four endings are chosen | Phase 5 |
| Who owns art, writing, testing and the submission | Phase 6 |
| Art style: semi-realistic or low-poly | Phase 10 |
| Higgsfield credits or free trial for portraits and clips | Phase 10 |
| 2026 judging criteria and submission rules | Phase 12 |
| Local lead's written confirmation on building before 14 Nov | Now |
