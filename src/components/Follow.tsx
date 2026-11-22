import { Check, UserPlus } from 'lucide-react'
import type { Artist } from '../lib/types'
import { usePlayer } from '../store/player'
import { toast } from './Toast'

/** Follow an artist to see their new releases on Home. */
export function FollowButton({ artist, className = '' }: { artist: Artist; className?: string }) {
  const following = usePlayer((s) => !!s.following[artist.id])
  if (!artist.id || !artist.name) return null
  return (
    <button
      className={`btn ${following ? 'btn-ghost is-following' : ''} ${className}`}
      onClick={() => {
        usePlayer.getState().toggleFollow(artist)
        toast(following ? `Unfollowed ${artist.name}` : `Following ${artist.name}. New releases show on Home.`)
      }}
      aria-pressed={following}
    >
      {following ? <Check size={15} /> : <UserPlus size={15} />} {following ? 'Following' : 'Follow'}
    </button>
  )
}
