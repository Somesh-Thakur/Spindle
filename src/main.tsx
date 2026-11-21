import { MotionConfig } from 'framer-motion'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { TitleBar, UpdateBanner } from './components/DesktopChrome'
import { ErrorBoundary } from './components/ErrorBoundary'
import { InstallGuide } from './components/InstallGuide'
import { startAutoplay } from './lib/autoplay'
import { startDesktop } from './lib/desktop'
import { startRemoteHost } from './lib/remote'
import { startErrorReporting } from './lib/errors'
import { startIosGapFix } from './lib/iosGap'
import { startTooltips } from './lib/tooltip'
import { startPrefetch } from './lib/prefetch'
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
// Mukta's Punjabi (Gurmukhi) sibling; only downloaded when Gurmukhi text is on screen.
import '@fontsource/mukta-mahee/gurmukhi-400.css'
import '@fontsource/mukta-mahee/gurmukhi-600.css'
import '@fontsource/mukta-mahee/gurmukhi-800.css'
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
import { at } from './lib/site'

// Offline start-up and fast repeat visits (public/sw.js). Not in development, where it would cache stale code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register(at('sw.js')).catch(() => {}))
}

// iPhone home-screen app: no empty strip under the bottom bars.
startIosGapFix()

// Hover labels for icon buttons (with a mouse).
startTooltips()

// While you're in another window, decorative animations rest (v5.css .is-away).
// Checked a moment later: clicking into the YouTube player also blurs the page.
const markAway = () => setTimeout(() => document.documentElement.classList.toggle('is-away', !document.hasFocus()), 50)
addEventListener('blur', markAway)
addEventListener('focus', markAway)

// Record crashes so they can be fixed (src/lib/errors.ts).
startErrorReporting()

// Discord status, tray and media keys in the desktop app.
startDesktop()

// The pop-out mini player's buttons come here.
startRemoteHost(() => window.focus())

// Count visits for the admin Insights tab (no cookies, no third party).
startInsights()

// Once: start everyone, including existing devices, with the video hidden.
try {
  if (!localStorage.getItem('spindle:video-hidden-default')) {
    usePlayer.setState({ videoHidden: true })
    localStorage.setItem('spindle:video-hidden-default', '1')
  }
} catch {
  /* private mode */
}

// Find the next songs in the queue ahead of time.
startPrefetch()

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
      {/* "Use Spindle like an app": opened from Home, the sign-in page and Settings. */}
      <InstallGuide />
      <HashRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </HashRouter>
    </MotionConfig>
  </React.StrictMode>,
)
