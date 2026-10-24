// Listening history: what was played, when, and for how long. It feeds the
// Stats page and playlist play counts. A play counts once you've listened to
// 30 seconds of a song (half of it, for short previews), like Spotify.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { usePlayer } from '../store/player'
import type { Track } from './types'

/** One listen: which song, when it started (ms) and how many seconds you heard. */
export interface Play {
  id: string
  at: number
  secs: number
}

/** Keeps a couple of years of everyday listening in well under a megabyte. */
const MAX_PLAYS = 15000

interface HistoryState {
  plays: Play[]
  /** Each song's details, stored once however often it's played. */
  tracks: Record<string, Track>
}

export const useHistory = create<HistoryState>()(persist(() => ({ plays: [] as Play[], tracks: {} as Record<string, Track> }), { name: 'spindle:history' }))

function record(t: Track, at: number, secs: number) {
  useHistory.setState((h) => {
    const plays = [...h.plays, { id: t.id, at, secs }].slice(-MAX_PLAYS)
    const tracks = h.tracks[t.id] ? h.tracks : { ...h.tracks, [t.id]: t }
    return { plays, tracks }
  })
}

/** Plays and songs from your other devices, merged in without duplicates (see sync.ts). */
export function mergeHistory(plays: Play[], tracks: Record<string, Track>) {
  useHistory.setState((h) => {
    const byKey = new Map(h.plays.map((p) => [`${p.at}.${p.id}`, p]))
    for (const p of plays) {
      const k = `${p.at}.${p.id}`
      const mine = byKey.get(k)
      // Same play seen twice: keep the longer listening time.
      if (!mine || p.secs > mine.secs) byKey.set(k, p)
    }
    return {
      plays: [...byKey.values()].sort((a, b) => a.at - b.at).slice(-MAX_PLAYS),
      tracks: { ...tracks, ...h.tracks },
    }
  })
}

let running = false

/** Start counting listening time. Safe to call more than once. */
export function startHistory() {
  if (running) return
  running = true
  let key = ''
  let listened = 0
  let started = 0
  let recorded = false
  // Each playlist counts once per listening session started from it.
  const counted = new Set<number>()

  setInterval(() => {
    const s = usePlayer.getState()
    const t = s.current()
    const k = t ? `${t.id}#${s.replayNonce}#${s.queueSession}#${s.pos}` : ''
    if (k !== key) {
      key = k
      listened = 0
      recorded = false
      started = Date.now()
    }
    if (!t || !s.isPlaying || s.buffering || s.resolving) return
    listened += 1
    const needed = Math.min(30, Math.max(10, (t.duration || 60) * 0.5))
    if (!recorded && listened >= needed) {
      recorded = true
      record(t, started, listened)
      // A play from a playlist counts toward that playlist's listens.
      if (s.queueSource.startsWith('playlist:') && !counted.has(s.queueSession)) {
        counted.add(s.queueSession)
        const id = s.queueSource.slice('playlist:'.length)
        usePlayer.setState((p) => ({ playlists: p.playlists.map((pl) => (pl.id === id ? { ...pl, plays: (pl.plays ?? 0) + 1 } : pl)) }))
      }
    } else if (recorded && listened % 30 === 0) {
      // Keep the listening time of the current play up to date.
      useHistory.setState((h) => {
        const plays = h.plays.slice()
        const last = plays[plays.length - 1]
        if (last && last.id === t.id && last.at === started) plays[plays.length - 1] = { ...last, secs: listened }
        return { plays }
      })
    }
  }, 1000)
}

// ---------- Stats ----------

export type Period = '4w' | '6m' | 'all'

export const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: '4w', label: 'Last 4 weeks', days: 28 },
  { id: '6m', label: 'Last 6 months', days: 182 },
  { id: 'all', label: 'All time', days: Infinity },
]

/** The first credited artist, e.g. "Badshah & Seedhe Maut" → "Badshah". */
export const leadArtist = (artist: string) => artist.split(/,|&| x | feat\.? /i)[0].trim()

export interface Stats {
  minutes: number
  plays: number
  songs: number
  artists: number
  topSongs: { track: Track; count: number }[]
  topArtists: { name: string; art: string; count: number; minutes: number }[]
  topGenre?: string
  /** 0–23, the hour you listen most. */
  peakHour?: number
  /** Most consecutive days with listening, ending today or yesterday. */
  streak: number
}

export function computeStats(all: Play[], tracks: Record<string, Track>, period: Period): Stats {
  const days = PERIODS.find((p) => p.id === period)!.days
  const since = days === Infinity ? 0 : Date.now() - days * 86400000
  const plays = all.filter((p) => p.at >= since)

  const songs = new Map<string, { track: Track; count: number }>()
  const artists = new Map<string, { name: string; art: string; count: number; secs: number }>()
  const genres = new Map<string, number>()
  const hours = new Array(24).fill(0)
  let secs = 0
  const last = new Map<string, number>()
  for (const p of plays) {
    const t = tracks[p.id]
    if (!t) continue
    secs += p.secs
    songs.set(p.id, { track: t, count: (songs.get(p.id)?.count ?? 0) + 1 })
    last.set(p.id, p.at)
    const name = leadArtist(t.artist)
    const a = artists.get(name.toLowerCase())
    artists.set(name.toLowerCase(), { name, art: a?.art || t.art, count: (a?.count ?? 0) + 1, secs: (a?.secs ?? 0) + p.secs })
    if (t.genre) genres.set(t.genre, (genres.get(t.genre) ?? 0) + 1)
    hours[new Date(p.at).getHours()] += 1
  }

  // Streak: consecutive days with at least one play, counting back from today.
  const dayKey = (t: number) => new Date(t).toDateString()
  const active = new Set(all.map((p) => dayKey(p.at)))
  let streak = 0
  const d = new Date()
  if (!active.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1)
  while (active.has(dayKey(d.getTime()))) {
    streak++
    d.setDate(d.getDate() - 1)
  }

  const peak = hours.indexOf(Math.max(...hours))
  return {
    minutes: Math.round(secs / 60),
    plays: plays.length,
    songs: songs.size,
    artists: artists.size,
    topSongs: [...songs.values()].sort((a, b) => b.count - a.count || (last.get(b.track.id) ?? 0) - (last.get(a.track.id) ?? 0)).slice(0, 10),
    topArtists: [...artists.values()]
      .sort((a, b) => b.count - a.count || b.secs - a.secs)
      .slice(0, 10)
      .map((a) => ({ name: a.name, art: a.art, count: a.count, minutes: Math.round(a.secs / 60) })),
    topGenre: [...genres.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
    peakHour: plays.length ? peak : undefined,
    streak,
  }
}
