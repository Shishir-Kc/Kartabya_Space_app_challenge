/**
 * Shishir's voice cast: the ElevenLabs voice for each character (his Phase 1
 * script's cast table). Used to make the recordings (tools/voices.mts) and
 * to write the voice script (docs/SCRIPT.md, tools/export-script.mts).
 */
import type { SpeakerId } from '../state/mission'

export const VOICE_CAST: Readonly<Record<SpeakerId, { voice: string; voiceId: string }>> = {
  trainer: { voice: 'Justin Time', voiceId: 'uFIXVu9mmnDZ7dTKCBTX' },
  science: { voice: 'Kai Ellen', voiceId: 'BIvP0GN1cAtSRTxNHnWS' },
  comms: { voice: 'Jack John', voiceId: '7EzWGsX10sAS4c9m9cPf' },
  commander: { voice: 'David', voiceId: 'T2sZgOl8ol4kf4u6yM2z' },
  safety: { voice: 'Patrick', voiceId: 'zs057lc0shdaAFXkm2Fm' },
}
