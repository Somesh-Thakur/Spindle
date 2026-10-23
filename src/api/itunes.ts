// Apple's public iTunes Search / Lookup / RSS APIs. Free, keyless, CORS-enabled.
// Songs come as 30-second previews with full-resolution artwork.
import { cached, DAY, HOUR } from '../lib/cache'
import type { Album, Artist, Track } from '../lib/types'

const BASE = 'https://itunes.apple.com'

export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'in', name: 'India' },
  { code: 'us', name: 'United States' },
  { code: 'gb', name: 'United Kingdom' },
  { code: 'ca', name: 'Canada' },
  { code: 'au', name: 'Australia' },
  { code: 'de', name: 'Germany' },
  { code: 'fr', name: 'France' },
  { code: 'jp', name: 'Japan' },
  { code: 'kr', name: 'South Korea' },
  { code: 'br', name: 'Brazil' },
  { code: 'mx', name: 'Mexico' },
  { code: 'ae', name: 'UAE' },
]

export function defaultCountry() {
  const lang = (navigator.language || 'en-US').toLowerCase()
  const region = lang.split('-')[1]
  return COUNTRIES.some((c) => c.code === region) ? region! : 'us'
}

/** Turn any mzstatic artwork URL into a `{s}` size template. */
function artTemplate(url?: string) {
  if (!url) return ''
  return url.replace(/\/\d+x\d+(bb)?(-\d+)?\.(png|jpg|jpeg|webp)$/, '/{s}x{s}bb.jpg')
}

async function get<T = any>(path: string): Promise<T> {
  await slot()
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`iTunes ${res.status}`)
  return res.json()
}

// Space requests out so pages that load many small feeds (Browse) don't trip
// Apple's rate limit. Cached reads never get here.
let nextSlot = 0
function slot() {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + 350
  return new Promise((r) => setTimeout(r, at - now))
}

export interface ChartPeek {
  title: string
  artist: string
  art: string
}

/** The first few covers of a chart, straight from the feed (no lookup needed). */
export function chartPeek(country: string, genre?: number, limit = 3): Promise<ChartPeek[]> {
  return cached(`peek:${country}:${genre ?? 'all'}:${limit}`, 12 * HOUR, async () => {
    const g = genre ? `/genre=${genre}` : ''
    const feed = await get(`/${country}/rss/topsongs/limit=${limit}${g}/json`)
    return [feed.feed?.entry ?? []].flat().map((e: any) => ({
      title: e['im:name']?.label ?? '',
      artist: e['im:artist']?.label ?? '',
      art: artTemplate(e['im:image']?.at(-1)?.label),
    }))
  })
}

function toTrack(r: any): Track | null {
  if (!r || r.wrapperType !== 'track' || r.kind !== 'song' || !r.previewUrl) return null
  return {
    id: `it:${r.trackId}`,
    source: 'itunes',
    title: r.trackName,
    artist: r.artistName,
    artistId: String(r.artistId ?? ''),
    album: r.collectionName,
    albumId: String(r.collectionId ?? ''),
    art: artTemplate(r.artworkUrl100),
    duration: (r.trackTimeMillis ?? 30000) / 1000,
    streamUrl: r.previewUrl,
    preview: true,
    genre: r.primaryGenreName,
    releaseDate: r.releaseDate,
    explicit: r.trackExplicitness === 'explicit',
  }
}

function toAlbum(r: any): Album | null {
  if (!r || r.wrapperType !== 'collection') return null
  return {
    id: String(r.collectionId),
    title: r.collectionName,
    artist: r.artistName,
    artistId: String(r.artistId ?? ''),
    art: artTemplate(r.artworkUrl100),
    year: r.releaseDate?.slice(0, 4),
    genre: r.primaryGenreName,
    trackCount: r.trackCount,
    copyright: r.copyright,
  }
}

const compact = <T,>(xs: (T | null)[]) => xs.filter(Boolean) as T[]

export async function lookupSongs(ids: string[], country: string): Promise<Track[]> {
  if (!ids.length) return []
  const data = await get(`/lookup?id=${ids.join(',')}&country=${country}`)
  const byId = new Map(compact<Track>(data.results.map(toTrack)).map((t) => [t.id, t] as const))
  return compact<Track>(ids.map((id) => byId.get(`it:${id}`) ?? null))
}

export function topSongs(country: string, genre?: number, limit = 50) {
  return cached(`top:${country}:${genre ?? 'all'}:${limit}`, 3 * HOUR, async () => {
    const g = genre ? `/genre=${genre}` : ''
    const feed = await get(`/${country}/rss/topsongs/limit=${limit}${g}/json`)
    const entries = [feed.feed?.entry ?? []].flat()
    const ids: string[] = entries.map((e: any) => e.id?.attributes?.['im:id']).filter(Boolean)
    return lookupSongs(ids, country)
  })
}

export function topAlbums(country: string, limit = 30) {
  return cached(`topalb:${country}:${limit}`, 6 * HOUR, async () => {
    const feed = await get(`/${country}/rss/topalbums/limit=${limit}/json`)
    const entries = [feed.feed?.entry ?? []].flat()
    return entries.map((e: any): Album => ({
      id: e.id.attributes['im:id'],
      title: e['im:name'].label,
      artist: e['im:artist'].label,
      art: artTemplate(e['im:image']?.at(-1)?.label),
      year: e['im:releaseDate']?.label?.slice(0, 4),
      genre: e.category?.attributes?.label,
      trackCount: Number(e['im:itemCount']?.label) || undefined,
    }))
  })
}

export interface SearchResults {
  songs: Track[]
  albums: Album[]
  artists: Artist[]
}

export function search(term: string, country: string): Promise<SearchResults> {
  const q = encodeURIComponent(term.trim())
  return cached(`s:${country}:${term.trim().toLowerCase()}`, DAY, async () => {
    const [songs, albums] = await Promise.all([
      get(`/search?term=${q}&entity=song&limit=30&country=${country}`),
      get(`/search?term=${q}&entity=album&limit=16&country=${country}`),
    ])
    const tracks = compact<Track>(songs.results.map(toTrack))
    // Derive artists from song hits so a search costs two requests, not three.
    const seen = new Map<string, Artist>()
    for (const t of tracks) {
      if (t.artistId && !seen.has(t.artistId) && !t.artist.includes(',') && !t.artist.includes('&'))
        seen.set(t.artistId, { id: t.artistId, name: t.artist, genre: t.genre, art: t.art })
    }
    return {
      songs: tracks,
      albums: compact<Album>(albums.results.map(toAlbum)),
      artists: [...seen.values()].slice(0, 8),
    }
  })
}

export function album(id: string, country: string) {
  return cached(`alb:${country}:${id}`, DAY, async () => {
    const data = await get(`/lookup?id=${id}&entity=song&country=${country}`)
    const info = toAlbum(data.results[0])
    return { album: info, tracks: compact<Track>(data.results.slice(1).map(toTrack)) }
  })
}

export function artist(id: string, country: string) {
  return cached(`art:${country}:${id}`, DAY, async () => {
    const [songs, albums] = await Promise.all([
      get(`/lookup?id=${id}&entity=song&limit=25&country=${country}`),
      get(`/lookup?id=${id}&entity=album&limit=40&country=${country}`),
    ])
    const a = songs.results[0]
    const tracks = compact<Track>(songs.results.slice(1).map(toTrack))
    const albumList = compact<Album>(albums.results.slice(1).map(toAlbum)).sort((x, y) =>
      (y.year ?? '').localeCompare(x.year ?? ''),
    )
    return {
      artist: { id, name: a?.artistName ?? '', genre: a?.primaryGenreName, art: tracks[0]?.art } as Artist,
      tracks,
      albums: albumList,
    }
  })
}

/** Top songs for several artists in one request, interleaved so artists alternate. */
export function artistsTopSongs(key: string, ids: number[], country: string, perArtist = 3) {
  return cached(`mix:${country}:${key}`, 3 * DAY, async () => {
    const data = await get(`/lookup?id=${ids.join(',')}&entity=song&limit=${perArtist}&sort=popular&country=${country}`)
    const buckets = new Map<string, Track[]>()
    for (const r of data.results) {
      const t = toTrack(r)
      if (!t) continue
      const b = buckets.get(t.artistId!) ?? []
      if (b.length < perArtist) b.push(t)
      buckets.set(t.artistId!, b)
    }
    const lists = [...buckets.values()]
    const out: Track[] = []
    for (let i = 0; i < perArtist; i++) for (const l of lists) if (l[i]) out.push(l[i])
    return out
  })
}
