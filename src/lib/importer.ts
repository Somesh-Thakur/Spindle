// Importing playlists into Spindle: read a link (via /api/import) or an export
// file, then match every song to something playable here.
import { cleanYouTube, type ImportItem, type ImportResult } from '../../server/import'
import { lookupSongs } from '../api/itunes'
import { searchYouTubeMusic } from '../api/youtube'
import type { Track } from './types'

export type { ImportItem, ImportResult }

export async function readLink(url: string): Promise<ImportResult> {
  const res = await fetch(`/api/import?url=${encodeURIComponent(url)}`)
  const body = await res.json().catch(() => null)
  if (!res.ok || !body) throw new Error(body?.error ?? 'The import service didn’t answer. Try again in a moment.')
  return body
}

// ------------------------------------------------------------ Export files

/** Small RFC 4180 CSV reader: quoted fields, escaped quotes, newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') row.push(cell), (cell = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

const COLS = {
  title: ['track name', 'title', 'song', 'song name', 'track', 'name'],
  artist: ['artist name(s)', 'artist name', 'artist', 'artists', 'artist(s)'],
  album: ['album name', 'album'],
  duration: ['duration (ms)', 'duration', 'time'],
  videoId: ['video id', 'videoid', 'video_id'],
  playlist: ['playlist name', 'playlist'],
}

function pickCol(header: string[], names: string[]) {
  const h = header.map((x) => x.trim().toLowerCase())
  for (const n of names) {
    const i = h.indexOf(n)
    if (i >= 0) return i
  }
  return -1
}

const toSeconds = (v: string, ms: boolean) => {
  if (!v) return undefined
  if (v.includes(':')) return v.split(':').map(Number).reduce((a, b) => a * 60 + b, 0) || undefined
  const n = Number(v)
  return n ? Math.round(ms ? n / 1000 : n) : undefined
}

/**
 * Exportify (Spotify), TuneMyMusic, Soundiiz and Google Takeout (YouTube Music)
 * CSVs, or a plain text file with one song per line. One file can hold several
 * playlists (a "Playlist name" column); each becomes its own import.
 */
export async function readFile(file: File): Promise<ImportResult[]> {
  const text = (await file.text()).replace(/^﻿/, '')
  const base = file.name.replace(/\.(csv|txt)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Imported songs'

  if (!/\.csv$/i.test(file.name) && !text.split('\n')[0].includes(',')) {
    // Plain text: "Artist - Song", "Song by Artist", or just a song name per line.
    const items = text
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean)
      .map((l): ImportItem => {
        const by = l.match(/^(.+?)\s+by\s+(.+)$/i)
        if (by) return { title: by[1], artist: by[2] }
        const dash = l.match(/^(.+?)\s+[-–—]\s+(.+)$/)
        return dash ? { title: dash[2], artist: dash[1], ambiguous: true } : { title: l, artist: '' }
      })
    return [{ source: 'youtube', kind: 'playlist', name: base, items }]
  }

  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('That file has no songs in it.')
  const [header, ...body] = rows
  const c = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, pickCol(header, names)])) as Record<keyof typeof COLS, number>
  if (c.title < 0 && c.videoId < 0) throw new Error('Couldn’t find a song title or video ID column. Export with track names, or use a Google Takeout playlist file.')
  const ms = c.duration >= 0 && /ms/i.test(header[c.duration])

  const groups = new Map<string, ImportItem[]>()
  for (const r of body) {
    const item: ImportItem = {
      title: c.title >= 0 ? r[c.title]?.trim() ?? '' : '',
      artist: c.artist >= 0 ? (r[c.artist] ?? '').replace(/;/g, ', ').trim() : '',
      album: c.album >= 0 ? r[c.album]?.trim() || undefined : undefined,
      duration: c.duration >= 0 ? toSeconds(r[c.duration]?.trim() ?? '', ms) : undefined,
      videoId: c.videoId >= 0 ? r[c.videoId]?.trim() || undefined : undefined,
    }
    if (!item.title && !item.videoId) continue
    const g = (c.playlist >= 0 && r[c.playlist]?.trim()) || base
    groups.set(g, [...(groups.get(g) ?? []), item])
  }
  return [...groups].map(([name, items]) => ({ source: items[0]?.videoId ? 'youtube' : 'spotify', kind: 'playlist', name, items }))
}

// ---------------------------------------------------------------- Matching

const fold = (s = '') =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(feat|ft|with)\b.*$/, '')
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')
    .trim()

/** 0–1 confidence that a search hit is the imported song. */
function confidence(hit: Track, want: ImportItem) {
  const ht = fold(hit.title)
  const wt = fold(want.title)
  if (!wt) return 0
  const words = wt.split(' ').filter((w) => w.length > 1)
  let s = ht === wt ? 0.55 : ht.includes(wt) || wt.includes(ht) ? 0.45 : (words.filter((w) => ht.includes(w)).length / Math.max(1, words.length)) * 0.35
  const wa = fold(want.artist).split(' ')[0]
  if (!wa || fold(hit.artist).includes(wa)) s += 0.3
  if (want.duration && hit.duration) {
    const d = Math.abs(want.duration - hit.duration)
    s += d < 4 ? 0.15 : d < 12 ? 0.08 : d > 40 ? -0.2 : 0
  } else s += 0.05
  return s
}

const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hq720.jpg`
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7).toString(36)

/** A song we couldn't confidently match yet: it's looked up again when played. */
function pending(item: ImportItem, cover?: string): Track {
  return {
    id: `imp:${hash(`${fold(item.title)}|${fold(item.artist)}`)}`,
    source: 'youtube',
    title: item.title,
    artist: item.artist || 'Unknown artist',
    album: item.album,
    art: item.art ?? cover ?? '',
    duration: item.duration ?? 0,
    streamUrl: '',
    preview: false,
  }
}

export type MatchStatus = 'matched' | 'video' | 'later'

export interface Resolved {
  track: Track
  status: MatchStatus
}

async function resolveOne(item: ImportItem, cover?: string): Promise<Resolved> {
  // Takeout files only carry video IDs: fill in the title from YouTube.
  if (item.videoId && !item.title) {
    try {
      const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${item.videoId}`)}`).then((r) => r.json())
      Object.assign(item, cleanYouTube(o.title ?? '', o.author_name ?? ''))
    } catch {
      /* keep going with what we have */
    }
  }
  if (item.title) {
    const hits = await searchYouTubeMusic(`${item.title} ${item.artist}`.trim())
    // A free-text "A - B" line could be either order; score both readings.
    const readings = item.ambiguous ? [item, { ...item, title: item.artist, artist: item.title }] : [item]
    const best = readings
      .flatMap((r) => hits.map((h) => ({ h, r, c: confidence(h, r) })))
      .sort((a, b) => b.c - a.c)[0]
    if (best && best.c >= 0.7) return { track: { ...best.h, album: item.album ?? best.h.album }, status: 'matched' }
    if (best?.r !== item && best) Object.assign(item, { title: best.r.title, artist: best.r.artist })
  }
  if (item.videoId)
    return {
      track: {
        id: `yt:${item.videoId}`,
        source: 'youtube',
        videoId: item.videoId,
        title: item.title || 'YouTube video',
        artist: item.artist || 'YouTube',
        art: ytThumb(item.videoId),
        duration: item.duration ?? 0,
        streamUrl: '',
        preview: false,
      },
      status: 'video',
    }
  return { track: pending(item, cover), status: 'later' }
}

/**
 * Match every item, a few at a time, reporting each one as it lands.
 * Apple Music items map straight onto the iTunes catalogue in bulk.
 */
export async function resolveAll(
  result: ImportResult,
  country: string,
  onItem: (index: number, r: Resolved) => void,
  signal?: { cancelled: boolean },
): Promise<Resolved[]> {
  const out: Resolved[] = new Array(result.items.length)
  const viaItunes = result.items.map((it, i) => ({ it, i })).filter((x) => x.it.itunesId)
  for (let k = 0; k < viaItunes.length; k += 150) {
    const chunk = viaItunes.slice(k, k + 150)
    const found = await lookupSongs(chunk.map((x) => x.it.itunesId!), country).catch(() => [] as Track[])
    const byId = new Map(found.map((t) => [t.id, t]))
    for (const { it, i } of chunk) {
      const t = byId.get(`it:${it.itunesId}`)
      if (t) onItem(i, (out[i] = { track: t, status: 'matched' }))
    }
  }

  const queue = result.items.map((it, i) => ({ it, i })).filter((x) => !out[x.i])
  const worker = async () => {
    for (let next = queue.shift(); next && !signal?.cancelled; next = queue.shift()) {
      let r: Resolved
      try {
        r = await resolveOne(next.it, result.cover)
      } catch {
        r = { track: pending(next.it, result.cover), status: 'later' }
      }
      out[next.i] = r
      onItem(next.i, r)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return out.filter(Boolean)
}
