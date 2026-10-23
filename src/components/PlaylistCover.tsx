import { Music2 } from 'lucide-react'
import type { Track } from '../lib/types'
import { Artwork } from './Artwork'

/**
 * Playlist art: the listener's own image, else a 2×2 mosaic of its first covers,
 * a single cover, or a placeholder. Song covers go through <Artwork>, so they get
 * the same fallbacks (other image hosts, proxies) as artwork everywhere else.
 */
export function PlaylistCover({ tracks, cover, size = 300, className = '' }: { tracks: Track[]; cover?: string; size?: number; className?: string }) {
  if (cover)
    return (
      <div className={`pl-cover ${className}`}>
        <img src={cover} alt="" />
      </div>
    )
  const arts = [...new Set(tracks.map((t) => t.art).filter(Boolean))].slice(0, 4)
  if (!arts.length)
    return (
      <div className={`pl-cover pl-empty ${className}`}>
        <Music2 size={size / 5} />
      </div>
    )
  if (arts.length < 4)
    return (
      <div className={`pl-cover ${className}`}>
        <Artwork src={arts[0]} size={size} />
      </div>
    )
  return (
    <div className={`pl-cover pl-mosaic ${className}`}>
      {arts.map((a) => (
        <Artwork key={a} src={a} size={size / 2} />
      ))}
    </div>
  )
}
