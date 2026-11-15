/**
 * Lines said only as transmissions (src/hud/Transmission.tsx): the rover's
 * hologram and the hazard alerts. Each has a lineId for Shishir's voices.
 */
import type { CrewLine } from './challenges'

/** The safety officer, as a hologram above the rover, when the battery reaches the home line. */
export const ROVER_LOW_BATTERY: CrewLine = { speakerId: 'safety', lineId: 'rover-low-battery', text: 'You have just enough charge to get home. Turn back now.' }

/** A solar storm with no warning from Houston (no antenna power): the alarm. */
export const ALERT_STORM: CrewLine = { speakerId: 'safety', lineId: 'alert-storm', text: 'Solar storm! The radiation is coming. Decide fast.' }

/** A meteoroid hits a solar panel. */
export const ALERT_METEOROID: CrewLine = { speakerId: 'commander', lineId: 'alert-meteoroid', text: 'Something just hit a solar panel. Let’s look at the damage.' }

export const TRANSMISSION_LINES: readonly CrewLine[] = [ROVER_LOW_BATTERY, ALERT_STORM, ALERT_METEOROID]
