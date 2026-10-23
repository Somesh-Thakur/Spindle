import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { currentTime, totalTime } from '../lib/engine'
import { fmtTime } from '../lib/format'
import type { Track } from '../lib/types'
import { usePlayer } from '../store/player'
import { Artwork } from './Artwork'
import { seek } from './AudioEngine'

/** 33⅓ rpm in degrees per second. */
const RPM_DEG = (100 / 3 / 60) * 360
/** How much music one full turn of the record by hand scrubs through. */
const SEC_PER_TURN = 6
const ARM_REST = -30
/** The needle waits for the record to slide out of the sleeve before dropping. */
const ARM_DROP_DELAY = 350

interface Props {
  track: Track
  playing: boolean
  /** Tapping the turntable toggles playback: the arm lifts off, or drops back on. */
  onToggle?: () => void
}

interface Hold {
  cx: number
  cy: number
  last: number
  turned: number
  from: number
  wasPlaying: boolean
}

const angleAt = (h: Pick<Hold, 'cx' | 'cy'>, e: PointerEvent) => (Math.atan2(e.clientY - h.cy, e.clientX - h.cx) * 180) / Math.PI

/**
 * Album sleeve with a record that slides out and spins while playing.
 * The platter has inertia: it spins up and coasts down like a real turntable,
 * and the tonearm swings on, then creeps inward as the track progresses.
 *
 * Grab the record and turn it to scrub: clockwise forward, anticlockwise back.
 * Music pauses while you hold it and resumes from the new spot when you let go.
 */
export function Deck({ track, playing, onToggle }: Props) {
  const discRef = useRef<HTMLDivElement>(null)
  const armRef = useRef<SVGGElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const hold = useRef<Hold | null>(null)
  const suppressClick = useRef(false)
  const [held, setHeld] = useState(false)
  const [heldWhilePlaying, setHeldWhilePlaying] = useState(false)

  // Things the animation loop reads every frame.
  const live = useRef({ playing, held: false, needleDown: false, angle: 0, vel: 0 })
  live.current.playing = playing
  live.current.held = held
  live.current.needleDown = playing || heldWhilePlaying

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let arm = ARM_REST
    let downSince = 0
    const l = live.current
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      // Platter: spins up quickly, coasts down slowly, stops dead under your hand.
      if (!l.held) {
        const target = l.playing && !reduce ? RPM_DEG : 0
        l.vel += (target - l.vel) * (target > l.vel ? 3.2 : 1.4) * dt
        l.angle = (l.angle + l.vel * dt) % 360
      }
      if (discRef.current) discRef.current.style.transform = `rotate(${l.angle}deg)`

      // Tonearm: eased in code (a CSS transition restarted every frame and never arrived).
      if (l.needleDown) downSince ||= now
      else downSince = 0
      const dropped = l.needleDown && (now - downSince > ARM_DROP_DELAY || l.held)
      const progress = Math.min(1, currentTime() / totalTime(30))
      const target = dropped ? 2 + progress * 11 : ARM_REST
      const k = dropped ? 3.2 : 4.5
      arm += (target - arm) * (1 - Math.exp(-k * dt))
      if (armRef.current) armRef.current.style.transform = `rotate(${arm}deg)`

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [reduce])

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!onToggle || e.button !== 0) return
    const disc = discRef.current!
    const r = disc.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    // Only the vinyl itself can be grabbed; the sleeve and arm just take taps.
    // (offsetWidth, not the rect: the spinning disc's bounding box is wider than the record.)
    if (Math.hypot(e.clientX - cx, e.clientY - cy) > disc.offsetWidth / 2) return
    e.currentTarget.setPointerCapture(e.pointerId)
    hold.current = { cx, cy, last: angleAt({ cx, cy }, e), turned: 0, from: currentTime(), wasPlaying: playing }
    live.current.vel = 0
    setHeld(true)
    setHeldWhilePlaying(playing)
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const h = hold.current
    if (!h) return
    const a = angleAt(h, e)
    let d = a - h.last
    if (d > 180) d -= 360
    if (d < -180) d += 360
    h.last = a
    h.turned += d
    live.current.angle = (live.current.angle + d) % 360
    if (Math.abs(h.turned) < 4) return
    // A real turn, not a tap: hold the music still while scrubbing.
    if (usePlayer.getState().isPlaying) usePlayer.getState().setPlaying(false)
    const total = totalTime(track.duration || 30)
    const to = Math.max(0, Math.min(total - 1, h.from + (h.turned / 360) * SEC_PER_TURN))
    const diff = Math.round(to - h.from)
    const b = bubbleRef.current
    if (b) {
      b.dataset.show = 'true'
      b.firstElementChild!.textContent = fmtTime(to)
      b.lastElementChild!.textContent = diff === 0 ? 'hold steady' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)}s`
    }
  }

  const onUp = () => {
    const h = hold.current
    if (!h) return
    hold.current = null
    setHeld(false)
    setHeldWhilePlaying(false)
    bubbleRef.current && (bubbleRef.current.dataset.show = 'false')
    if (Math.abs(h.turned) < 4) return // a tap: the click handler toggles play
    suppressClick.current = true
    const total = totalTime(track.duration || 30)
    seek(Math.max(0, Math.min(total - 1, h.from + (h.turned / 360) * SEC_PER_TURN)))
    if (h.wasPlaying) usePlayer.getState().setPlaying(true)
  }

  const spring = { type: 'spring', stiffness: 70, damping: 16, mass: 1.1 } as const
  const out = playing || held

  return (
    <div
      className={`deck ${onToggle ? 'is-tappable' : ''} ${held ? 'is-held' : ''}`}
      role={onToggle ? 'button' : undefined}
      tabIndex={onToggle ? 0 : undefined}
      aria-label={onToggle ? (playing ? 'Pause: lift the needle. Drag the record to scrub.' : 'Play: drop the needle. Drag the record to scrub.') : undefined}
      data-cursor={onToggle ? (held ? 'grab' : 'hand') : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClick={() => {
        if (suppressClick.current) return void (suppressClick.current = false)
        onToggle?.()
      }}
      onKeyDown={(e) => onToggle && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), e.stopPropagation(), onToggle())}
    >
      <motion.div className="record" initial={false} animate={{ x: out ? '46%' : '10%', rotate: 0 }} transition={spring}>
        <div className="disc" ref={discRef}>
          <div className="disc-grooves" />
          <div className="disc-label">
            <Artwork src={track.art} size={240} round />
          </div>
          <div className="disc-hole" />
        </div>
        {/* Fixed reflections: they don't rotate with the disc, which is what sells the spin. */}
        <div className="disc-sheen" />
        <div className="scrub-bubble" ref={bubbleRef} data-show="false" aria-hidden="true">
          <b />
          <small />
        </div>
      </motion.div>

      <motion.div layoutId="np-art" className="sleeve" transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}>
        <Artwork src={track.art} size={600} alt={`${track.album ?? track.title} cover`} />
        <span className="sleeve-edge" />
      </motion.div>

      <svg className="tonearm" viewBox="0 0 120 300" aria-hidden="true">
        <defs>
          <linearGradient id="arm-metal" x1="0" x2="1">
            <stop offset="0" stopColor="#8d8d96" />
            <stop offset=".45" stopColor="#f4f4f8" />
            <stop offset="1" stopColor="#6b6b74" />
          </linearGradient>
          <radialGradient id="arm-base" cx=".4" cy=".35">
            <stop offset="0" stopColor="#fafafa" />
            <stop offset=".6" stopColor="#9a9aa3" />
            <stop offset="1" stopColor="#4a4a52" />
          </radialGradient>
        </defs>
        <g ref={armRef} className="tonearm-swing">
          <path d="M84 36 L84 210 Q84 236 62 252 L46 264" fill="none" stroke="url(#arm-metal)" strokeWidth="6" strokeLinecap="round" />
          <rect x="30" y="256" width="26" height="34" rx="4" transform="rotate(-36 43 273)" fill="#2a2a30" stroke="#55555e" />
          <rect x="74" y="8" width="20" height="22" rx="5" fill="#3a3a42" />
        </g>
        <circle cx="84" cy="36" r="20" fill="url(#arm-base)" />
        <circle cx="84" cy="36" r="7" fill="#3a3a42" />
      </svg>
    </div>
  )
}
