/**
 * The four endings. None is a death screen: at worst the crew comes home
 * early and safe. The run's final state picks one (resolveEnding and
 * checkFailure in src/state/mission.ts; the cut-offs are placeholders,
 * TODO: source). The card closes with one line from the crew member whose
 * advice the player followed most (`advisedBy` on each option).
 */
import type { CrewLine } from './challenges'
import type { Ending, SpeakerId } from '../state/mission'

export interface EndingText {
  title: string
  /** One or two sentences for ages 7 to 12. */
  text: string
  /** True for the two good endings. */
  good: boolean
}

export const ENDINGS: Record<Ending, EndingText> = {
  'outpost-thrives': {
    title: 'The outpost thrives',
    text: 'Everything is running well and the whole crew is healthy. The mission is extended, and a second crew is on its way.',
    good: true,
  },
  'mission-complete': {
    title: 'Mission complete',
    text: 'The base made it through. Nothing broke beyond repair, and the crew flies home on schedule.',
    good: true,
  },
  'early-return-supplies': {
    title: 'Early return: supplies ran short',
    text: 'The base ran too low to keep going, so the crew packed up and flew home early. Everyone is safe.',
    good: false,
  },
  'early-return-health': {
    title: 'Early return: crew health',
    text: 'The crew took too much radiation or got too worn out. The safety officer sent everyone home early, and they are safe.',
    good: false,
  },
}

/** Each speaker's closing line, for a good ending and an early return. */
export const CLOSING_LINES: Record<SpeakerId, { good: CrewLine; early: CrewLine }> = {
  commander: {
    good: { speakerId: 'commander', lineId: 'end-commander-good', text: 'You kept a cool head and a safety margin. I’d fly with you again.' },
    early: { speakerId: 'commander', lineId: 'end-commander-early', text: 'Coming home early is not failing. We all get home, and next time we plan better.' },
  },
  safety: {
    good: { speakerId: 'safety', lineId: 'end-safety-good', text: 'Nobody got hurt. That’s the best report a safety officer can write.' },
    early: { speakerId: 'safety', lineId: 'end-safety-early', text: 'Sending everyone home was the right call. The crew always comes first.' },
  },
  science: {
    good: { speakerId: 'science', lineId: 'end-science-good', text: 'We grew food on the Moon! I can’t wait to tell everyone back home.' },
    early: { speakerId: 'science', lineId: 'end-science-early', text: 'We learned a lot, even if it was hard. That’s what science is for.' },
  },
  comms: {
    good: { speakerId: 'comms', lineId: 'end-comms-good', text: 'Houston here. Great work up there. Everyone down here is cheering.' },
    early: { speakerId: 'comms', lineId: 'end-comms-early', text: 'Houston here. We’re bringing you home. You did everything you could.' },
  },
  trainer: {
    good: { speakerId: 'trainer', lineId: 'end-trainer-good', text: 'Your choices back on Earth paid off on the Moon. That’s what training is for.' },
    early: { speakerId: 'trainer', lineId: 'end-trainer-early', text: 'Every trade-off you made taught you something. Let’s train again.' },
  },
}
