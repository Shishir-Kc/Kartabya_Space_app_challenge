import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import { fenceSegments, levelById, levelOf, listDoors, rectCenter } from '../maps/collision'
import { requireMap } from '../maps/registry'
import { launchPad } from '../maps/types'
import { player } from '../state/player'
import { useSettings } from '../state/settings'
import { useGame } from '../state/store'
import { walkTo } from '../scene/session'
import { roverState } from '../scene/rover'
import { formatDistance, headingUpRotation, mapRotation } from './mapMath'
import './minimap.css'

const PADDING = 1
/** The building map never shows less than this many metres across. */
const MIN_VIEW = 22
/** How thick door gaps are drawn across the wall line, in metres. */
const DOOR_GAP = 0.7
/**
 * Labels are drawn in a group scaled down by this factor, so their font
 * size is 10x larger in its own units. Browsers with a minimum font size
 * would otherwise blow up a 1-unit font and clip it ("ew", "Tov").
 */
const LABEL_SCALE = 10
/** Average glyph width as a fraction of the font size, for fitting labels. */
const GLYPH_WIDTH = 0.62
/** The player arrow is drawn this much bigger on the zoomed-out grounds map. */
const GROUNDS_ARROW_SCALE = 2.6
/** While driving, the map follows the rover showing this many metres across (small map, big map). */
const FOLLOW_WIDTH = { small: 170, big: 340 }
const ZOOM_MIN = 0.5
const ZOOM_MAX = 8

interface View {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The map, drawn straight from the map data in an SVG whose units are world
 * metres (x across, z down, so north is up). Indoors it shows the building's
 * rooms; outdoors it zooms out to the grounds. The player and rover icons,
 * and while driving the whole view, are moved every frame outside React.
 * When the mouse is free, clicking a room or the grounds walks there.
 *
 * Shift+M makes it the big map across the bottom half of the screen, with
 * a legend; with the mouse free, the wheel zooms it and dragging pans it.
 */
export function Minimap() {
  const mapId = useGame((state) => state.mapId)
  const mode = useGame((state) => state.mode)
  const locked = useGame((state) => state.pointerLocked)
  const outdoors = useGame((state) => state.outdoors)
  const levelId = useGame((state) => state.levelId)
  const cinematic = useGame((state) => state.sequence !== null)
  const big = useGame((state) => state.bigMap)
  const mapFocus = useGame((state) => state.mapFocus)
  const driving = useGame((state) => state.driving)
  const used = useGame((state) => state.usedConsoles)
  const map = requireMap(mapId)
  const pad = launchPad(map)
  const rooms = useMemo(() => map.rooms.filter((room) => levelOf(room) === levelId), [map, levelId])
  const doors = useMemo(() => listDoors(map, levelId), [map, levelId])
  const consoles = useMemo(() => map.consoles.filter((item) => levelOf(item) === levelId), [map, levelId])
  const markers = useMemo(() => map.markers.filter((marker) => levelOf(marker) === levelId), [map, levelId])
  const cars = useMemo(
    () => (map.elevators ?? []).filter((elevator) => elevator.stops.some((stop) => stop.level === levelId)),
    [map, levelId],
  )
  const levelLabel = levelById(map, levelId).label
  const multiLevel = (map.levels?.length ?? 1) > 1
  const svgRef = useRef<SVGSVGElement>(null)
  const worldRef = useRef<SVGGElement>(null)
  const playerRef = useRef<SVGGElement>(null)
  const roverRef = useRef<SVGGElement>(null)
  const rangeRef = useRef<SVGCircleElement>(null)
  const homeRef = useRef<SVGLineElement>(null)
  const compassRef = useRef<HTMLSpanElement>(null)
  const grounds = outdoors && map.outdoor ? map.outdoor : null
  const lunar = !!grounds?.areas?.length
  const home = map.rover?.home ?? null
  const arrowScale = useRef(1)
  const zoom = useRef(1)
  const pan = useRef({ x: 0, z: 0 })
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  // Distances to the pinged places, refreshed twice a second (not every frame).
  const [here, setHere] = useState({ x: player.x, z: player.z })
  useEffect(() => {
    if (!lunar) return
    const timer = window.setInterval(() => {
      const rover = roverState()
      const from = rover?.driving ? rover : player
      setHere({ x: Math.round(from.x), z: Math.round(from.z) })
    }, 500)
    return () => window.clearInterval(timer)
  }, [lunar])

  // A new map or a smaller map: back to the whole view.
  useEffect(() => {
    zoom.current = 1
    pan.current = { x: 0, z: 0 }
  }, [mapId, big, levelId, outdoors])

  const bounds = useMemo<View>(() => {
    // The lunar surface: framed on the outpost and the named places, not the whole zone.
    if (grounds?.areas?.length) {
      const ground = map.rooms.filter((room) => levelOf(room) === 'ground').map((room) => room.rect)
      const x0 = Math.min(...grounds.areas.map((a) => a.x - a.radius), ...ground.map((r) => r.x0)) - 18
      const x1 = Math.max(...grounds.areas.map((a) => a.x + a.radius), ...ground.map((r) => r.x1)) + 18
      const z0 = Math.min(...grounds.areas.map((a) => a.z - a.radius), ...ground.map((r) => r.z0)) - 18
      const z1 = Math.max(...grounds.areas.map((a) => a.z + a.radius), ...ground.map((r) => r.z1)) + 18
      const width = Math.max(x1 - x0, (z1 - z0) * 1.6)
      const height = Math.max(z1 - z0, width / 1.9)
      return { x: (x0 + x1) / 2 - width / 2, y: (z0 + z1) / 2 - height / 2, width, height }
    }
    if (grounds) {
      const zones = grounds.zones.map((zone) => zone.rect)
      const x0 = Math.min(...zones.map((r) => r.x0)) - 2
      const x1 = Math.max(...zones.map((r) => r.x1)) + 2
      const z0 = Math.min(...zones.map((r) => r.z0)) - 2
      const z1 = Math.max(...zones.map((r) => r.z1)) + 2
      return { x: x0, y: z0, width: x1 - x0, height: z1 - z0 }
    }
    const rects = [...rooms.map((room) => room.rect), ...cars.map((car) => car.car)]
    let x0 = Math.min(...rects.map((r) => r.x0)) - PADDING
    let x1 = Math.max(...rects.map((r) => r.x1)) + PADDING
    let z0 = Math.min(...rects.map((r) => r.z0)) - PADDING
    let z1 = Math.max(...rects.map((r) => r.z1)) + PADDING
    // Small levels (the access arm) would zoom in too far: keep at least
    // MIN_VIEW across, and the map's landscape shape.
    const width = Math.max(x1 - x0, MIN_VIEW, (z1 - z0) * 1.8)
    const height = Math.max(z1 - z0, width / 2.2)
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    x0 = cx - width / 2
    x1 = cx + width / 2
    z0 = cz - height / 2
    z1 = cz + height / 2
    return { x: x0, y: z0, width: x1 - x0, height: z1 - z0 }
  }, [rooms, cars, grounds, map])

  // Each label gets the biggest font that fits inside its room, placed in
  // the band (top, middle or bottom) furthest from any console or marker,
  // so the icons never sit on top of the text.
  const labels = useMemo(() => {
    const icons = [...map.consoles.map((item) => item.position), ...map.markers.map((marker) => rectCenter(marker.rect))]
    return rooms.flatMap((room) => {
      if (!room.shortLabel) return []
      const { x0, x1, z0, z1 } = room.rect
      const w = x1 - x0
      const h = z1 - z0
      const size = Math.min(1.2, (w * 0.82) / (room.shortLabel.length * GLYPH_WIDTH), h * 0.4)
      const x = (x0 + x1) / 2
      const bands = [z0 + 0.35 + size / 2, (z0 + z1) / 2, z1 - 0.35 - size / 2]
      const clearance = (y: number) => Math.min(Infinity, ...icons.map((icon) => Math.hypot((icon.x - x) / (w / 2), icon.z - y)))
      const y = bands.reduce((best, band) => (clearance(band) > clearance(best) ? band : best), bands[1] ?? z0)
      return [{ id: room.id, text: room.shortLabel, x, y, size }]
    })
  }, [map, rooms])

  // Grounds labels: the building, the pad, each outbuilding, and on the Moon each place with its distance.
  const groundsLabels = useMemo(() => {
    const outdoor = map.outdoor
    if (!outdoor) return []
    const groundRooms = map.rooms.filter((room) => levelOf(room) === 'ground')
    const xs = groundRooms.flatMap((room) => [room.rect.x0, room.rect.x1])
    const zs = groundRooms.flatMap((room) => [room.rect.z0, room.rect.z1])
    const list = [
      { id: 'building', text: map.name, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...zs) - 2.5, size: 2.6 },
      ...outdoor.buildings.map((building) => ({
        id: building.id,
        text: building.shortLabel ?? building.label,
        x: (building.rect.x0 + building.rect.x1) / 2,
        y: (building.rect.z0 + building.rect.z1) / 2,
        size: 2.2,
      })),
    ]
    const padAt = launchPad(map)
    if (padAt) list.push({ id: 'pad', text: 'Launch pad', x: padAt.x, y: padAt.z + 8, size: 2.6 })
    if (outdoor.areas?.length) {
      const size = 11
      list[0] = { ...list[0]!, text: 'Outpost', size }
      for (const area of outdoor.areas) {
        if (!area.ping) continue
        const distance = Math.hypot(area.x - here.x, area.z - here.z)
        list.push({ id: area.id, text: `${area.label} · ${formatDistance(distance)}`, x: area.x, y: area.z - area.radius - 5, size })
      }
    }
    return list
  }, [map, here])

  // Every frame: the icons, and while driving the view follows the rover.
  useEffect(() => {
    let handle = requestAnimationFrame(update)
    function update() {
      const rover = roverState()
      const following = !!(rover?.driving && grounds)
      const base: View = following
        ? (() => {
            const width = (big ? FOLLOW_WIDTH.big : FOLLOW_WIDTH.small) / zoom.current
            const height = width / (big ? 3.2 : 1.75)
            return { x: rover!.x - width / 2, y: rover!.z - height / 2, width, height }
          })()
        : (() => {
            const width = bounds.width / zoom.current
            const height = bounds.height / zoom.current
            const cx = bounds.x + bounds.width / 2 + pan.current.x
            const cz = bounds.y + bounds.height / 2 + pan.current.z
            return { x: cx - width / 2, y: cz - height / 2, width, height }
          })()
      if (following) {
        base.x += pan.current.x
        base.y += pan.current.z
      }
      svgRef.current?.setAttribute('viewBox', `${base.x.toFixed(2)} ${base.y.toFixed(2)} ${base.width.toFixed(2)} ${base.height.toFixed(2)}`)
      arrowScale.current = grounds ? Math.max(GROUNDS_ARROW_SCALE, base.width / 45) : 1
      // Outdoor labels keep one size on screen however far the view is zoomed: world units per pixel.
      const box = svgRef.current?.clientWidth
      const boxHeight = svgRef.current?.clientHeight
      if (box && boxHeight) {
        const worldPerPixel = Math.max(base.width / box, base.height / boxHeight)
        svgRef.current!.style.setProperty('--wpp', (worldPerPixel * LABEL_SCALE).toFixed(4))
      }

      // Heading up: the whole map turns round the rover so its nose points up.
      const turn = following && useSettings.getState().mapHeadingUp ? headingUpRotation(rover!.yaw) : 0
      worldRef.current?.setAttribute('transform', turn ? `rotate(${turn.toFixed(1)} ${rover!.x.toFixed(2)} ${rover!.z.toFixed(2)})` : '')
      if (compassRef.current) compassRef.current.style.transform = `rotate(${turn.toFixed(1)}deg)`

      playerRef.current?.setAttribute(
        'transform',
        `translate(${player.x.toFixed(2)} ${player.z.toFixed(2)}) rotate(${mapRotation(player.yaw).toFixed(1)}) scale(${arrowScale.current})`,
      )
      if (roverRef.current) {
        roverRef.current.setAttribute(
          'transform',
          rover ? `translate(${rover.x.toFixed(2)} ${rover.z.toFixed(2)}) rotate(${mapRotation(rover.yaw).toFixed(1)}) scale(${arrowScale.current})` : 'scale(0)',
        )
      }
      // The battery range ring (how far the charge left can take the rover) and the line home.
      if (rangeRef.current) {
        const reach = rover?.driving ? rover.battery / rover.def.battery.perMetre : 0
        rangeRef.current.setAttribute('cx', String(rover?.x ?? 0))
        rangeRef.current.setAttribute('cy', String(rover?.z ?? 0))
        rangeRef.current.setAttribute('r', String(Math.max(0, reach)))
      }
      if (homeRef.current && home) {
        const from = rover?.driving ? rover : player
        homeRef.current.setAttribute('x1', from.x.toFixed(2))
        homeRef.current.setAttribute('y1', from.z.toFixed(2))
      }
      handle = requestAnimationFrame(update)
    }
    return () => cancelAnimationFrame(handle)
  }, [bounds, grounds, big, home])

  const clickable = mode === 'playing' && !locked
  // In microgravity, click-to-walk becomes click-to-float.
  const move = map.gravity === 'micro' ? 'float' : 'walk'
  const hint = clickable
    ? big
      ? `Wheel to zoom, drag to pan, click to ${move} there`
      : grounds
        ? `Click the building or the grounds to ${move} there`
        : `Click a room to ${move} there`
    : mode === 'playing'
      ? 'M: use the map'
      : ''

  const onRoomKey = (event: KeyboardEvent, roomId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      walkTo(roomId)
    }
  }
  // A click that ended a drag doesn't walk anywhere.
  const walk = (id: string) => () => {
    if (!drag.current?.moved) walkTo(id)
  }

  const onWheel = (event: WheelEvent) => {
    if (!big || !clickable) return
    zoom.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom.current * (event.deltaY < 0 ? 1.2 : 1 / 1.2)))
  }
  const onPointerDown = (event: PointerEvent) => {
    if (!big || !clickable) return
    drag.current = { x: event.clientX, y: event.clientY, moved: false }
  }
  const onPointerMove = (event: PointerEvent) => {
    const start = drag.current
    if (!start || !big || event.buttons === 0) return
    const box = svgRef.current?.getBoundingClientRect()
    const view = svgRef.current?.viewBox.baseVal
    if (!box || !view || box.width === 0) return
    const metresPerPixel = Math.max(view.width / box.width, view.height / box.height)
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) + Math.abs(dy) > 4) start.moved = true
    pan.current = { x: pan.current.x - dx * metresPerPixel, z: pan.current.z - dy * metresPerPixel }
    start.x = event.clientX
    start.y = event.clientY
  }
  const onPointerUp = () => {
    // Let the click that follows see whether this was a drag, then forget it.
    window.setTimeout(() => {
      drag.current = null
    }, 0)
  }

  // Hidden while the launch or landing cinematic plays.
  if (cinematic) return null

  return (
    <nav
      className="minimap glass enter"
      data-big={big ? 'true' : undefined}
      data-clickable={clickable ? 'true' : 'false'}
      aria-label={`Map of the ${map.name.toLowerCase()}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg
        ref={svgRef}
        className="minimap__svg"
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="geometricPrecision"
      >
        <defs>
          <radialGradient id="minimap-glow">
            <stop offset="0" stopColor="#5cc8ff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#5cc8ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g ref={worldRef}>
          {grounds && (
            <>
              {grounds.zones.map((zone) => (
                <rect
                  key={zone.id}
                  className="minimap__zone"
                  x={zone.rect.x0}
                  y={zone.rect.z0}
                  width={zone.rect.x1 - zone.rect.x0}
                  height={zone.rect.z1 - zone.rect.z0}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-label={clickable ? `Walk to ${zone.label}` : zone.label}
                  onClick={clickable ? walk(zone.id) : undefined}
                  onKeyDown={clickable ? (event) => onRoomKey(event, zone.id) : undefined}
                />
              ))}
              {grounds.paths.map((path, index) => (
                <polyline
                  key={index}
                  className="minimap__path"
                  points={path.points.map((point) => `${point.x},${point.z}`).join(' ')}
                  strokeWidth={path.width}
                />
              ))}
              {grounds.buildings.map((building) => (
                <rect
                  key={building.id}
                  className="minimap__outbuilding"
                  x={building.rect.x0}
                  y={building.rect.z0}
                  width={building.rect.x1 - building.rect.x0}
                  height={building.rect.z1 - building.rect.z0}
                />
              ))}
              {grounds.fences.map((fence) =>
                fenceSegments(fence.points, fence.closed ?? false).map(([a, b], index) => (
                  <line
                    key={`${fence.id}-${index}`}
                    className={fence.id.includes('security') ? 'minimap__fence minimap__fence--security' : 'minimap__fence'}
                    x1={a.x}
                    y1={a.z}
                    x2={b.x}
                    y2={b.z}
                  />
                )),
              )}
              {pad && <circle className="minimap__rocket" cx={pad.x} cy={pad.z} r={2.2} />}
              {grounds.boundary && <circle className="minimap__boundary" cx={grounds.boundary.x} cy={grounds.boundary.z} r={grounds.boundary.radius} />}
              {grounds.areas
                ?.filter((area) => area.ping)
                .map((area) => (
                  <g key={area.id} className="minimap__area" data-area={area.id}>
                    <circle cx={area.x} cy={area.z} r={area.radius} className="minimap__area-ring" />
                    <circle cx={area.x} cy={area.z} r={Math.max(3, area.radius * 0.18)} className="minimap__area-ping" />
                  </g>
                ))}
              {lunar && home && (
                <>
                  <line ref={homeRef} className="minimap__home-line" x1={player.x} y1={player.z} x2={home.x} y2={home.z} />
                  <g className="minimap__home" transform={`translate(${home.x} ${home.z})`}>
                    <path d="M0 -7 L7 0 V7 H-7 V0 Z" />
                  </g>
                </>
              )}
              {lunar && <circle ref={rangeRef} className="minimap__range" cx={0} cy={0} r={0} />}
            </>
          )}

          {cars.map((car) => (
            <rect key={car.id} className="minimap__car" x={car.car.x0} y={car.car.z0} width={car.car.x1 - car.car.x0} height={car.car.z1 - car.car.z0} />
          ))}

          {rooms.map((room) => (
            <rect
              key={room.id}
              className="minimap__room"
              x={room.rect.x0}
              y={room.rect.z0}
              width={room.rect.x1 - room.rect.x0}
              height={room.rect.z1 - room.rect.z0}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-label={clickable ? `${move === 'float' ? 'Float' : 'Walk'} to ${room.label}` : room.label}
              onClick={clickable ? walk(room.id) : undefined}
              onKeyDown={clickable ? (event) => onRoomKey(event, room.id) : undefined}
            />
          ))}

          {!grounds &&
            doors.map((door) => (
              <rect
                key={`${door.center.x},${door.center.z}`}
                className="minimap__door"
                x={door.runs === 'x' ? door.center.x - door.width / 2 : door.center.x - DOOR_GAP / 2}
                y={door.runs === 'x' ? door.center.z - DOOR_GAP / 2 : door.center.z - door.width / 2}
                width={door.runs === 'x' ? door.width : DOOR_GAP}
                height={door.runs === 'x' ? DOOR_GAP : door.width}
              />
            ))}

          <g transform={`scale(${1 / LABEL_SCALE})`}>
            {(grounds ? groundsLabels : labels).map((label) => (
              <text
                key={label.id}
                className={grounds ? 'minimap__label minimap__label--screen' : 'minimap__label'}
                x={label.x * LABEL_SCALE}
                y={label.y * LABEL_SCALE}
                fontSize={label.size * LABEL_SCALE}
              >
                {label.text}
              </text>
            ))}
          </g>

          {!grounds &&
            consoles.map((item) => (
              <g key={item.id} className="minimap__console" data-done={used.includes(item.challengeId) ? 'true' : undefined}>
                <circle cx={item.position.x} cy={item.position.z} r={1.3} fill="url(#minimap-glow)" />
                <circle cx={item.position.x} cy={item.position.z} r={0.5} className="minimap__console-dot" />
              </g>
            ))}

          {!grounds &&
            markers.map((marker) => {
              const center = rectCenter(marker.rect)
              return <circle key={marker.id} className="minimap__marker" cx={center.x} cy={center.z} r={0.55} />
            })}

          {/* The rover: a body with four wheels, an arrow at its front and a short heading line ahead. */}
          {map.rover && grounds && (
            <g ref={roverRef} className="minimap__rover" data-driving={driving ? 'true' : undefined}>
              <line className="minimap__rover-heading" x1={0} y1={-1.6} x2={0} y2={-5} />
              <rect className="minimap__rover-wheel" x={-1.15} y={-1.1} width={0.4} height={0.7} rx={0.1} />
              <rect className="minimap__rover-wheel" x={0.75} y={-1.1} width={0.4} height={0.7} rx={0.1} />
              <rect className="minimap__rover-wheel" x={-1.15} y={0.5} width={0.4} height={0.7} rx={0.1} />
              <rect className="minimap__rover-wheel" x={0.75} y={0.5} width={0.4} height={0.7} rx={0.1} />
              <rect className="minimap__rover-body" x={-0.8} y={-1.3} width={1.6} height={2.6} rx={0.35} />
              <path className="minimap__rover-nose" d="M0 -2.1 L0.7 -1.1 H-0.7 Z" />
            </g>
          )}
          {mapFocus && mapFocus.mapId === map.id && (
            <g className="minimap__focus" transform={`translate(${mapFocus.x} ${mapFocus.z})`}>
              <circle className="minimap__focus-ring" r={grounds ? 9 : 2.4} />
              <circle className="minimap__focus-dot" r={grounds ? 2.5 : 0.7} />
              <text className="minimap__focus-label" y={grounds ? -12 : -3.2} fontSize={grounds ? 7 : 1.6}>
                {mapFocus.label}
              </text>
            </g>
          )}
          {!driving && (
            <g ref={playerRef}>
              <path className="minimap__player" d="M0 -1.1 L0.8 0.75 L0 0.35 L-0.8 0.75 Z" />
            </g>
          )}
        </g>
      </svg>

      {grounds && (
        <span className="minimap__compass" aria-label="North">
          <span ref={compassRef} className="minimap__compass-needle">
            N
          </span>
        </span>
      )}

      {big && (
        <ul className="minimap__legend" aria-label="Map key">
          <li>
            <span className="legend-icon legend-icon--player" /> You
          </li>
          {map.rover && (
            <li>
              <span className="legend-icon legend-icon--rover" /> Rover
            </li>
          )}
          {!grounds && (
            <>
              <li>
                <span className="legend-icon legend-icon--console" /> Challenge
              </li>
              <li>
                <span className="legend-icon legend-icon--done" /> Done
              </li>
            </>
          )}
          {lunar && (
            <>
              <li>
                <span className="legend-icon legend-icon--home" /> Outpost (home)
              </li>
              <li>
                <span className="legend-icon legend-icon--place" /> Places (ice crater…)
              </li>
              <li>
                <span className="legend-icon legend-icon--range" /> Battery range
              </li>
            </>
          )}
        </ul>
      )}

      <p className="minimap__hint">
        {multiLevel && <span className="minimap__level">{levelLabel}</span>}
        {hint}
        {hint && ' · '}
        <span className="keycap keycap--small">Shift</span>+<span className="keycap keycap--small">M</span> {big ? 'small map' : 'big map'} · <span className="keycap keycap--small">G</span> guidebook
      </p>
    </nav>
  )
}
