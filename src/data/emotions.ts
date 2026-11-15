/**
 * How each line is said: the face the speaker's portrait makes while saying
 * it (src/hud/art/Portrait.tsx). Shishir's voice script gives each of its
 * lines an emotion; it wasn't readable from here, so these follow the team's
 * rules and wait for his review:
 *
 * - storm and meteoroid warnings: urgent;
 * - consequences that bite: worried or sad;
 * - praise and good results: happy or proud;
 * - reminders: calm;
 * - the best friend's launch-night line: excited.
 *
 * `tools/checks/data.mts` checks every line in the game has one.
 */
import type { CrewLine } from './challenges'

export type Emotion = 'neutral' | 'happy' | 'excited' | 'worried' | 'urgent' | 'sad' | 'calm' | 'proud'

export const EMOTIONS: readonly Emotion[] = ['neutral', 'happy', 'excited', 'worried', 'urgent', 'sad', 'calm', 'proud']

export const LINE_EMOTION: Record<string, Emotion> = {
  // Shishir's Phase 1 script (src/data/phase1Lines.ts): the script's own
  // emotions, each turned into the nearest of the eight faces.
  'p1-trainer-01': 'happy', // warm, energetic
  'p1-science-01': 'excited', // happy, excited, a little breathless
  'p1-trainer-02': 'proud', // friendly, proud
  'p1-trainer-03': 'happy', // friendly
  'p1-commander-01': 'happy', // dry, amused
  'p1-trainer-04': 'happy', // laughs
  'p1-trainer-05': 'happy', // welcoming
  'p1-trainer-06': 'calm', // clear, storytelling
  'p1-trainer-07': 'calm', // clear, storytelling
  'p1-trainer-08': 'calm', // clear, storytelling
  'p1-trainer-09': 'calm', // clear, storytelling
  'p1-trainer-10': 'calm', // serious, but kind
  'p1-safety-01': 'calm', // calm, firm
  'p1-commander-02': 'calm', // steady
  'p1-trainer-11': 'happy', // inviting
  'p1-trainer-12': 'proud', // approving
  'p1-trainer-13': 'happy', // warm, wrapping up
  'p1-science-02': 'happy', // teasing
  'p1-comms-03': 'neutral', // curious, slightly testing
  'p1-comms-04a': 'calm', // kind, but firm
  'p1-comms-04b': 'happy', // pleased
  'p1-comms-05': 'happy', // light
  'p1-science-04': 'happy', // playful
  'card-lc-move': 'happy', // the trainer's welcome card
  'card-lc-guide': 'calm',
  'p1-comms-01': 'happy', // warm, upbeat
  'p1-comms-02': 'calm', // reassuring
  'p1-science-03': 'happy', // cheerful
  'p1-science-05': 'proud', // satisfied
  'p1-comms-06': 'proud', // crisp, proud
  'p1-comms-07': 'happy', // upbeat
  'p1-trainer-14': 'proud', // proud, a little emotional
  'p1-trainer-15': 'happy', // smiling
  // Challenge 1: the power source.
  'c01-line-1': 'happy',
  'c01-line-2': 'worried',
  'c01-reminder': 'calm',
  // Challenge 2: the cargo.
  'c02-line-1': 'worried',
  'c02-line-2': 'neutral',
  'c02-reminder': 'calm',
  // Challenge 3: the scrubber.
  'c03-line-1': 'calm',
  'c03-line-2': 'neutral',
  'c03-reminder': 'calm',
  'c03-a-locked': 'sad',
  // Challenge 4: the storm in transit.
  'c04-line-1': 'urgent',
  'c04-line-2': 'worried',
  'c04-line-1b': 'urgent',
  'c04-line-2b': 'worried',
  'c04-line-1c': 'urgent',
  'c04-line-2c': 'worried',
  'c04-reminder': 'calm',
  'c04-houston': 'urgent',
  'bite-no-shielding-transit': 'worried',
  // Challenge 5: the landing site.
  'c05-line-1': 'excited',
  'c05-line-2': 'neutral',
  'c05-a-ruled-out': 'calm', // talking the player round to the slope, kindly
  'c05-b-ruled-out': 'calm',
  'c05-reminder': 'calm',
  // Challenge 6: waking the base.
  'c06-line-1': 'neutral',
  'c06-line-2': 'worried',
  'c06-reminder': 'calm',
  // Challenge 7: the greenhouse.
  'c07-line-1': 'excited',
  'c07-line-2': 'worried',
  'c07-reminder': 'calm',
  // Challenge 8: the ice.
  'c08-line-1': 'excited',
  'c08-line-2': 'worried',
  'c08-reminder': 'calm',
  'c08-briefing': 'calm',
  // Challenge 9: the tired crew.
  'c09-line-1': 'calm',
  'c09-line-2': 'worried',
  'c09-reminder': 'calm',
  // Challenge 10: the storm at the outpost.
  'c10-line-1': 'urgent',
  'c10-line-2': 'excited',
  'c10-line-1b': 'urgent',
  'c10-line-2b': 'worried',
  'c10-line-1c': 'urgent',
  'c10-line-2c': 'worried',
  'c10-houston': 'urgent',
  'bite-transit-dose': 'worried',
  'bite-no-shielding': 'worried',
  'bite-no-antenna': 'sad',
  'bite-worked-in-storm': 'sad',
  // Challenge 11: the broken panel.
  'c11-line-1': 'calm',
  'c11-line-2': 'worried',
  'c11-line-1b': 'urgent',
  'c11-line-2b': 'worried',
  'c11-line-1c': 'worried',
  'c11-line-2c': 'worried',
  'c11-reminder': 'calm',
  'c11-a-locked': 'sad',
  'bite-no-rover-walk': 'worried',
  'bite-no-rover-patch': 'worried',
  // Challenge 12: the lunar night.
  'c12-line-1': 'calm',
  'c12-line-2': 'worried',
  'c12-reminder': 'calm',
  'c12-houston': 'worried',
  'bite-solar-night': 'sad',
  // Nights.
  'bite-no-spares': 'sad',
  'bite-few-supplies': 'worried',
  'bite-pushed-on': 'worried',
  'bite-skipped-planting': 'sad',
  'bite-rationing': 'worried',
  'bite-rover-tow': 'sad',
  'dose-moderate': 'worried',
  // The endings.
  'end-commander-good': 'proud',
  'end-commander-early': 'calm',
  'end-safety-good': 'proud',
  'end-safety-early': 'calm',
  'end-science-good': 'happy',
  'end-science-early': 'calm',
  'end-comms-good': 'happy',
  'end-comms-early': 'sad',
  'end-trainer-good': 'proud',
  'end-trainer-early': 'calm',
  // Story beats.
  'beat-arrival-commander': 'happy',
  'beat-night-commander-1': 'calm',
  'beat-night-commander-2': 'proud',
  // Transmissions (src/data/transmissionLines.ts).
  'rover-low-battery': 'worried',
  'alert-storm': 'urgent',
  'alert-meteoroid': 'urgent',
}

/** The face for a line: its own emotion, else its entry above, else neutral. */
export function emotionOf(line: Pick<CrewLine, 'lineId' | 'emotion'>): Emotion {
  return line.emotion ?? LINE_EMOTION[line.lineId] ?? 'neutral'
}
