import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { startMission } from '../../scene/session'
import { dragLobby, lobby } from '../../state/lobby'
import { useGame, type MenuTab } from '../../state/store'
import { AstronautTab } from './AstronautTab'
import { LobbyLoading } from './LobbyLoading'
import { MissionDataTab } from './MissionDataTab'
import { SettingsPanel } from './SettingsPanel'
import './menu.css'

const TABS: { id: MenuTab; label: string }[] = [
  { id: 'play', label: 'Play' },
  { id: 'astronaut', label: 'Astronaut' },
  { id: 'settings', label: 'Settings' },
  { id: 'data', label: 'Mission data' },
]

const PANEL_TITLES: Record<Exclude<MenuTab, 'play'>, string> = {
  astronaut: 'Your astronaut',
  settings: 'Settings',
  data: 'Mission data',
}

/** How far left of the middle the astronaut stands: further over when a wide panel is open. */
const SHIFT: Record<MenuTab, number> = { play: 0.12, astronaut: 0.21, settings: 0.21, data: 0.21 }

/** The game's name and what it is about: on the title, and on the PLAY tab. */
function Hero() {
  return (
    <div className="hero">
      <p className="hero__eyebrow">Junior Astronaut Mission Trainer</p>
      <h1 className="hero__title">
        Lunar
        <br />
        Outpost
      </h1>
      <p className="hero__line">Run a lunar outpost. Every choice costs something.</p>
    </div>
  )
}

/** The big buttons on the PLAY tab: continue, a new mission, or first make an astronaut. */
function PlayActions() {
  const started = useGame((state) => state.started)
  const saved = useGame((state) => state.astronautSaved)
  const name = useGame((state) => state.astronaut.name)
  const setMenuTab = useGame((state) => state.setMenuTab)
  const [confirming, setConfirming] = useState(false)

  if (!saved) {
    return (
      <div className="actions">
        <button type="button" className="cta" onClick={() => setMenuTab('astronaut')} autoFocus>
          <span>Make your astronaut</span>
        </button>
        <button type="button" className="cta cta--ghost" onClick={() => startMission(true)}>
          <span>Play as {name}</span>
        </button>
      </div>
    )
  }
  if (confirming) {
    return (
      <div className="actions" role="group" aria-label="Start a new mission?">
        <p className="actions__ask">Start again from the beginning? Your mission so far will be lost.</p>
        <button type="button" className="cta" onClick={() => startMission(true)}>
          <span>Yes, start again</span>
        </button>
        <button type="button" className="cta cta--ghost" onClick={() => setConfirming(false)} autoFocus>
          <span>Keep my mission</span>
        </button>
      </div>
    )
  }
  if (started) {
    return (
      <div className="actions">
        <button type="button" className="cta" onClick={() => startMission(false)} autoFocus>
          <span>Continue</span>
        </button>
        <button type="button" className="cta cta--ghost" onClick={() => setConfirming(true)}>
          <span>New mission</span>
        </button>
      </div>
    )
  }
  return (
    <div className="actions">
      <button type="button" className="cta cta--big" onClick={() => startMission(true)} autoFocus>
        <span>Play</span>
      </button>
      <p className="actions__note">New mission</p>
    </div>
  )
}

/**
 * The title, then the main menu: a lobby with the player's astronaut on
 * the podium (drawn by the lobby stage in the 3D scene behind) and four
 * tabs across the top. Drag the astronaut to turn them.
 */
export function MainMenu() {
  const screen = useGame((state) => state.screen)
  const tab = useGame((state) => state.menuTab)
  const setMenuTab = useGame((state) => state.setMenuTab)
  const openMenu = useGame((state) => state.openMenu)
  const name = useGame((state) => state.astronaut.name)
  const dragFrom = useRef<number | null>(null)
  const title = screen === 'title'

  useEffect(() => {
    if (screen === 'game') return
    lobby.shift = title ? SHIFT.play : SHIFT[tab]
  }, [screen, title, tab])

  // The title goes away on any key or click.
  useEffect(() => {
    if (!title) return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key === 'Tab') return
      openMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [title, openMenu])

  if (screen === 'game') return null

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (title) {
      openMenu()
      return
    }
    dragFrom.current = event.clientX
    lobby.dragging = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragFrom.current === null) return
    dragLobby(event.clientX - dragFrom.current)
    dragFrom.current = event.clientX
  }
  const onPointerUp = () => {
    dragFrom.current = null
    lobby.dragging = false
  }
  const onStageKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') dragLobby(-30)
    if (event.key === 'ArrowRight') dragLobby(30)
  }
  const onTabKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    const index = TABS.findIndex((item) => item.id === tab)
    const next = TABS[(index + step + TABS.length) % TABS.length]!
    setMenuTab(next.id)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus()
  }

  return (
    <div className="menu" data-menu data-screen={screen} data-tab={tab}>
      <div className="menu__shade" aria-hidden="true" />
      <div
        className="menu__stage"
        role={title ? undefined : 'img'}
        tabIndex={title ? -1 : 0}
        aria-label={title ? undefined : `${name}, your astronaut. Drag, or press the left and right arrow keys, to turn them.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onStageKey}
      />

      {title ? (
        <div className="menu__title">
          <Hero />
          <button type="button" className="cta cta--big" onClick={openMenu} autoFocus>
            <span>Start</span>
          </button>
          <p className="menu__hint">Press any key</p>
        </div>
      ) : (
        <>
          <header className="menu__bar">
            <p className="menu__brand">Lunar Outpost</p>
            <div className="tabs" role="tablist" aria-label="Menu" onKeyDown={onTabKey}>
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`menu-tab-${item.id}`}
                  data-tab={item.id}
                  aria-selected={tab === item.id}
                  aria-controls="menu-panel"
                  tabIndex={tab === item.id ? 0 : -1}
                  className="tab"
                  onClick={() => setMenuTab(item.id)}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </header>

          {tab === 'play' ? (
            <div key="play" id="menu-panel" className="menu__play" role="tabpanel" aria-labelledby="menu-tab-play">
              <Hero />
              <PlayActions />
            </div>
          ) : (
            <section key={tab} id="menu-panel" className="menu__panel glass" role="tabpanel" aria-labelledby={`menu-tab-${tab}`}>
              <h2 className="panel__title">{PANEL_TITLES[tab]}</h2>
              <div className="panel__body" data-fixed={tab === 'astronaut' ? 'true' : undefined}>
                {tab === 'astronaut' && <AstronautTab onDone={() => setMenuTab('play')} />}
                {tab === 'settings' && <SettingsPanel />}
                {tab === 'data' && <MissionDataTab />}
              </div>
            </section>
          )}

          {tab === 'play' && (
            <p className="plate">
              <span className="plate__name">{name}</span>
              <span className="plate__role">Mission engineer</span>
            </p>
          )}
          {tab !== 'play' && <p className="menu__drag">Drag your astronaut to turn them</p>}
        </>
      )}
      {/* Last, so it covers everything until the astronaut and the rocket are in place. */}
      <LobbyLoading />
    </div>
  )
}
