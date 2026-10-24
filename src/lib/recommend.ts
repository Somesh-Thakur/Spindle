// "Recommended songs" under a playlist, like Spotify and YouTube Music: the
// popular songs of the artists the playlist leans on, minus what's already in it.
import { artistsTopSongs, search } from '../api/itunes'
import type { Track } from './types'

const MAX_ARTISTS = 8
const PER_ARTIST = 5
/** Name lookups cost an iTunes request each, so only a few. */
const MAX_NAME_LOOKUPS = 3

const key = (t: Pick<Track, 'title' | 'artist'>) =>
  `${t.title.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^\p{L}\p{N}]+/gu, '')}|${t.artist.toLowerCase().split(/,|&| x /)[0].trim()}`

/** The first credited artist, e.g. "Badshah & Seedhe Maut" → "Badshah". */
const leadArtist = (artist: string) => artist.split(/,|&| x | feat\.? /i)[0].trim()

/**
 * Songs to suggest for `seed`, best first. `exclude` is what's already in the
 * playlist (by id, and by title + artist so other versions don't sneak in).
 */
export async function recommend(seed: Track[], exclude: Track[], country: string, perArtist = PER_ARTIST): Promise<Track[]> {
  // Which artists does this playlist lean on? Apple ids where we have them…
  const byId = new Map<string, number>()
  const byName = new Map<string, number>()
  for (const t of seed) {
    if (t.artistId && /^\d+$/.test(t.artistId)) byId.set(t.artistId, (byId.get(t.artistId) ?? 0) + 1)
    else if (t.artist) byName.set(leadArtist(t.artist), (byName.get(leadArtist(t.artist)) ?? 0) + 1)
  }
  // …and for songs from YouTube or Audius, find the artist by name.
  const names = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_NAME_LOOKUPS)
  await Promise.all(
    names.map(async ([name, n]) => {
      try {
        const found = (await search(name, country)).songs.find((s) => s.artistId && leadArtist(s.artist).toLowerCase() === name.toLowerCase())
        if (found?.artistId) byId.set(found.artistId, (byId.get(found.artistId) ?? 0) + n)
      } catch {
        /* skip this artist */
      }
    }),
  )
  const ids = [...byId.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ARTISTS)
    .map(([id]) => Number(id))
  if (!ids.length) return []

  const songs = await artistsTopSongs(`rec:${perArtist}:${[...ids].sort().join(',')}`, ids, country, perArtist)
  const have = new Set(exclude.map((t) => t.id))
  const haveKeys = new Set(exclude.map(key))
  const seen = new Set<string>()
  return songs.filter((t) => {
    const k = key(t)
    if (have.has(t.id) || haveKeys.has(k) || seen.has(k)) return false
    seen.add(k)
    return true
  })
}
