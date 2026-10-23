import { Play, Shuffle } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { extractPalette } from '../lib/color'
import { artUrl } from '../lib/format'
import type { Track } from '../lib/types'
import { usePlayer } from '../store/player'
import { Artwork } from './Artwork'

interface Props {
  title: string
  kind: string
  /** Line under the title, usually the artist. */
  byline?: ReactNode
  meta?: string
  art?: string
  /** Colour used instead of artwork (genres, decades). */
  tint?: string
  tracks: Track[]
}

export function CollectionHeader({ title, kind, byline, meta, art, tint, tracks }: Props) {
  const playList = usePlayer((s) => s.playList)
  const [wash, setWash] = useState(tint ?? 'transparent')

  useEffect(() => {
    if (tint) return setWash(tint)
    if (!art) return
    let alive = true
    extractPalette(artUrl(art, 100)).then((p) => alive && setWash(p.accent))
    return () => {
      alive = false
    }
  }, [art, tint])

  const play = (shuffle: boolean) => {
    if (!tracks.length) return
    const st = usePlayer.getState()
    if (st.shuffle !== shuffle) st.toggleShuffle()
    playList(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : 0)
  }

  return (
    <header className="coll-head" style={{ ['--wash' as string]: wash }}>
      <div className="coll-art">
        {art ? (
          <Artwork src={art} size={300} />
        ) : (
          <div className="coll-tint">
            <span>{title}</span>
          </div>
        )}
      </div>
      <div className="coll-text">
        <div className="coll-kind">{kind}</div>
        <h1 className="coll-title">{title}</h1>
        {byline && <div className="coll-byline">{byline}</div>}
        {meta && <div className="coll-meta">{meta}</div>}
        <div className="coll-actions">
          <button className="btn btn-primary" onClick={() => play(false)} disabled={!tracks.length}>
            <Play size={15} fill="currentColor" strokeWidth={0} /> Play
          </button>
          <button className="btn" onClick={() => play(true)} disabled={!tracks.length}>
            <Shuffle size={15} /> Shuffle
          </button>
        </div>
      </div>
    </header>
  )
}
