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

      {/*
        Tonearm, modelled on a real S-arm: brushed-aluminium pivot base with a
        bearing housing, a ribbed counterweight behind the pivot, a polished tube
        that catches a highlight along its length, and a headshell with a finger
        lift, cartridge and stylus. The pivot (84, 36) and stylus position match
        the old arm, so it still lands on the same groove. The rest post sits
        where the arm parks (rotated -30° about the pivot).
      */}
      <svg className="tonearm" viewBox="0 0 120 300" aria-hidden="true">
        <defs>
          <linearGradient id="ta-tube" gradientUnits="userSpaceOnUse" x1="79" y1="0" x2="89" y2="0">
            <stop offset="0" stopColor="#5d5d66" />
            <stop offset=".28" stopColor="#d9d9e0" />
            <stop offset=".45" stopColor="#ffffff" />
            <stop offset=".62" stopColor="#b9b9c2" />
            <stop offset="1" stopColor="#4c4c55" />
          </linearGradient>
          <linearGradient id="ta-weight" x1="0" x2="1">
            <stop offset="0" stopColor="#3b3b42" />
            <stop offset=".35" stopColor="#a9a9b2" />
            <stop offset=".5" stopColor="#e6e6ec" />
            <stop offset=".7" stopColor="#8a8a93" />
            <stop offset="1" stopColor="#2e2e34" />
          </linearGradient>
          <radialGradient id="ta-plinth" cx=".38" cy=".32" r=".75">
            <stop offset="0" stopColor="#f3f3f6" />
            <stop offset=".45" stopColor="#b8b8c1" />
            <stop offset=".85" stopColor="#6c6c75" />
            <stop offset="1" stopColor="#3f3f46" />
          </radialGradient>
          <radialGradient id="ta-bearing" cx=".42" cy=".38" r=".7">
            <stop offset="0" stopColor="#5a5a63" />
            <stop offset="1" stopColor="#1d1d22" />
          </radialGradient>
          <radialGradient id="ta-cap" cx=".35" cy=".3" r=".8">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".5" stopColor="#c9c9d1" />
            <stop offset="1" stopColor="#6e6e77" />
          </radialGradient>
          <linearGradient id="ta-shell" x1="0" x2="1">
            <stop offset="0" stopColor="#d8d8de" />
            <stop offset=".5" stopColor="#f7f7fa" />
            <stop offset="1" stopColor="#9c9ca5" />
          </linearGradient>
        </defs>

        {/* Arm rest: a post with a soft cradle, where the arm parks */}
        <g transform="translate(151 150)">
          <ellipse cx="0" cy="10" rx="9" ry="4" fill="#000" opacity=".35" />
          <rect x="-3" y="-6" width="6" height="16" rx="2" fill="url(#ta-weight)" />
          <path d="M-7 -6 Q0 -1 7 -6" fill="none" stroke="#2a2a30" strokeWidth="3.4" strokeLinecap="round" />
        </g>

        {/* Plinth: the brushed base the arm pivots on */}
        <circle cx="84" cy="36" r="25" fill="#16161a" opacity=".55" />
        <circle cx="84" cy="36" r="23" fill="url(#ta-plinth)" />
        <circle cx="84" cy="36" r="23" fill="none" stroke="#ffffff" strokeOpacity=".35" strokeWidth=".8" />
        <circle cx="84" cy="36" r="18.5" fill="none" stroke="#2c2c32" strokeOpacity=".35" strokeWidth=".6" />
        <circle cx="84" cy="36" r="15.5" fill="none" stroke="#ffffff" strokeOpacity=".18" strokeWidth=".6" />

        <g ref={armRef} className="tonearm-swing">
          {/* Counterweight behind the pivot, with machined ribs */}
          <rect x="81" y="6" width="6" height="22" rx="1.5" fill="url(#ta-tube)" />
          <rect x="72" y="-6" width="24" height="18" rx="4" fill="url(#ta-weight)" />
          <g stroke="#1c1c21" strokeOpacity=".45" strokeWidth=".7">
            <line x1="72.5" y1="-1" x2="95.5" y2="-1" />
            <line x1="72.5" y1="3" x2="95.5" y2="3" />
            <line x1="72.5" y1="7" x2="95.5" y2="7" />
          </g>
          <rect x="72" y="-6" width="24" height="18" rx="4" fill="none" stroke="#ffffff" strokeOpacity=".25" strokeWidth=".6" />

          {/* The tube: dark edge, polished body, and a sharp specular line */}
          <path d="M84 40 L84 206 Q84 233 62.5 250 L48.5 261" fill="none" stroke="#2a2a30" strokeWidth="8" strokeLinecap="round" />
          <path d="M84 40 L84 206 Q84 233 62.5 250 L48.5 261" fill="none" stroke="url(#ta-tube)" strokeWidth="6.4" strokeLinecap="round" />
          <path d="M82.6 44 L82.6 205 Q82.4 229 62 246" fill="none" stroke="#ffffff" strokeOpacity=".75" strokeWidth="1.1" strokeLinecap="round" />
          {/* Collars where the tube meets the bearing and the headshell */}
          <rect x="79.5" y="52" width="9" height="6" rx="1.5" fill="url(#ta-weight)" />
          <rect x="79.5" y="190" width="9" height="5" rx="1.5" fill="url(#ta-weight)" opacity=".9" />

          {/* Headshell with a finger lift, then the cartridge and stylus */}
          <g transform="rotate(-36 43 273)">
            <path d="M33 255 L53 255 L54.5 283 L31.5 283 Z" fill="url(#ta-shell)" stroke="#6e6e77" strokeWidth=".7" />
            <path d="M53.5 260 Q63 258 64 248" fill="none" stroke="url(#ta-weight)" strokeWidth="2.6" strokeLinecap="round" />
            <rect x="35.5" y="270" width="15" height="17" rx="2" fill="#151518" />
            <rect x="35.5" y="270" width="15" height="3" rx="1" fill="var(--accent, #ff3b5c)" opacity=".9" />
            <path d="M41.5 287 L44.5 287 L43 292 Z" fill="#c9c9d1" />
          </g>
        </g>

        {/* Bearing housing and cap sit on top of the arm's root */}
        <circle cx="84" cy="36" r="11" fill="url(#ta-bearing)" />
        <circle cx="84" cy="36" r="11" fill="none" stroke="#ffffff" strokeOpacity=".2" strokeWidth=".6" />
        <circle cx="84" cy="36" r="5.5" fill="url(#ta-cap)" />
      </svg>
    </div>
  )
}
