import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Disc3, Heart, ListEnd, ListMusic, ListStart, MoreHorizontal, Play, Plus, User, Share } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtTime } from '../lib/format'
import type { Track } from '../lib/types'
import { openShare, trackShare } from '../lib/share'
import { useCurrent, usePlayer } from '../store/player'
import { Artwork } from './Artwork'
import { Equalizer } from './Equalizer'
import { toast } from './Toast'

interface Props {
  track: Track
  /** Leading chart position; omitted for unranked lists. */
  rank?: number
  /** Replaces the number in the leading column, e.g. "A1" on a record sleeve. */
  label?: string
  onPlay: () => void
  showAlbum?: boolean
  showArt?: boolean
}

export function TrackRow({ track, rank, label, onPlay, showAlbum = true, showArt = true }: Props) {
  const current = useCurrent()
  const isPlaying = usePlayer((s) => s.isPlaying)
  const liked = usePlayer((s) => !!s.liked[track.id])
  const toggleLike = usePlayer((s) => s.toggleLike)
  const toggle = usePlayer((s) => s.toggle)
  const active = current?.id === track.id

  return (
    <div
      className={`row ${active ? 'is-active' : ''}`}
      onDoubleClick={() => (active ? toggle() : onPlay())}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget === e.target && (active ? toggle() : onPlay())}
      tabIndex={0}
      role="button"
      aria-label={`Play ${track.title} by ${track.artist}`}
    >
      <button className="row-lead" onClick={() => (active ? toggle() : onPlay())} aria-label={active && isPlaying ? 'Pause' : 'Play'} tabIndex={-1}>
        {showArt ? (
          <span className="row-art">
            <Artwork src={track.art} size={48} />
            <span className="row-art-cover">{active ? <Equalizer paused={!isPlaying} /> : <Play size={14} fill="currentColor" strokeWidth={0} />}</span>
          </span>
        ) : (
          <span className="row-num">
            {active ? <Equalizer paused={!isPlaying} /> : <span className="row-num-n">{label ?? rank ?? '•'}</span>}
            {!active && <Play className="row-num-play" size={12} fill="currentColor" strokeWidth={0} />}
          </span>
        )}
      </button>
      {showArt && rank != null && <span className="row-rank">{rank}</span>}
      <div className="row-main">
        <div className="row-title">
          {track.title}
          {track.explicit && <span className="badge-e" title="Explicit">E</span>}
        </div>
        <div className="row-sub">{track.artist}</div>
      </div>
      {showAlbum && <div className="row-album">{track.album}</div>}
      <button
        className={`icon-btn row-like ${liked ? 'is-on' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          toggleLike(track)
        }}
        aria-label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
        aria-pressed={liked}
      >
        <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
      </button>
      <span className="row-time">{fmtTime(track.duration)}</span>
      <TrackMenu track={track} />
    </div>
  )
}

export function TrackMenu({ track, className = '' }: { track: Track; className?: string }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'playlists'>('main')
  const playlists = usePlayer((s) => s.playlists)
  const ref = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  const { playNext, addToQueue, setFull } = usePlayer.getState()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const go = (path: string) => {
    setOpen(false)
    setFull(false)
    nav(path)
  }

  return (
    <div className={`menu-wrap ${className}`} ref={ref}>
      <button
        className="icon-btn"
        aria-label="More options"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setView('main')
          setOpen((o) => !o)
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="menu glass"
            role="menu"
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
          >
            {view === 'playlists' ? (
              <PlaylistChooser
                track={track}
                playlists={playlists}
                onBack={() => setView('main')}
                onDone={() => setOpen(false)}
              />
            ) : (
              <>
            <button role="menuitem" onClick={() => (playNext(track), setOpen(false), toast('Playing next'))}>
              <ListStart size={16} /> Play next
            </button>
            <button role="menuitem" onClick={() => (addToQueue(track), setOpen(false), toast('Added to queue'))}>
              <ListEnd size={16} /> Add to queue
            </button>
            <button role="menuitem" onClick={() => setView('playlists')} aria-haspopup="menu">
              <ListMusic size={16} /> Add to playlist <ChevronRight size={14} className="menu-more" />
            </button>
            <button role="menuitem" onClick={() => (setOpen(false), openShare(trackShare(track)))}>
              <Share size={16} /> Share
            </button>
            {track.source === 'itunes' && track.albumId && (
              <button role="menuitem" onClick={() => go(`/album/${track.albumId}`)}>
                <Disc3 size={16} /> Go to album
              </button>
            )}
            {track.source === 'itunes' && track.artistId && (
              <button role="menuitem" onClick={() => go(`/artist/${track.artistId}`)}>
                <User size={16} /> Go to artist
              </button>
            )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PlaylistChooser({
  track,
  playlists,
  onBack,
  onDone,
}: {
  track: Track
  playlists: { id: string; name: string; tracks: Track[] }[]
  onBack: () => void
  onDone: () => void
}) {
  const { addToPlaylist, createPlaylist } = usePlayer.getState()
  const nav = useNavigate()
  return (
    <>
      <button role="menuitem" className="menu-back" onClick={onBack}>
        <ChevronLeft size={16} /> Add to playlist
      </button>
      <button
        role="menuitem"
        onClick={(e) => {
          // The menu lingers while it fades out; drop focus so Enter can't press this twice.
          e.currentTarget.blur()
          const id = createPlaylist(undefined, [track])
          onDone()
          toast('Playlist created')
          usePlayer.getState().setFull(false)
          nav(`/playlist/${id}?rename=1`)
        }}
      >
        <Plus size={16} /> New playlist
      </button>
      {playlists.map((p) => {
        const has = p.tracks.some((t) => t.id === track.id)
        return (
          <button
            key={p.id}
            role="menuitem"
            disabled={has}
            onClick={() => {
              addToPlaylist(p.id, track)
              onDone()
              toast(`Added to ${p.name}`)
            }}
          >
            <ListMusic size={16} /> <span className="menu-label">{p.name}</span>
            {has && <small className="menu-note">Added</small>}
          </button>
        )
      })}
    </>
  )
}
