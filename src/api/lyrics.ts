// LRCLIB: free, open lyrics database (https://lrclib.net). No key needed.
import { cached, DAY } from '../lib/cache'
import type { Track } from '../lib/types'

export interface LyricLine {
  time: number | null
  text: string
}

export interface Word {
  text: string
  start: number
  end: number
}

/**
 * Free lyric sources only time whole lines, so words are timed by spreading
 * the line across them in proportion to their length. The line's duration is
 * capped by a typical singing pace so a long instrumental gap after it
 * doesn't stretch the last word.
 */
export function wordsOf(lines: LyricLine[], i: number): Word[] {
  const line = lines[i]
  if (line.time == null || !line.text) return []
  const next = lines.slice(i + 1).find((l) => l.time != null)?.time ?? line.time + 6
  const parts = line.text.split(/\s+/).filter(Boolean)
  const chars = parts.reduce((s, p) => s + p.length + 1, 0)
  const pace = chars * 0.075 + 0.8
  const dur = Math.max(0.4, Math.min(next - line.time - 0.1, pace))
  let at = line.time
  return parts.map((p) => {
    const d = ((p.length + 1) / chars) * dur
    const w = { text: p, start: at, end: at + d }
    at += d
    return w
  })
}

export interface Lyrics {
  lines: LyricLine[]
  synced: boolean
  instrumental: boolean
  /** Where they came from, shown as a credit. */
  source?: string
}

function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const row of lrc.split('\n')) {
    const m = row.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/)
    if (m) out.push({ time: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() })
  }
  return out
}

/** Strip "(feat. X)", "(From "Film")", "- Remastered" etc. so lookups match more often. */
const clean = (s = '') =>
  s
    .replace(/\s*[([].*?(feat|ft\.|with|from|remaster|version|edit|original motion|soundtrack).*?[)\]]/gi, '')
    .replace(/\s+-\s+(remaster|single|radio edit|from).*$/i, '')
    .trim()

const primaryArtist = (a: string) => a.split(/,|&| x | feat\.? /i)[0].trim()

const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, '')

class Busy extends Error {}

async function lrclib(path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://lrclib.net/api/${path}`)
    if (res.status === 404) return null
    if (res.ok) return res.json()
    // 429/503: the free server is under load. Back off briefly and retry.
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
  }
  throw new Busy('lrclib busy')
}

/** Best search hit: synced over plain, matching artist, closest length. */
function pick(hits: any[], t: Track) {
  const artist = loose(primaryArtist(t.artist))
  const title = loose(clean(t.title))
  const ok = hits.filter((h) => loose(h.trackName ?? '').includes(title) || title.includes(loose(h.trackName ?? '')))
  // Same title by a different artist is a different song ("Video Games" by Lana Del Rey
  // vs Seedhe Maut), so the artist must match.
  const sameArtist = (h: any) => {
    const a = loose(h.artistName ?? '')
    return !!a && (a.includes(artist) || artist.includes(a))
  }
  const scored = ok.filter(sameArtist).map((h) => {
    let s = 0
    if (h.syncedLyrics) s += 3
    if (t.duration > 40 && h.duration) s += Math.abs(h.duration - t.duration) < 5 ? 3 : Math.abs(h.duration - t.duration) < 20 ? 1 : -2
    return { h, s }
  })
  scored.sort((a, b) => b.s - a.s)
  return scored[0]?.h ?? null
}

async function fromLrclib(t: Track): Promise<Lyrics | null> {
  const title = clean(t.title)
  const artist = primaryArtist(t.artist)
  const params = new URLSearchParams({ track_name: title, artist_name: artist })
  if (t.album && t.source === 'itunes') params.set('album_name', clean(t.album))
  if (t.duration > 40) params.set('duration', String(Math.round(t.duration)))
  const exact = await lrclib(`get?${params}`)
  if (exact) {
    const l = toLyrics(exact)
    // Some exact entries only have plain text; a search may turn up a synced copy.
    if (l?.synced || l?.instrumental) return l
  }
  for (const q of [`track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`, `q=${encodeURIComponent(`${title} ${artist}`)}`, `q=${encodeURIComponent(title)}`]) {
    const hits = await lrclib(`search?${q}`)
    const best = hits && pick(hits, t)
    if (best) return toLyrics(best)
  }
  return exact ? toLyrics(exact) : null
}

/** lyrics.ovh: plain text only, but covers songs LRCLIB doesn't have. */
async function fromLyricsOvh(t: Track): Promise<Lyrics | null> {
  const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist(t.artist))}/${encodeURIComponent(clean(t.title))}`)
  if (!res.ok) return null
  const { lyrics } = await res.json()
  if (!lyrics?.trim()) return null
  const lines = lyrics
    .replace(/\r/g, '')
    .replace(/^Paroles de la chanson.*\n/i, '')
    .split('\n')
    .map((text: string) => ({ time: null, text: text.trim() }))
  return { lines, synced: false, instrumental: false, source: 'lyrics.ovh' }
}

// --- Lyrics the listener added themselves (pasted, optionally tap-synced) ---
const USER = 'aura:ly:user:'

export function userLyrics(id: string): Lyrics | null {
  try {
    const raw = localStorage.getItem(USER + id)
    return raw ? { ...JSON.parse(raw), source: 'you' } : null
  } catch {
    return null
  }
}

export function saveUserLyrics(id: string, l: Pick<Lyrics, 'lines' | 'synced'>) {
  try {
    localStorage.setItem(USER + id, JSON.stringify({ lines: l.lines, synced: l.synced, instrumental: false }))
  } catch {
    /* storage full or blocked */
  }
  missing.delete(id)
}

export function deleteUserLyrics(id: string) {
  try {
    localStorage.removeItem(USER + id)
  } catch {
    /* ignore */
  }
}

/** Turn pasted text into lines, dropping section labels like "[Chorus]". */
export function parsePasted(text: string): LyricLine[] {
  if (/^\s*\[\d+:\d+/m.test(text)) return parseLrc(text)
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, a) => !/^\[.*\]$/.test(l) && !(l === '' && a[i - 1] === ''))
    .map((text) => ({ time: null, text }))
}

// Not-found results are remembered for this session only, so a busy server doesn't hide lyrics for days.
const missing = new Set<string>()

export async function lyrics(t: Track): Promise<Lyrics | null> {
  const mine = userLyrics(t.id)
  if (mine) return mine
  if (missing.has(t.id)) return null
  try {
    return await cached(`ly3:${t.id}`, 7 * DAY, async () => {
      const found = (await fromLrclib(t)) ?? (await fromLyricsOvh(t).catch(() => null))
      if (!found) throw new Error('none')
      return found
    })
  } catch (e) {
    if (!(e instanceof Busy)) missing.add(t.id)
    return null
  }
}

function toLyrics(d: any): Lyrics | null {
  if (d.instrumental) return { lines: [], synced: false, instrumental: true, source: 'LRCLIB' }
  if (d.syncedLyrics) return { lines: parseLrc(d.syncedLyrics), synced: true, instrumental: false, source: 'LRCLIB' }
  if (d.plainLyrics)
    return { lines: d.plainLyrics.split('\n').map((text: string) => ({ time: null, text })), synced: false, instrumental: false, source: 'LRCLIB' }
  return null
}
