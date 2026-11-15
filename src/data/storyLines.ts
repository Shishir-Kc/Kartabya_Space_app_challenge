/**
 * The story through the spacecraft (`p2-`) and the outpost (`p3-`), in the
 * voice of Shishir's launch center script (src/data/phase1Lines.ts): short
 * lines, the player's name, crew who need the player's help, and hand-offs
 * that lead to the next task. Every sentence has 12 words or fewer, and no
 * line says a crew member's name (the names may change; the recordings
 * shouldn't have to).
 *
 * Where each plays is in src/scene/story.ts. Whether a line is said in
 * person or by hologram depends on where the speaker is when it plays;
 * Houston is always on the radio.
 */
import type { CrewLine } from './challenges'
import type { Emotion } from './emotions'

const line = (speakerId: CrewLine['speakerId'], lineId: string, emotion: Emotion, text: string): CrewLine => ({ speakerId, lineId, emotion, text })

/** The spacecraft. */
export const P2 = {
  // After unbuckling.
  welcome1: line('commander', 'p2-commander-01', 'happy', 'Welcome to microgravity, {name}! Push off gently. Nothing weighs anything up here.'),
  welcome2: line('commander', 'p2-commander-02', 'calm', 'Our safety officer is in life support, at the back. Go and help.'),
  // Task 3, the scrubber fault.
  ask3: line('safety', 'p2-safety-01', 'worried', 'Hey {name}, the air scrubber is failing. Can you help me decide?'),
  good3: line('safety', 'p2-safety-02', 'happy', 'That did it. The air is clean again. Thank you!'),
  risky3: line('safety', 'p2-safety-03', 'worried', 'We’ll manage. But stuffy air will make us all tired.'),
  next3: line('commander', 'p2-commander-03', 'calm', 'Good work. Come up to the cockpit. We need to pick where to land.'),
  // The storm in transit: whoever the player sheltered with.
  stormSheltered: line('science', 'p2-science-01', 'calm', 'That was close. I’m glad we all fit in there.'),
  stormPart: line('safety', 'p2-safety-04', 'worried', 'Those of us outside took a dose. Let’s be more careful.'),
  stormWorked: line('safety', 'p2-safety-05', 'sad', 'The repair is done, but we all took radiation. It adds up.'),
  // Task 5, the landing site.
  ask5: line('commander', 'p2-commander-04', 'calm', '{name}, help me pick where we land. Our outpost is already waiting down there.'),
  after5: line('commander', 'p2-commander-05', 'excited', 'Strap in. We’re going down.'),
} as const satisfies Record<string, CrewLine>

/** The outpost. */
export const P3 = {
  // Inside, after the airlock.
  welcome: line('commander', 'p3-commander-01', 'calm', 'Welcome home, {name}. First job: wake the base. The power bay is this way.'),
  // Task 6, wake the base.
  ask6: line('commander', 'p3-commander-02', 'calm', 'The base is asleep. You share out our power, {name}. Choose well.'),
  after6: line('commander', 'p3-commander-03', 'happy', 'Lights on, air flowing. Nice work.'),
  next6: line('science', 'p3-science-01', 'excited', '{name}! Come to the greenhouse. I need your help!'),
  // Task 7, the greenhouse.
  ask7: line('science', 'p3-science-02', 'excited', '{name}! The greenhouse is ready, but water is tight. What should we plant?'),
  good7: line('science', 'p3-science-03', 'happy', 'Seeds in! We’ll have fresh food before long.'),
  risky7: line('science', 'p3-science-04', 'sad', 'No seeds this time. I hope our food lasts.'),
  next7: line('safety', 'p3-safety-01', 'worried', 'Can you come to crew quarters? The crew needs you.'),
  // Task 9, the tired crew.
  ask9: line('safety', 'p3-safety-02', 'worried', 'The crew is worn out, {name}. What should we do?'),
  good9: line('safety', 'p3-safety-03', 'calm', 'Thank you. Rested people make fewer mistakes.'),
  risky9: line('safety', 'p3-safety-04', 'worried', 'We’ll push on. Watch for anyone who looks too tired.'),
  // Task 8, the ice: Kal by hologram at the crater.
  ask8: line('science', 'p3-science-05', 'excited', 'Look at all that ice! How much should we take?'),
  good8: line('science', 'p3-science-06', 'happy', 'Water from the Moon! Bring it home safely.'),
  risky8: line('science', 'p3-science-07', 'sad', 'No ice for now. We’ll have to save water.'),
  next8: line('commander', 'p3-commander-04', 'calm', 'Head back to base, {name}. The long night is coming.'),
  // The meteoroid: the commander asks after the alert.
  ask11: line('commander', 'p3-commander-05', 'urgent', 'A panel has been hit, {name}. How should we fix it?'),
  replaced11: line('commander', 'p3-commander-06', 'happy', 'Good as new. We’ll need that power tonight.'),
  patched11: line('commander', 'p3-commander-07', 'calm', 'It will hold. Half power is better than none.'),
  left11: line('commander', 'p3-commander-08', 'worried', 'Less power, then. We’ll have to be careful tonight.'),
  // The outpost storm, afterwards.
  stormSheltered: line('science', 'p3-science-08', 'calm', 'Safe in here. Thanks for getting us all inside.'),
  stormExposed: line('safety', 'p3-safety-05', 'worried', 'That storm hit us hard. Next time, we all shelter.'),
  // Task 12, after the commander's story.
  ask12: line('commander', 'p3-commander-09', 'calm', 'The long night is coming, {name}. How do we get through it?'),
} as const satisfies Record<string, CrewLine>

/** One line on each night card, about the day (in turn). */
export const NIGHT_LINES: readonly CrewLine[] = [
  line('science', 'p3-science-09', 'happy', 'Long day. The plants look happy, though.'),
  line('safety', 'p3-safety-06', 'calm', 'Everyone is tucked in. Get some sleep, {name}.'),
  line('commander', 'p3-commander-10', 'proud', 'Another day done. Tomorrow we keep going.'),
  { ...line('comms', 'p3-comms-01', 'calm', 'Houston here. Good night, outpost. We’re watching over you.') },
]

/** Every story line (for the voices, the script and the checks). */
export const STORY_LINES: readonly CrewLine[] = [...Object.values(P2), ...Object.values(P3), ...NIGHT_LINES]
