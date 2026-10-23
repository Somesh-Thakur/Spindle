import { motion } from 'framer-motion'
import { Play, Shuffle } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { extractPalette } from '../lib/color'
import { artUrl } from '../lib/format'
import type { Track } from '../lib/types'
import { useCurrent, usePlayer } from '../store/player'
import { Artwork } from './Artwork'
import { Marquee } from './Kinetic'
import { TrackRow } from './TrackRow'

/** Long titles get a condensed width so they still read as one confident line. */
function widthFor(title: string) {
  return Math.max(56, Math.min(118, 150 - title.length * 3.2))
}

function usePalette(art?: string) {
  const [p, setP] = useState<{ accent: string; glow: string } | null>(null)
  useEffect(() => {
    if (!art) return
    let alive = true
    extractPalette(artUrl(art, 100)).then((x) => alive && setP(x))
    return () => {
      alive = false
    }
  }, [art])
  return p
}

function play(tracks: Track[], shuffle: boolean) {
  if (!tracks.length) return
  const st = usePlayer.getState()
  if (st.shuffle !== shuffle) st.toggleShuffle()
  st.playList(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : 0)
}

/** Album hero: the cover tilts toward the pointer and its record slides out. */
export function SleeveHero({
  art,
  title,
  byline,
  meta,
  tracks,
  actions,
  kind = 'Album',
}: {
  art: string
  title: string
  byline: ReactNode
  meta: string
  tracks: Track[]
  /** Extra buttons after Play and Shuffle. */
  actions?: ReactNode
  /** Label above the title. */
  kind?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pal = usePalette(art)
  const current = useCurrent()
  const isPlaying = usePlayer((s) => s.isPlaying)
  const spinning = isPlaying && tracks.some((t) => t.id === current?.id)

  const onMove = (e: PointerEvent) => {
    const el = ref.current
    if (!el || e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -14}deg`)
    el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 18}deg`)
  }
  const onLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg')
    ref.current?.style.setProperty('--ry', '0deg')
  }

  return (
    <header className="sleeve-hero" style={{ ['--wash' as string]: pal?.accent ?? '#444', ['--wash2' as string]: pal?.glow ?? '#222' }}>
      <div className={`sleeve-object ${spinning ? 'is-spinning' : ''}`} ref={ref} onPointerMove={onMove} onPointerLeave={onLeave}>
        <div className="so-record">
          <div className="so-label">
            <Artwork src={art} size={200} round />
          </div>
        </div>
        <motion.div
          className="so-cover"
          initial={{ opacity: 0, rotateY: -25, x: -40 }}
          animate={{ opacity: 1, rotateY: 0, x: 0 }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <Artwork src={art} size={560} />
          <span className="so-gloss" />
        </motion.div>
      </div>
      <div className="sleeve-text">
        <div className="sleeve-kind">{kind}</div>
        <motion.h1
          className="sleeve-title"
          style={{ fontVariationSettings: `'wdth' ${widthFor(title)}, 'wght' 800` }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {title}
        </motion.h1>
        <div className="sleeve-byline">{byline}</div>
        <div className="sleeve-meta">{meta}</div>
        <div className="coll-actions">
          <button className="btn btn-primary" onClick={() => play(tracks, false)} disabled={!tracks.length}>
            <Play size={15} fill="currentColor" strokeWidth={0} /> Play
          </button>
          <button className="btn" onClick={() => play(tracks, true)} disabled={!tracks.length}>
            <Shuffle size={15} /> Shuffle
          </button>
          {actions}
        </div>
      </div>
    </header>
  )
}

/** The back of the sleeve: tracks split into Side A and Side B, numbered A1, A2… */
export function SleeveBack({ tracks }: { tracks: Track[] }) {
  const playList = usePlayer((s) => s.playList)
  const half = Math.ceil(tracks.length / 2)
  const sides = tracks.length > 5 ? [tracks.slice(0, half), tracks.slice(half)] : [tracks]
  return (
    <div className={`sleeve-back ${sides.length > 1 ? 'two-sides' : ''}`}>
      {sides.map((side, s) => (
        <section key={s} className="side">
          {sides.length > 1 && <h2 className="side-head">Side {s === 0 ? 'A' : 'B'}</h2>}
          <div className="list list-lined">
            {side.map((t, i) => {
              const idx = s * half + i
              return (
                <TrackRow
                  key={t.id}
                  track={t}
                  label={sides.length > 1 ? `${s === 0 ? 'A' : 'B'}${i + 1}` : String(i + 1)}
                  showArt={false}
                  showAlbum={false}
                  onPlay={() => playList(tracks, idx)}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Artist hero: their name runs past in huge type behind a spinning portrait. */
export function ArtistHero({ name, genre, art, tracks }: { name: string; genre?: string; art?: string; tracks: Track[] }) {
  const pal = usePalette(art)
  return (
    <header className="artist-stage" style={{ ['--wash' as string]: pal?.accent ?? '#444' }}>
      <div className="artist-marquee">{name && <Marquee items={[name, name, name, name]} speed={30} />}</div>
      <motion.div className="artist-portrait" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}>
        <span className="artist-ring" />
        <Artwork src={art} size={360} round />
      </motion.div>
      <div className="artist-info">
        <h1 className="artist-name-lg">{name || ' '}</h1>
        {genre && <p className="artist-genre">{genre}</p>}
        <button className="btn btn-primary" onClick={() => play(tracks, false)} disabled={!tracks.length}>
          <Play size={15} fill="currentColor" strokeWidth={0} /> Play top songs
        </button>
      </div>
    </header>
  )
}
