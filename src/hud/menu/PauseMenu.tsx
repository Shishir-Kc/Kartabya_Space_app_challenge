import { useEffect, useState } from 'react'
import { OUTFITS } from '../../character/outfits'
import { requireMap } from '../../maps/registry'
import { beginPlay, quitToMenu } from '../../scene/session'
import { HAIR_STYLES, PATCHES, VARIANT_LABELS } from '../../state/astronaut'
import { useGame } from '../../state/store'
import { AstronautPreview } from '../AstronautPreview'
import { SettingsPanel } from './SettingsPanel'
import './menu.css'

type PauseView = 'main' | 'astronaut' | 'settings'

/** The player's astronaut, to look at: changing them is done in the lobby. */
function AstronautCard() {
  const astronaut = useGame((state) => state.astronaut)
  const outfit = useGame((state) => requireMap(state.mapId).outfit ?? 'flight')
  const facts: [string, string][] = [
    ['Name', astronaut.name],
    ['Job', 'Mission engineer'],
    ['Body', VARIANT_LABELS[astronaut.variant]],
    ['Hair', HAIR_STYLES.find((item) => item.id === astronaut.hair)?.label ?? ''],
    ['Patch', PATCHES.find((item) => item.id === astronaut.patch)?.label ?? ''],
    ['Suit', OUTFITS[outfit].label],
  ]
  return (
    <div className="pause__astronaut">
      <AstronautPreview profile={astronaut} outfit={outfit} />
      <div>
        <dl className="facts">
          {facts.map(([label, value]) => (
            <div key={label} className="facts__row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="group__note">To change your astronaut, quit to the menu and open the ASTRONAUT tab. Your mission will wait for you.</p>
      </div>
    </div>
  )
}

/**
 * The in-game pause menu (Esc): a smaller card in the lobby's style over
 * the blurred mission. Resume, a look at your astronaut, the settings, and
 * back to the menu. The browser only captures the mouse after a click,
 * which is why resuming needs a button.
 */
export function PauseMenu() {
  const paused = useGame((state) => state.screen === 'game' && state.mode === 'paused')
  const [view, setView] = useState<PauseView>('main')

  useEffect(() => {
    if (!paused) setView('main')
  }, [paused])

  // Esc goes back a step, and from the first step back to the mission.
  useEffect(() => {
    if (!paused) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || event.repeat) return
      if (view !== 'main') setView('main')
      else beginPlay(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paused, view])

  if (!paused) return null

  return (
    <div className="pause-backdrop" data-menu>
      <section className="pause glass" data-view={view} role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <header className="pause__head">
          <h1 id="pause-title" className="pause__title">
            {view === 'main' ? 'Paused' : view === 'astronaut' ? 'Your astronaut' : 'Settings'}
          </h1>
          {view !== 'main' && (
            <button type="button" className="chip-button" onClick={() => setView('main')}>
              Back
            </button>
          )}
        </header>

        {view === 'main' && (
          <div key="main" className="pause__list">
            <p className="pause__line">The crew will wait for you.</p>
            <button type="button" className="cta" onClick={() => beginPlay(true)} autoFocus>
              <span>Resume</span>
            </button>
            <button type="button" className="cta cta--ghost" onClick={() => setView('astronaut')}>
              <span>Astronaut</span>
            </button>
            <button type="button" className="cta cta--ghost" onClick={() => setView('settings')}>
              <span>Settings</span>
            </button>
            <button type="button" className="cta cta--ghost" onClick={quitToMenu}>
              <span>Quit to menu</span>
            </button>
            <button type="button" className="link-button" onClick={() => beginPlay(false)}>
              Resume without mouse look
            </button>
          </div>
        )}
        {view === 'astronaut' && (
          <div key="astronaut" className="pause__body">
            <AstronautCard />
          </div>
        )}
        {view === 'settings' && (
          <div key="settings" className="pause__body">
            <SettingsPanel />
          </div>
        )}
      </section>
    </div>
  )
}
