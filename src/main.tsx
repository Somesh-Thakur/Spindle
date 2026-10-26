import { MotionConfig } from 'framer-motion'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { TitleBar, UpdateBanner } from './components/DesktopChrome'
import { ErrorBoundary } from './components/ErrorBoundary'
import { startAutoplay } from './lib/autoplay'
import { startDesktop } from './lib/desktop'
import { startRemoteHost } from './lib/remote'
import { startBackgroundRule } from './lib/background'
import { startErrorReporting } from './lib/errors'
import { startInsights } from './lib/insights'
import { startHistory } from './lib/history'
import './lib/sync'
import { usePlayer } from './store/player'
// Fonts are bundled with the app (no requests to Google Fonts).
import '@fontsource-variable/anybody/standard.css'
import '@fontsource-variable/geist/wght.css'
import '@fontsource/mukta/400.css'
import '@fontsource/mukta/600.css'
import '@fontsource/mukta/800.css'
import './styles/app.css'
import './styles/v3.css'
import './styles/v4.css'
import './styles/v5.css'
import './styles/v6.css'
import './styles/v7.css'
import './styles/v8.css'
import './styles/v9.css'
import './styles/v10.css'
import './styles/phone.css'

// Offline start-up and fast repeat visits (public/sw.js). Not in development, where it would cache stale code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

// Record crashes so they can be fixed (src/lib/errors.ts).
startErrorReporting()

// Discord status, tray and media keys in the desktop app.
startDesktop()

// YouTube songs pause while Spindle is out of sight (YouTube's rules).
startBackgroundRule()

// The pop-out mini player's buttons come here.
// "Open Spindle" and playing a YouTube song from it bring Spindle back to the front.
startRemoteHost(() => {
  const tauri = (window as { __TAURI_INTERNALS__?: { invoke: (cmd: string) => Promise<unknown> } }).__TAURI_INTERNALS__
  if (tauri) return tauri.invoke('show_main').catch(() => {})
  window.focus()
})

// Count visits for the admin Insights tab (no cookies, no third party).
startInsights()

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
      {/* Desktop app only: the window's title bar and update notice, outside the app so they survive a crash. */}
      <TitleBar />
      <UpdateBanner />
      <HashRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </HashRouter>
    </MotionConfig>
  </React.StrictMode>,
)
