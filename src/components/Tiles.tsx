import { Pause, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Album, Artist, Track } from '../lib/types'
import { useCurrent, usePlayer } from '../store/player'
import { Artwork } from './Artwork'

export function AlbumTile({ album }: { album: Album }) {
  return (
    <Link to={`/album/${album.id}`} className="tile" data-cursor="open">
      <div className="tile-art">
        <Artwork src={album.art} size={220} />
      </div>
      <div className="tile-title">{album.title}</div>
      <div className="tile-sub">{album.artist}</div>
    </Link>
  )
}

export function SongTile({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const active = useCurrent()?.id === track.id
  const isPlaying = usePlayer((s) => s.isPlaying)
  const toggle = usePlayer((s) => s.toggle)
  const on = active && isPlaying
  return (
    <div className={`tile ${active ? 'is-active' : ''}`}>
      <button className="tile-art" data-cursor="play" onClick={() => (active ? toggle() : onPlay())} aria-label={`${on ? 'Pause' : 'Play'} ${track.title}`}>
        <Artwork src={track.art} size={220} />
        <span className={`tile-play ${on ? 'is-on' : ''}`}>
          {on ? <Pause size={14} fill="currentColor" strokeWidth={0} /> : <Play size={14} fill="currentColor" strokeWidth={0} />}
        </span>
      </button>
      <div className="tile-title">{track.title}</div>
      <div className="tile-sub">{track.artist}</div>
    </div>
  )
}

export function ArtistTile({ artist }: { artist: Artist }) {
  return (
    <Link to={`/artist/${artist.id}`} className="tile tile-artist" data-cursor="open">
      <div className="tile-art art-round-wrap">
        <Artwork src={artist.art} size={220} round />
      </div>
      <div className="tile-title">{artist.name}</div>
    </Link>
  )
}
