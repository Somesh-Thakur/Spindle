import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Disc3, Heart, ListEnd, ListMusic, ListStart, MoreHorizontal, Play, Plus, User, Share, ArrowDownToLine, CircleCheck } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { fmtTime } from '../lib/format'
import type { Track } from '../lib/types'
import { canDownload, download, removeDownload, useDownloads } from '../lib/offline'
import { openShare, trackShare } from '../lib/share'
import { useIsPhone } from '../lib/useIsPhone'
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

const MENU_GAP = 6

/**
 * Where the menu goes on screen: under its button, right edges lined up, and
 * flipped above when there's no room below (or when the caller asks, as the
 * full player does with `menu-up`).
 */
function placeMenu(button: DOMRect, menu: { width: number; height: number }, preferUp: boolean) {
  const right = Math.max(8, innerWidth - button.right)
  const below = innerHeight - button.bottom - MENU_GAP
  const up = preferUp ? button.top - MENU_GAP >= menu.height || below < menu.height : below < menu.height && button.top > below
  return up
    ? { right, bottom: innerHeight - button.top + MENU_GAP, transformOrigin: 'bottom right' }
    : { right, top: button.bottom + MENU_GAP, transformOrigin: 'top right' }
}

export function TrackMenu({ track, className = '' }: { track: Track; className?: string }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'playlists'>('main')
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' })
  const playlists = usePlayer((s) => s.playlists)
  const phone = useIsPhone()
  const saved = useDownloads((s) => !!s.saved[track.id])
  const saving = useDownloads((s) => s.progress[track.id])
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  const { playNext, addToQueue, setFull } = usePlayer.getState()

  const place = useCallback(() => {
    if (!button.current || !menu.current) return
    const b = button.current.getBoundingClientRect()
    // Scrolled out of sight: nothing left to point at.
    if (b.bottom < 0 || b.top > innerHeight) return setOpen(false)
    const m = menu.current
    setPos(placeMenu(b, { width: m.offsetWidth, height: m.offsetHeight }, className.includes('menu-up')))
  }, [className])

  useEffect(() => {
    if (!open) return
    const inside = (n: Node) => ref.current?.contains(n) || menu.current?.contains(n)
    const close = (e: MouseEvent) => !inside(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    // The menu floats above the page, so it follows its button when the list scrolls.
    let raf = 0
    const follow = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(place)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [open, place])

  // Measure once it's drawn (the playlist view is taller), then place it.
  useLayoutEffect(() => {
    if (open) place()
  }, [open, view, playlists.length, place])

  const go = (path: string) => {
    setOpen(false)
    setFull(false)
    nav(path)
  }

  const items =
    view === 'playlists' ? (
      <PlaylistChooser track={track} playlists={playlists} onBack={() => setView('main')} onDone={() => setOpen(false)} />
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
        {canDownload(track) && (
          <button
            role="menuitem"
            disabled={saving != null}
            onClick={() => {
              setOpen(false)
              if (saved) return removeDownload(track.id).then(() => toast('Removed from downloads'))
              toast('Downloading for offline…')
              download(track).then(
                () => toast(`Saved “${track.title}” for offline`),
                () => toast('Couldn’t download this song. Try again.'),
              )
            }}
          >
            {saved ? <CircleCheck size={16} /> : <ArrowDownToLine size={16} />}
            {saved ? 'Remove download' : saving != null ? `Downloading ${Math.round(saving * 100)}%` : 'Download'}
          </button>
        )}
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
    )

  return (
    <div className={`menu-wrap ${className}`} ref={ref}>
      <button
        ref={button}
        className="icon-btn"
        aria-label="More options"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setView('main')
          setPos({ visibility: 'hidden' })
          setOpen((o) => !o)
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {/* Drawn at the top of the page: rows below this one are their own layers and would cover it.
          On phones it's an action sheet from the bottom, like iOS. */}
      {createPortal(
        <AnimatePresence>
          {open &&
            (phone ? (
              <motion.div key="sheet" className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <motion.div
                  ref={menu}
                  className="sheet-menu glass"
                  role="menu"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', stiffness: 420, damping: 40 }}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.7 }}
                  onDragEnd={(_, i) => (i.offset.y > 90 || i.velocity.y > 600) && setOpen(false)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="sheet-grabber" aria-hidden="true" />
                  <div className="sheet-head">
                    <Artwork src={track.art} size={96} eager />
                    <span>
                      <b>{track.title}</b>
                      <small>{track.artist}</small>
                    </span>
                  </div>
                  <div className="sheet-items">{items}</div>
                  <button className="sheet-cancel" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="menu"
                ref={menu}
                className="menu menu-floating glass"
                role="menu"
                style={pos}
                initial={{ opacity: 0, scale: 0.97, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                onClick={(e) => e.stopPropagation()}
              >
                {items}
              </motion.div>
            ))}
        </AnimatePresence>,
        document.body,
      )}
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
