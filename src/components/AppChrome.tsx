import { AnimatePresence, motion } from 'framer-motion'
import { Share, SquarePlus, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const DISMISSED = 'spindle:install-dismissed'

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const isIOS = () => /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const phoneSized = () => matchMedia('(max-width: 860px)').matches

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED) === '1'
  } catch {
    return true
  }
}

interface InstallEvent extends Event {
  prompt: () => Promise<void>
}

/**
 * A one-time card on phones that explains how to put Spindle on the home
 * screen. iPhones have no install button, so it shows the two taps in Safari;
 * Android gets the browser's own install prompt.
 */
export function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [android, setAndroid] = useState<InstallEvent | null>(null)

  useEffect(() => {
    if (standalone() || wasDismissed() || !phoneSized()) return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setAndroid(e as InstallEvent)
    }
    addEventListener('beforeinstallprompt', onPrompt)
    // Give people a moment with the app before suggesting it.
    const id = setTimeout(() => setShow(true), 12000)
    return () => {
      clearTimeout(id)
      removeEventListener('beforeinstallprompt', onPrompt)
    }
  }, [])

  const close = () => {
    setShow(false)
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      /* private mode */
    }
  }

  const visible = show && (isIOS() || !!android)

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          className="install-card glass"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          aria-label="Install Spindle"
        >
          <img src="/brand/spindle-icon-120.png" alt="" width={52} height={52} />
          <div className="install-text">
            <b>Get the Spindle app</b>
            {android ? (
              <span>Full screen, on your home screen, and opens even offline.</span>
            ) : (
              <span>
                Tap <Share size={14} className="install-glyph" /> <b>Share</b>, then <SquarePlus size={14} className="install-glyph" /> <b>Add to Home Screen</b>.
              </span>
            )}
          </div>
          {android && (
            <button className="btn btn-primary" onClick={() => android.prompt().finally(close)}>
              Install
            </button>
          )}
          <button className="icon-btn install-close" onClick={close} aria-label="Not now">
            <X size={16} />
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

/** A small pill while there's no internet. Downloads and the library still work. */
export function OfflinePill() {
  const [offline, setOffline] = useState(() => !navigator.onLine)
  useEffect(() => {
    const on = () => setOffline(!navigator.onLine)
    addEventListener('online', on)
    addEventListener('offline', on)
    return () => {
      removeEventListener('online', on)
      removeEventListener('offline', on)
    }
  }, [])
  return (
    <AnimatePresence>
      {offline && (
        <motion.div className="offline-pill glass" role="status" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }}>
          <WifiOff size={14} /> Offline · downloads still play
        </motion.div>
      )}
    </AnimatePresence>
  )
}
