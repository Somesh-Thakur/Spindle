// Finds the YouTube upload for a catalogue track so it can play in full
// through YouTube's official embedded player.
//
// Lookup: local cache, then Piped, Invidious and the YouTube Data API (only if
// VITE_YT_API_KEY is set) all at once, first good match wins. Piped/Invidious are community mirrors used here for
// search only; playback always goes through the official embed.
import { cached, DAY } from '../lib/cache'
import type { Track } from '../lib/types'

const PIPED = ['https://pipedapi.ducks.party', 'https://api.piped.private.coffee']
const INVIDIOUS_FALLBACK = ['https://invidious.f5.si']
const KEY = import.meta.env.VITE_YT_API_KEY as string | undefined

interface Hit {
  id: string
  title: string
  author: string
  duration: number
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/feat\.?|ft\.?|official|video|audio|lyrics?|lyrical|hd|4k/g, ' ')
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')
    .trim()

/** Higher is better. Rewards title and artist overlap and a matching length. */
function score(h: Hit, t: Track) {
  const ht = norm(h.title)
  const tt = norm(t.title)
  const ha = norm(h.author)
  const artists = t.artist.split(/,|&| x /i).map(norm).filter(Boolean)
  let s = 0
  if (ht === tt) s += 6
  else if (ht.includes(tt) || tt.includes(ht)) s += 4
  else {
    const words = tt.split(' ').filter((w) => w.length > 1)
    s += (words.filter((w) => ht.includes(w)).length / Math.max(1, words.length)) * 3
  }
  if (artists.some((a) => ha.includes(a) || ht.includes(a))) s += 3
  if (/ - topic$/i.test(h.author)) s += 2
  if (h.duration && t.duration > 40) {
    const d = Math.abs(h.duration - t.duration)
    s += d < 4 ? 4 : d < 10 ? 2 : d < 30 ? 0 : -4
  }
  const junk = /\b(live|cover|remix|slowed|reverb|8d|karaoke|instrumental|sped up|nightcore|lofi|lo-fi|mashup)\b/i
  if ((junk.test(h.title) || junk.test(h.author)) && !junk.test(t.title)) s -= 5
  return s
}

async function timed(url: string, ms = 9000) {
  const ctl = new AbortController()
  const id = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) throw new Error(String(r.status))
    return await r.json()
  } finally {
    clearTimeout(id)
  }
}

const pipedHits = (j: any): Hit[] =>
  (j.items ?? [])
    .filter((i: any) => i.type === 'stream' && i.url)
    .map((i: any) => ({ id: i.url.split('v=')[1], title: i.title, author: i.uploaderName ?? '', duration: i.duration ?? 0 }))

/** Asks one mirror. Throws when it fails or finds nothing, so races skip it. */
async function pipedAt(base: string, q: string, filter = 'music_songs'): Promise<Hit[]> {
  const hits = pipedHits(await timed(`${base}/search?q=${encodeURIComponent(q)}&filter=${filter}`))
  if (!hits.length) throw new Error('empty')
  return hits
}

/** Every mirror at once; the first good answer wins. */
async function viaPiped(q: string, filter = 'music_songs'): Promise<Hit[]> {
  return Promise.any(PIPED.map((b) => pipedAt(b, q, filter))).catch(() => [])
}

let invidiousList: Promise<string[]> | null = null
function invidiousHosts() {
  invidiousList ??= cached('inv:hosts', DAY, async () => {
    const j = await timed('https://api.invidious.io/instances.json?sort_by=health', 5000)
    return j.filter(([, i]: any) => i.api && i.cors && i.type === 'https').map(([, i]: any) => i.uri as string)
  })
    .catch(() => [] as string[])
    .then((l) => [...new Set([...l, ...INVIDIOUS_FALLBACK])].slice(0, 4))
  return invidiousList
}

async function invidiousAt(base: string, q: string): Promise<Hit[]> {
  const j = await timed(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`)
  const hits: Hit[] = j.map((v: any) => ({ id: v.videoId, title: v.title, author: v.author ?? '', duration: v.lengthSeconds ?? 0 }))
  if (!hits.length) throw new Error('empty')
  return hits
}

async function viaInvidious(q: string): Promise<Hit[]> {
  const hosts = await invidiousHosts()
  return Promise.any(hosts.map((b) => invidiousAt(b, q))).catch(() => [])
}

async function viaDataApi(q: string): Promise<Hit[]> {
  if (!KEY) return []
  const j = await timed(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&videoCategoryId=10&maxResults=8&q=${encodeURIComponent(q)}&key=${KEY}`,
  )
  return (j.items ?? []).map((i: any) => ({ id: i.id.videoId, title: i.snippet.title, author: i.snippet.channelTitle, duration: 0 }))
}

const SOURCES = [(q: string) => viaPiped(q), viaInvidious, viaDataApi]

/** Best matches among some search results, or nothing if none fit well. */
function pick(hits: Hit[], t: Track) {
  const ranked = hits
    .map((h) => ({ h, s: score(h, t) }))
    .filter((x) => x.s >= 5)
    .sort((a, b) => b.s - a.s)
  // Only keep runners-up that are nearly as good: a weaker match is
  // usually a different recording (karaoke, cover), which is worse than a preview.
  const best = ranked[0]?.s ?? 0
  return ranked.filter((x) => x.s >= best - 2).slice(0, 3).map((x) => x.h.id)
}

// Songs that just failed, so replaying one doesn't wait on every mirror again.
const misses = new Map<string, number>()
const MISS_FOR = 10 * 60_000

/**
 * Candidate video IDs for a track, best match first. Empty when nothing fits.
 * `from` skips earlier sources, used when every candidate refused to embed.
 * All sources are asked at once and the first good match wins, so one slow
 * mirror no longer holds up the song.
 */
export function findVideos(t: Track, from = 0): Promise<string[]> {
  const key = `yt2:${t.id}:${from}`
  if ((misses.get(key) ?? 0) > Date.now()) return Promise.resolve([])
  return cached(key, 30 * DAY, () => {
    const q = `${t.title} ${t.artist.split(/,|&/)[0]}`
    return Promise.any(
      SOURCES.slice(from).map(async (source) => {
        const ids = pick(await source(q), t)
        if (!ids.length) throw new Error('no match')
        return ids
      }),
    )
  }).catch(() => {
    misses.set(key, Date.now() + MISS_FOR)
    return []
  })
}

/**
 * Karaoke or instrumental uploads of a track, best first. Scored like
 * findVideos, but the upload must say it's karaoke or instrumental.
 */
export function findInstrumentals(t: Track): Promise<string[]> {
  return cached(`yti:${t.id}`, 30 * DAY, async () => {
    const artist = t.artist.split(/,|&/)[0]
    const pools = await Promise.all([
      viaPiped(`${t.title} ${artist} karaoke`, 'videos').catch(() => [] as Hit[]),
      viaPiped(`${t.title} ${artist} instrumental`, 'music_songs').catch(() => [] as Hit[]),
    ])
    let hits = pools.flat()
    if (!hits.length) hits = await viaInvidious(`${t.title} ${artist} karaoke`)
    const want = /\b(karaoke|instrumental|minus one|backing track)\b/i
    const tt = norm(t.title)
    const words = tt.split(' ').filter((w) => w.length > 1)
    const ranked = hits
      .filter((h) => want.test(h.title))
      .map((h) => {
        const ht = norm(h.title)
        let sc = (words.filter((w) => ht.includes(w)).length / Math.max(1, words.length)) * 6
        if (/\b(cover|live|remix|slowed|8d|nightcore)\b/i.test(h.title)) sc -= 4
        // Same length usually means the same arrangement, so lyric timings still line up.
        if (h.duration && t.duration > 40) {
          const d = Math.abs(h.duration - t.duration)
          sc += d < 3 ? 4 : d < 20 ? 1 : -2
        }
        return { h, sc }
      })
      .filter((x) => x.sc >= 4)
      .sort((a, b) => b.sc - a.sc)
    if (!ranked.length) throw new Error('none')
    return [...new Set(ranked.map((x) => x.h.id))].slice(0, 3)
  }).catch(() => [])
}

/** Piped proxies Google artwork; rebuild the direct URL as a size template. */
function artFromThumb(thumb?: string) {
  if (!thumb) return ''
  try {
    const u = new URL(thumb)
    const host = u.searchParams.get('host') ?? 'lh3.googleusercontent.com'
    if (!/googleusercontent\.com$/.test(host)) return thumb
    return `https://${host}${u.pathname.replace(/=w\d+-h\d+.*$/, '')}=w{s}-h{s}-l90-rw`
  } catch {
    return thumb
  }
}

/**
 * Song search on YouTube Music. It carries plenty that the iTunes catalogue
 * doesn't, especially independent and regional music.
 */
export function searchYouTubeMusic(q: string): Promise<Track[]> {
  return cached(`ytm:${q.trim().toLowerCase()}`, DAY, async () => {
    const items = await Promise.any(
      PIPED.map(async (base) => {
        const j = await timed(`${base}/search?q=${encodeURIComponent(q)}&filter=music_songs`)
        const found = (j.items ?? []).filter((i: any) => i.type === 'stream' && i.url)
        if (!found.length) throw new Error('empty')
        return found
      }),
    )
    return items.slice(0, 20).map(
      (i: any): Track => {
        const id = i.url.split('v=')[1]
        return {
          id: `yt:${id}`,
          source: 'youtube',
          videoId: id,
          title: i.title,
          artist: (i.uploaderName ?? '').replace(/ - Topic$/, ''),
          art: artFromThumb(i.thumbnail),
          duration: i.duration ?? 0,
          streamUrl: '',
          preview: false,
        }
      },
    )
  }).catch(() => [])
}
