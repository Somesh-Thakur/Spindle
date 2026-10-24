import { AnimatePresence, motion } from 'framer-motion'
import { Check, Clock3, Download, Flame, Headphones, Music2, Share2, Sparkles, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Artwork } from '../components/Artwork'
import { KineticTitle } from '../components/Kinetic'
import { toast } from '../components/Toast'
import { computeStats, PERIODS, useHistory, type Period, type Stats } from '../lib/history'
import { drawStats, STORY_H, STORY_W, storyBlob } from '../lib/storyCard'
import { displayName, useAccount } from '../lib/sync'
import { usePlayer } from '../store/player'

const COLORS: [string, string][] = [
  ['#2a1150', '#ff3b5c'],
  ['#1d1b4b', '#7a5cff'],
  ['#0f3d3e', '#3fd6a3'],
  ['#3a2a0c', '#f4b23b'],
  ['#3b0a1e', '#ff7a59'],
  ['#101014', '#5a5a66'],
]

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })

function StatsShare({ stats, period, onClose }: { stats: Stats; period: string; onClose: () => void }) {
  const [colors, setColors] = useState(COLORS[0])
  const [drawn, setDrawn] = useState<HTMLCanvasElement | null>(null)
  const view = useRef<HTMLCanvasElement>(null)
  const user = useAccount((s) => s.user)
  const name = user ? displayName(user) : ''

  useEffect(() => {
    let alive = true
    const canvas = document.createElement('canvas')
    drawStats(canvas, {
      c1: colors[0],
      c2: colors[1],
      period,
      name,
      minutes: stats.minutes,
      plays: stats.plays,
      songs: stats.songs,
      streak: stats.streak,
      topArtist: stats.topArtists[0],
      topSongs: stats.topSongs.map((s) => ({ title: s.track.title, artist: s.track.artist, art: s.track.art, count: s.count })),
    }).then(() => {
      if (!alive) return
      const v = view.current
      if (v) v.getContext('2d')!.drawImage(canvas, 0, 0)
      setDrawn(canvas)
    })
    return () => {
      alive = false
    }
  }, [colors, stats, period, name])

  const fileName = `spindle-stats-${period.toLowerCase().replace(/\s+/g, '-')}.png`
  const download = async () => {
    if (!drawn) return
    const url = URL.createObjectURL(await storyBlob(drawn))
    Object.assign(document.createElement('a'), { href: url, download: fileName }).click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast('Saved your stats image')
  }
  const probe = typeof File !== 'undefined' ? new File([], fileName, { type: 'image/png' }) : null
  const canShare = !!probe && typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] })

  return (
    <motion.div className="share-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="share-sheet glass is-story" role="dialog" aria-modal="true" aria-label="Share your stats" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className="story-maker">
          <div className="story-stage">
            <div className="story-phone">
              <canvas ref={view} width={STORY_W} height={STORY_H} className={drawn ? '' : 'is-loading'} role="img" aria-label="Stats preview" />
            </div>
          </div>
          <div className="story-controls">
            <div className="share-head">
              <h2 className="story-h">Share your stats</h2>
              <button className="icon-btn" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className="story-sub">Your minutes, top artist and top songs for {period.toLowerCase()}, as a story image for Instagram, WhatsApp or Snapchat.</p>
            <div className="story-label">Colours</div>
            <div className="story-swatches" role="radiogroup" aria-label="Colours">
              {COLORS.map(([a, b]) => {
                const on = colors[0] === a && colors[1] === b
                return (
                  <button key={a + b} role="radio" aria-checked={on} className={`story-swatch ${on ? 'is-on' : ''}`} style={{ background: `linear-gradient(135deg, ${b}, ${a})` }} onClick={() => setColors([a, b])} aria-label="Colours">
                    {on && <Check size={14} />}
                  </button>
                )
              })}
            </div>
            <div className="story-actions">
              <button className="btn btn-primary" onClick={download} disabled={!drawn}>
                <Download size={16} /> Download image
              </button>
              {canShare && (
                <button className="btn" disabled={!drawn} onClick={async () => drawn && navigator.share({ files: [new File([await storyBlob(drawn)], fileName, { type: 'image/png' })] }).catch(() => {})}>
                  <Share2 size={16} /> Share
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** Your listening, Spotify Wrapped style: minutes, top songs and artists, streaks. */
export function StatsPage() {
  const plays = useHistory((s) => s.plays)
  const tracks = useHistory((s) => s.tracks)
  const [period, setPeriod] = useState<Period>('4w')
  const [sharing, setSharing] = useState(false)
  const stats = useMemo(() => computeStats(plays, tracks, period), [plays, tracks, period])
  const label = PERIODS.find((p) => p.id === period)!.label
  const playTop = (i: number) => usePlayer.getState().playList(stats.topSongs.map((s) => s.track), i)

  return (
    <div className="page stats-page">
      <div className="sec-head">
        <KineticTitle as="h1">Your stats</KineticTitle>
        <div className="stats-actions">
          <div className="seg" role="radiogroup" aria-label="Time period">
            {PERIODS.map((p) => (
              <button key={p.id} role="radio" aria-checked={period === p.id} className={period === p.id ? 'is-on' : ''} onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setSharing(true)} disabled={!stats.plays}>
            <Share2 size={15} /> Share my stats
          </button>
        </div>
      </div>

      {!stats.plays ? (
        <div className="note stats-empty">
          <Headphones size={20} />
          <p>
            Nothing here yet for {label.toLowerCase()}. Play some music and your stats build up as you listen: a song counts once you’ve heard 30 seconds of it. <Link to="/">Find something to play</Link>
          </p>
        </div>
      ) : (
        <>
          <div className="stats-cards">
            <div className="stats-card is-big">
              <Clock3 size={20} />
              <b>{stats.minutes.toLocaleString()}</b>
              <span>minutes listened</span>
            </div>
            <div className="stats-card">
              <Music2 size={18} />
              <b>{stats.plays.toLocaleString()}</b>
              <span>plays · {stats.songs} songs</span>
            </div>
            <div className="stats-card">
              <Users size={18} />
              <b>{stats.artists}</b>
              <span>artists</span>
            </div>
            <div className="stats-card">
              <Flame size={18} />
              <b>{stats.streak}</b>
              <span>day streak</span>
            </div>
            {stats.peakHour != null && (
              <div className="stats-card">
                <Sparkles size={18} />
                <b>{hourLabel(stats.peakHour)}</b>
                <span>when you listen most{stats.topGenre ? ` · mostly ${stats.topGenre}` : ''}</span>
              </div>
            )}
          </div>

          <div className="stats-grid">
            <section>
              <h2 className="stats-h">Top songs</h2>
              <ol className="stats-songs">
                {stats.topSongs.map((s, i) => (
                  <li key={s.track.id}>
                    <span className="stats-rank">{i + 1}</span>
                    <button className="stats-song-art" onClick={() => playTop(i)} data-cursor="play" aria-label={`Play ${s.track.title}`}>
                      <Artwork src={s.track.art} size={48} />
                    </button>
                    <span className="stats-song-text">
                      <b>{s.track.title}</b>
                      <small>{s.track.artist}</small>
                    </span>
                    <span className="stats-count">
                      {s.count} {s.count === 1 ? 'play' : 'plays'}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h2 className="stats-h">Top artists</h2>
              <ol className="stats-artists">
                {stats.topArtists.map((a, i) => (
                  <li key={a.name}>
                    <span className="stats-artist-art">
                      <Artwork src={a.art} size={120} round />
                      <span className="stats-artist-rank">{i + 1}</span>
                    </span>
                    <b>{a.name}</b>
                    <small>
                      {a.count} {a.count === 1 ? 'play' : 'plays'} · {a.minutes} min
                    </small>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <p className="stats-note">Stats are counted on this device.</p>
        </>
      )}

      <AnimatePresence>{sharing && <StatsShare stats={stats} period={label} onClose={() => setSharing(false)} />}</AnimatePresence>
    </div>
  )
}
