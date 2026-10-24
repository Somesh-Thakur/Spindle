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
import './styles/phone.css'

// iOS home-screen apps with a see-through status bar can get a page that's short
// by the status bar's height, leaving a black strip at the bottom. Measure the
// gap (0 when iOS gets it right) so the layout can reach the real bottom.
function measureViewportGap() {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  // screen.width/height don't rotate on iOS, so pick the side that matches the page's orientation.
  const portrait = innerHeight > innerWidth
  const screenHeight = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)
  const gap = standalone ? screenHeight - innerHeight : 0
  document.documentElement.style.setProperty('--vh-gap', `${gap > 0 && gap < 90 ? gap : 0}px`)
}
measureViewportGap()
addEventListener('resize', measureViewportGap)
addEventListener('orientationchange', () => setTimeout(measureViewportGap, 300))

// Offline start-up and fast repeat visits (public/sw.js). Not in development, where it would cache stale code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

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
