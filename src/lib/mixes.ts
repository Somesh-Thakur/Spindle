// "Made for you": personal mixes built from your listening history and likes,
// like Spotify's Daily Mixes. They're rebuilt once a day (the order reshuffles
// each day too) and kept for that day, so Home opens instantly.
import { create } from 'zustand'
import { artistsTopSongs, search } from '../api/itunes'
import { recommend } from './recommend'
import { leadArtist, useHistory } from './history'
import type { Track } from './types'
import { usePlayer } from '../store/player'

export interface Mix {
  id: string
  title: string
  subtitle: string
  /** A colour for the cover. */
  tint: string
  tracks: Track[]
}

const DAY_MS = 86400000
const MIX_SIZE = 40
const TINTS = ['#ff3b5c', '#5b3cff', '#14b8a6', '#f59e0b', '#ec4899', '#3b82f6']

const today = () => new Date().toDateString()

/** Same shuffle all day, a new one tomorrow. */
function dayShuffle<T>(xs: T[], salt: string): T[] {
  let h = 2166136261
  for (const c of today() + salt) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const songKey = (t: Track) => `${t.title.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^\p{L}\p{N}]+/gu, '')}|${leadArtist(t.artist).toLowerCase()}`

function unique(tracks: Track[]) {
  const seen = new Set<string>()
  return tracks.filter((t) => {
    const k = songKey(t)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** An artist's Apple id: from songs that carry it, or one search by name. */
async function artistId(name: string, songs: Track[], country: string) {
  const known = songs.find((t) => t.artistId && /^\d+$/.test(t.artistId) && leadArtist(t.artist).toLowerCase() === name.toLowerCase())
  if (known) return Number(known.artistId)
  try {
    const hit = (await search(name, country)).songs.find((s) => s.artistId && leadArtist(s.artist).toLowerCase() === name.toLowerCase())
    return hit?.artistId ? Number(hit.artistId) : null
  } catch {
    return null
  }
}

async function build(country: string): Promise<Mix[]> {
  const { plays, tracks } = useHistory.getState()
  const liked = Object.values(usePlayer.getState().liked)
  const now = Date.now()
  const count = (since: number, until = now) => {
    const m = new Map<string, number>()
    for (const p of plays) if (p.at >= since && p.at < until && tracks[p.id]) m.set(p.id, (m.get(p.id) ?? 0) + 1)
    return m
  }
  const mixes: Mix[] = []

  // Your Repeat: what you keep coming back to this month.
  const month = count(now - 30 * DAY_MS)
  const repeat = [...month.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([id]) => tracks[id])
  if (repeat.length >= 5) mixes.push({ id: 'repeat', title: 'Your Repeat', subtitle: 'The songs you can’t stop playing', tint: TINTS[0], tracks: repeat.slice(0, MIX_SIZE) })

  // Your top artists, by plays in the last two months plus likes.
  const recent = count(now - 60 * DAY_MS)
  const byArtist = new Map<string, { name: string; score: number; songs: Track[] }>()
  const credit = (t: Track, score: number) => {
    const name = leadArtist(t.artist)
    if (!name) return
    const a = byArtist.get(name.toLowerCase()) ?? { name, score: 0, songs: [] }
    a.score += score
    if (!a.songs.some((s) => s.id === t.id)) a.songs.push(t)
    byArtist.set(name.toLowerCase(), a)
  }
  for (const [id, n] of recent) credit(tracks[id], n)
  for (const t of liked) credit(t, 2)
  const top = [...byArtist.values()].sort((a, b) => b.score - a.score)
  const mine = [...recent.keys()].map((id) => tracks[id]).concat(liked)

  // Artist mixes: their popular songs and yours, with a few from your other favourites.
  const lead = top.slice(0, 3)
  const ids = await Promise.all(top.slice(0, 8).map((a) => artistId(a.name, [...a.songs, ...mine], country)))
  const popular = new Map<number, Track[]>()
  const validIds = ids.filter((x): x is number => x != null)
  if (validIds.length) {
    const songs = await artistsTopSongs(`mfy:${validIds.slice().sort().join(',')}`, validIds, country, 12).catch(() => [] as Track[])
    for (const t of songs) {
      const k = Number(t.artistId)
      popular.set(k, [...(popular.get(k) ?? []), t])
    }
  }
  lead.forEach((a, i) => {
    const id = ids[i]
    const own = popular.get(id ?? -1) ?? []
    const others = top
      .slice(0, 8)
      .filter((o) => o !== a)
      .flatMap((o) => (popular.get(ids[top.indexOf(o)] ?? -1) ?? []).slice(0, 3))
    const pool = unique([...a.songs, ...own, ...dayShuffle(others, a.name).slice(0, 12)])
    if (pool.length >= 6)
      mixes.push({ id: `artist-${a.name.toLowerCase()}`, title: `${a.name} Mix`, subtitle: `${a.name} and more`, tint: TINTS[(i + 1) % TINTS.length], tracks: dayShuffle(pool, a.name).slice(0, MIX_SIZE) })
  })

  // Discover: popular songs by artists you love that you haven't played.
  const played = Object.values(tracks)
  const seed = top.slice(0, 10).flatMap((a) => a.songs.slice(0, 3))
  if (seed.length) {
    const fresh = await recommend(seed, [...played, ...liked], country, 4).catch(() => [] as Track[])
    if (fresh.length >= 6) mixes.push({ id: 'discover', title: 'Discover Mix', subtitle: 'New to you, from artists you love', tint: TINTS[4], tracks: dayShuffle(fresh, 'discover').slice(0, MIX_SIZE) })
  }

  // Throwback: songs you loved a while ago but haven't played this month.
  const earlier = count(0, now - 45 * DAY_MS)
  const throwback = [...earlier.entries()]
    .filter(([id, n]) => n >= 2 && !month.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => tracks[id])
  if (throwback.length >= 5) mixes.push({ id: 'throwback', title: 'Throwback', subtitle: 'Songs you used to play on repeat', tint: TINTS[5], tracks: dayShuffle(throwback, 'throwback').slice(0, MIX_SIZE) })

  return mixes
}

interface MixState {
  mixes: Mix[] | null
  /** Which day and history they were built from. */
  built: string
}

export const useMixes = create<MixState>(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('spindle:mixes') ?? 'null')
    if (saved?.day === today()) return { mixes: saved.mixes, built: saved.sig }
  } catch {
    /* rebuild */
  }
  return { mixes: null, built: '' }
})

let building: Promise<void> | null = null

/** Build today's mixes if they aren't built yet (or the history grew a lot since). */
export function ensureMixes() {
  const { plays } = useHistory.getState()
  const country = usePlayer.getState().country
  // Rebuild when the day changes, the region changes, or every ~25 new plays.
  const sig = `${today()}|${country}|${Math.floor(plays.length / 25)}|${Object.keys(usePlayer.getState().liked).length > 0}`
  if (useMixes.getState().built === sig || building) return
  building = build(country)
    .then((mixes) => {
      useMixes.setState({ mixes, built: sig })
      try {
        localStorage.setItem('spindle:mixes', JSON.stringify({ day: today(), sig, mixes }))
      } catch {
        /* storage full: they'll be rebuilt next time */
      }
    })
    .catch(() => useMixes.setState({ mixes: useMixes.getState().mixes ?? [] }))
    .finally(() => (building = null))
}
