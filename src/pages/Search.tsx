import { AnimatePresence, motion } from 'framer-motion'
import { Clock3, Search as SearchIcon, TrendingUp, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { searchTracks } from '../api/audius'
import { search, topSongs } from '../api/itunes'
import { searchYouTubeMusic } from '../api/youtube'
import { Artwork } from '../components/Artwork'
import { ErrorNote, RowSkeletons, Shelf, TileSkeletons } from '../components/Shelf'
import { AlbumTile, ArtistTile, SongTile } from '../components/Tiles'
import { TrackRow } from '../components/TrackRow'
import { mergeSongs } from '../lib/rank'
import { useRecentSearches } from '../lib/recentSearches'
import { useAsync } from '../lib/useAsync'
import type { Track } from '../lib/types'
import { usePlayer } from '../store/player'

const glide = { type: 'spring', stiffness: 210, damping: 30, mass: 0.9 } as const
const rise = (i: number) => ({ ['--i' as string]: i }) as CSSProperties

/**
 * Search starts as a centred hero with one big field. The moment there's a
 * query, the field glides up into a toolbar and the results rise in behind it.
 * The field shares a layoutId with the sidebar's, so arriving here from the
 * sidebar it grows out of that one.
 */
export function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [text, setText] = useState(q)
  const inputRef = useRef<HTMLInputElement>(null)
  const active = text.trim().length > 0

  useEffect(() => setText(q), [q])
  useEffect(() => {
    const id = setTimeout(() => {
      const v = text.trim()
      if (v !== q) setParams(v ? { q: v } : {}, { replace: true })
    }, 320)
    return () => clearTimeout(id)
  }, [text])

  useEffect(() => {
    // Focus after the shared-layout glide so the caret doesn't jump mid-flight.
    const id = setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }, 60)
    return () => clearTimeout(id)
  }, [])

  const pick = (v: string) => {
    setText(v)
    setParams({ q: v }, { replace: true })
    inputRef.current?.focus()
  }

  return (
    <div className={`page search-page ${active ? 'has-query' : 'is-idle'}`}>
      <motion.div layout className="search-stage" transition={glide}>
        <AnimatePresence initial={false}>
          {!active && (
            <motion.h1
              key="hero"
              className="search-hero"
              initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -24, filter: 'blur(8px)', transition: { duration: 0.2 } }}
              transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            >
              What do you want to hear?
            </motion.h1>
          )}
        </AnimatePresence>

        <motion.label layoutId="searchbox" className="search-box" transition={glide}>
          <motion.span layout="position" className="search-icon">
            <SearchIcon size={active ? 18 : 22} />
          </motion.span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setText('')
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            placeholder="Songs, artists, albums"
            aria-label="Search music"
            enterKeyHint="search"
          />
          <AnimatePresence>
            {text && (
              <motion.button
                className="ctl ctl-minor"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                onClick={() => (setText(''), inputRef.current?.focus())}
                aria-label="Clear search"
              >
                <X size={16} />
              </motion.button>
            )}
          </AnimatePresence>
          <kbd className="search-kbd" aria-hidden="true">
            /
          </kbd>
        </motion.label>

        <AnimatePresence initial={false}>{!active && <Suggestions key="sugg" onPick={pick} />}</AnimatePresence>
      </motion.div>

      <AnimatePresence mode="wait">
        {active && q && (
          <motion.div
            key={q}
            className="search-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2 }}
          >
            <Results q={q} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Idle state: recent searches, then artists from today's chart to start from. */
function Suggestions({ onPick }: { onPick: (q: string) => void }) {
  const recent = useRecentSearches()
  const country = usePlayer((s) => s.country)
  const chart = useAsync(() => topSongs(country, undefined, 50), [country])
  const trending = useMemo(
    () => [...new Set((chart.data ?? []).map((t) => t.artist.split(/,|&/)[0].trim()))].slice(0, 10),
    [chart.data],
  )

  return (
    <motion.div
      className="search-sugg"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12, transition: { duration: 0.15 } }}
      transition={{ duration: 0.45, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {recent.items.length > 0 && (
        <div className="sugg-group">
          <div className="sugg-head">
            <span>
              <Clock3 size={14} /> Recent
            </span>
            <button onClick={recent.clear}>Clear</button>
          </div>
          <div className="sugg-chips">
            {recent.items.map((r, i) => (
              <span key={r} className="chip-x rise" style={rise(i)}>
                <button onClick={() => onPick(r)}>{r}</button>
                <button className="chip-x-del" onClick={() => recent.remove(r)} aria-label={`Remove ${r}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      {trending.length > 0 && (
        <div className="sugg-group">
          <div className="sugg-head">
            <span>
              <TrendingUp size={14} /> Trending artists
            </span>
          </div>
          <div className="sugg-chips">
            {trending.map((a, i) => (
              <button key={a} className="chip rise" style={rise(i)} onClick={() => onPick(a)}>
                {a}
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

function Results({ q }: { q: string }) {
  const country = usePlayer((s) => s.country)
  const playList = usePlayer((s) => s.playList)
  const remember = useRecentSearches((s) => s.add)
  const res = useAsync(() => search(q, country), [q, country])
  const radio = useAsync(() => searchTracks(q, 12), [q])
  const ytm = useAsync(() => searchYouTubeMusic(q), [q])
  const songs = mergeSongs(q, res.data?.songs ?? [], ytm.data ?? [])
  const top = songs[0]
  // Wait for both catalogues before ranking the top slots, so the order doesn't jump.
  const settling = res.loading || ytm.loading

  const play = (list: Track[], i: number) => {
    remember(q)
    playList(list, i)
  }

  if (res.error && ytm.error) return <ErrorNote />
  if (!settling && !songs.length && !res.data?.albums.length)
    return <div className="note rise">No results for “{q}”. Check the spelling, or search for an artist.</div>

  return (
    <div onClickCapture={(e) => (e.target as HTMLElement).closest('a') && remember(q)}>
      <div className="results-top">
        <section>
          <h2 className="shelf-title">Top result</h2>
          {top && !settling ? (
            <motion.button
              className="top-result"
              onClick={() => play(songs, 0)}
              data-cursor="play"
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            >
              <Artwork src={top.art} size={120} />
              <span className="top-text">
                <span className="top-title">{top.title}</span>
                <span className="top-sub">Song, {top.artist}</span>
              </span>
            </motion.button>
          ) : (
            <div className="top-result skel" />
          )}
        </section>
        <section className="results-songs">
          <h2 className="shelf-title">Songs</h2>
          <div className="list">
            {settling ? (
              <RowSkeletons n={4} />
            ) : (
              songs.slice(0, 4).map((t, i) => (
                <div key={t.id} className="rise" style={rise(i + 1)}>
                  <TrackRow track={t} onPlay={() => play(songs, i)} showAlbum={false} />
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {!settling && songs.length > 4 && (
        <div className="rise" style={rise(5)}>
          <Shelf title="More songs" itemWidth="min(360px, 84vw)" rows={3}>
            {songs.slice(4).map((t, i) => (
              <TrackRow key={t.id} track={t} onPlay={() => play(songs, i + 4)} showAlbum={false} />
            ))}
          </Shelf>
        </div>
      )}
      {!!res.data?.artists.length && (
        <div className="rise" style={rise(6)}>
          <Shelf title="Artists">
            {res.data.artists.map((a) => (
              <ArtistTile key={a.id} artist={a} />
            ))}
          </Shelf>
        </div>
      )}
      <div className="rise" style={rise(7)}>
        <Shelf title="Albums">{res.data ? res.data.albums.map((a) => <AlbumTile key={a.id} album={a} />) : <TileSkeletons />}</Shelf>
      </div>
      {!!radio.data?.length && (
        <div className="rise" style={rise(8)}>
          <Shelf title="On Radio" subtitle="Independent artists on Audius">
            {radio.data.map((t, i) => (
              <SongTile key={t.id} track={t} onPlay={() => play(radio.data!, i)} />
            ))}
          </Shelf>
        </div>
      )}
    </div>
  )
}
