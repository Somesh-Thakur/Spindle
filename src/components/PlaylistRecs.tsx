import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Play, Plus, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { fmtTime } from '../lib/format'
import { recommend } from '../lib/recommend'
import type { Track } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import { useCurrent, usePlayer, type Playlist } from '../store/player'
import { Artwork } from './Artwork'
import { toast } from './Toast'

const PAGE = 10

const norm = (t: Track) => `${t.title.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^\p{L}\p{N}]+/gu, '')}|${t.artist.toLowerCase()}`

/**
 * "Recommended songs" under a playlist, like Spotify's: songs from the artists
 * it leans on, ten at a time, each one a tap away from joining the playlist.
 */
export function PlaylistRecs({ playlist }: { playlist: Playlist }) {
  const country = usePlayer((s) => s.country)
  const liked = usePlayer((s) => s.liked)
  const recent = usePlayer((s) => s.recent)
  const current = useCurrent()
  const isPlaying = usePlayer((s) => s.isPlaying)
  const [page, setPage] = useState(0)

  // An empty playlist borrows from what you like and play.
  const seed = playlist.tracks.length ? playlist.tracks : [...Object.values(liked), ...recent].slice(0, 40)
  // Only refetch when the set of artists changes, not on every add or reorder.
  const seedKey = useMemo(() => [...new Set(seed.map((t) => t.artistId || t.artist))].sort().join('|'), [seed])
  const { data, loading } = useAsync(() => recommend(seed, [], country), [seedKey, country])

  const inList = useMemo(() => {
    const ids = new Set(playlist.tracks.map((t) => t.id))
    const keys = new Set(playlist.tracks.map(norm))
    return (t: Track) => ids.has(t.id) || keys.has(norm(t))
  }, [playlist.tracks])
  const pool = (data ?? []).filter((t) => !inList(t))
  const pages = Math.max(1, Math.ceil(pool.length / PAGE))
  const shown = pool.slice((page % pages) * PAGE, (page % pages) * PAGE + PAGE)

  if (!loading && !pool.length) return null

  const add = (t: Track) => {
    if (usePlayer.getState().addToPlaylist(playlist.id, t)) toast(`Added to ${playlist.name}`)
  }

  return (
    <section className="recs" aria-labelledby="recs-title">
      <div className="recs-head">
        <div>
          <h2 id="recs-title" className="recs-title">
            Recommended songs
          </h2>
          <p className="recs-sub">{playlist.tracks.length ? 'Based on what’s in this playlist' : 'Based on what you like and play'}</p>
        </div>
        {pages > 1 && (
          <button className="btn btn-ghost recs-refresh" onClick={() => setPage((n) => n + 1)}>
            <RefreshCw size={15} /> Refresh
          </button>
        )}
      </div>

      {loading && !data ? (
        <div className="recs-list">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="recs-row is-skel">
              <span className="skel recs-skel-art" />
              <span className="skel recs-skel-line" />
            </div>
          ))}
        </div>
      ) : (
        <div className="recs-list">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((t, i) => {
              const active = current?.id === t.id
              const on = active && isPlaying
              return (
                <motion.div
                  key={t.id}
                  layout
                  className={`recs-row ${active ? 'is-active' : ''}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.025 } }}
                  exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                >
                  <button
                    className="recs-art"
                    data-cursor="play"
                    onClick={() => (active ? usePlayer.getState().toggle() : usePlayer.getState().playList(shown, i))}
                    aria-label={`${on ? 'Pause' : 'Play'} ${t.title}`}
                  >
                    <Artwork src={t.art} size={48} />
                    <span className="recs-play">{on ? <Pause size={14} fill="currentColor" strokeWidth={0} /> : <Play size={14} fill="currentColor" strokeWidth={0} />}</span>
                  </button>
                  <div className="recs-main">
                    <div className="recs-name">{t.title}</div>
                    <div className="recs-artist">{t.artist}</div>
                  </div>
                  <div className="recs-album">{t.album}</div>
                  <span className="recs-time">{fmtTime(t.duration)}</span>
                  <button className="btn recs-add" onClick={() => add(t)} aria-label={`Add ${t.title} to ${playlist.name}`}>
                    <Plus size={15} /> Add
                  </button>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}
