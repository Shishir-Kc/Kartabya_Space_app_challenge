import type { CSSProperties, ReactNode } from 'react'
import { CONTROLS } from '../../data/controls'
import { GRAPHICS_ORDER, GRAPHICS_PRESETS } from '../../state/graphics'
import { SENSITIVITY_MAX, SENSITIVITY_MIN, useSettings } from '../../state/settings'
import { useGame, VIEW_ORDER, type View } from '../../state/store'

const VIEW_LABELS: Record<View, string> = { first: 'First person', second: 'Second person', third: 'Third person' }

/** Every key the game uses, with what it does on foot and floating. */
const KEYS = CONTROLS

/** A row of choices where exactly one is picked. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { id: T; label: string }[]
  onChange: (id: T) => void
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className="seg__option"
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** A slider with its name on the left and its value on the right. */
export function Slider({
  id,
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  format,
  onChange,
}: {
  id: string
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div className="slider">
      <label className="slider__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        aria-valuetext={format(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="slider__value num">{format(value)}</span>
    </div>
  )
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting__text">
        <span className="setting__title">{title}</span>
        {hint && <span className="setting__hint">{hint}</span>}
      </div>
      <div className="setting__control">{children}</div>
    </div>
  )
}

const ON_OFF = [
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
] as const

const percent = (value: number) => `${Math.round(value * 100)}%`

/**
 * The settings, shared by the lobby's SETTINGS tab and the pause menu.
 * Everything applies straight away and is remembered in this browser.
 */
export function SettingsPanel() {
  const graphics = useGame((state) => state.graphics)
  const setGraphics = useGame((state) => state.setGraphics)
  const view = useGame((state) => state.view)
  const setView = useGame((state) => state.setView)
  const easyFloat = useGame((state) => state.easyFloat)
  const setEasyFloat = useGame((state) => state.setEasyFloat)
  const settings = useSettings()

  return (
    <div className="settings">
      <section className="group" aria-labelledby="settings-graphics">
        <h3 id="settings-graphics" className="group__title">
          Graphics
        </h3>
        <Row title="Quality" hint="Pick Low if the game feels slow.">
          <Segmented
            label="Graphics quality"
            value={graphics}
            options={GRAPHICS_ORDER.map((id) => ({ id, label: GRAPHICS_PRESETS[id].label }))}
            onChange={setGraphics}
          />
        </Row>
        <Row title="View" hint="Press V while playing to change it.">
          <Segmented label="View" value={view} options={VIEW_ORDER.map((id) => ({ id, label: VIEW_LABELS[id] }))} onChange={setView} />
        </Row>
      </section>

      <section className="group" aria-labelledby="settings-controls">
        <h3 id="settings-controls" className="group__title">
          Controls
        </h3>
        <dl className="keys">
          {KEYS.map(([keys, action]) => (
            <div key={keys} className="keys__row">
              <dt>
                <span className="keycap">{keys}</span>
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        <Slider
          id="settings-sensitivity"
          label="Mouse speed"
          value={settings.mouseSensitivity}
          min={SENSITIVITY_MIN}
          max={SENSITIVITY_MAX}
          step={0.05}
          format={(value) => `${value.toFixed(2)}×`}
          onChange={(mouseSensitivity) => settings.set({ mouseSensitivity })}
        />
        <Row title="Flip up and down" hint="Moving the mouse up looks down.">
          <Segmented label="Flip up and down" value={settings.invertY ? 'on' : 'off'} options={ON_OFF} onChange={(id) => settings.set({ invertY: id === 'on' })} />
        </Row>
        <Row title="Easy float" hint="In space, you slowly turn the right way up by yourself.">
          <Segmented label="Easy float" value={easyFloat ? 'on' : 'off'} options={ON_OFF} onChange={(id) => setEasyFloat(id === 'on')} />
        </Row>
      </section>

      <section className="group" aria-labelledby="settings-audio">
        <h3 id="settings-audio" className="group__title">
          Sound
        </h3>
        <Slider id="settings-master" label="Everything" value={settings.audio.master} format={percent} onChange={(master) => settings.setAudio({ master })} />
        <Slider id="settings-voices" label="Voices" value={settings.audio.voices} format={percent} onChange={(voices) => settings.setAudio({ voices })} />
        <Slider id="settings-effects" label="Effects" value={settings.audio.effects} format={percent} onChange={(effects) => settings.setAudio({ effects })} />
        <p className="group__note">Sound is on its way. Your volumes are saved for when it arrives.</p>
      </section>

      <section className="group" aria-labelledby="settings-access">
        <h3 id="settings-access" className="group__title">
          Easier to see
        </h3>
        <Row title="Text size">
          <Segmented
            label="Text size"
            value={settings.textSize}
            options={[
              { id: 'normal', label: 'Normal' },
              { id: 'large', label: 'Large' },
            ]}
            onChange={(textSize) => settings.set({ textSize })}
          />
        </Row>
        <Row title="Less movement" hint="Stops the camera drifting and the screen shaking.">
          <Segmented
            label="Less movement"
            value={settings.reducedMotion ? 'on' : 'off'}
            options={ON_OFF}
            onChange={(id) => settings.set({ reducedMotion: id === 'on' })}
          />
        </Row>
        <Row title="Map turns with you" hint="While driving, the map turns so the rover points up. Off: north stays up.">
          <Segmented
            label="Map turns with you"
            value={settings.mapHeadingUp ? 'on' : 'off'}
            options={ON_OFF}
            onChange={(id) => settings.set({ mapHeadingUp: id === 'on' })}
          />
        </Row>
        <Row title="Skip cutscenes on replay" hint="After Try again, the launch and landing jump straight to the decisions.">
          <Segmented
            label="Skip cutscenes on replay"
            value={settings.skipCutscenesOnReplay ? 'on' : 'off'}
            options={ON_OFF}
            onChange={(id) => settings.set({ skipCutscenesOnReplay: id === 'on' })}
          />
        </Row>
        <Row title="Story scenes and guides" hint="Each story scene plays once, and the handbook guide shows the first time. Reset to see them again.">
          <button
            type="button"
            className="button"
            disabled={!settings.handbookGuideSeen && settings.beatsSeen.length === 0}
            onClick={() => settings.set({ handbookGuideSeen: false, beatsSeen: [] })}
          >
            {settings.handbookGuideSeen || settings.beatsSeen.length > 0 ? 'Reset: show them again' : 'They will show next time'}
          </button>
        </Row>
      </section>
    </div>
  )
}
