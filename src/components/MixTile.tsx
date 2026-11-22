import { Sparkles } from 'lucide-react'
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

/** Spindle Wrapped, first in "Made for you" so it's easy to find. */
export function WrappedTile() {
  return (
    <Link to="/wrapped" className="tile mix-tile wrapped-tile" data-cursor="open" style={{ ['--tint' as string]: '#5b3cff' }}>
      <div className="tile-art mix-art wrapped-art">
        <Sparkles size={56} />
        <span className="mix-band">Spindle Wrapped</span>
      </div>
      <div className="tile-title">Spindle Wrapped</div>
      <div className="tile-sub">Your listening as a story, any time</div>
    </Link>
  )
}
