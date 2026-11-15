import { useMemo } from 'react'
import { CHALLENGES, getChallenge } from '../data/challenges'
import { stormCount } from '../state/hazards'
import { Portrait } from './art/Portrait'
import { requireMap } from '../maps/registry'
import { previewEffects } from '../scene/challenges'
import { useObjective } from '../scene/objective'
import { blockedBy, ghostMeters } from '../state/decisions'
import {
  CAST,
  CREW,
  CREW_IDS,
  METER_IDS,
  METER_LABELS,
  PLAYER_ROLE,
  type Health,
  type MeterId,
} from '../state/mission'
import { useGame } from '../state/store'
import { useEasedNumber } from './useEasedNumber'
import './hud.css'

/** A meter below this shows its warning colour; the tick on the bar marks it. */
const WARNING_LINE = 30
const CRITICAL_LINE = 15

const HEALTH_WORDS: Record<Health, string> = {
  green: 'Good',
  yellow: 'Tired',
  red: 'Must rest',
}

/**
 * One meter. While a decision is previewed, `ghost` is where it would end
 * up: a striped bar past the fill when it would rise, a striped cut over the
 * fill when it would fall. No number is shown for it.
 */
function Meter({ id, value, ghost }: { id: MeterId; value: number; ghost: number | null }) {
  const shown = useEasedNumber(value)
  const level = value <= CRITICAL_LINE ? 'critical' : value < WARNING_LINE ? 'warning' : 'ok'
  const rising = ghost !== null && ghost > value
  const falling = ghost !== null && ghost < value
  const low = Math.min(value, ghost ?? value)
  const span = Math.abs((ghost ?? value) - value)
  return (
    <div className="meter" data-meter={id} data-level={level} data-preview={rising ? 'up' : falling ? 'down' : undefined}>
      <div className="meter__head">
        <span className="meter__label">{METER_LABELS[id]}</span>
        <span className="meter__value num">{Math.round(shown)}%</span>
      </div>
      <div
        className="meter__track"
        role="meter"
        aria-label={METER_LABELS[id]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
      >
        {rising && <div className="meter__ghost meter__ghost--up" style={{ left: `${low}%`, width: `${span}%` }} />}
        <div className="meter__fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, value / 100))})` }} />
        {falling && <div className="meter__ghost meter__ghost--down" style={{ left: `${low}%`, width: `${span}%` }} />}
        <span className="meter__tick" aria-hidden="true" />
      </div>
    </div>
  )
}

function FoodChip({ days, preview }: { days: number; preview: number }) {
  const shown = useEasedNumber(days)
  return (
    <p className="food glass glass--pill enter" data-level={days <= 2 ? 'critical' : days <= 4 ? 'warning' : 'ok'}>
      <svg className="food__icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2c-3 3.2-4.5 6-4.5 8.4a4.5 4.5 0 0 0 9 0C14.5 8 13 5.2 10 2Z" />
        <path d="M10 18v-6" />
      </svg>
      <span className="food__count num">{Math.round(shown)}</span>
      <span className="food__label">days of food</span>
      {preview !== 0 && (
        <span className="food__preview" data-direction={preview > 0 ? 'up' : 'down'} aria-label={preview > 0 ? 'would go up' : 'would go down'}>
          {preview > 0 ? '▲' : '▼'}
        </span>
      )}
    </p>
  )
}

/**
 * The always-on HUD: resource meters and food (top left), the crew
 * (top right) and the challenge banner (bottom centre).
 */
export function Hud() {
  const mission = useGame((state) => state.mission)
  const astronaut = useGame((state) => state.astronaut)
  const mapId = useGame((state) => state.mapId)
  const used = useGame((state) => state.usedConsoles)
  // Hidden while the launch or landing cinematic plays; back afterwards.
  const cinematic = useGame((state) => state.sequence !== null)
  // The ending and the debrief have the screen to themselves.
  const afterword = useGame((state) => state.afterword)
  // A decision panel is open: the meters preview the option, the banner steps aside.
  const session = useGame((state) => state.challenge)
  const preview = useMemo(() => previewEffects(session, mission), [session, mission])
  const ghosts = useMemo(() => (preview ? ghostMeters(mission, preview) : null), [mission, preview])
  const foodPreview = preview ? Math.max(0, mission.foodDays + (preview.foodDays ?? 0)) - mission.foodDays : 0
  // Until the challenges are real (Phase 4): the next challenge on this map
  // the player hasn't done yet, or a line to explore when there's none.
  const map = requireMap(mapId)
  const trainerHere = mapId === 'launch-center'
  const here = [
    ...map.consoles.map((item) => item.challengeId),
    ...map.markers.flatMap((marker) => (marker.kind === 'challenge' ? [marker.challengeId] : [])),
  ].sort((a, b) => a - b)
  // The next ready challenge the player can open here (not the storm, which comes by itself,
  // nor the lunar night while it waits), else the next console not reached yet.
  const open = (id: number) => {
    const item = getChallenge(id)
    return !!item?.ready && item.trigger !== 'event' && !blockedBy(item, mission) && !used.includes(id)
  }
  const fallback = here.find(open) ?? here.find((id) => !used.includes(id) && !getChallenge(id)?.ready) ?? null
  // What to do now (src/scene/objective.ts): it follows the story's every direction. Without it, the task's title.
  const objective = useObjective((state) => state.objective)
  const next = objective ? objective.task : fallback
  const challenge = next !== null ? getChallenge(next) : null
  // The planned mission is nine tasks; storms and meteoroids are luck, counted beside them.
  const tasks = CHALLENGES.filter((item) => item.ready && !item.hazard).map((item) => item.id)
  const taskNumber = next !== null ? tasks.indexOf(next) + 1 : 0
  const title = objective?.step ?? challenge?.title ?? `Explore the ${map.name.toLowerCase()}`
  const storms = stormCount(mission)
  void mission.currentChallenge
  if (cinematic || afterword) return null

  return (
    <div className="hud" data-challenge={session ? 'open' : undefined}>
      <div className="hud__left">
        {astronaut && (
          <p className="player-chip glass glass--pill enter">
            <span className="player-chip__avatar" aria-hidden="true">
              {astronaut.name.charAt(0).toUpperCase()}
            </span>
            <span className="player-chip__text">
              <span className="player-chip__name">{astronaut.name}</span>
              <span className="player-chip__role">{PLAYER_ROLE}</span>
            </span>
          </p>
        )}
        <section className="hud__meters glass enter" aria-label="Outpost meters">
          {METER_IDS.map((id) => (
            <Meter key={id} id={id} value={mission.meters[id]} ghost={ghosts ? ghosts[id] : null} />
          ))}
        </section>
        <FoodChip days={mission.foodDays} preview={foodPreview} />
        {mapId === 'outpost' && (
          <p className="day-chip glass glass--pill enter" aria-label={`Mission day ${mission.day}`}>
            Day <span className="num">{mission.day}</span>
          </p>
        )}
      </div>

      <section className="hud__crew glass enter" aria-label="Crew">
        <ul className="crew-list">
          {CREW_IDS.map((id) => {
            const member = CREW[id]
            const health = mission.crewHealth[id]
            return (
              <li key={id} className="crew">
                <span className="crew__portrait" data-health={health} aria-hidden="true">
                  <Portrait speaker={id} still />
                </span>
                <span className="crew__text">
                  <span className="crew__name">{member.name}</span>
                  <span className="crew__role">{health === 'red' && member.lostWhileResting ? member.lostWhileResting : member.shortRole}</span>
                </span>
                <span className="crew__status" data-health={health}>
                  {HEALTH_WORDS[health]}
                </span>
              </li>
            )
          })}
        </ul>
        <ul className="crew-extra">
          {/* Mission control is on Earth: a radio chip, no health face. */}
          <li className="radio-chip" title={CAST.comms.role}>
            <span className="radio-chip__face" aria-hidden="true">
              <Portrait speaker="comms" radio still />
            </span>
            <span className="radio-chip__text">
              Mission control <span className="radio-chip__name">{CAST.comms.name}</span>
            </span>
          </li>
          {trainerHere && (
            <li className="radio-chip radio-chip--trainer" title={CAST.trainer.role}>
              <span className="radio-chip__face" aria-hidden="true">
                <Portrait speaker="trainer" still />
              </span>
              <span className="radio-chip__text">
                Trainer <span className="radio-chip__name">{CAST.trainer.name}</span>
              </span>
            </li>
          )}
        </ul>
      </section>

      <div className="hud__bottom" hidden={session !== null}>
        <section className="banner glass enter" aria-label="Current challenge">
          <p className="banner__text">
            <span className="banner__count">
              {next !== null && taskNumber > 0 ? (
                <>
                  Task <span className="num">{taskNumber}</span> of <span className="num">{tasks.length}</span>
                </>
              ) : objective ? (
                'Every task done'
              ) : (
                'Nothing left to do here'
              )}
            </span>
            <span key={title} className="banner__title enter">
              {title}
            </span>
            {objective?.hint && <span className="banner__hint">{objective.hint}</span>}
          </p>
          <ol className="banner__progress" style={{ gridTemplateColumns: `repeat(${tasks.length}, 1fr)` }} aria-hidden="true">
            {tasks.map((number) => {
              const state = used.includes(number) ? 'done' : number === next ? 'current' : 'todo'
              return <li key={number} data-state={state} />
            })}
          </ol>
          <p className="banner__hazards" aria-label={`Hazards so far: ${storms} storms and ${mission.hazards.meteoroid} meteoroids`}>
            Storms <span className="num">{storms}</span> · Meteoroids <span className="num">{mission.hazards.meteoroid}</span>
          </p>
        </section>
      </div>
    </div>
  )
}
