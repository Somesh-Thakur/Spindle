import { motion } from 'framer-motion'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { chartPeek, COUNTRIES, type ChartPeek } from '../api/itunes'
import { KineticTitle } from '../components/Kinetic'
import { RegionPicker } from '../components/RegionPicker'
import { Reveal } from '../components/Reveal'
import { Shelf } from '../components/Shelf'
import { AUDIUS_GENRES, ERAS, GENRES, type Genre } from '../lib/catalog'
import { artUrl } from '../lib/format'
import { useScrollRoot } from '../lib/scroll'
import { usePlayer } from '../store/player'

/** Loads `fn` the first time the element scrolls near the viewport. */
function useLazy<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T>()
  const [asked, setAsked] = useState(false)
  const onEnter = () => {
    if (asked) return
    setAsked(true)
    fn().then(setData, () => setData(undefined))
  }
  return { data, onEnter }
}

/** Genre card: a fan of that genre's current top covers that spreads on hover. */
function GenreCard({ g, i }: { g: Genre; i: number }) {
  const root = useScrollRoot()
  const country = usePlayer((s) => s.country)
  const { data, onEnter } = useLazy(() => chartPeek(country, g.id, 3))
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotate: i % 2 ? 2 : -2 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ root, once: true, amount: 0.2 }}
      onViewportEnter={onEnter}
      transition={{ duration: 0.6, delay: (i % 4) * 0.06, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <Link to={`/genre/${g.id}`} className="gcard" style={{ ['--tint' as string]: g.tint }} data-cursor="open">
        <span className="gcard-fan" aria-hidden="true">
          {(data ?? []).slice(0, 3).map((c, k) => (
            <img key={k} src={artUrl(c.art, 200)} alt="" style={{ ['--k' as string]: k - 1 }} loading="lazy" />
          ))}
        </span>
        <span className="gcard-name">{g.name}</span>
        {data?.[0] && (
          <span className="gcard-top">
            No. 1 now: {data[0].title}
          </span>
        )}
      </Link>
    </motion.div>
  )
}

/** One country's current number one, full-bleed. */
function WorldCard({ code, name }: { code: string; name: string }) {
  const root = useScrollRoot()
  const { data, onEnter } = useLazy<ChartPeek[]>(() => chartPeek(code, undefined, 1))
  const nav = useNavigate()
  const top = data?.[0]
  return (
    <motion.button
      className="wcard"
      data-cursor="open"
      onViewportEnter={onEnter}
      viewport={{ root, margin: '0px 400px 0px 0px' }}
      onClick={() => {
        usePlayer.getState().setCountry(code)
        nav('/charts')
      }}
      aria-label={`Open the ${name} chart`}
    >
      {top ? <img className="wcard-art" src={artUrl(top.art, 400)} alt="" /> : <span className="wcard-art skel" />}
      <span className="wcard-scrim" />
      <img className="wcard-flag" src={`https://flagcdn.com/w80/${code}.png`} alt="" />
      <span className="wcard-text">
        <span className="wcard-country">{name}</span>
        <span className="wcard-song">{top ? `${top.title}, ${top.artist}` : ' '}</span>
      </span>
    </motion.button>
  )
}

export function BrowsePage() {
  return (
    <div className="page page-browse">
      <div className="sec-head browse-head">
        <KineticTitle as="h1">Browse</KineticTitle>
        <RegionPicker />
      </div>

      <section>
        <h2 className="browse-sub">Genres</h2>
        <div className="gcard-grid">
          {GENRES.map((g, i) => (
            <GenreCard key={g.id} g={g} i={i} />
          ))}
        </div>
      </section>

      <section className="home-sec">
        <div className="sec-head">
          <KineticTitle>Around the world</KineticTitle>
          <p className="sec-lede">What's number one right now, country by country.</p>
        </div>
        <Shelf title="" itemWidth="min(260px, 70vw)">
          {COUNTRIES.map((c) => (
            <WorldCard key={c.code} code={c.code} name={c.name} />
          ))}
        </Shelf>
      </section>

      <section className="home-sec">
        <div className="sec-head">
          <KineticTitle>Decades</KineticTitle>
          <p className="sec-lede">The hits that never left.</p>
        </div>
        <div className="ecard-grid">
          {ERAS.map((e, i) => (
            <Reveal key={e.key} i={i}>
              <Link to={`/era/${e.key}`} className="ecard" style={{ ['--tint' as string]: e.tint, ['--len' as string]: e.short.length }} data-cursor="open">
                <span className="ecard-year">{e.short}</span>
                <span className="ecard-blurb">{e.blurb}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="home-sec">
        <div className="sec-head">
          <KineticTitle>Radio</KineticTitle>
          <p className="sec-lede">Independent artists, by sound.</p>
        </div>
        <div className="radio-chips">
          {AUDIUS_GENRES.map((g, i) => (
            <Reveal key={g} i={i}>
              <Link to={`/full?genre=${encodeURIComponent(g)}`} className="radio-chip" data-cursor="open">
                {g}
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  )
}
