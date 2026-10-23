import { Link } from 'react-router-dom'
import { trending } from '../api/audius'
import { COUNTRIES, topAlbums, topSongs } from '../api/itunes'
import { Crate } from '../components/Crate'
import { KineticTitle, Marquee } from '../components/Kinetic'
import { Reveal } from '../components/Reveal'
import { ErrorNote, RowSkeletons, Shelf, TileSkeletons } from '../components/Shelf'
import { AlbumTile, SongTile } from '../components/Tiles'
import { Timeline } from '../components/Timeline'
import { TrackRow } from '../components/TrackRow'
import { useAsync } from '../lib/useAsync'
import { usePlayer } from '../store/player'

export function Home() {
  const country = usePlayer((s) => s.country)
  const playList = usePlayer((s) => s.playList)
  const recent = usePlayer((s) => s.recent)
  const countryName = COUNTRIES.find((c) => c.code === country)?.name ?? 'your region'

  const songs = useAsync(() => topSongs(country, undefined, 50), [country])
  const albums = useAsync(() => topAlbums(country, 24), [country])
  const radio = useAsync(() => trending(undefined, 20), [])

  const top = songs.data ?? []
  const crate = top.slice(0, 20)
  const rest = top.slice(20)
  const artists = [...new Set(top.map((t) => t.artist.split(/,|&/)[0].trim()))].slice(0, 14)

  return (
    <div className="page page-home">
      {songs.error && <ErrorNote />}
      {crate.length ? (
        <Crate tracks={crate} title="The Crate" lede={`The 20 biggest songs in ${countryName} today. Scroll to dig through them, select a record to play it.`} />
      ) : (
        <div className="crate-skel skel" />
      )}

      <Marquee items={artists} />

      <section className="home-sec">
        <div className="sec-head">
          <KineticTitle>New releases</KineticTitle>
          <p className="sec-lede">Albums climbing the chart in {countryName}.</p>
        </div>
        <div className="wall">
          {albums.data
            ? albums.data.map((a, i) => (
                <Reveal key={a.id} i={i}>
                  <AlbumTile album={a} />
                </Reveal>
              ))
            : <TileSkeletons n={12} />}
        </div>
      </section>

      <Timeline />

      <section className="home-sec">
        <div className="sec-head">
          <KineticTitle>Still charting</KineticTitle>
          <p className="sec-lede">
            Numbers 21 to 50. <Link to="/charts">See the full Top 100</Link>
          </p>
        </div>
        <div className="chart-cols">
          {songs.loading && !rest.length ? <RowSkeletons n={8} /> : rest.map((t, i) => <TrackRow key={t.id} track={t} rank={i + 21} onPlay={() => playList(top, i + 20)} showAlbum={false} />)}
        </div>
      </section>

      <section className="home-sec">
        <div className="sec-head">
          <KineticTitle>Radio</KineticTitle>
          <p className="sec-lede">Trending with independent artists on Audius.</p>
        </div>
        <Shelf title="" to="/full">
          {radio.data ? radio.data.map((t, i) => <SongTile key={t.id} track={t} onPlay={() => playList(radio.data!, i)} />) : <TileSkeletons />}
        </Shelf>
      </section>

      {recent.length > 0 && (
        <section className="home-sec">
          <div className="sec-head">
            <KineticTitle>Back again</KineticTitle>
            <p className="sec-lede">What you played recently.</p>
          </div>
          <Shelf title="" to="/recent">
            {recent.map((t, i) => (
              <SongTile key={t.id} track={t} onPlay={() => playList(recent, i)} />
            ))}
          </Shelf>
        </section>
      )}
    </div>
  )
}
