import { useState } from 'react'
import { Share } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { trending } from '../api/audius'
import { album, artist, artistsTopSongs, COUNTRIES, topSongs } from '../api/itunes'
import { CollectionHeader } from '../components/CollectionHeader'
import { Reveal } from '../components/Reveal'
import { ArtistHero, SleeveBack, SleeveHero } from '../components/Sleeve'
import { ErrorNote, RowSkeletons, Shelf, TileSkeletons } from '../components/Shelf'
import { AlbumTile, SongTile } from '../components/Tiles'
import { TrackRow } from '../components/TrackRow'
import { AUDIUS_GENRES, ERAS, GENRES } from '../lib/catalog'
import type { Track } from '../lib/types'
import { albumShare, openShare } from '../lib/share'
import { useAsync } from '../lib/useAsync'
import { usePlayer } from '../store/player'

export function TrackList({
  tracks,
  loading,
  numbered,
  showArt = true,
  showAlbum = true,
}: {
  tracks: Track[]
  loading?: boolean
  numbered?: boolean
  showArt?: boolean
  showAlbum?: boolean
}) {
  const playList = usePlayer((s) => s.playList)
  if (loading && !tracks.length) return <RowSkeletons n={8} />
  return (
    <div className="list list-lined">
      {tracks.map((t, i) => (
        <TrackRow key={t.id} track={t} rank={numbered ? i + 1 : undefined} showArt={showArt} showAlbum={showAlbum} onPlay={() => playList(tracks, i)} />
      ))}
    </div>
  )
}

const minutes = (tracks: Track[]) => Math.round(tracks.reduce((s, t) => s + t.duration, 0) / 60)

export function AlbumPage() {
  const { id = '' } = useParams()
  const country = usePlayer((s) => s.country)
  const { data, loading, error } = useAsync(() => album(id, country), [id, country])
  const tracks = data?.tracks ?? []
  const a = data?.album

  if (error) return <div className="page"><ErrorNote /></div>
  if (!loading && !a)
    return (
      <div className="page">
        <div className="note">This album isn't available in your region. Change the region in the sidebar to try another store.</div>
      </div>
    )
  return (
    <div className="page">
      {a ? (
        <SleeveHero
          art={a.art}
          title={a.title}
          tracks={tracks}
          byline={<Link to={`/artist/${a.artistId}`}>{a.artist}</Link>}
          meta={[a.genre, a.year, tracks.length && `${tracks.length} songs, ${minutes(tracks)} minutes`].filter(Boolean).join(', ')}
          actions={
            <button className="btn" onClick={() => openShare(albumShare(a.id, a.title, a.artist, a.art, tracks))} disabled={!tracks.length}>
              <Share size={15} /> Share
            </button>
          }
        />
      ) : (
        <div className="coll-head-skel skel" />
      )}
      {loading && !tracks.length ? <RowSkeletons n={8} /> : <SleeveBack tracks={tracks} />}
      {a?.copyright && <footer className="fineprint">{a.copyright}</footer>}
    </div>
  )
}

export function ArtistPage() {
  const { id = '' } = useParams()
  const country = usePlayer((s) => s.country)
  const { data, loading, error } = useAsync(() => artist(id, country), [id, country])
  const tracks = data?.tracks ?? []

  if (error) return <div className="page"><ErrorNote /></div>
  return (
    <div className="page">
      <ArtistHero name={data?.artist.name ?? ''} genre={data?.artist.genre} art={data?.artist.art} tracks={tracks} />
      <h2 className="section-title">Top songs</h2>
      <TrackList tracks={tracks.slice(0, 10)} loading={loading} />
      <h2 className="section-title">Discography</h2>
      <div className="wall">
        {data ? data.albums.map((al, i) => (
          <Reveal key={al.id} i={i}>
            <AlbumTile album={al} />
          </Reveal>
        )) : <TileSkeletons n={8} />}
      </div>
    </div>
  )
}

export function GenrePage() {
  const { id = '' } = useParams()
  const country = usePlayer((s) => s.country)
  const g = GENRES.find((x) => String(x.id) === id)
  const { data, loading, error } = useAsync(() => topSongs(country, Number(id), 50), [id, country])
  const tracks = data ?? []
  return (
    <div className="page page-wash">
      <CollectionHeader kind="Chart" title={`Top ${g?.name ?? ''} Songs`} tint={g?.tint ?? '#333'} tracks={tracks} meta={tracks.length ? `${tracks.length} songs, updated daily` : undefined} />
      {error ? <ErrorNote /> : <TrackList tracks={tracks} loading={loading} numbered />}
      {!loading && !error && !tracks.length && <div className="note">There's no chart for this genre in your region. Change the region in the sidebar.</div>}
    </div>
  )
}

export function ChartsPage() {
  const country = usePlayer((s) => s.country)
  const name = COUNTRIES.find((c) => c.code === country)?.name ?? ''
  const { data, loading, error } = useAsync(() => topSongs(country, undefined, 100), [country])
  const tracks = data ?? []
  return (
    <div className="page page-wash">
      <CollectionHeader kind="Chart" title={`Top 100: ${name}`} tint="#7a2236" tracks={tracks} meta="Updated daily" />
      {error ? <ErrorNote /> : <TrackList tracks={tracks} loading={loading} numbered />}
    </div>
  )
}

export function EraPage() {
  const { key = '' } = useParams()
  const country = usePlayer((s) => s.country)
  const era = ERAS.find((e) => e.key === key)
  const { data, loading, error } = useAsync(() => (era ? artistsTopSongs(era.key, era.artists, country, 4) : Promise.resolve([])), [key, country])
  if (!era)
    return (
      <div className="page">
        <div className="note">That page doesn't exist.</div>
      </div>
    )
  return (
    <div className="page page-wash">
      <CollectionHeader kind="Playlist" title={era.title} tint={era.tint} tracks={data ?? []} meta={era.blurb} />
      {error ? <ErrorNote /> : <TrackList tracks={data ?? []} loading={loading} />}
    </div>
  )
}

export function FullTracksPage() {
  const [params] = useSearchParams()
  const [genre, setGenre] = useState<string | undefined>(params.get('genre') ?? undefined)
  const { data, loading, error } = useAsync(() => trending(genre, 40), [genre])
  const playList = usePlayer((s) => s.playList)
  const tracks = data ?? []
  return (
    <div className="page">
      <h1 className="page-title">Radio</h1>
      <p className="page-lede">Trending tracks from independent artists on Audius.</p>
      <div className="chips" role="tablist" aria-label="Genre">
        {[undefined, ...AUDIUS_GENRES].map((g) => (
          <button key={g ?? 'all'} role="tab" aria-selected={genre === g} className={`chip ${genre === g ? 'is-on' : ''}`} onClick={() => setGenre(g)}>
            {g ?? 'All'}
          </button>
        ))}
      </div>
      {error && <ErrorNote />}
      <Shelf title="Trending">
        {loading && !tracks.length ? <TileSkeletons /> : tracks.slice(0, 12).map((t, i) => <SongTile key={t.id} track={t} onPlay={() => playList(tracks, i)} />)}
      </Shelf>
      <h2 className="section-title">More</h2>
      <TrackList tracks={tracks.slice(12)} loading={loading} />
    </div>
  )
}

export function LikedPage() {
  const liked = usePlayer((s) => s.liked)
  const likedList = Object.values(liked).reverse()
  return (
    <div className="page page-wash">
      <CollectionHeader
        kind="Playlist"
        title="Liked Songs"
        tint="#6b2a44"
        tracks={likedList}
        meta={likedList.length ? `${likedList.length} songs, ${minutes(likedList)} minutes` : undefined}
      />
      {likedList.length ? <TrackList tracks={likedList} /> : <div className="note">Songs you like appear here. Select the heart next to any song. Likes are saved on this device.</div>}
    </div>
  )
}

export function RecentPage() {
  const recent = usePlayer((s) => s.recent)
  return (
    <div className="page">
      <h1 className="page-title">Recently Played</h1>
      {recent.length ? <TrackList tracks={recent} /> : <div className="note">Songs you play appear here.</div>}
    </div>
  )
}

export function NotFound() {
  return (
    <div className="page">
      <h1 className="page-title">Page not found</h1>
      <p className="page-lede">
        <Link to="/">Go to Home</Link>
      </p>
    </div>
  )
}
