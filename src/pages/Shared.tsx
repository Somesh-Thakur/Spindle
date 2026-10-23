import { BookmarkPlus, Check, Heart, Share } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorNote } from '../components/Shelf'
import { SleeveBack, SleeveHero } from '../components/Sleeve'
import { toast } from '../components/Toast'
import { albumShare, loadShare, openShare, playlistShare, shareTracks, trackShare } from '../lib/share'
import { useAsync } from '../lib/useAsync'
import { usePlayer } from '../store/player'

const minutes = (secs: number) => Math.round(secs / 60)

/** A shared song, playlist or album, opened by someone who's signed in: full playback and saving. */
export function SharedPage() {
  const { code = '' } = useParams()
  const { data: share, loading, error } = useAsync(() => loadShare(code), [code])
  const liked = usePlayer((s) => s.liked)
  const nav = useNavigate()
  const [saved, setSaved] = useState<string | null>(null)

  if (error) return <div className="page"><ErrorNote /></div>
  if (loading) return <div className="page"><div className="coll-head-skel skel" /></div>
  if (!share)
    return (
      <div className="page">
        <div className="note">
          This link doesn’t work anymore. Whoever shared it may have turned it off. <Link to="/">Go home</Link>
        </div>
      </div>
    )

  const tracks = shareTracks(share)
  const first = tracks[0]
  const count = share.payload.count ?? tracks.length
  const art = share.payload.cover || share.image || first?.art || ''
  const by = share.owner_name ? `Shared by ${share.owner_name}` : 'Shared with you'
  const length = `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}, ${minutes(tracks.reduce((s, t) => s + t.duration, 0))} minutes`

  const save = () => {
    const st = usePlayer.getState()
    if (share.kind === 'track') {
      if (first && !st.liked[first.id]) st.toggleLike(first)
      toast('Added to Liked Songs')
      return
    }
    const name = share.kind === 'album' ? `${share.title} · ${share.subtitle ?? ''}`.replace(/ · $/, '') : share.title
    const id = st.createPlaylist(name, tracks)
    if (share.payload.cover) st.setPlaylistCover(id, share.payload.cover)
    setSaved(id)
    toast(`Saved “${name}” to your library`)
  }

  const reshare = () =>
    openShare({
      ...(share.kind === 'track' && first
        ? trackShare(first)
        : share.kind === 'album'
          ? albumShare(share.code, share.title, share.subtitle ?? '', art, tracks)
          : playlistShare({ id: share.code, name: share.title, tracks, createdAt: 0, cover: share.payload.cover })),
      code: share.code,
    })

  const isLiked = share.kind === 'track' && first && liked[first.id]

  return (
    <div className="page shared-page">
      <SleeveHero
        kind={share.kind === 'track' ? 'Shared song' : share.kind === 'album' ? 'Shared album' : 'Shared playlist'}
        art={art}
        title={share.title}
        tracks={tracks}
        byline={share.kind === 'playlist' ? by : <span>{share.subtitle}</span>}
        meta={[share.kind !== 'playlist' && by, share.kind === 'track' ? first?.album : count > tracks.length ? `${length} of ${count}` : length].filter(Boolean).join(' · ')}
        actions={
          <>
            {saved ? (
              <button className="btn" onClick={() => nav(`/playlist/${saved}`)}>
                <Check size={15} /> In your library
              </button>
            ) : (
              <button className="btn" onClick={save} disabled={!!isLiked}>
                {share.kind === 'track' ? <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} /> : <BookmarkPlus size={15} />}
                {share.kind === 'track' ? (isLiked ? 'Liked' : 'Like') : 'Save to library'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={reshare}>
              <Share size={15} /> Share
            </button>
          </>
        }
      />
      <SleeveBack tracks={tracks} />
    </div>
  )
}
