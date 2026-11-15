import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Frustum, Matrix4, type Mesh, type Object3D, type Points, type Sprite } from 'three'
import type { OutfitId } from '../character/outfits'
import type { MapId, SequenceId } from '../maps/types'
import type { AstronautProfile } from '../state/astronaut'
import { lobby } from '../state/lobby'
import { cinematic } from '../state/cinematic'
import { skipSequence, startSequence } from './sequences'
import { useGame, type MenuTab } from '../state/store'
import { renderStats } from './renderStats'
import { airlockState, requestCycle } from './airlock'
import { enterRover, roverState } from './rover'
import { player } from '../state/player'
import { carWithPlayer } from './elevatorLogic'
import { isLocked } from './pointerLock'
import { challengeKey, openDecision } from './challenges'
import { backToMenu, closeNight, hazardClock, openDebrief, setHazardMode, showEnding, triggerHazard, tryAgain } from './run'
import type { Ending, MissionState } from '../state/mission'
import { crewShown } from './crewRuntime'
import { transmit } from '../state/transmissions'
import type { CrewLine } from '../data/challenges'

declare global {
  interface Window {
    /** Dev builds only: hooks for headless checks (memory across map switches). */
    __lunar?: {
      memory: () => { geometries: number; textures: number; programs: number }
      loadMap: (id: MapId) => void
      /** The decision panel open now (stage, picked option, split, outcome), or null. */
      challenge: () => unknown
      /** Opens a challenge's decision panel, as E at its console does. */
      openChallenge: (id: number) => boolean
      /** Presses a key in the decision panel (KeyboardEvent.code), as the player would. */
      challengeKey: (code: string) => boolean
      /** The mission state (meters, counters, flags, history). */
      mission: () => unknown
      /** Starts the outpost solar storm now (alarm, then its panel). */
      storm: () => boolean
      /** Starts a hazard now: 'transitStorm', 'outpostStorm' or 'meteoroid'. */
      hazard: (kind: 'transitStorm' | 'outpostStorm' | 'meteoroid') => boolean
      /** Ends the run now with this ending (plays its scene on the Moon, then the card). */
      ending: (which: Ending) => void
      /** Sends a line as a transmission (style and headline optional). */
      say: (line: { speakerId: string; lineId: string; text: string }, style?: 'radio' | 'hologram' | 'alert', headline?: string) => void
      /** Visible meshes in view grouped by what they are, with triangles (finding what costs draw calls). */
      draws: () => unknown
      /** Visible meshes per branch of the scene graph. */
      tree: () => unknown
      /** How many meshes cast shadows; false turns them all off (an experiment). */
      shadowCasters: (on?: boolean) => number
      /** Where each crew figure is shown now. */
      crew: () => unknown
      /** Puts the player somewhere, looking a given way (for screenshots). */
      place: (pose: { x: number; z: number; yaw?: number; pitch?: number }) => void
      /** Changes the mission directly (e.g. a crew member's health), for testing what follows from it. */
      patchMission: (patch: Partial<MissionState>) => void
      /** Opens the Mission Handbook for a finished mission (e.g. one saved by tools/checks/handbook.mts). */
      handbook: (mission: MissionState) => void
      /** Forces hazards off ('none'), to the maximum ('max'), or back to chance (null). */
      hazardMode: (mode: 'none' | 'max' | 'random' | null) => void
      /** The run around the challenges: night card, ending or debrief, caption, alarm, storm clock. */
      run: () => unknown
      /** Closes the night card, opens the debrief, or tries again, as the buttons do. */
      runAction: (action: 'night' | 'debrief' | 'again' | 'menu') => void
      /** Marks a challenge console as used, as if the player had pressed E there. */
      useConsole: (challengeId: number) => void
      /** Starts an airlock cycle toward the outside or the inside. */
      cycleAirlock: (toOutside: boolean) => void
      airlock: () => { phase: string; pressure: number; inner: number; outer: number; suited: boolean } | null
      /** Puts the player in the rover's seat, optionally moving it and setting its battery. */
      drive: (patch?: { x?: number; z?: number; yaw?: number; battery?: number }) => void
      rover: () => { x: number; z: number; speed: number; battery: number; headlights: boolean; driving: boolean } | null
      /** The rover model's wheels: how far each has rolled and is steered, radians (to check they move). */
      roverWheels: () => Record<string, { roll: number; steer: number }> | null
      /** Starts the launch or landing cinematic now, from where the player is (on the spacecraft). */
      sequence: (id: SequenceId) => void
      /** Skips the cinematic playing. */
      skip: () => void
      /** Where the cinematic is: script time, outside or not, and the stage built. */
      cinematic: () => { time: number; outside: boolean; stage: string | null; step: string | null }
      /** The menu: which screen and tab are up, and the astronaut. */
      menu: () => { screen: string; tab: string; started: boolean; mode: string; mapId: string; astronaut: AstronautProfile }
      /** From the title to the lobby, on a tab. */
      openMenu: (tab?: MenuTab) => void
      /** Changes the astronaut, as the ASTRONAUT tab does. */
      setAstronaut: (patch: Partial<AstronautProfile>) => void
      /** The lobby's suit view, and a close-up of the face (for checking skin tones). */
      lobbyView: (view: { outfit?: OutfitId; closeUp?: boolean; yaw?: number }) => void
      /** Starts a mission (a new one, or the one in progress) and leaves it for the lobby, as the menu's buttons do. */
      play: (fresh: boolean) => void
      quit: () => void
      /** Where the player is and looks, whether the mouse is captured, and the elevator car they are in (with its phase). */
      view: () => { x: number; z: number; level: string; yaw: number; pitch: number; locked: boolean; car: string | null; phase: string | null; panel: string | null }
    }
  }
}

/**
 * Counts draw calls and triangles for the dev counter. The renderer's own
 * counter resets on every render call, which would hide post-processing
 * passes, so it is reset here once per frame instead. This runs before the
 * frame is drawn, so it reports the previous frame's totals.
 */
export function RenderStatsProbe() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const cameraRef = useRef(useThree((state) => state.camera))
  cameraRef.current = useThree((state) => state.camera)

  useEffect(() => {
    gl.info.autoReset = false
    window.__lunar = {
      memory: () => ({
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs: gl.info.programs?.length ?? 0,
      }),
      loadMap: (id) => useGame.getState().loadMap(id),
      challenge: () => useGame.getState().challenge,
      openChallenge: (id) => openDecision(id),
      challengeKey: (code) => challengeKey(code),
      mission: () => useGame.getState().mission,
      storm: () => triggerHazard('outpostStorm'),
      hazard: (kind) => triggerHazard(kind),
      crew: () => [...crewShown.values()],
      shadowCasters: (on) => {
        let n = 0
        const names = new Map<string, number>()
        scene.traverse((o) => {
          if ((o as Mesh).isMesh && o.castShadow && o.visible) {
            n++
            let label = ''
            let p: Object3D | null = o
            while (p && !label) {
              label = p.name
              p = p.parent
            }
            names.set(label || 'unnamed', (names.get(label || 'unnamed') ?? 0) + 1)
          }
          if ((o as Mesh).isMesh && on === false) o.castShadow = false
        })
        console.log([...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${v} ${k}`).join(' | '))
        return n
      },
      tree: () => {
        // Visible meshes under each branch of the scene, two levels down (what costs draw calls).
        // Only what the camera can see (what is actually drawn, before the shadow pass).
        const camera = cameraRef.current
        camera.updateMatrixWorld()
        const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
        const count = (o: Object3D) => {
          let n = 0
          o.traverseVisible((c) => {
            const m = c as Mesh
            if (!(m.isMesh || (c as Points).isPoints)) return
            if (m.frustumCulled && m.geometry && !frustum.intersectsObject(m)) return
            n++
          })
          return n
        }
        const out: string[] = []
        scene.children.forEach((child, i) => {
          const n = count(child)
          if (!n) return
          out.push(`${i} ${child.type} ${child.name}: ${n}`)
          child.children.forEach((sub, j) => {
            const m = count(sub)
            if (m < 2) return
            // A hint of what it is: the first few names or material colours inside.
            const hints: string[] = []
            sub.traverseVisible((c) => {
              const mat = (c as Mesh).material as { name?: string; color?: { getHexString: () => string }; type?: string } | undefined
              if (hints.length < 3 && (c as Mesh).isMesh) hints.push(c.name || mat?.name || `${mat?.type ?? ''}#${mat?.color?.getHexString() ?? ''}`)
            })
            out.push(`  ${i}.${j} ${sub.type} ${sub.name}: ${m}  (${hints.join(', ')})`)
          })
        })
        return out
      },
      draws: () => {
        const groups = new Map<string, { meshes: number; triangles: number }>()
        scene.updateMatrixWorld()
        scene.traverseVisible((object) => {
          const mesh = object as Mesh
          if (!mesh.isMesh && !(object as Points).isPoints && !(object as Sprite).isSprite) return
          // Name the group after the first named ancestor (or the material key).
          let label = ''
          let o: Object3D | null = object
          while (o && !label) {
            label = o.name || o.userData.label || ''
            o = o.parent
          }
          const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
          const key = `${label || 'unnamed'} [${object.type}${material?.name ? ` ${material.name}` : ''}]`
          const index = mesh.geometry?.index
          const triangles = index ? index.count / 3 : (mesh.geometry?.attributes.position?.count ?? 0) / 3
          const g = groups.get(key) ?? { meshes: 0, triangles: 0 }
          g.meshes += 1
          g.triangles += triangles
          groups.set(key, g)
        })
        return [...groups.entries()].sort((a, b) => b[1].meshes - a[1].meshes).map(([k, v]) => `${v.meshes}\t${Math.round(v.triangles)}\t${k}`)
      },
      say: (line, style, headline) => {
        transmit(line as CrewLine, { style, headline })
      },
      place: (pose) => {
        Object.assign(player, pose)
      },
      patchMission: (patch) => useGame.setState((s) => ({ mission: { ...s.mission, ...patch } })),
      handbook: (mission) => useGame.setState({ mission, afterword: 'debrief', mode: 'panel', challenge: null, night: null }),
      ending: (which) => {
        useGame.setState((s) => ({ mission: { ...s.mission, status: 'ended', ending: which } }))
        showEnding()
      },
      hazardMode: (mode) => setHazardMode(mode),
      run: () => {
        const s = useGame.getState()
        return { night: s.night, afterword: s.afterword, caption: s.caption, alarm: s.alarm, hazards: { ...hazardClock(), counts: s.mission.hazards, flares: s.mission.usedFlares }, mode: s.mode, mapId: s.mapId, runId: s.runId }
      },
      runAction: (action) => {
        if (action === 'night') closeNight()
        else if (action === 'debrief') openDebrief()
        else if (action === 'again') tryAgain()
        else backToMenu()
      },
      useConsole: (challengeId) => useGame.getState().markConsoleUsed(challengeId),
      cycleAirlock: (toOutside) => requestCycle(toOutside),
      drive: (patch) => {
        const rover = roverState()
        if (!rover) return
        Object.assign(rover, patch ?? {})
        enterRover()
        useGame.getState().setDriving(true)
      },
      roverWheels: () => {
        const wheels: Record<string, { roll: number; steer: number }> = {}
        for (const key of ['fl', 'fr', 'rl', 'rr']) {
          const steer = scene.getObjectByName(`wheel_${key}`)
          const spin = scene.getObjectByName(`spin_${key}`)
          if (steer && spin) wheels[key] = { roll: spin.rotation.x, steer: steer.rotation.y }
        }
        return Object.keys(wheels).length ? wheels : null
      },
      rover: () => {
        const s = roverState()
        return s ? { x: s.x, z: s.z, speed: s.speed, battery: s.battery, headlights: s.headlights, driving: s.driving } : null
      },
      menu: () => {
        const s = useGame.getState()
        return { screen: s.screen, tab: s.menuTab, started: s.started, mode: s.mode, mapId: s.mapId, astronaut: s.astronaut }
      },
      openMenu: (tab) => {
        useGame.getState().openMenu()
        if (tab) useGame.getState().setMenuTab(tab)
      },
      setAstronaut: (patch) => useGame.getState().setAstronaut({ ...useGame.getState().astronaut, ...patch }),
      lobbyView: (view) => {
        if (view.outfit) lobby.outfit = view.outfit
        if (view.closeUp !== undefined) lobby.closeUp = view.closeUp
        if (view.yaw !== undefined) lobby.yaw = view.yaw
      },
      play: (fresh) => useGame.getState().enterGame(fresh),
      quit: () => useGame.getState().leaveGame(),
      view: () => {
        const car = carWithPlayer()
        return { x: player.x, z: player.z, level: player.level, yaw: player.yaw, pitch: player.pitch, locked: isLocked(), car: car?.def.id ?? null, phase: car?.phase ?? null, panel: useGame.getState().elevatorPanel }
      },
      sequence: (id) => startSequence(id),
      skip: () => skipSequence(),
      cinematic: () => ({
        time: cinematic.time,
        outside: cinematic.outside,
        stage: useGame.getState().cinematicStage,
        step: useGame.getState().sequence?.step ?? null,
      }),
      airlock: () => {
        const s = airlockState()
        return s ? { phase: s.phase, pressure: s.pressure, inner: s.inner, outer: s.outer, suited: s.suited } : null
      },
    }
    return () => {
      gl.info.autoReset = true
      delete window.__lunar
    }
  }, [gl, scene])

  useFrame(() => {
    renderStats.calls = gl.info.render.calls
    renderStats.triangles = gl.info.render.triangles
    gl.info.reset()
  })
  return null
}
