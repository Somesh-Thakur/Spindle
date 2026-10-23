import { motion, Reorder, useDragControls } from 'framer-motion'
import { Download, GripVertical, Heart, Pencil, Play, Plus, Search, Shuffle, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Artwork } from '../components/Artwork'
import { CoverEditor } from '../components/CoverEditor'
import { KineticTitle } from '../components/Kinetic'
import { PlaylistCover } from '../components/PlaylistCover'
import { Reveal } from '../components/Reveal'
import { Shelf } from '../components/Shelf'
import { SongTile } from '../components/Tiles'
import { toast } from '../components/Toast'
import { fmtTime } from '../lib/format'
import type { Track } from '../lib/types'
import { useCurrent, usePlayer } from '../store/player'

const minutes = (tracks: Track[]) => Math.round(tracks.reduce((s, t) => s + t.duration, 0) / 60)
const songs = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`

function play(tracks: Track[], shuffle: boolean) {
  if (!tracks.length) return
  const st = usePlayer.getState()
  if (st.shuffle !== shuffle) st.toggleShuffle()
  st.playList(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : 0)
}

function DraggableRow({ track, playlistId, index, all }: { track: Track; playlistId: string; index: number; all: Track[] }) {
  const controls = useDragControls()
  const current = useCurrent()
  const active = current?.id === track.id
  return (
    <Reorder.Item value={track} dragListener={false} dragControls={controls} className={`row pl-row ${active ? 'is-active' : ''}`} whileDrag={{ scale: 1.02, boxShadow: '0 20px 40px rgba(0,0,0,.5)' }}>
      <span className="pl-grip" onPointerDown={(e) => controls.start(e)} aria-label="Drag to reorder" role="button" tabIndex={-1}>
        <GripVertical size={16} />
      </span>
      <button className="row-lead" onClick={() => usePlayer.getState().playList(all, index)} aria-label={`Play ${track.title}`}>
        <span className="row-art">
          <Artwork src={track.art} size={48} />
          <span className="row-art-cover">
            <Play size={14} fill="currentColor" strokeWidth={0} />
          </span>
        </span>
      </button>
      <div className="row-main">
        <div className="row-title">{track.title}</div>
        <div className="row-sub">{track.artist}</div>
      </div>
      <div className="row-album">{track.album}</div>
      <span className="row-time">{fmtTime(track.duration)}</span>
      <button className="icon-btn" onClick={() => usePlayer.getState().removeFromPlaylist(playlistId, track.id)} aria-label={`Remove ${track.title}`}>
        <X size={16} />
      </button>
    </Reorder.Item>
  )
}

export function PlaylistPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const p = usePlayer((s) => s.playlists.find((x) => x.id === id))
  const { renamePlaylist, deletePlaylist, setPlaylistTracks } = usePlayer.getState()
  const [editing, setEditing] = useState(params.get('rename') === '1')
  const [confirm, setConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const nav = useNavigate()

  useEffect(() => {
    if (!editing) return
    // Wait for the page transition, which otherwise steals the focus.
    const id = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 180)
    return () => clearTimeout(id)
  }, [editing])

  if (!p)
    return (
      <div className="page">
        <div className="note">This playlist doesn't exist anymore.</div>
      </div>
    )

  const finishRename = (v: string) => {
    renamePlaylist(p.id, v)
    setEditing(false)
    if (params.get('rename')) setParams({}, { replace: true })
  }

  return (
    <div className="page">
      <header className="pl-hero">
        <motion.div className="pl-hero-art" initial={{ opacity: 0, scale: 0.9, rotate: -4 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}>
          <CoverEditor playlist={p} />
        </motion.div>
        <div className="pl-hero-text">
          <div className="sleeve-kind">Playlist</div>
          {editing ? (
            <input
              ref={inputRef}
              className="pl-name-input"
              defaultValue={p.name}
              aria-label="Playlist name"
              onBlur={(e) => finishRename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finishRename(e.currentTarget.value)
                if (e.key === 'Escape') setEditing(false)
              }}
            />
          ) : (
            <h1 className="sleeve-title pl-name" onClick={() => setEditing(true)} title="Rename">
              {p.name}
              <Pencil size={20} className="pl-pencil" />
            </h1>
          )}
          <div className="sleeve-meta">{p.tracks.length ? `${songs(p.tracks.length)}, ${minutes(p.tracks)} minutes` : 'No songs yet'}</div>
          <div className="coll-actions">
            <button className="btn btn-primary" onClick={() => play(p.tracks, false)} disabled={!p.tracks.length}>
              <Play size={15} fill="currentColor" strokeWidth={0} /> Play
            </button>
            <button className="btn" onClick={() => play(p.tracks, true)} disabled={!p.tracks.length}>
              <Shuffle size={15} /> Shuffle
            </button>
            <button
              className={`btn btn-ghost ${confirm ? 'is-danger' : ''}`}
              onClick={() => {
                if (!confirm) return setConfirm(true)
                deletePlaylist(p.id)
                toast(`Deleted ${p.name}`)
                nav('/library')
              }}
              onBlur={() => setConfirm(false)}
            >
              <Trash2 size={15} /> {confirm ? 'Select again to delete' : 'Delete'}
            </button>
          </div>
        </div>
      </header>

      {p.tracks.length ? (
        <Reorder.Group axis="y" values={p.tracks} onReorder={(t) => setPlaylistTracks(p.id, t)} className="list list-lined pl-list">
          {p.tracks.map((t, i) => (
            <DraggableRow key={t.id} track={t} playlistId={p.id} index={i} all={p.tracks} />
          ))}
        </Reorder.Group>
      ) : (
        <div className="pl-empty-note">
          <p>Find songs in Search and add them here from the ••• menu next to any song.</p>
          <Link to="/search" className="btn btn-primary">
            <Search size={15} /> Find songs
          </Link>
        </div>
      )}
    </div>
  )
}

export function LibraryPage() {
  const liked = usePlayer((s) => s.liked)
  const playlists = usePlayer((s) => s.playlists)
  const recent = usePlayer((s) => s.recent)
  const likedList = Object.values(liked).reverse()
  const nav = useNavigate()

  const create = () => nav(`/playlist/${usePlayer.getState().createPlaylist()}?rename=1`)

  return (
    <div className="page">
      <div className="sec-head lib-head">
        <KineticTitle as="h1">Library</KineticTitle>
        <div className="lib-actions">
          <Link to="/import" className="btn">
            <Download size={16} /> Import
          </Link>
          <button className="btn btn-primary" onClick={create}>
            <Plus size={16} /> New playlist
          </button>
        </div>
      </div>

      <div className="lib-grid">
        <Reveal i={0}>
          <Link to="/liked" className="lib-card lib-liked" data-cursor="open">
            <span className="lib-liked-art">
              <Heart size={44} fill="currentColor" />
            </span>
            <span className="lib-name">Liked Songs</span>
            <span className="lib-sub">{songs(likedList.length)}</span>
          </Link>
        </Reveal>
        {playlists.map((p, i) => (
          <Reveal key={p.id} i={i + 1}>
            <Link to={`/playlist/${p.id}`} className="lib-card" data-cursor="open">
              <PlaylistCover tracks={p.tracks} cover={p.cover} size={240} />
              <span className="lib-name">{p.name}</span>
              <span className="lib-sub">{songs(p.tracks.length)}</span>
            </Link>
          </Reveal>
        ))}
        <Reveal i={playlists.length + 1}>
          <button className="lib-card lib-new" onClick={create}>
            <span className="lib-new-art">
              <Plus size={36} />
            </span>
            <span className="lib-name">New playlist</span>
            <span className="lib-sub">Start one from scratch</span>
          </button>
        </Reveal>
      </div>

      {recent.length > 0 && (
        <Shelf title="Recently played" to="/recent">
          {recent.map((t, i) => (
            <SongTile key={t.id} track={t} onPlay={() => usePlayer.getState().playList(recent, i)} />
          ))}
        </Shelf>
      )}
    </div>
  )
}
