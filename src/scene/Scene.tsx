import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { requireMap } from '../maps/registry'
import { GRAPHICS_PRESETS, pixelRatioFor } from '../state/graphics'
import { EYE_HEIGHT } from '../state/player'
import { useGame } from '../state/store'
import { MapView } from './MapView'
import { FOG_FAR, FOG_NEAR, PALETTE } from './palette'
import { PerformanceGuard } from './PerformanceGuard'
import { PlayerController } from './PlayerController'
import { PostEffects } from './PostEffects'
import { RenderStatsProbe } from './RenderStatsProbe'
import { SequenceDirector } from './SequenceDirector'
import { LunarShadows } from './LunarShadows'
import { ShadowFreeze } from './ShadowFreeze'
import { LaunchStage } from './cinematic/LaunchStage'
import { LandingStage } from './cinematic/LandingStage'
import { getMap } from '../maps/registry'
import { prebakeLunar } from './kit/lunarPrebake'
import { LobbyStage } from './lobby/LobbyStage'

/**
 * The 3D view: the current map and the player. The canvas is rebuilt when
 * the graphics tier changes, because antialiasing can only be chosen when
 * the WebGL context is created.
 */
export function Scene() {
  const graphics = useGame((state) => state.graphics)
  const preset = GRAPHICS_PRESETS[graphics]
  const mapId = useGame((state) => state.mapId)
  const stage = useGame((state) => state.cinematicStage)
  // The title and the menu show the lobby; the mission stays loaded behind it, on its own layer.
  const inGame = useGame((state) => state.screen === 'game')
  const runId = useGame((state) => state.runId)
  const map = requireMap(mapId)
  const usesComposer = preset.fxaa || preset.ambientOcclusion || preset.bloom
  // Space and the Moon have no air: no haze, and black behind everything.
  const lunar = map.exterior?.scene === 'lunar-south-pole'
  // The lobby is always the launch complex at dusk, whatever the mission's map is.
  const inSpace = inGame && (map.exterior?.scene === 'space' || lunar)

  // On the way to the Moon, the outpost's terrain and light are worked out in
  // the background, ready for the landing (and for arriving there).
  useEffect(() => {
    if (map.gravity !== 'micro') return
    const outpost = getMap('outpost')
    if (outpost) prebakeLunar(outpost)
  }, [map])

  // The HUD reads this to drop the frosted-glass blur on the low tier.
  useEffect(() => {
    document.documentElement.dataset.graphics = graphics
  }, [graphics])

  return (
    <Canvas
      key={graphics}
      className="app__scene"
      dpr={pixelRatioFor(preset)}
      shadows={preset.shadows ? 'percentage' : false}
      gl={{ antialias: preset.msaa && !usesComposer, powerPreference: 'high-performance' }}
      camera={{ position: [0, EYE_HEIGHT, 0], fov: 70, near: 0.05, far: 800 }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 0.85
      }}
    >
      <color attach="background" args={[inSpace ? '#000003' : PALETTE.skyTop]} />
      {!inSpace && <fog attach="fog" args={[PALETTE.fog, FOG_NEAR, FOG_FAR]} />}
      <MapView key={map.id} map={map} />
      {/* A new mission starts the player and the sequences over (the key), even on the same map. */}
      <PlayerController key={`player-${runId}`} map={map} />
      {map.seat && <SequenceDirector key={`sequence-${map.id}-${runId}`} map={map} />}
      {/* The launch and landing cinematics' outside scenes, built only while one plays. */}
      {inGame && stage === 'launch-pad' && <LaunchStage />}
      {inGame && stage === 'landing-site' && <LandingStage />}
      {!inGame && <LobbyStage />}
      {/* Shadows are frozen after a few frames; coming back from the lobby they are drawn again. */}
      {preset.shadows && <ShadowFreeze mapId={`${map.id}:${inGame ? 'game' : 'lobby'}`} freeze={!lunar} />}
      {preset.shadows && lunar && <LunarShadows key={`shadows-${map.id}`} map={map} />}
      {usesComposer && <PostEffects preset={preset} />}
      <PerformanceGuard />
      {import.meta.env.DEV && <RenderStatsProbe />}
    </Canvas>
  )
}
