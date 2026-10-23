// Playlist importer, server side. Reads public playlist and album pages from
// Spotify, Apple Music and YouTube / YouTube Music, which browsers can't fetch
// directly (no CORS). Used by the Vite dev server (vite.config.ts) and by the
// Vercel function in api/import.ts. No accounts or API keys needed.

export interface ImportItem {
  title: string
  artist: string
  album?: string
  /** Seconds. */
  duration?: number
  /** Artwork URL, or a `{s}` size template for Apple artwork. */
  art?: string
  videoId?: string
  /** Apple / iTunes catalogue id. */
  itunesId?: string
  /** From a free-text line where "A - B" could be either "Artist - Song" or "Song - Artist". */
  ambiguous?: boolean
}

export interface ImportResult {
  source: 'spotify' | 'apple' | 'youtube'
  kind: 'playlist' | 'album'
  name: string
  cover?: string
  items: ImportItem[]
  /** True when the source only exposed part of a longer list. */
  truncated?: boolean
}

export class ImportError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

async function page(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } })
  if (res.status === 404) throw new ImportError('That playlist doesn’t exist or isn’t public.', 404)
  if (!res.ok) throw new ImportError(`The service answered ${res.status}. Try again in a moment.`, 502)
  return res.text()
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

const meta = (html: string, prop: string) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, 'i'))
  return m ? decode(m[1]) : undefined
}

function walk(o: unknown, visit: (o: Record<string, any>) => boolean | void) {
  if (!o || typeof o !== 'object') return
  if (Array.isArray(o)) return o.forEach((x) => walk(x, visit))
  if (visit(o as Record<string, any>)) return
  for (const v of Object.values(o)) walk(v, visit)
}

// ---------------------------------------------------------------- Spotify

async function spotify(type: string, id: string): Promise<ImportResult> {
  if (type === 'track') throw new ImportError('That’s a single song. Paste a playlist or album link.')
  const html = await page(`https://open.spotify.com/embed/${type}/${id}`)
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  const entity = m && JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity
  if (!entity?.trackList) throw new ImportError('Couldn’t read that Spotify page. Make sure the playlist is public.', 422)
  const cover = entity.coverArt?.sources?.[0]?.url ?? entity.visualIdentity?.image?.at(-1)?.url
  const items: ImportItem[] = entity.trackList.map((t: any) => ({
    title: t.title,
    artist: t.subtitle?.replace(/ /g, ' ') ?? '',
    album: type === 'album' ? entity.name : undefined,
    duration: t.duration ? Math.round(t.duration / 1000) : undefined,
  }))
  // The embed page lists at most 100 tracks.
  return { source: 'spotify', kind: type === 'album' ? 'album' : 'playlist', name: entity.name, cover, items, truncated: items.length >= 100 }
}

// ------------------------------------------------------------ Apple Music

async function apple(url: string, kind: 'playlist' | 'album'): Promise<ImportResult> {
  const html = await page(url)
  const m = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) throw new ImportError('Couldn’t read that Apple Music page.', 422)
  const data = JSON.parse(m[1])
  const items: ImportItem[] = []
  const seen = new Set<string>()
  walk(data, (o) => {
    if (o.contentDescriptor?.kind !== 'song' || !o.title) return
    const id = o.contentDescriptor.identifiers?.storeAdamID
    const key = id ?? `${o.title}|${o.subtitleLinks?.[0]?.title}`
    if (seen.has(key)) return true
    seen.add(key)
    items.push({
      title: o.title,
      artist: (o.subtitleLinks ?? []).map((l: any) => l.title).join(', ') || o.artistName || '',
      duration: o.duration ? Math.round(o.duration / 1000) : undefined,
      art: o.artwork?.dictionary?.url?.replace('{w}x{h}bb.{f}', '{s}x{s}bb.jpg'),
      itunesId: id,
    })
    return true
  })
  if (!items.length) throw new ImportError('That Apple Music page has no songs we can read.', 422)
  const name = (meta(html, 'og:title') ?? 'Apple Music import').replace(/ (?:on|by) Apple Music$/i, '').replace(/^(.*?) - (?:Playlist|Album) by .*$/i, '$1')
  return { source: 'apple', kind, name, cover: meta(html, 'og:image'), items }
}

// ------------------------------------------------- YouTube / YouTube Music

/** "Artist - Song (Official Video)" → { artist, title } using the channel name as a hint. */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')

export function cleanYouTube(rawTitle: string, channel: string) {
  const artistHint = channel.replace(/ - Topic$/, '').replace(/\s*VEVO$/i, '').replace(/\s*official$/i, '').trim()
  let title = rawTitle
    .replace(/\s*[[(]\s*(?:official|video|videoclip|lyric|lyrics|letra|audio|visuali[sz]er|music video|full video|full song|hd|4k|mv|m\/v)[^)\]]*[)\]]/gi, '')
    .replace(/\s*\|.*$/, '')
    .trim()
  let artist = artistHint
  const dash = title.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash) {
    const [, left, right] = dash
    const hint = fold(artistHint)
    const lead = (s: string) => fold(s.split(/,|&| x | ft\.? | feat\.? /i)[0])
    // "Artist - Song" (most common) or "Song - Artist" (the channel name says which).
    if (hint && (fold(right).includes(hint) || hint.includes(lead(right))) && !fold(left).includes(hint)) {
      title = left.trim()
      artist = right.trim()
    } else if (!hint || fold(left).includes(hint) || hint.includes(lead(left))) {
      artist = left.trim()
      title = right.trim()
    }
  }
  return { title, artist }
}

const secs = (t?: string) => {
  if (!t) return undefined
  const p = t.split(':').map(Number)
  return p.some(isNaN) ? undefined : p.reduce((a, b) => a * 60 + b, 0)
}

function ytItems(data: unknown): { items: ImportItem[]; token?: string } {
  const items: ImportItem[] = []
  let token: string | undefined
  walk(data, (o) => {
    if (o.playlistVideoRenderer) {
      const v = o.playlistVideoRenderer
      const raw = v.title?.runs?.[0]?.text ?? v.title?.simpleText ?? ''
      const channel = v.shortBylineText?.runs?.[0]?.text ?? ''
      if (v.videoId && raw) items.push({ ...cleanYouTube(raw, channel), videoId: v.videoId, duration: Number(v.lengthSeconds) || undefined })
      return true
    }
    if (o.lockupViewModel) {
      const l = o.lockupViewModel
      const thumb: string = l.contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url ?? ''
      const videoId = l.contentId ?? thumb.match(/\/vi\/([\w-]{11})\//)?.[1]
      const md = l.metadata?.lockupMetadataViewModel
      const raw = md?.title?.content ?? ''
      const channel = md?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content ?? ''
      let badge: string | undefined
      walk(l.contentImage, (x) => {
        if (!x.thumbnailBadgeViewModel?.text) return
        badge = x.thumbnailBadgeViewModel.text
        return true
      })
      if (videoId && raw) items.push({ ...cleanYouTube(raw, channel), videoId, duration: secs(badge) })
      return true
    }
    if (o.continuationCommand?.token) token = o.continuationCommand.token
  })
  return { items, token }
}

async function youtube(list: string): Promise<ImportResult> {
  if (/^(LM|LL|WL)$/.test(list)) throw new ImportError('Liked Songs and Watch Later are private. Use a Google Takeout export instead (see below).')
  const html = await page(`https://www.youtube.com/playlist?list=${encodeURIComponent(list)}&hl=en`)
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/)
  if (!m) throw new ImportError('Couldn’t read that YouTube playlist. Make sure it’s public or unlisted.', 422)
  const data = JSON.parse(m[1])
  const name = data.metadata?.playlistMetadataRenderer?.title ?? meta(html, 'og:title') ?? 'YouTube import'
  let { items, token } = ytItems(data.contents ?? data)
  const version = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] ?? '2.20240101.00.00'
  const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1]
  // Each continuation brings the next ~100 videos.
  for (let pageNo = 0; token && pageNo < 40; pageNo++) {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?prettyPrint=false${key ? `&key=${key}` : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: version, hl: 'en' } }, continuation: token }),
    })
    if (!res.ok) break
    const next = ytItems(await res.json())
    items = items.concat(next.items)
    token = next.token
  }
  if (!items.length) throw new ImportError('That YouTube playlist is empty or private.', 422)
  const seen = new Set<string>()
  items = items.filter((i) => !seen.has(i.videoId!) && seen.add(i.videoId!))
  const cover = meta(html, 'og:image')
  return { source: 'youtube', kind: list.startsWith('OLAK5uy_') ? 'album' : 'playlist', name, cover, items, truncated: !!token }
}

// ---------------------------------------------------------------- Router

export async function importFromUrl(raw: string): Promise<ImportResult> {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new ImportError('That doesn’t look like a link. Paste the full playlist or album URL.')
  }
  const host = url.hostname.replace(/^www\./, '')

  if (host === 'open.spotify.com' || host === 'spotify.link') {
    const m = url.pathname.match(/\/(playlist|album|track)\/([A-Za-z0-9]+)/)
    if (!m) throw new ImportError('Paste a Spotify playlist or album link.')
    return spotify(m[1], m[2])
  }
  if (host === 'music.apple.com' || host === 'itunes.apple.com') {
    const kind = url.pathname.includes('/playlist/') ? 'playlist' : url.pathname.includes('/album/') ? 'album' : null
    if (!kind) throw new ImportError('Paste an Apple Music playlist or album link.')
    return apple(url.toString(), kind)
  }
  if (/(^|\.)youtube\.com$/.test(host) || host === 'youtu.be') {
    const list = url.searchParams.get('list')
    if (!list) throw new ImportError('That YouTube link has no playlist in it. Open the playlist itself and copy its link.')
    return youtube(list)
  }
  throw new ImportError('Paste a link from Spotify, Apple Music, YouTube or YouTube Music.')
}
