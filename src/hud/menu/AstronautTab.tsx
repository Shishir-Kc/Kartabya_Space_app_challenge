import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { drawPatch } from '../../character/insignia'
import { OUTFITS, type OutfitId } from '../../character/outfits'
import {
  checkName,
  defaultProfile,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  NAME_MAX_LENGTH,
  PATCHES,
  randomProfile,
  SKIN_PRESETS,
  skinToneCss,
  suggestName,
  swatchColor,
  VARIANT_LABELS,
  VARIANTS,
  type AstronautProfile,
  type AstronautVariant,
  type HairStyle,
  type PatchId,
  type Swatch,
} from '../../state/astronaut'
import { faceCamera, lobby } from '../../state/lobby'
import { useGame } from '../../state/store'

const BODIES = VARIANTS.map((id) => ({ id, label: VARIANT_LABELS[id] }))

const SUITS: { id: OutfitId; label: string; where: string }[] = [
  { id: 'flight', label: 'Coverall', where: 'On Earth' },
  { id: 'launch', label: 'Launch suit', where: 'In space' },
  { id: 'surface', label: 'Moon suit', where: 'On the Moon' },
]

/** The slider's track: the same colours the shader uses, sampled along it. */
const SKIN_GRADIENT = `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, i) => skinToneCss(i / 12)).join(', ')})`

/** A little figure for the body buttons: shoulders, waist and legs drawn to each build. */
function BodyPicture({ variant, skin }: { variant: AstronautVariant; skin: string }) {
  const body =
    variant === 'female'
      ? 'M32 30c-7 0-13 3-14 9l-2 20c0 3 5 3 5 0l2-13 2 14-3 30c0 4 6 4 7 0l3-22 3 22c1 4 7 4 7 0l-3-30 2-14 2 13c0 3 5 3 5 0l-2-20c-1-6-7-9-14-9Z'
      : 'M32 30c-9 0-16 3-17 10l-2 20c0 3 5 3 6 0l2-14 1 16-2 28c0 4 7 4 8 0l4-22 4 22c1 4 8 4 8 0l-2-28 1-16 2 14c1 3 6 3 6 0l-2-20c-1-7-8-10-17-10Z'
  return (
    <svg className="pic" viewBox="0 0 64 96" aria-hidden="true">
      <circle cx="32" cy="16" r="10" fill={skin} />
      <path d={body} fill="#2f5c9c" />
    </svg>
  )
}

/** A head for the hair cards, in the astronaut's own skin and hair colours. */
function HairPicture({ style, skin, hair }: { style: HairStyle; skin: string; hair: string }) {
  return (
    <svg className="pic" viewBox="0 0 64 64" aria-hidden="true">
      {style === 'long' && <path d="M14 30c0-14 8-22 18-22s18 8 18 22v22c0 4-8 4-8 0V34H22v18c0 4-8 4-8 0Z" fill={hair} />}
      <ellipse cx="32" cy="33" rx="13" ry="16" fill={skin} />
      {style === 'short' && <path d="M18 30c-1-13 6-20 14-20s15 7 14 20c-3-6-7-9-10-10-5 2-13 3-18 10Z" fill={hair} />}
      {style === 'long' && <path d="M18 30c-1-12 6-19 14-19s15 7 14 19c-4-7-9-10-14-11-5 1-10 4-14 11Z" fill={hair} />}
      <path d="M22 62c1-8 5-11 10-11s9 3 10 11Z" fill="#2f5c9c" />
    </svg>
  )
}

function PatchPicture({ id }: { id: PatchId }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvas.current) drawPatch(canvas.current, id)
  }, [id])
  return <canvas ref={canvas} className="pic pic--patch" aria-hidden="true" />
}

function Swatches({ label, list, value, onChange }: { label: string; list: Swatch[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {list.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={value === item.id}
          aria-label={item.label}
          title={item.label}
          className="dot"
          style={{ '--dot': item.color } as CSSProperties}
          onClick={() => onChange(item.id)}
        />
      ))}
    </div>
  )
}

/**
 * The customisation screen: the controls here, the astronaut large on the
 * podium beside them, changing as you pick. Every change is saved in this
 * browser straight away (the name, once it is a valid one).
 */
export function AstronautTab({ onDone }: { onDone: () => void }) {
  const astronaut = useGame((state) => state.astronaut)
  const saved = useGame((state) => state.astronautSaved)
  const setAstronaut = useGame((state) => state.setAstronaut)
  const [name, setName] = useState(astronaut.name)
  const [suit, setSuit] = useState<OutfitId>(lobby.outfit)
  const check = checkName(name)
  const skin = skinToneCss(astronaut.skinTone)
  const hair = swatchColor(HAIR_COLORS, astronaut.hairColor)

  const change = (patch: Partial<AstronautProfile>) => {
    setAstronaut({ ...astronaut, ...patch })
    faceCamera()
  }

  const rename = (value: string) => {
    setName(value)
    const next = checkName(value)
    if (next.ok) setAstronaut({ ...astronaut, name: next.name })
  }

  const showSuit = (id: OutfitId) => {
    setSuit(id)
    lobby.outfit = id
    faceCamera()
  }

  // The suit view is only a preview: the mission always starts in the coverall.
  useEffect(
    () => () => {
      lobby.outfit = 'flight'
    },
    [],
  )

  const replace = (profile: AstronautProfile) => {
    setName(profile.name)
    setAstronaut(profile)
    faceCamera()
  }

  return (
    <div className="editor">
      <div className="editor__scroll">
      <section className="group" aria-labelledby="astronaut-name-label">
        <label id="astronaut-name-label" className="group__title" htmlFor="astronaut-name">
          Name
        </label>
        <div className="field__row">
          <input
            id="astronaut-name"
            className="field__input"
            value={name}
            onChange={(event) => rename(event.target.value)}
            maxLength={NAME_MAX_LENGTH + 8}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!check.ok}
            aria-describedby="astronaut-name-help"
          />
          <button type="button" className="chip-button" onClick={() => rename(suggestName(name))}>
            Suggest
          </button>
        </div>
        {check.ok ? (
          <p id="astronaut-name-help" className="field__help">
            Up to {NAME_MAX_LENGTH} letters. Your crew will call you this. It stays on this device.
          </p>
        ) : (
          <p id="astronaut-name-help" className="field__error" role="alert">
            {check.error}
          </p>
        )}
      </section>

      <section className="group" aria-labelledby="astronaut-body">
        <h3 id="astronaut-body" className="group__title">
          Body
        </h3>
        <div className="cards cards--2" role="radiogroup" aria-labelledby="astronaut-body">
          {BODIES.map((body) => (
            <button
              key={body.id}
              type="button"
              role="radio"
              aria-checked={astronaut.variant === body.id}
              className="card"
              onClick={() => change({ variant: body.id })}
            >
              <BodyPicture variant={body.id} skin={skin} />
              <span className="card__label">{body.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="group" aria-labelledby="astronaut-skin">
        <h3 id="astronaut-skin" className="group__title">
          Skin tone
        </h3>
        <div className="swatches" aria-label="Quick picks">
          {SKIN_PRESETS.map((tone) => (
            <button
              key={tone}
              type="button"
              className="dot dot--large"
              aria-label={`Skin tone ${Math.round(tone * 100)}`}
              aria-pressed={Math.abs(astronaut.skinTone - tone) < 0.005}
              style={{ '--dot': skinToneCss(tone) } as CSSProperties}
              onClick={() => change({ skinTone: tone })}
            />
          ))}
        </div>
        <div className="tone">
          <span className="tone__end" style={{ background: skinToneCss(0) }} aria-hidden="true" />
          <input
            className="range range--tone"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={astronaut.skinTone}
            aria-labelledby="astronaut-skin"
            aria-valuetext={`${Math.round(astronaut.skinTone * 100)} out of 100`}
            style={{ '--track': SKIN_GRADIENT, '--thumb': skin } as CSSProperties}
            onChange={(event) => change({ skinTone: Number(event.target.value) })}
          />
          <span className="tone__end" style={{ background: skinToneCss(1) }} aria-hidden="true" />
        </div>
      </section>

      <section className="group" aria-labelledby="astronaut-hair">
        <h3 id="astronaut-hair" className="group__title">
          Hair
        </h3>
        <div className="cards cards--3" role="radiogroup" aria-labelledby="astronaut-hair">
          {HAIR_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={astronaut.hair === style.id}
              className="card"
              onClick={() => change({ hair: style.id })}
            >
              <HairPicture style={style.id} skin={skin} hair={hair} />
              <span className="card__label">{style.label}</span>
            </button>
          ))}
        </div>
        <Swatches label="Hair colour" list={HAIR_COLORS} value={astronaut.hairColor} onChange={(hairColor) => change({ hairColor })} />
      </section>

      <section className="group" aria-labelledby="astronaut-eyes">
        <h3 id="astronaut-eyes" className="group__title">
          Eye colour
        </h3>
        <Swatches label="Eye colour" list={EYE_COLORS} value={astronaut.eyeColor} onChange={(eyeColor) => change({ eyeColor })} />
      </section>

      <section className="group" aria-labelledby="astronaut-suit">
        <h3 id="astronaut-suit" className="group__title">
          Try on a suit
        </h3>
        <div className="cards cards--3" role="radiogroup" aria-labelledby="astronaut-suit">
          {SUITS.map((item) => (
            <button key={item.id} type="button" role="radio" aria-checked={suit === item.id} className="card card--suit" onClick={() => showSuit(item.id)}>
              <span className="card__suit" style={{ background: OUTFITS[item.id].color }} aria-hidden="true" />
              <span className="card__label">{item.label}</span>
              <span className="card__sub">{item.where}</span>
            </button>
          ))}
        </div>
        <p className="group__note">You change suits by yourself during the mission. This is just a look.</p>
      </section>

      <section className="group" aria-labelledby="astronaut-patch">
        <h3 id="astronaut-patch" className="group__title">
          Mission patch
        </h3>
        <div className="cards cards--4" role="radiogroup" aria-labelledby="astronaut-patch">
          {PATCHES.map((patch) => (
            <button
              key={patch.id}
              type="button"
              role="radio"
              aria-checked={astronaut.patch === patch.id}
              className="card"
              onClick={() => change({ patch: patch.id })}
            >
              <PatchPicture id={patch.id} />
              <span className="card__label">{patch.label}</span>
            </button>
          ))}
        </div>
        <p className="group__note">It goes on your left shoulder.</p>
      </section>
      </div>

      <div className="editor__actions">
        <button type="button" className="chip-button" onClick={() => replace(randomProfile(check.ok ? check.name : undefined))}>
          Randomise
        </button>
        <button type="button" className="chip-button" onClick={() => replace(defaultProfile(check.ok ? check.name : astronaut.name, astronaut.variant))}>
          Reset
        </button>
        <button
          type="button"
          className="cta cta--small"
          disabled={!check.ok}
          onClick={() => {
            if (!check.ok) return
            setAstronaut({ ...astronaut, name: check.name })
            onDone()
          }}
        >
          <span>{saved ? 'Done' : 'Ready'}</span>
        </button>
      </div>
    </div>
  )
}
