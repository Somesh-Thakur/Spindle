import { MotionConfig } from 'framer-motion'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { startAutoplay } from './lib/autoplay'
import { startErrorReporting } from './lib/errors'
import { startHistory } from './lib/history'
import './lib/sync'
import { usePlayer } from './store/player'
import './styles/app.css'
import './styles/v3.css'
import './styles/v4.css'
import './styles/v5.css'
import './styles/v6.css'
import './styles/v7.css'
import './styles/v8.css'
import './styles/v9.css'
import './styles/phone.css'

// Offline start-up and fast repeat visits (public/sw.js). Not in development, where it would cache stale code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

// Record crashes so they can be fixed (src/lib/errors.ts).
startErrorReporting()

// Count listening time for Stats and playlist play counts.
startHistory()
// Keep the music going with similar songs when the queue ends.
startAutoplay()

// Dev-only handle for poking at player state from the console.
if (import.meta.env.DEV) Object.assign(window, { __player: usePlayer })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      {/* Hash routing keeps deep links working on any free static host. */}
      <HashRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </HashRouter>
    </MotionConfig>
  </React.StrictMode>,
)
