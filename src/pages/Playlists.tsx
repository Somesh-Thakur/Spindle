import { motion, Reorder, useDragControls } from 'framer-motion'
import { ArrowDownToLine, ChartNoAxesColumn, Columns2, Headphones, Loader2, Sparkles, Download, GripVertical, Heart, LayoutGrid, List, Pause, Pencil, Play, Plus, Search, Settings, Share, Shuffle, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Artwork } from '../components/Artwork'
import { Initials } from '../components/Avatar'
import { CoverEditor } from '../components/CoverEditor'
import { KineticTitle } from '../components/Kinetic'
import { PlaylistCover } from '../components/PlaylistCover'
import { PlaylistRecs } from '../components/PlaylistRecs'
import { Reveal } from '../components/Reveal'
import { Shelf } from '../components/Shelf'
import { SongTile } from '../components/Tiles'
import { toast } from '../components/Toast'
import { TrackMenu } from '../components/TrackRow'
import { fmtTime } from '../lib/format'
import { useDownloads } from '../lib/offline'
import { openShare, playlistShare } from '../lib/share'
import { smartShuffle } from '../lib/smartShuffle'
import { displayName, useAccount } from '../lib/sync'
import type { Track } from '../lib/types'
import { useCurrent, usePlayer } from '../store/player'

const minutes = (tracks: Track[]) => Math.round(tracks.reduce((s, t) => s + t.duration, 0) / 60)
const songs = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`

function play(tracks: Track[], shuffle: boolean, source = '') {
  if (!tracks.length) return
  const st = usePlayer.getState()
  if (st.shuffle !== shuffle) st.toggleShuffle()
  st.playList(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : 0, source)
}

const VIEWS = [
  { id: 'list', label: 'List', icon: List },
  { id: 'grid', label: 'Grid', icon: LayoutGrid },
  { id: 'compact', label: 'Compact', icon: Columns2 },
] as const

/** A slim row for the compact view, laid out in columns. */
function CompactRow({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const active = useCurrent()?.id === track.id
  const isPlaying = usePlayer((s) => s.isPlaying)
  const on = active && isPlaying
  return (
    <div className={`pl-compact-row ${active ? 'is-active' : ''}`}>
      <button className="pl-compact-art" data-cursor="play" onClick={() => (active ? usePlayer.getState().toggle() : onPlay())} aria-label={`${on ? 'Pause' : 'Play'} ${track.title}`}>
        <Artwork src={track.art} size={40} />
        <span className="recs-play">{on ? <Pause size={12} fill="currentColor" strokeWidth={0} /> : <Play size={12} fill="currentColor" strokeWidth={0} />}</span>
      </button>
      <div className="pl-compact-text">
        <b>{track.title}</b>
        <small>{track.artist}</small>
      </div>
      <span className="pl-compact-time">{fmtTime(track.duration)}</span>
      <TrackMenu track={track} />
    </div>
  )
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
      <button className="row-lead" onClick={() => usePlayer.getState().playList(all, index, `playlist:${playlistId}`)} aria-label={`Play ${track.title}`}>
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
      <TrackMenu track={track} />
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
  const view = usePlayer((s) => s.playlistView)
  const [smartBusy, setSmartBusy] = useState(false)
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
          <div className="sleeve-meta">
            {p.tracks.length ? `${songs(p.tracks.length)}, ${minutes(p.tracks)} minutes` : 'No songs yet'}
            {!!p.plays && (
              <span className="pl-plays">
                {' · '}
                <Headphones size={14} /> Played {p.plays} {p.plays === 1 ? 'time' : 'times'}
              </span>
            )}
          </div>
          <div className="coll-actions">
            <button className="btn btn-primary" onClick={() => play(p.tracks, false, `playlist:${p.id}`)} disabled={!p.tracks.length}>
              <Play size={15} fill="currentColor" strokeWidth={0} /> Play
            </button>
            <button className="btn" onClick={() => play(p.tracks, true, `playlist:${p.id}`)} disabled={!p.tracks.length}>
              <Shuffle size={15} /> Shuffle
            </button>
            <button
              className="btn btn-smart"
              disabled={!p.tracks.length || smartBusy}
              onClick={() => {
                setSmartBusy(true)
                smartShuffle(p)
                  .then((n) => toast(n ? `Smart Shuffle: ${n} new picks mixed in` : 'Smart Shuffle: no new picks right now, playing shuffled'))
                  .finally(() => setSmartBusy(false))
              }}
              title="Shuffle with recommended songs mixed in"
            >
              {smartBusy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} Smart Shuffle
            </button>
            <button className="btn" onClick={() => openShare(playlistShare(p))} disabled={!p.tracks.length}>
              <Share size={15} /> Share
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
        <>
          <div className="pl-toolbar">
            <span className="pl-count">{songs(p.tracks.length)}</span>
            <div className="seg pl-views" role="radiogroup" aria-label="View">
              {VIEWS.map(({ id, label, icon: Icon }) => (
                <button key={id} role="radio" aria-checked={view === id} className={view === id ? 'is-on' : ''} onClick={() => usePlayer.setState({ playlistView: id })} title={label}>
                  <Icon size={15} /> <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
          {view === 'grid' ? (
            <div className="pl-grid">
              {p.tracks.map((t, i) => (
                <div key={t.id} className="pl-grid-item">
                  <SongTile track={t} onPlay={() => usePlayer.getState().playList(p.tracks, i, `playlist:${p.id}`)} />
                  <TrackMenu track={t} className="pl-grid-menu" />
                </div>
              ))}
            </div>
          ) : view === 'compact' ? (
            <div className="pl-compact">
              {p.tracks.map((t, i) => (
                <CompactRow key={t.id} track={t} onPlay={() => usePlayer.getState().playList(p.tracks, i, `playlist:${p.id}`)} />
              ))}
            </div>
          ) : (
            <Reorder.Group axis="y" values={p.tracks} onReorder={(t) => setPlaylistTracks(p.id, t)} className="list list-lined pl-list">
              {p.tracks.map((t, i) => (
                <DraggableRow key={t.id} track={t} playlistId={p.id} index={i} all={p.tracks} />
              ))}
            </Reorder.Group>
          )}
        </>
      ) : (
        <div className="pl-empty-note">
          <p>Find songs in Search and add them here from the ••• menu next to any song, or pick from the suggestions below.</p>
          <Link to="/search" className="btn btn-primary">
            <Search size={15} /> Find songs
          </Link>
        </div>
      )}

      <PlaylistRecs playlist={p} />
    </div>
  )
}

/** Account and settings entry on the Library page; phones have no sidebar to hold it. */
function LibAccountButton() {
  const status = useAccount((s) => s.status)
  const user = useAccount((s) => s.user)
  return (
    <Link to="/settings" className="lib-avatar" aria-label="Account and settings">
      {status === 'in' ? <Initials name={displayName(user)} size={34} /> : <span className="avatar is-empty lib-gear"><Settings size={17} /></span>}
    </Link>
  )
}

export function LibraryPage() {
  const liked = usePlayer((s) => s.liked)
  const playlists = usePlayer((s) => s.playlists)
  const recent = usePlayer((s) => s.recent)
  const likedList = Object.values(liked).reverse()
  const downloads = useDownloads((s) => Object.keys(s.saved).length)
  const nav = useNavigate()

  const create = () => nav(`/playlist/${usePlayer.getState().createPlaylist()}?rename=1`)

  return (
    <div className="page">
      <div className="sec-head lib-head">
        <KineticTitle as="h1">Library</KineticTitle>
        <div className="lib-actions">
          <LibAccountButton />
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
        <Reveal i={1}>
          <Link to="/downloads" className="lib-card lib-liked lib-downloads" data-cursor="open">
            <span className="lib-liked-art">
              <ArrowDownToLine size={44} />
            </span>
            <span className="lib-name">Downloads</span>
            <span className="lib-sub">{downloads ? songs(downloads) : 'Listen offline'}</span>
          </Link>
        </Reveal>
        <Reveal i={2}>
          <Link to="/stats" className="lib-card lib-liked lib-stats" data-cursor="open">
            <span className="lib-liked-art">
              <ChartNoAxesColumn size={44} />
            </span>
            <span className="lib-name">Your stats</span>
            <span className="lib-sub">Top songs, artists and minutes</span>
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
