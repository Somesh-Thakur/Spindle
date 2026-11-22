import { Link } from 'react-router-dom'
import type { Mix } from '../lib/mixes'
import { PlaylistCover } from './PlaylistCover'

/** A "Made for you" mix: its songs' covers under a coloured band with the mix name. */
export function MixTile({ mix }: { mix: Mix }) {
  return (
    <Link to={`/mix/${encodeURIComponent(mix.id)}`} className="tile mix-tile" data-cursor="open" style={{ ['--tint' as string]: mix.tint }}>
      <div className="tile-art mix-art">
        <PlaylistCover tracks={mix.tracks} size={220} />
        <span className="mix-band">{mix.title}</span>
      </div>
      <div className="tile-title">{mix.title}</div>
      <div className="tile-sub">{mix.subtitle}</div>
    </Link>
  )
}
