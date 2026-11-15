/**
 * Shishir's Phase 1 script (the launch center): the lines the game says, by
 * the script's line ids, word for word. The scenes that say them are in
 * src/scene/beats.ts; each line's face is in src/data/emotions.ts, and its
 * recording is `public/audio/voice/<lineId>.mp3` (made with
 * `bun tools/voices.mts`).
 *
 * Where each one plays:
 * - Scene 1, crew quarters: the trainer's welcome card first, then the
 *   opening scene ("night-before"), at the start of every run.
 * - Scene 2, the walk: after the opening scene, the trainer leads the way and
 *   the crew walk with the player to the briefing room, talking in person;
 *   "Here we are" on reaching it.
 * - Scene 3, the briefing: a scene in the briefing room, starting by itself
 *   after "Here we are"; then challenge 1's panel opens. The trainer's
 *   "Good" after the choice.
 * - Scene 5, the cargo hangar: Kal on first walking in, and after packing.
 * - Scene 6: Houston's radio call after packing, and the trainer's goodbye at
 *   the crew elevator (a scene).
 *
 * - Scene 4, the communications building (the ground support building on
 *   the grounds): after challenge 1 the trainer sends the player to Houston,
 *   who waits at its door; he asks about the cargo and the player answers
 *   with one of two buttons, and he sends the player to the cargo hangar.
 *   It plays on every run.
 * - Kal's "It's full!" plays in the cargo panel when a block won't fit
 *   (packing is the panel, not the script's pallet mini game).
 * - The trainer's two teaching cards in the launch center are voiced too
 *   (`TEACHING_CARD_LINES`).
 */
import type { CrewLine } from './challenges'

const line = (speakerId: CrewLine['speakerId'], lineId: string, text: string): CrewLine => ({ speakerId, lineId, text })

export const P1 = {
  // Scene 1: crew quarters.
  trainer01: line('trainer', 'p1-trainer-01', 'Good evening, astronauts! Tonight I’m going to give you a short briefing about your mission. Follow me to the briefing room.'),
  science01: line('science', 'p1-science-01', 'Finally! It’s the day we’ve been dreaming about. We’ll be on the Moon soon!'),
  // Scene 2: the walk.
  trainer02: line('trainer', 'p1-trainer-02', 'For those who don’t know me yet: I’m your trainer. For months I’ve taught you how to fly, how to fix things, and how to stay calm when things go wrong.'),
  trainer03: line('trainer', 'p1-trainer-03', 'My job ends at the launch pad. After that, your crew and Houston will look after you.'),
  commander01: line('commander', 'p1-commander-01', 'He says that every year. Then he watches every launch with his fingers crossed.'),
  trainer04: line('trainer', 'p1-trainer-04', 'Guilty. Here we are.'),
  // Scene 3: the briefing.
  trainer05: line('trainer', 'p1-trainer-05', 'Take a seat. I’ll start the mission briefing in a moment.'),
  trainer06: line('trainer', 'p1-trainer-06', 'Tonight, your rocket carries the four of you from Earth to the Moon.'),
  trainer07: line('trainer', 'p1-trainer-07', 'You’ll spend a few days in space on the way.'),
  trainer08: line('trainer', 'p1-trainer-08', 'Then you land near the Moon’s south pole and wake up our outpost. It has been asleep, waiting for you.'),
  trainer09: line('trainer', 'p1-trainer-09', 'Up there, you’ll have to keep the power on, the air clean, the plants growing, and the radio talking to Earth.'),
  trainer10: line('trainer', 'p1-trainer-10', 'And you’ll have to make hard choices. Something that helps you today might cost you tomorrow. There’s rarely one perfect answer.'),
  safety01: line('safety', 'p1-safety-01', 'Which is why we listen to each other before we decide.'),
  commander02: line('commander', 'p1-commander-02', 'And once we decide, we stick together.'),
  trainer11: line('trainer', 'p1-trainer-11', 'Your first real decision. The outpost needs a power source, and our mission engineer gets to choose it. Listen to your crew first.'),
  trainer12: line('trainer', 'p1-trainer-12', 'Good. Remember that choice. You’ll find out on the Moon how it works out.'),
  trainer13: line('trainer', 'p1-trainer-13', 'That’s all for the briefing. Before you do anything else, why doesn’t our mission engineer pay one last visit to the communications officer? He’ll be your voice from Earth.'),
  science02: line('science', 'p1-science-02', 'Go on. I’ll save you a seat on the rocket.'),
  // Scene 4: Houston at the communications building.
  comms01: line('comms', 'p1-comms-01', 'There’s our mission engineer! Good luck tonight, astronaut. Today you leave Earth and head out into space.'),
  comms02: line('comms', 'p1-comms-02', 'And I’ll be right here the whole way. I’ll stay connected to your team by radio. If anything goes wrong, any problem at all, I’ll be the first one to help.'),
  comms03: line('comms', 'p1-comms-03', 'So tell me. Have you checked your cargo for the trip?'),
  comms04a: line('comms', 'p1-comms-04a', 'Then let’s fix that. Every kilogram on that rocket matters, so head to the cargo hangar and pack it yourself.'),
  comms04b: line('comms', 'p1-comms-04b', 'That’s the spirit. Good astronauts always check twice. The cargo hangar is next door.'),
  comms05: line('comms', 'p1-comms-05', 'I’ll call you on the radio when you’re done.'),
  // Scene 5: the cargo hangar.
  science03: line('science', 'p1-science-03', 'Thought you’d end up here. The rocket can only carry so much, so we can’t take everything. You pick.'),
  science04: line('science', 'p1-science-04', 'It’s full! Put something back if you want that one.'),
  science05: line('science', 'p1-science-05', 'Packed and sealed. No changing your mind now!'),
  // Scene 6: Houston, then the trainer's goodbye.
  comms06: line('comms', 'p1-comms-06', 'Houston here. I see your cargo is loaded. Nice work, mission engineer.'),
  comms07: line('comms', 'p1-comms-07', 'The rocket is fuelled and ready. Head to the launch pad and take the elevator up to the hatch. Your crew is waiting.'),
  trainer14: line('trainer', 'p1-trainer-14', 'This is where I leave you. You’ve trained hard for this. Trust your crew, think before you choose, and bring everyone home.'),
  trainer15: line('trainer', 'p1-trainer-15', 'Now go. The Moon is waiting.'),
} as const satisfies Record<string, CrewLine>

/** The player's two answers to Houston's cargo question (text buttons; the player is never voiced). */
export const CARGO_ANSWERS = ['Not yet, sir.', 'Yes, sir! But I can check it once more.'] as const

/**
 * The trainer's teaching cards in the launch center, voiced: the card's
 * title and words, said as the card shows (src/hud/TeachingCardView.tsx).
 */
export const TEACHING_CARD_LINES: Readonly<Record<string, CrewLine>> = {
  'lc-move': line('trainer', 'card-lc-move', 'Welcome, mission engineer! Walk with W, A, S, D and look around with the mouse. Or click on the floor, and you’ll walk there.'),
  // Added for the guidebook (not in Shishir's script yet; to record).
  'lc-guide': line('trainer', 'card-lc-guide', 'Lost? Press G any time for your guidebook: space words, where your tasks are, and every key.'),
}

/** Every Phase 1 line the game says (for the voices and the checks). */
export const PHASE1_LINES: readonly CrewLine[] = [...Object.values(P1), ...Object.values(TEACHING_CARD_LINES)]

/**
 * How each line was asked to sound when it was recorded: one gentle
 * ElevenLabs audio tag in front of the words (never shown or spoken). The
 * script's directions ("warm, energetic") were toned down to one word each,
 * so the voices have feeling without overacting. Includes challenge 1 and
 * 2's panel lines and reminders, recorded at the same time.
 */
export const VOICE_DIRECTION: Readonly<Record<string, string>> = {
  'p1-trainer-01': 'warm',
  'p1-science-01': 'excited',
  'p1-trainer-02': 'friendly',
  'p1-trainer-03': 'friendly',
  'p1-commander-01': 'amused',
  'p1-trainer-04': 'laughs',
  'p1-trainer-05': 'warm',
  'p1-trainer-06': 'calm',
  'p1-trainer-07': 'calm',
  'p1-trainer-08': 'calm',
  'p1-trainer-09': 'calm',
  'p1-trainer-10': 'serious',
  'p1-safety-01': 'calm',
  'p1-commander-02': 'calm',
  'p1-trainer-11': 'warm',
  'p1-trainer-12': 'pleased',
  'p1-trainer-13': 'warm',
  'p1-science-02': 'teasing',
  'p1-comms-03': 'curious',
  'p1-comms-04a': 'kind',
  'p1-comms-04b': 'pleased',
  'p1-comms-05': 'friendly',
  'p1-science-04': 'playful',
  'card-lc-move': 'friendly',
  'p1-comms-01': 'warm',
  'p1-comms-02': 'reassuring',
  'p1-science-03': 'cheerful',
  'p1-science-05': 'satisfied',
  'p1-comms-06': 'proud',
  'p1-comms-07': 'upbeat',
  'p1-trainer-14': 'proud',
  'p1-trainer-15': 'smiling',
  'c01-line-1': 'cheerful',
  'c01-line-2': 'concerned',
  'c01-reminder': 'calm',
  'c02-line-1': 'concerned',
  'c02-line-2': 'thoughtful',
  'c02-reminder': 'calm',
}
