// Shared links, server side. A link like /s/abc123 has to carry its own title
// and picture, because WhatsApp, Discord and iMessage read the HTML of the page
// and never run the app. Used by the Vercel functions in api/ and by the Vite
// dev server (vite.config.ts).
import { ImageResponse } from '@vercel/og'

export interface ShareTrack {
  id: string
  title: string
  artist: string
  art: string
  duration: number
}

export interface Share {
  code: string
  kind: 'track' | 'playlist' | 'album'
  title: string
  subtitle: string | null
  image: string | null
  owner_name: string | null
  updated_at: string
  payload: { track?: ShareTrack; tracks?: ShareTrack[]; cover?: string; count?: number }
}

export interface Env {
  supabaseUrl?: string
  supabaseKey?: string
}

export const envFromProcess = (): Env => ({
  supabaseUrl: process.env.VITE_SUPABASE_URL,
  supabaseKey: process.env.VITE_SUPABASE_ANON_KEY,
})

const CODE = /^[a-z0-9]{6,16}$/i

export async function fetchShare(code: string, env: Env): Promise<Share | null> {
  if (!CODE.test(code) || !env.supabaseUrl || !env.supabaseKey) return null
  const res = await fetch(`${env.supabaseUrl}/rest/v1/shares?code=eq.${code}&select=code,kind,title,subtitle,image,owner_name,updated_at,payload`, {
    headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` },
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Share[]
  return rows[0] ?? null
}

/** Artwork at a given pixel size, matching src/lib/format.ts. */
export function artAt(art: string | undefined | null, size: number) {
  if (!art) return ''
  if (art.includes('{s}')) return art.replaceAll('{s}', String(size))
  const [base] = art.split('#')
  if (base.endsWith('/480x480.jpg')) return base.replace('/480x480.jpg', size <= 480 ? '/480x480.jpg' : '/1000x1000.jpg')
  return base
}

const KIND = { track: 'Song', playlist: 'Playlist', album: 'Album' } as const

export function describe(s: Share) {
  const count = s.payload.count ?? s.payload.tracks?.length ?? 0
  const songs = `${count} ${count === 1 ? 'song' : 'songs'}`
  const line =
    s.kind === 'track'
      ? `Song · ${s.subtitle ?? ''}`
      : s.kind === 'album'
        ? `Album · ${s.subtitle ?? ''} · ${songs}`
        : `Playlist${s.owner_name ? ` by ${s.owner_name}` : ''} · ${songs}`
  return { label: KIND[s.kind], line: line.replace(/ · $/, '') }
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Apps that drop preview images over about 300 KB; they get the plain cover instead of the card. */
const SMALL_PREVIEWS = /WhatsApp/i

/** The app's index.html with this share's title, description and preview image. */
export function shareHtml(index: string, s: Share, origin: string, userAgent = '') {
  const { line } = describe(s)
  const url = `${origin}/s/${s.code}`
  const cover = artAt(s.image ?? s.payload.track?.art ?? s.payload.tracks?.[0]?.art, 600)
  const image = SMALL_PREVIEWS.test(userAgent) && cover ? cover : `${origin}/api/og?code=${s.code}&v=${encodeURIComponent(s.updated_at)}`
  const square = image === cover
  const title = `${s.title}${s.kind === 'track' && s.subtitle ? ` · ${s.subtitle}` : ''}`
  const tags = [
    `<title>${esc(title)} | Spindle</title>`,
    `<meta name="description" content="${esc(`${line}. Listen on Spindle.`)}" />`,
    `<meta property="og:type" content="${s.kind === 'track' ? 'music.song' : s.kind === 'album' ? 'music.album' : 'music.playlist'}" />`,
    `<meta property="og:site_name" content="Spindle" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(`${line}. Listen on Spindle.`)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="${square ? 600 : 1200}" />`,
    `<meta property="og:image:height" content="${square ? 600 : 630}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    // The page renders the share at once instead of fetching it again.
    `<script>window.__SHARE__=${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ')
  return index
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/\s*<meta (name="description"|property="og:[^"]+"|name="twitter:[^"]+")[^>]*>/g, '')
    .replace('</head>', `    ${tags}\n  </head>`)
}

// ---------- Preview image ----------

export type Node = { type: string; props: Record<string, unknown> & { children?: unknown } }
/** A box for the image renderer. It needs flex on any box with several children, so that's the default. */
export const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) },
})
export const img = (src: string, style: Record<string, unknown>): Node => ({ type: 'img', props: { src, style } })

let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 500 | 700 | 800; style: 'normal' }[]> | null = null
const FONT = 'https://cdn.jsdelivr.net/npm/@fontsource'
export function loadFonts() {
  fonts ??= Promise.all(
    [
      ['Anybody', `${FONT}/anybody@5/files/anybody-latin-800-normal.woff`, 800],
      ['Geist', `${FONT}/geist-sans@5/files/geist-sans-latin-500-normal.woff`, 500],
      ['Geist', `${FONT}/geist-sans@5/files/geist-sans-latin-700-normal.woff`, 700],
      ['Mukta', `${FONT}/mukta@5/files/mukta-devanagari-700-normal.woff`, 700],
    ].map(async ([name, url, weight]) => ({
      name: name as string,
      data: await (await fetch(url as string)).arrayBuffer(),
      weight: weight as 500 | 700 | 800,
      style: 'normal' as const,
    })),
  ).catch((e) => {
    fonts = null
    throw e
  })
  return fonts
}

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

export function coverNode(s: Share, size: number, radius = 28): Node {
  const box = { width: size, height: size, borderRadius: radius, overflow: 'hidden', display: 'flex', flexWrap: 'wrap', boxShadow: '0 24px 36px rgba(0,0,0,0.45)', backgroundColor: '#1a1720' }
  const own = s.payload.cover || s.image
  if (own) return h('div', box, img(own.startsWith('data:') ? own : artAt(own, 600), { width: size, height: size, objectFit: 'cover' }))
  const arts = [...new Set((s.payload.tracks ?? []).map((t) => t.art).filter(Boolean))].slice(0, 4)
  if (arts.length >= 4) return h('div', box, ...arts.map((a) => img(artAt(a, 300), { width: size / 2, height: size / 2, objectFit: 'cover' })))
  if (arts[0]) return h('div', box, img(artAt(arts[0], 600), { width: size, height: size, objectFit: 'cover' }))
  return h('div', { ...box, alignItems: 'center', justifyContent: 'center', fontSize: 120, color: '#ff3b5c' }, '♪')
}

/** 1200×630 card: the cover, what it is, and the Spindle mark. */
export async function shareImage(s: Share, origin: string) {
  const { label, line } = describe(s)
  const title = clip(s.title, 60)
  const sub = s.kind === 'track' ? s.subtitle ?? '' : line.replace(/^(Playlist|Album) · /, '')
  const root = h(
    'div',
    {
      width: 1200,
      height: 630,
      display: 'flex',
      alignItems: 'center',
      padding: '0 80px',
      gap: 64,
      color: '#f4f4f5',
      fontFamily: 'Geist, Mukta',
      backgroundColor: '#07060b',
      backgroundImage: 'radial-gradient(circle at 0% 0%, rgba(255,59,92,0.45), rgba(7,6,11,0) 55%), radial-gradient(circle at 100% 100%, rgba(122,92,255,0.5), rgba(7,6,11,0) 55%)',
    },
    coverNode(s, 440),
    h(
      'div',
      { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 },
      h(
        'div',
        { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 34 },
        img(`${origin}/brand/spindle-icon-120.png`, { width: 54, height: 54 }),
        h('div', { fontFamily: 'Anybody', fontSize: 40, fontWeight: 800, letterSpacing: -1 }, 'spindle'),
      ),
      h('div', { fontSize: 24, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: '#ff5672', marginBottom: 14 }, label),
      h('div', { fontSize: title.length > 28 ? 58 : 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5, marginBottom: 18, display: 'flex' }, title),
      h('div', { fontSize: 32, fontWeight: 500, color: '#c9c6d2', display: 'flex' }, clip(sub, 48)),
      h(
        'div',
        { display: 'flex', marginTop: 40 },
        h('div', { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 28px', borderRadius: 999, backgroundColor: '#ff3b5c', fontSize: 26, fontWeight: 700 }, '▶  Listen on Spindle'),
      ),
    ),
  )
  return new ImageResponse(root as never, {
    width: 1200,
    height: 630,
    fonts: await loadFonts(),
    headers: { 'cache-control': 'public, max-age=86400, s-maxage=604800, immutable' },
  })
}
