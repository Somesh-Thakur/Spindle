import { motion } from 'framer-motion'
import { Headphones, Loader2, Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { defaultCountry } from '../api/itunes'
import { artUrl, fmtTime } from '../lib/format'
import { PREVIEW_SECONDS, usePreview } from '../lib/preview'
import { loadShare, shareTracks, type Share } from '../lib/share'
import type { Track } from '../lib/types'
import { Artwork } from './Artwork'
import { Logo } from './Brand'
import { PlaylistCover } from './PlaylistCover'

const KIND = { track: 'Song', playlist: 'Playlist', album: 'Album' } as const
const LIST_LIMIT = 50

function Ring({ progress }: { progress: number }) {
  const c = 2 * Math.PI * 21
  return (
    <svg className="ps-ring" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="21" />
      <circle cx="24" cy="24" r="21" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - progress) }} />
    </svg>
  )
}

/**
 * What a shared link shows to someone who isn't signed in: the cover, the songs
 * and 30-second previews, with a way in to hear everything in full.
 */
export function PublicShare({ code, onSignIn }: { code: string; onSignIn: () => void }) {
  const [share, setShare] = useState<Share | null | undefined>(undefined)
  const preview = usePreview(defaultCountry())

  useEffect(() => {
    loadShare(code).then(setShare, () => setShare(null))
  }, [code])

  if (share === undefined)
    return (
      <div className="ps ps-center">
        <Loader2 className="spin" size={28} />
      </div>
    )

  if (!share)
    return (
      <div className="ps ps-center">
        <Logo size={72} />
        <h1 className="ps-missing">This link doesn’t work anymore</h1>
        <p className="ps-sub">Whoever shared it may have turned it off.</p>
        <button className="btn btn-primary ps-cta" onClick={onSignIn}>
          Open Spindle
        </button>
      </div>
    )

  const tracks = shareTracks(share)
  const first = tracks[0]
  const count = share.payload.count ?? tracks.length
  const backdrop = share.payload.cover || artUrl(share.image ?? first?.art, 600)
  const single = share.kind === 'track'

  const PlayButton = ({ t, big }: { t: Track; big?: boolean }) => {
    const on = preview.playing === t.id
    const busy = preview.loading === t.id
    const gone = preview.missing.has(t.id)
    return (
      <button
        className={`ps-play ${big ? 'is-big' : ''} ${on ? 'is-on' : ''}`}
        onClick={() => preview.toggle(t)}
        disabled={gone}
        aria-label={gone ? 'No preview available' : on ? 'Pause preview' : `Play a preview of ${t.title}`}
      >
        {on && <Ring progress={preview.progress} />}
        {busy ? <Loader2 className="spin" size={big ? 24 : 16} /> : on ? <Pause size={big ? 24 : 16} fill="currentColor" strokeWidth={0} /> : <Play size={big ? 24 : 16} fill="currentColor" strokeWidth={0} />}
      </button>
    )
  }

  return (
    <div className="ps">
      {backdrop && <img className="ps-backdrop" src={backdrop} alt="" aria-hidden="true" />}
      <div className="ps-veil" aria-hidden="true" />

      <header className="ps-top">
        <a href="/" className="ps-brand" aria-label="Spindle">
          <Logo size={30} />
          <span>spindle</span>
        </a>
        <button className="btn" onClick={onSignIn}>
          Sign in
        </button>
      </header>

      <main className="ps-main">
        <motion.section className="ps-hero" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}>
          <div className="ps-cover">
            {share.kind === 'playlist' ? <PlaylistCover tracks={tracks} cover={share.payload.cover} size={360} /> : <Artwork src={share.image ?? first?.art ?? ''} size={600} />}
          </div>
          <div className="ps-info">
            <span className="ps-kind">{KIND[share.kind]}</span>
            <h1 className="ps-title">{share.title}</h1>
            <p className="ps-sub">
              {single ? share.subtitle : `${share.subtitle ? `${share.subtitle} · ` : ''}${count} ${count === 1 ? 'song' : 'songs'}`}
              {share.owner_name && <span> · shared by {share.owner_name}</span>}
            </p>
            <div className="ps-actions">
              {single && first && <PlayButton t={first} big />}
              <button className="btn btn-primary ps-cta" onClick={onSignIn}>
                <Headphones size={17} /> {single ? 'Sign in to hear the full song' : 'Sign in to listen in full'}
              </button>
            </div>
            <p className="ps-fine">Free {PREVIEW_SECONDS}-second previews. Full songs, lyrics and karaoke with a free Spindle account.</p>
          </div>
        </motion.section>

        {!single && (
          <section className="ps-list" aria-label="Songs">
            {tracks.slice(0, LIST_LIMIT).map((t, i) => (
              <motion.div
                key={t.id + i}
                className={`ps-row ${preview.playing === t.id ? 'is-on' : ''}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 14) * 0.03 }}
              >
                <span className="ps-num">{i + 1}</span>
                <Artwork src={t.art} size={80} />
                <span className="ps-row-text">
                  <b>{t.title}</b>
                  <small>{t.artist}</small>
                </span>
                <span className="ps-dur">{t.duration ? fmtTime(t.duration) : ''}</span>
                <PlayButton t={t} />
              </motion.div>
            ))}
            {count > LIST_LIMIT && (
              <button className="ps-more" onClick={onSignIn}>
                + {count - LIST_LIMIT} more songs. Sign in to see them all
              </button>
            )}
          </section>
        )}
      </main>

      <footer className="ps-foot">
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <span>Spindle · Every record you love, on every screen.</span>
      </footer>
    </div>
  )
}
