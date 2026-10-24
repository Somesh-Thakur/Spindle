import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { artUrl } from '../lib/format'
import { useSaver } from '../lib/saver'
import { useCurrent, usePlayer } from '../store/player'
import { Logo } from './Brand'

const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/**
 * A dim, nearly still screen after a few idle minutes (Settings → Appearance),
 * or with Z. The app underneath is hidden and its visuals pause; this redraws
 * once a minute and drifts slowly, so it costs almost nothing and never burns in.
 */
export function Screensaver() {
  const on = useSaver((s) => s.on)
  const minutes = usePlayer((s) => s.screensaver)

  // Idle timer, and Z to start it by hand.
  useEffect(() => {
    if (on) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      clearTimeout(timer)
      if (minutes > 0) timer = setTimeout(maybeStart, minutes * 60_000)
    }
    const maybeStart = () => {
      const s = usePlayer.getState()
      // Not while someone's watching the music video, or with the window in the background.
      if (document.hidden || (s.isPlaying && s.mode === 'yt' && s.videoStarted && !s.videoHidden)) return arm()
      useSaver.setState({ on: true })
    }
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key.toLowerCase() === 'z' && !e.ctrlKey && !e.metaKey && !e.altKey && !el.closest('input, textarea, select, [contenteditable]')) {
        useSaver.setState({ on: true })
      } else arm()
    }
    arm()
    addEventListener('mousemove', arm, { passive: true })
    for (const ev of ACTIVITY) if (ev !== 'keydown') addEventListener(ev, arm, { passive: true })
    addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      removeEventListener('mousemove', arm)
      for (const ev of ACTIVITY) if (ev !== 'keydown') removeEventListener(ev, arm)
      removeEventListener('keydown', onKey)
    }
  }, [on, minutes])

  // Any real input ends it (a nudge of the mouse doesn't).
  useEffect(() => {
    if (!on) return
    document.documentElement.classList.add('is-saver')
    let start: { x: number; y: number } | null = null
    const stop = () => useSaver.setState({ on: false })
    const onMove = (e: MouseEvent) => {
      start ??= { x: e.clientX, y: e.clientY }
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 24) stop()
    }
    // Ignore the key press that started it.
    const t = setTimeout(() => {
      for (const ev of ACTIVITY) addEventListener(ev, stop, { passive: true })
      addEventListener('mousemove', onMove, { passive: true })
    }, 300)
    return () => {
      clearTimeout(t)
      document.documentElement.classList.remove('is-saver')
      for (const ev of ACTIVITY) removeEventListener(ev, stop)
      removeEventListener('mousemove', onMove)
    }
  }, [on])

  return createPortal(<AnimatePresence>{on && <SaverScreen key="saver" />}</AnimatePresence>, document.body)
}

function SaverScreen() {
  const track = useCurrent()
  const playing = usePlayer((s) => s.isPlaying)
  const [now, setNow] = useState(() => new Date())
  const [spot, setSpot] = useState({ x: 0, y: 0 })

  // One update a minute: the clock ticks over and everything drifts a little.
  useEffect(() => {
    const tick = () => {
      setNow(new Date())
      setSpot({ x: (Math.random() - 0.5) * 36, y: (Math.random() - 0.5) * 30 })
    }
    const toMinute = setTimeout(() => {
      tick()
      id = setInterval(tick, 60_000)
    }, 60_000 - (Date.now() % 60_000))
    let id: ReturnType<typeof setInterval> | undefined
    return () => {
      clearTimeout(toMinute)
      clearInterval(id)
    }
  }, [])

  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <motion.div className="saver" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }} aria-hidden="true">
      <div className="saver-body" style={{ transform: `translate(${spot.x}vw, ${spot.y}vh)` }}>
        <div className="saver-time">{time}</div>
        <div className="saver-date">{date}</div>
        {track ? (
          <div className="saver-now">
            {track.art && <img src={artUrl(track.art, 160)} alt="" width={64} height={64} />}
            <div>
              <b>{track.title}</b>
              <span>
                {track.artist}
                {!playing && ' · Paused'}
              </span>
            </div>
          </div>
        ) : (
          <div className="saver-brand">
            <Logo size={22} />
            Spindle
          </div>
        )}
      </div>
    </motion.div>
  )
}
