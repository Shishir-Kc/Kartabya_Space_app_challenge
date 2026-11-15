import { TeachingCardView } from './hud/TeachingCardView'
import { ChallengePanel } from './hud/ChallengePanel'
import { Handbook } from './hud/Handbook'
import { AlarmOverlay, EndingCard, NightCard, StormDirector } from './hud/RunCards'
import { Transmission } from './hud/Transmission'
import { SceneGrade } from './hud/SceneGrade'
import { Guidebook } from './hud/Guidebook'
import { Fade } from './hud/Fade'
import { ElevatorPanel } from './hud/ElevatorPanel'
import { FpsCounter } from './hud/FpsCounter'
import { Hud } from './hud/Hud'
import { Minimap } from './hud/Minimap'
import { PlaceholderPanel } from './hud/PlaceholderPanel'
import { PlayOverlay } from './hud/PlayOverlay'
import { RoverDashboard } from './hud/RoverDashboard'
import { SequenceOverlay } from './hud/SequenceOverlay'
import { BeatOverlay } from './hud/BeatOverlay'
import { MainMenu } from './hud/menu/MainMenu'
import { PauseMenu } from './hud/menu/PauseMenu'
import { Toast } from './hud/Toast'
import { TransitionOverlay } from './hud/TransitionOverlay'
import { Scene } from './scene/Scene'
import { useGame } from './state/store'

/**
 * One 3D scene with everything else laid over it: the lobby's menu on the
 * title and menu screens, and the mission's HUD, panels and pause menu in
 * the game.
 */
export function App() {
  const inGame = useGame((state) => state.screen === 'game')
  return (
    <div className="app">
      <Scene />
      {inGame && (
        <>
          <SceneGrade />
          <Guidebook />
          <AlarmOverlay />
          <Hud />
          <PlayOverlay />
          <SequenceOverlay />
          <BeatOverlay />
          <RoverDashboard />
          <ElevatorPanel />
          <TeachingCardView />
          <Minimap />
        </>
      )}
      <Toast />
      {import.meta.env.DEV && <FpsCounter />}
      <Fade />
      {inGame && <TransitionOverlay />}
      {inGame && <PlaceholderPanel />}
      {inGame && <ChallengePanel />}
      {inGame && <Transmission />}
      {inGame && <NightCard />}
      {inGame && <EndingCard />}
      {inGame && <Handbook />}
      {inGame && <StormDirector />}
      <MainMenu />
      <PauseMenu />
    </div>
  )
}
