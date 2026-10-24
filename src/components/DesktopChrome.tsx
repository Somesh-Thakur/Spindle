import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Copy, Download, Loader2, Minus, Square, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { installUpdate, isDesktop, isMac, useDesktop, win } from '../lib/desktop'
import { useCurrent, usePlayer } from '../store/player'
import { Logo } from './Brand'

/**
 * Spindle's own title bar in the desktop app, in place of the plain Windows
 * frame. Drag it to move the window and double-click to maximise. On a Mac
 * the system's traffic lights stay, so it only leaves room for them.
 */
export function TitleBar() {
  const maximized = useDesktop((s) => s.maximized)
  const track = useCurrent()
  const playing = usePlayer((s) => s.isPlaying)
  if (!isDesktop) return null
  return createPortal(
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <Logo size={16} spinning={playing} />
        <span>Spindle</span>
      </div>
      <div className="titlebar-now" data-tauri-drag-region>
        {track && (
          <>
            <b>{track.title}</b> · {track.artist}
          </>
        )}
      </div>
      {!isMac && (
        <div className="titlebar-buttons">
          <button onClick={win.minimize} aria-label="Minimise" title="Minimise">
            <Minus size={15} strokeWidth={1.6} />
          </button>
          <button onClick={win.toggleMaximize} aria-label={maximized ? 'Restore' : 'Maximise'} title={maximized ? 'Restore' : 'Maximise'}>
            {maximized ? <Copy size={12} strokeWidth={1.6} style={{ transform: 'scaleX(-1)' }} /> : <Square size={12} strokeWidth={1.6} />}
          </button>
          <button className="is-close" onClick={win.close} aria-label="Close" title="Close">
            <X size={16} strokeWidth={1.6} />
          </button>
        </div>
      )}
    </header>,
    document.body,
  )
}

/** "A new version is ready" card, with the release notes and an Update button. */
export function UpdateBanner() {
  const update = useDesktop((s) => s.update)
  const installing = useDesktop((s) => s.installing)
  const [hidden, setHidden] = useState('')
  const [notes, setNotes] = useState(false)
  if (!isDesktop) return null
  const show = update && hidden !== update.version
  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.aside
          className="update-card"
          role="status"
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          <div className="update-head">
            <span className="update-icon">
              <Download size={16} />
            </span>
            <div>
              <b>Spindle {update.version} is ready</b>
              <span>{installing ? 'Updating… Spindle will restart in a moment.' : 'Update now to get the latest fixes and features.'}</span>
            </div>
          </div>
          {update.notes && (
            <>
              <button className="update-notes-toggle" onClick={() => setNotes((n) => !n)} aria-expanded={notes}>
                What’s new <ChevronDown size={14} style={{ transform: notes ? 'rotate(180deg)' : undefined }} />
              </button>
              {notes && <div className="update-notes">{update.notes}</div>}
            </>
          )}
          <div className="update-actions">
            {!installing && (
              <button className="btn btn-ghost" onClick={() => setHidden(update.version)}>
                Later
              </button>
            )}
            <button className="btn btn-primary" onClick={installUpdate} disabled={installing}>
              {installing ? <Loader2 size={15} className="spin" /> : null} {installing ? 'Updating' : 'Update now'}
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  )
}
