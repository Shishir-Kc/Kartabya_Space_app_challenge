import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import '@fontsource/barlow-semi-condensed/latin-800-italic.css'
import './styles/tokens.css'
import './styles/global.css'
import './styles/glass.css'
import { App } from './App'
import { startSfx } from './audio/sfx'
import { startVoices } from './audio/voices'
import { PortraitGallery } from './hud/PortraitGallery'

/** Dev builds only: `?portraits` shows every face and expression instead of the game. */
const gallery = import.meta.env.DEV && new URLSearchParams(window.location.search).has('portraits')

// The crew's recorded voices play with every spoken line, and the sound effects with the game.
if (!gallery) {
  startVoices()
  startSfx()
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element in index.html')

createRoot(root).render(
  <StrictMode>
    {gallery ? <PortraitGallery /> : <App />}
  </StrictMode>,
)
