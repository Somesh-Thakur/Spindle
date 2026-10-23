import type { Track } from './types'

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')
    .trim()

/** How well a track answers the query, 0 and up. Title hits weigh more than artist hits. */
function relevance(t: Track, q: string) {
  const words = norm(q).split(' ').filter(Boolean)
  if (!words.length) return 0
  const title = norm(t.title)
  const artist = norm(t.artist)
  let s = 0
  for (const w of words) {
    if (title.split(' ').includes(w)) s += 2
    else if (title.includes(w)) s += 1
    if (artist.includes(w)) s += 1.5
  }
  s /= words.length
  // Whole title typed, e.g. "video games" in "video games seedhe maut".
  if (title && norm(q).includes(title)) s += 1.5
  // Prefer the original over remixes, lofi flips and covers, unless that's what was asked for.
  const raw = t.title.toLowerCase()
  const ql = q.toLowerCase()
  if (VARIANT.test(raw) && !VARIANT.test(ql)) s -= 1.2
  // Any other bracketed or dashed tag the listener didn't type ("(Synthwave)",
  // "- Club Mix") marks a version; "(From "Film")" and "(feat. X)" don't.
  for (const tag of raw.match(/\(([^)]*)\)|\[([^\]]*)\]|\s-\s.*$/g) ?? []) {
    if (/\b(from|feat|ft|with|original|soundtrack|ost)\b/.test(tag)) continue
    const words = tag.replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w.length > 2)
    if (words.length && !words.some((w) => ql.includes(w))) s -= 0.8
  }
  return s
}

const VARIANT = /\b(lofi|lo-fi|flip|remix|slowed|reverb|sped up|nightcore|cover|karaoke|instrumental|mashup|8d|unplugged|reprise|live)\b/

const key = (t: Track) => `${norm(t.title)}|${norm(t.artist.split(/,|&/)[0])}`

/**
 * Merge catalogue results with YouTube Music results: drop duplicates
 * (keeping the catalogue copy, which has album and artist pages), then order
 * by relevance so a song that only exists on YouTube Music still comes first
 * when it's what was searched for.
 */
export function mergeSongs(q: string, primary: Track[], extra: Track[]): Track[] {
  // YouTube Music orders results by popularity, which iTunes doesn't. Its top
  // hits break ties, so The Weeknd's "Blinding Lights" beats a cover of it.
  const popular = new Map(extra.slice(0, 3).map((t, i) => [key(t), [0.9, 0.5, 0.3][i]]))
  const seen = new Set(primary.map(key))
  const all = [...primary, ...extra.filter((t) => !seen.has(key(t)) && (seen.add(key(t)), true))]
  return all
    .map((t, i) => ({ t, i, r: relevance(t, q) + (popular.get(key(t)) ?? 0) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.t)
}
