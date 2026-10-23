import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'

const KEY = 'spindle:intro'

function seen() {
  try {
    return sessionStorage.getItem(KEY) === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** A short opening: the record spins up, the needle drops, the name settles, the curtain lifts. */
export function Intro() {
  const [show, setShow] = useState(() => !seen())

  useEffect(() => {
    if (!show) return
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      /* private mode */
    }
    const done = () => setShow(false)
    const id = setTimeout(done, 1900)
    addEventListener('pointerdown', done, { once: true })
    addEventListener('keydown', done, { once: true })
    return () => {
      clearTimeout(id)
      removeEventListener('pointerdown', done)
      removeEventListener('keydown', done)
    }
  }, [show])

  const letters = 'spindle'.split('')

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="intro"
          exit={{ clipPath: 'inset(0 0 100% 0)' }}
          initial={{ clipPath: 'inset(0 0 0% 0)' }}
          transition={{ duration: 0.75, ease: [0.76, 0, 0.24, 1] }}
          aria-hidden="true"
        >
          <div className="intro-deck">
            <motion.div
              className="intro-disc"
              initial={{ scale: 0.6, opacity: 0, rotate: -120 }}
              animate={{ scale: 1, opacity: 1, rotate: 360 }}
              transition={{ duration: 1.6, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <span className="intro-label" />
            </motion.div>
            <motion.svg
              className="intro-arm"
              viewBox="0 0 40 120"
              initial={{ rotate: -38, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.8, ease: [0.5, 0, 0.2, 1] }}
            >
              <path d="M30 8v70l-14 16" fill="none" stroke="#e9e6df" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="30" cy="8" r="6" fill="#e9e6df" />
              <rect x="8" y="90" width="12" height="9" rx="2" transform="rotate(-40 14 94)" fill="#e9e6df" />
            </motion.svg>
          </div>
          <div className="intro-word">
            {letters.map((l, i) => (
              <motion.span
                key={i}
                initial={{ y: '110%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                transition={{ delay: 0.55 + i * 0.05, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
              >
                {l}
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
