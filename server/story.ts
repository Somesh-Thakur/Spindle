// Story cards: a 1080×1920 image of a shared song, album or playlist for
// Instagram, WhatsApp or Snapchat stories, like Spotify's "Share to Story".
// Three looks: the cover on its own colours, a record sliding out of its
// sleeve, and a lyrics card. Used by api/story.ts and the Vite dev server.
import { ImageResponse } from '@vercel/og'
import { artAt, clip, coverNode, h, img, loadFonts, type Node, type Share } from './share.js'

export type StoryStyle = 'cover' | 'vinyl' | 'lyrics'

export interface StoryOptions {
  style: StoryStyle
  /** Main and secondary colour, from the artwork (the browser picks them). */
  c1: string
  c2: string
  /** Lyric lines for the lyrics card. */
  lines: string[]
}

const W = 1080
const H = 1920
const HEX = /^#?[0-9a-f]{6}$/i

/** Reads ?style=&c1=&c2=&lines= safely; anything odd falls back to defaults. */
export function storyOptions(q: URLSearchParams): StoryOptions {
  const style = (['cover', 'vinyl', 'lyrics'] as const).find((s) => s === q.get('style')) ?? 'cover'
  const color = (v: string | null, fallback: string) => (v && HEX.test(v) ? `#${v.replace('#', '')}` : fallback)
  const lines = (q.get('lines') ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((l) => clip(l, 90))
  return { style, c1: color(q.get('c1'), '#5b1a2e'), c2: color(q.get('c2'), '#ff3b5c'), lines }
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Darken a colour toward black by `amount` (0–1). */
function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.round(v * (1 - amount))
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`
}

function brand(origin: string, ink: string) {
  return h(
    'div',
    { display: 'flex', alignItems: 'center', gap: 18, padding: '18px 34px 18px 22px', borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.28)', border: '2px solid rgba(255,255,255,0.14)' },
    img(`${origin}/brand/spindle-icon-120.png`, { width: 60, height: 60, borderRadius: 16 }),
    h('div', { display: 'flex', flexDirection: 'column' }, h('div', { fontFamily: 'Anybody', fontSize: 40, fontWeight: 800, color: ink, letterSpacing: -1, lineHeight: 1 }, 'spindle'), h('div', { fontSize: 24, fontWeight: 500, color: ink, opacity: 0.75, marginTop: 6 }, 'Listen on Spindle')),
  )
}

function titleBlock(s: Share, ink: string, size = 76) {
  const sub = s.kind === 'track' ? s.subtitle ?? '' : s.kind === 'album' ? `Album · ${s.subtitle ?? ''}` : `Playlist${s.owner_name ? ` by ${s.owner_name}` : ''}`
  const title = clip(s.title, 52)
  return h(
    'div',
    { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: 900 },
    h('div', { display: 'flex', fontSize: title.length > 26 ? size - 14 : size, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5, color: ink, justifyContent: 'center' }, title),
    h('div', { display: 'flex', fontSize: 42, fontWeight: 500, color: ink, opacity: 0.78, marginTop: 18, justifyContent: 'center' }, clip(sub, 44)),
  )
}

/** The record: black vinyl with grooves and the cover printed on the centre label. */
function record(s: Share, size: number): Node {
  const art = s.payload.cover || s.image || s.payload.track?.art || s.payload.tracks?.[0]?.art || ''
  const label = size * 0.38
  const rings = [0.92, 0.84, 0.76, 0.68, 0.6, 0.52]
  return h(
    'div',
    {
      position: 'relative',
      width: size,
      height: size,
      borderRadius: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundImage: 'radial-gradient(circle, #2a2730 0%, #121016 60%, #050407 100%)',
      boxShadow: '0 26px 36px rgba(0,0,0,0.55)',
    },
    ...rings.map((r) =>
      h('div', { position: 'absolute', left: (size * (1 - r)) / 2, top: (size * (1 - r)) / 2, width: size * r, height: size * r, borderRadius: size, border: `2px solid rgba(255,255,255,${r > 0.7 ? 0.07 : 0.05})` }),
    ),
    h('div', { position: 'absolute', top: size * 0.08, left: size * 0.2, width: size * 0.3, height: size * 0.06, borderRadius: size, backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.18), rgba(255,255,255,0))', transform: 'rotate(-28deg)' }),
    art
      ? img(art.startsWith('data:') ? art : artAt(art, 600), { width: label, height: label, borderRadius: label, objectFit: 'cover', border: '6px solid rgba(0,0,0,0.35)' })
      : h('div', { width: label, height: label, borderRadius: label, backgroundColor: '#ff3b5c' }),
    h('div', { position: 'absolute', left: size / 2 - 13, top: size / 2 - 13, width: 26, height: 26, borderRadius: 26, backgroundColor: '#f6f3ec' }),
  )
}

// Covers are downloaded once and kept, so trying different looks doesn't refetch them.
const inlined = new Map<string, Promise<string>>()
function inline(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) return Promise.resolve(url)
  let p = inlined.get(url)
  if (!p) {
    p = fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        const type = r.headers.get('content-type') || 'image/jpeg'
        return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`
      })
      .catch(() => {
        inlined.delete(url)
        return url
      })
    if (inlined.size > 60) inlined.delete(inlined.keys().next().value!)
    inlined.set(url, p)
  }
  return p
}

/** The share with its artwork swapped for cached copies. */
async function withArt(s: Share): Promise<Share> {
  const one = async (a?: string | null) => (a ? inline(artAt(a, 600)) : a)
  const tracks = s.payload.tracks ? await Promise.all(s.payload.tracks.slice(0, 4).map(async (t) => ({ ...t, art: (await one(t.art)) ?? '' }))) : undefined
  return {
    ...s,
    image: (await one(s.image)) ?? null,
    payload: {
      ...s.payload,
      ...(s.payload.track ? { track: { ...s.payload.track, art: (await one(s.payload.track.art)) ?? '' } } : {}),
      ...(tracks ? { tracks } : {}),
    },
  }
}

export async function storyImage(share: Share, origin: string, o: StoryOptions) {
  const s = await withArt(share)
  const light = luminance(o.c1) > 0.45
  const ink = light ? '#141218' : '#ffffff'
  const base = {
    width: W,
    height: H,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: 'Geist, Mukta',
    color: ink,
    backgroundColor: shade(o.c1, 0.55),
    backgroundImage: `radial-gradient(circle at 20% 10%, ${o.c2}, rgba(0,0,0,0) 55%), linear-gradient(170deg, ${o.c1} 0%, ${shade(o.c1, 0.35)} 55%, ${shade(o.c1, 0.75)} 100%)`,
  }

  let root: Node
  if (o.style === 'vinyl') {
    // The sleeve on the left, the record sliding out to the right with the cover on its label.
    root = h(
      'div',
      { ...base, padding: '200px 0 120px' },
      h(
        'div',
        { position: 'relative', width: W, height: 720 },
        h('div', { position: 'absolute', left: 400, top: 10 }, record(s, 700)),
        h('div', { position: 'absolute', left: 60, top: 40, transform: 'rotate(-4deg)' }, coverNode(s, 640, 18)),
      ),
      h('div', { marginTop: 110 }, titleBlock(s, ink)),
      h('div', { flex: 1 }),
      brand(origin, ink),
    )
  } else if (o.style === 'lyrics' && o.lines.length) {
    const cardInk = '#ffffff'
    root = h(
      'div',
      { ...base, justifyContent: 'center', gap: 60 },
      h(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          width: 920,
          padding: '56px 60px 64px',
          borderRadius: 48,
          backgroundColor: shade(o.c2, 0.15),
          backgroundImage: `linear-gradient(160deg, ${o.c2}, ${shade(o.c2, 0.45)})`,
          boxShadow: '0 26px 40px rgba(0,0,0,0.4)',
        },
        h(
          'div',
          { display: 'flex', alignItems: 'center', gap: 28, marginBottom: 48 },
          coverNode(s, 120, 16),
          h('div', { display: 'flex', flexDirection: 'column', flex: 1 }, h('div', { display: 'flex', fontSize: 40, fontWeight: 700, color: cardInk }, clip(s.title, 30)), h('div', { display: 'flex', fontSize: 30, fontWeight: 500, color: cardInk, opacity: 0.8, marginTop: 6 }, clip(s.subtitle ?? '', 36))),
        ),
        ...o.lines.map((l) => h('div', { display: 'flex', fontSize: o.lines.join(' ').length > 160 ? 56 : 66, fontWeight: 700, lineHeight: 1.22, color: cardInk, marginBottom: 14 }, l)),
      ),
      brand(origin, ink),
    )
  } else {
    root = h(
      'div',
      { ...base, padding: '220px 0 120px' },
      coverNode(s, 820, 40),
      h('div', { marginTop: 100 }, titleBlock(s, ink)),
      h('div', { flex: 1 }),
      brand(origin, ink),
    )
  }

  return new ImageResponse(root as never, {
    width: W,
    height: H,
    fonts: await loadFonts(),
    headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400' },
  })
}
