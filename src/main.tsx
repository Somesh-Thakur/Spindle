import { MotionConfig } from 'framer-motion'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './lib/sync'
import { usePlayer } from './store/player'
import './styles/app.css'
import './styles/v3.css'
import './styles/v4.css'
import './styles/v5.css'
import './styles/v6.css'
import './styles/v7.css'
import './styles/v8.css'

// Dev-only handle for poking at player state from the console.
if (import.meta.env.DEV) Object.assign(window, { __player: usePlayer })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      {/* Hash routing keeps deep links working on any free static host. */}
      <HashRouter>
        <App />
      </HashRouter>
    </MotionConfig>
  </React.StrictMode>,
)
