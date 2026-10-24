import { AnimatePresence, motion } from 'framer-motion'
import { Compass, Download, Monitor, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { isDesktop } from '../lib/desktop'
import { useHistory } from '../lib/history'
import { displayName, useAccount } from '../lib/sync'
import { usePlayer } from '../store/player'
import { Logo } from './Brand'

const key = (uid: string) => `spindle:welcomed:${uid}`

/**
 * First visit on a new account: instead of an empty library, offer the two
 * quickest ways in, bringing playlists over or starting from the charts.
 */
export function Welcome() {
  const user = useAccount((s) => s.user)
  const lastSynced = useAccount((s) => s.lastSynced)
  const [open, setOpen] = useState(false)
  const nav = useNavigate()

  useEffect(() => {
    // Wait for the first sync, so someone signing in on a new device isn't mistaken for a newcomer.
    if (!user || !lastSynced) return
    try {
      if (localStorage.getItem(key(user.id))) return
    } catch {
      return
    }
    const s = usePlayer.getState()
    const empty = !s.playlists.length && !Object.keys(s.liked).length && !useHistory.getState().plays.length
    if (!empty) return void localStorage.setItem(key(user.id), '1')
    const id = setTimeout(() => setOpen(true), 900)
    return () => clearTimeout(id)
  }, [user?.id, lastSynced])

  const close = () => {
    try {
      if (user) localStorage.setItem(key(user.id), '1')
    } catch {
      /* private mode */
    }
    setOpen(false)
  }
  const go = (path: string) => {
    close()
    nav(path)
  }

  const name = displayName(user)
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="wn-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.div
            className="wn-card welcome-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="wn-close" onClick={close} aria-label="Close">
              <X size={18} />
            </button>
            <Logo size={44} spinning />
            <h2 id="welcome-title">Welcome to Spindle{name !== 'You' ? `, ${name}` : ''}</h2>
            <p className="welcome-sub">Your library is empty for now. Here are the quickest ways to fill it.</p>
            <div className="welcome-options">
              <button className="welcome-option is-main" onClick={() => go('/import')} autoFocus>
                <Download size={20} />
                <span>
                  <b>Bring your playlists</b>
                  <small>Paste a Spotify, Apple Music or YouTube Music link</small>
                </span>
              </button>
              <button className="welcome-option" onClick={() => go('/charts')}>
                <Compass size={20} />
                <span>
                  <b>Start with what’s popular</b>
                  <small>Today’s top songs in your country</small>
                </span>
              </button>
              {!isDesktop && (
                <a className="welcome-option" href="https://github.com/Somesh-Thakur/Spindle/releases/latest" target="_blank" rel="noreferrer" onClick={close}>
                  <Monitor size={20} />
                  <span>
                    <b>Get the desktop app</b>
                    <small>Discord status, media keys and a mini player</small>
                  </span>
                </a>
              )}
            </div>
            <button className="welcome-skip" onClick={close}>
              I’ll look around first
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
