// Audius: open, decentralized music platform. Full-length tracks, free API, CORS-enabled.
import { cached, HOUR } from '../lib/cache'
import type { Track } from '../lib/types'

const BASE = 'https://api.audius.co/v1'
const APP = 'aura-music'

// Audius serves artwork from community nodes that sometimes go offline. Each
// image lists mirror hosts; we carry them in the URL fragment (ignored when
// fetching) so <Artwork> can fail over, even for tracks restored from storage.
function artWithMirrors(art: any): string {
  const url: string | undefined = art?.['480x480']
  if (!url) return ''
  return art.mirrors?.length ? `${url}#m=${art.mirrors.join('|')}` : url
}

export function nextMirror(url: string): string | null {
  const [base, hash = ''] = url.split('#')
  const list = hash.startsWith('m=') ? hash.slice(2).split('|') : []
  if (!list.length) return null
  try {
    const u = new URL(base)
    const next = list[list.indexOf(u.origin) + 1]
    return next ? `${next}${u.pathname}#${hash}` : null
  } catch {
    return null
  }
}

function toTrack(r: any): Track | null {
  if (!r?.id || r.is_streamable === false || r.is_stream_gated) return null
  return {
    id: `au:${r.id}`,
    source: 'audius',
    title: r.title,
    artist: r.user?.name ?? 'Unknown artist',
    artistId: r.user?.id,
    album: r.genre ? `${r.genre} on Audius` : 'Audius',
    art: artWithMirrors(r.artwork) || artWithMirrors(r.user?.profile_picture),
    duration: r.duration ?? 0,
    streamUrl: `${BASE}/tracks/${r.id}/stream?app_name=${APP}`,
    preview: false,
    genre: r.genre,
    releaseDate: r.release_date,
  }
}

const compact = (xs: (Track | null)[]) => xs.filter(Boolean) as Track[]

export function trending(genre?: string, limit = 24) {
  return cached(`au2:trend:${genre ?? 'all'}:${limit}`, 2 * HOUR, async () => {
    const g = genre ? `&genre=${encodeURIComponent(genre)}` : ''
    const res = await fetch(`${BASE}/tracks/trending?app_name=${APP}&limit=${limit}${g}`)
    if (!res.ok) throw new Error(`Audius ${res.status}`)
    const { data } = await res.json()
    return compact(data.map(toTrack))
  })
}

export function searchTracks(term: string, limit = 12) {
  return cached(`au2:s:${term.trim().toLowerCase()}`, 6 * HOUR, async () => {
    const res = await fetch(`${BASE}/tracks/search?app_name=${APP}&limit=${limit}&query=${encodeURIComponent(term)}`)
    if (!res.ok) throw new Error(`Audius ${res.status}`)
    const { data } = await res.json()
    return compact(data.map(toTrack))
  })
}
