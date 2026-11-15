import { requireMap } from '../maps/registry'
import { useGame } from '../state/store'
import './play.css'
import './space.css'

/**
 * What the player sees while walking: the room name, the crosshair, the
 * "Press E" prompt and, when the mouse isn't captured, how to capture it.
 */
export function PlayOverlay() {
  const mode = useGame((state) => state.mode)
  // A teaching card on screen hides the "Press E" prompt, so the two never overlap.
  const focus = useGame((state) => (state.card ? null : state.focus))
  const roomLabel = useGame((state) => state.roomLabel)
  const locked = useGame((state) => state.pointerLocked)
  const floatingMap = useGame((state) => requireMap(state.mapId).gravity === 'micro')
  const floating = useGame((state) => requireMap(state.mapId).gravity === 'micro' && !state.sequence)
  // In second person the camera faces the player, so there is nothing to aim at.
  const showCrosshair = useGame((state) => state.view !== 'second')
  // During the launch and landing cinematics only the "Unbuckle" prompt shows, at the end.
  const cinematic = useGame((state) => state.sequence !== null && state.sequence.step !== 'unbuckle')

  if (mode !== 'playing' || cinematic) return null

  return (
    <div className="play">
      <div className="play__top">
        {roomLabel && (
          <p key={roomLabel} className="play__room glass glass--pill enter">
            {roomLabel}
          </p>
        )}
        {floating && <p className="play__chip glass glass--pill">Microgravity</p>}
      </div>

      <div className="play__center">
        {showCrosshair && <div className="play__crosshair" data-active={focus ? 'true' : 'false'} aria-hidden="true" />}
        <div className="play__prompt-slot" aria-live="polite">
          {focus &&
            (focus.kind === 'notice' ? (
              <p key={focus.id} className="play__prompt play__prompt--notice glass glass--pill enter">
                {focus.prompt}
              </p>
            ) : (
              <p key={focus.id} className="play__prompt glass glass--pill enter">
                <span className="keycap">E</span>
                <span>{focus.prompt}</span>
              </p>
            ))}
        </div>
      </div>

      {!locked && (
        <div className="play__hint-row">
          <p className="play__hint glass glass--pill">
            Click to capture the mouse, or click a room on the map to {floatingMap ? 'float' : 'walk'} there
          </p>
        </div>
      )}
    </div>
  )
}
