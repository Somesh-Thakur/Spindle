import { Plus, Sparkles } from 'lucide-react'
import { sourcePlaylist } from '../lib/smartShuffle'
import type { Track } from '../lib/types'
import { usePlayer } from '../store/player'
import { toast } from './Toast'

/**
 * Shown on songs that Smart Shuffle or Autoplay added, not the listener:
 * a sparkle, and a one-tap way to keep the song in the playlist it came from.
 */
export function AddedBadge({ track }: { track: Track }) {
  const added = usePlayer((s) => s.addedIds.includes(track.id))
  const source = usePlayer((s) => s.queueSource)
  const inPlaylist = usePlayer((s) => {
    const pl = s.queueSource.startsWith('playlist:') ? s.playlists.find((p) => p.id === s.queueSource.slice(9)) : null
    return pl ? pl.tracks.some((t) => t.id === track.id) : false
  })
  if (!added) return null
  const playlist = source.startsWith('playlist:') ? sourcePlaylist() : null
  return (
    <div className="added-badge">
      <Sparkles size={14} />
      <span>{playlist ? 'Smart Shuffle pick' : 'Autoplay · similar music'}</span>
      {playlist &&
        (inPlaylist ? (
          <span className="added-kept">In {playlist.name}</span>
        ) : (
          <button
            onClick={() => {
              if (usePlayer.getState().addToPlaylist(playlist.id, track)) toast(`Added to ${playlist.name}`)
            }}
          >
            <Plus size={13} /> Add to {playlist.name}
          </button>
        ))}
    </div>
  )
}
