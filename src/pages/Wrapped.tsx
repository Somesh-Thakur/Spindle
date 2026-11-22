// Spindle Wrapped: your listening as full-screen story slides, like Spotify
// Wrapped, but whenever you like and for any period. Tap the right side (or →)
// for the next slide, the left side (or ←) to go back; slides move on by
// themselves unless you hold. The last slide makes a story image to share.
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Pause, Play, RotateCcw, Share2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Artwork } from '../components/Artwork'
import { computeStats, PERIODS, useHistory, type Period, type Stats } from '../lib/history'
import { usePlayer } from '../store/player'
import { StatsShare } from './Stats'

const SLIDE_MS = 6500

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })

/** What kind of listener the busiest hour says you are. */
function listener(hour?: number) {
  if (hour == null) return { name: 'Mystery listener', blurb: 'Play a little more and we’ll work out your rhythm.' }
  if (hour >= 22 || hour < 4) return { name: 'Night owl', blurb: `You listen most around ${hourLabel(hour)}, when everyone else is asleep.` }
  if (hour < 9) return { name: 'Early bird', blurb: `Your day starts with music, mostly around ${hourLabel(hour)}.` }
  if (hour < 13) return { name: 'Morning grinder', blurb: `Your busiest hour is ${hourLabel(hour)}: music to get things done.` }
  if (hour < 18) return { name: 'Afternoon vibe', blurb: `You peak around ${hourLabel(hour)}, powering through the afternoon.` }
  return { name: 'Evening unwinder', blurb: `Most of your listening happens around ${hourLabel(hour)}.` }
}

/** Counts up to `to` as the slide appears. */
function CountUp({ to, ms = 1400 }: { to: number; ms?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return <>{n.toLocaleString()}</>
}

const rise = (delay = 0) => ({ initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] as const } })

function Slide({ tint, children }: { tint: [string, string]; children: ReactNode }) {
  return (
    <motion.div
      className="wr-slide"
      style={{ background: `radial-gradient(120% 80% at 20% 0%, ${tint[1]}, transparent 60%), radial-gradient(100% 70% at 100% 100%, ${tint[1]}55, transparent 60%), ${tint[0]}` }}
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.45 }}
    >
      <div className="wr-body">{children}</div>
    </motion.div>
  )
}

function slidesFor(stats: Stats, label: string, onShare: () => void, onReplay: () => void) {
  const top = stats.topSongs[0]
  const artist = stats.topArtists[0]
  const who = listener(stats.peakHour)
  const hours = Math.round(stats.minutes / 60)
  const out: { key: string; tint: [string, string]; node: ReactNode }[] = [
    {
      key: 'minutes',
      tint: ['#1a0b2e', '#ff3b5c'],
      node: (
        <>
          <motion.p className="wr-kicker" {...rise()}>{label}, you listened for</motion.p>
          <motion.h2 className="wr-huge" {...rise(0.2)}>
            <CountUp to={stats.minutes} />
          </motion.h2>
          <motion.p className="wr-big" {...rise(0.4)}>minutes</motion.p>
          <motion.p className="wr-note" {...rise(0.9)}>
            {hours >= 2 ? `That’s about ${hours} hours of music` : 'Every minute counts'} across {stats.plays.toLocaleString()} plays.
          </motion.p>
        </>
      ),
    },
  ]
  if (top)
    out.push({
      key: 'song',
      tint: ['#0d1b3d', '#5b3cff'],
      node: (
        <>
          <motion.p className="wr-kicker" {...rise()}>Your number one song</motion.p>
          <motion.div className="wr-cover" initial={{ opacity: 0, scale: 0.6, rotate: -8 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: 0.2, type: 'spring', stiffness: 160, damping: 16 }}>
            <Artwork src={top.track.art} size={480} eager />
          </motion.div>
          <motion.h2 className="wr-title" {...rise(0.5)}>{top.track.title}</motion.h2>
          <motion.p className="wr-sub" {...rise(0.6)}>{top.track.artist}</motion.p>
          <motion.p className="wr-note" {...rise(1)}>
            You played it <b>{top.count}</b> {top.count === 1 ? 'time' : 'times'}.
          </motion.p>
        </>
      ),
    })
  if (stats.topSongs.length >= 3)
    out.push({
      key: 'songs',
      tint: ['#08262a', '#14b8a6'],
      node: (
        <>
          <motion.p className="wr-kicker" {...rise()}>Your top songs</motion.p>
          <ol className="wr-list">
            {stats.topSongs.slice(0, 5).map((s, i) => (
              <motion.li key={s.track.id} {...rise(0.15 + i * 0.12)}>
                <span className="wr-rank">{i + 1}</span>
                <Artwork src={s.track.art} size={96} />
                <span className="wr-li-text">
                  <b>{s.track.title}</b>
                  <small>{s.track.artist}</small>
                </span>
                <span className="wr-count">{s.count}×</span>
              </motion.li>
            ))}
          </ol>
        </>
      ),
    })
  if (artist)
    out.push({
      key: 'artist',
      tint: ['#2b0f12', '#f59e0b'],
      node: (
        <>
          <motion.p className="wr-kicker" {...rise()}>Your top artist</motion.p>
          <motion.div className="wr-cover wr-round" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 150, damping: 15 }}>
            <Artwork src={artist.art} size={480} round eager />
          </motion.div>
          <motion.h2 className="wr-title" {...rise(0.5)}>{artist.name}</motion.h2>
          <motion.p className="wr-note" {...rise(0.9)}>
            <b>{artist.minutes.toLocaleString()}</b> minutes together, over {artist.count} plays.
          </motion.p>
        </>
      ),
    })
  if (stats.topArtists.length >= 3)
    out.push({
      key: 'artists',
      tint: ['#26102e', '#ec4899'],
      node: (
        <>
          <motion.p className="wr-kicker" {...rise()}>Your top artists</motion.p>
          <ol className="wr-list">
            {stats.topArtists.slice(0, 5).map((a, i) => (
              <motion.li key={a.name} {...rise(0.15 + i * 0.12)}>
                <span className="wr-rank">{i + 1}</span>
                <Artwork src={a.art} size={96} round />
                <span className="wr-li-text">
                  <b>{a.name}</b>
                  <small>{a.minutes.toLocaleString()} min</small>
                </span>
              </motion.li>
            ))}
          </ol>
        </>
      ),
    })
  out.push({
    key: 'you',
    tint: ['#0b1d33', '#3b82f6'],
    node: (
      <>
        <motion.p className="wr-kicker" {...rise()}>Your listening personality</motion.p>
        <motion.h2 className="wr-title wr-xl" {...rise(0.2)}>{who.name}</motion.h2>
        <motion.p className="wr-note" {...rise(0.5)}>{who.blurb}</motion.p>
        <div className="wr-facts">
          {stats.topGenre && (
            <motion.div {...rise(0.8)}>
              <small>Top genre</small>
              <b>{stats.topGenre}</b>
            </motion.div>
          )}
          <motion.div {...rise(0.95)}>
            <small>Songs</small>
            <b>{stats.songs.toLocaleString()}</b>
          </motion.div>
          <motion.div {...rise(1.1)}>
            <small>Artists</small>
            <b>{stats.artists.toLocaleString()}</b>
          </motion.div>
          <motion.div {...rise(1.25)}>
            <small>Streak</small>
            <b>
              {stats.streak} {stats.streak === 1 ? 'day' : 'days'}
            </b>
          </motion.div>
        </div>
      </>
    ),
  })
  out.push({
    key: 'end',
    tint: ['#170d24', '#ff3b5c'],
    node: (
      <>
        <motion.p className="wr-kicker" {...rise()}>That’s a wrap</motion.p>
        <motion.h2 className="wr-title wr-xl" {...rise(0.2)}>Your {label.toLowerCase()} on Spindle</motion.h2>
        <motion.div className="wr-actions" {...rise(0.5)}>
          <button className="btn btn-primary" onClick={onShare}>
            <Share2 size={16} /> Share as a story
          </button>
          {top && (
            <button className="btn" onClick={() => usePlayer.getState().playList(stats.topSongs.map((s) => s.track), 0)}>
              <Play size={16} fill="currentColor" strokeWidth={0} /> Play your top songs
            </button>
          )}
          <button className="btn btn-ghost" onClick={onReplay}>
            <RotateCcw size={16} /> Watch again
          </button>
        </motion.div>
      </>
    ),
  })
  return out
}

function WrappedView() {
  const nav = useNavigate()
  const plays = useHistory((s) => s.plays)
  const tracks = useHistory((s) => s.tracks)
  const [period, setPeriod] = useState<Period | null>(null)
  const [i, setI] = useState(0)
  const [held, setHeld] = useState(false)
  const [sharing, setSharing] = useState(false)
  const started = useRef(0)

  const stats = useMemo(() => (period ? computeStats(plays, tracks, period) : null), [plays, tracks, period])
  const label = PERIODS.find((p) => p.id === period)?.label ?? ''
  const slides = useMemo(
    () =>
      stats
        ? slidesFor(
            stats,
            label,
            () => setSharing(true),
            () => setI(0),
          )
        : [],
    [stats, label],
  )
  const last = slides.length - 1
  const paused = held || sharing || i === last

  // Move on by itself, unless held, sharing or on the last slide.
  useEffect(() => {
    if (!slides.length || paused) return
    started.current = performance.now()
    const id = setTimeout(() => setI((n) => Math.min(last, n + 1)), SLIDE_MS)
    return () => clearTimeout(id)
  }, [i, slides.length, paused, last])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') nav(-1)
      if (!slides.length || sharing) return
      if (e.key === 'ArrowRight' || e.key === ' ') setI((n) => Math.min(last, n + 1))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1))
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [slides.length, last, nav, sharing])

  const tap = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('button, a')) return
    const r = e.currentTarget.getBoundingClientRect()
    if (e.clientX - r.left < r.width * 0.33) setI((n) => Math.max(0, n - 1))
    else setI((n) => Math.min(last, n + 1))
  }

  // Choose a period first.
  if (!period || !stats)
    return (
      <div className="wrapped">
        <button className="icon-btn wr-close" onClick={() => nav(-1)} aria-label="Close Wrapped">
          <X size={20} />
        </button>
        <div className="wr-slide wr-start">
          <div className="wr-body">
            <motion.p className="wr-kicker" {...rise()}>Spindle</motion.p>
            <motion.h1 className="wr-huge wr-brand" {...rise(0.1)}>Wrapped</motion.h1>
            <motion.p className="wr-note" {...rise(0.3)}>Your listening, as a story. Pick a period:</motion.p>
            <motion.div className="wr-periods" {...rise(0.45)}>
              {PERIODS.map((p) => (
                <button key={p.id} className="btn" onClick={() => (setI(0), setPeriod(p.id))}>
                  {p.label} <ChevronRight size={16} />
                </button>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    )

  if (stats.plays < 3)
    return (
      <div className="wrapped">
        <button className="icon-btn wr-close" onClick={() => nav(-1)} aria-label="Close Wrapped">
          <X size={20} />
        </button>
        <div className="wr-slide wr-start">
          <div className="wr-body">
            <h2 className="wr-title">Not much to wrap yet</h2>
            <p className="wr-note">Play a few more songs {period === 'all' ? '' : `or pick a longer period`} and come back.</p>
            <button className="btn" onClick={() => setPeriod(null)}>
              Pick another period
            </button>
          </div>
        </div>
      </div>
    )

  const slide = slides[Math.min(i, last)]
  return (
    <div className="wrapped" onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerLeave={() => setHeld(false)}>
      <div className="wr-bars" aria-hidden="true">
        {slides.map((s, n) => (
          <span key={s.key} className="wr-bar">
            <i className={n < i ? 'is-done' : n === i ? (paused ? 'is-on is-paused' : 'is-on') : ''} style={n === i ? { animationDuration: `${SLIDE_MS}ms` } : undefined} key={n === i ? `${s.key}-${i}` : s.key} />
          </span>
        ))}
      </div>
      <div className="wr-top">
        <button className="icon-btn" onClick={() => setPeriod(null)} aria-label="Pick another period">
          <RotateCcw size={18} />
        </button>
        {held && i !== last ? <Pause size={18} className="wr-held" aria-hidden="true" /> : null}
        <button className="icon-btn wr-close-in" onClick={() => nav(-1)} aria-label="Close Wrapped">
          <X size={20} />
        </button>
      </div>
      <div className="wr-stage" onClick={tap}>
        <AnimatePresence mode="wait">
          <Slide key={slide.key} tint={slide.tint}>
            {slide.node}
          </Slide>
        </AnimatePresence>
      </div>
      <AnimatePresence>{sharing && <StatsShare stats={stats} period={label} onClose={() => setSharing(false)} />}</AnimatePresence>
    </div>
  )
}

/** Full screen above everything (the app's own layout would otherwise box it in). */
export function WrappedPage() {
  return createPortal(<WrappedView />, document.body)
}
