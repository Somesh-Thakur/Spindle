import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LATEST } from '../lib/changelog'

const SEEN = 'spindle:whats-new'

const read = () => {
  try {
    return localStorage.getItem(SEEN)
  } catch {
    return LATEST.version
  }
}
const mark = () => {
  try {
    localStorage.setItem(SEEN, LATEST.version)
  } catch {
    /* private mode */
  }
}

/** "What's new" once per release, for people who used Spindle before it. */
export function WhatsNew() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const seen = read()
    // Someone new to Spindle doesn't need a list of changes; returning listeners do.
    const returning = seen !== null || !!localStorage.getItem('spindle:history') || !!localStorage.getItem('aura:sync:pending')
    if (seen === LATEST.version) return
    if (!returning) return mark()
    const id = setTimeout(() => setOpen(true), 1500)
    return () => clearTimeout(id)
  }, [])

  const close = () => {
    mark()
    setOpen(false)
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="wn-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.div
            className="wn-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wn-title"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="wn-close" onClick={close} aria-label="Close">
              <X size={18} />
            </button>
            <span className="wn-kicker">What’s new · v{LATEST.version}</span>
            <h2 id="wn-title">{LATEST.title}</h2>
            <ul>
              {LATEST.items.map((it) => (
                <li key={it.text}>
                  <span aria-hidden="true">{it.emoji}</span>
                  {it.text}
                </li>
              ))}
            </ul>
            <button className="btn btn-primary wn-go" onClick={close} autoFocus>
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
