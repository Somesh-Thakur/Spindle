// Story cards drawn in the browser: a 1080×1920 canvas for Instagram, WhatsApp
// and Snapchat stories. Drawing here (not on a server) makes the preview
// instant, can't time out, and uses the browser's fonts, so titles and lyrics
// in any language (Hindi, Tamil, Japanese…) render properly.
import { nextMirror } from '../api/audius'
import { artUrl } from './format'

export type StoryStyle = 'cover' | 'vinyl' | 'lyrics'

export interface StoryCard {
  style: StoryStyle
  /** Main and secondary colour. */
  c1: string
  c2: string
  title: string
  /** Line under the title: the artist, "Album · Artist" or "Playlist by …". */
  subtitle: string
  /** Artwork: one cover, or up to four for a playlist mosaic. Data URLs work too. */
  arts: string[]
  lines: string[]
}

export const STORY_W = 1080
export const STORY_H = 1920

// ---------- Artwork ----------

/** Same fallbacks as <Artwork>: other sizes, other hosts, Audius mirrors. */
function candidates(art: string): string[] {
  if (art.startsWith('data:')) return [art]
  const first = artUrl(art, 600)
  const list = [first]
  if (first.includes('/hq720.jpg')) list.push(first.replace('/hq720.jpg', '/hqdefault.jpg'))
  if (first.startsWith('https://yt3.googleusercontent.com/')) list.push(first.replace('//yt3.', '//lh3.'))
  let mirror = nextMirror(art)
  for (let i = 0; mirror && i < 4; i++) {
    list.push(artUrl(mirror, 600))
    mirror = nextMirror(mirror)
  }
  return [...new Set(list.map((u) => u.split('#')[0]))]
}

function loadOne(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Needed to save the canvas afterwards; every artwork host we use allows it.
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => reject(new Error('slow')), 8000)
    img.onload = () => {
      clearTimeout(timer)
      // An image the browser won't let us read would make the card impossible to save.
      try {
        const probe = document.createElement('canvas')
        probe.width = probe.height = 1
        const c = probe.getContext('2d')!
        c.drawImage(img, 0, 0, 1, 1)
        c.getImageData(0, 0, 1, 1)
        resolve(img)
      } catch {
        reject(new Error('not readable'))
      }
    }
    img.onerror = () => (clearTimeout(timer), reject(new Error('failed')))
    img.src = src
  })
}

const images = new Map<string, Promise<HTMLImageElement | null>>()

/** The artwork as a loaded image, trying fallbacks; null if none of them load. */
export function loadArt(art: string | undefined): Promise<HTMLImageElement | null> {
  if (!art) return Promise.resolve(null)
  let p = images.get(art)
  if (!p) {
    p = (async () => {
      for (const src of candidates(art)) {
        try {
          return await loadOne(src)
        } catch {
          /* try the next one */
        }
      }
      return null
    })()
    images.set(art, p)
  }
  return p
}

let brandIcon: Promise<HTMLImageElement | null> | null = null
const loadBrand = () => (brandIcon ??= loadOne('/brand/spindle-icon-120.png').catch(() => null))

/** Make sure the page's fonts are ready before measuring text. */
async function fontsReady() {
  await Promise.all(
    ['800 40px Anybody', '700 76px Geist', '500 42px Geist', '700 76px Mukta'].map((f) => document.fonts.load(f).catch(() => null)),
  )
}

// ---------- Drawing helpers ----------

const SANS = 'Geist, Mukta, system-ui, -apple-system, "Segoe UI", "Noto Sans", sans-serif'

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const shade = (hex: string, amount: number) => {
  const [r, g, b] = rgb(hex).map((v) => Math.round(v * (1 - amount)))
  return `rgb(${r}, ${g}, ${b})`
}
const alpha = (hex: string, a: number) => {
  const [r, g, b] = rgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Draw an image cropped to fill a box, like object-fit: cover. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const sw = w / s
  const sh = h / s
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h)
}

/** The artwork in a rounded square: one cover, a 2×2 mosaic, or a placeholder. */
function drawArt(ctx: CanvasRenderingContext2D, imgs: (HTMLImageElement | null)[], x: number, y: number, size: number, r: number, shadow = true) {
  ctx.save()
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = size * 0.08
    ctx.shadowOffsetY = size * 0.04
  }
  roundRect(ctx, x, y, size, size, r)
  ctx.fillStyle = '#1a1720'
  ctx.fill()
  ctx.restore()

  ctx.save()
  roundRect(ctx, x, y, size, size, r)
  ctx.clip()
  const ok = imgs.filter(Boolean) as HTMLImageElement[]
  if (ok.length >= 4) {
    const half = size / 2
    ok.slice(0, 4).forEach((img, i) => drawCover(ctx, img, x + (i % 2) * half, y + Math.floor(i / 2) * half, half, half))
  } else if (ok[0]) {
    drawCover(ctx, ok[0], x, y, size, size)
  } else {
    const g = ctx.createLinearGradient(x, y, x + size, y + size)
    g.addColorStop(0, '#ff3b5c')
    g.addColorStop(1, '#7a5cff')
    ctx.fillStyle = g
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `700 ${size * 0.4}px ${SANS}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', x + size / 2, y + size / 2)
  }
  ctx.restore()
}

/**
 * Break text into lines that fit, ending the last one with "…" if needed.
 * Words longer than a line (and languages without spaces) break by character.
 */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let line = ''
  const push = (l: string) => lines.push(l)
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word
    if (ctx.measureText(tryLine).width <= maxWidth) {
      line = tryLine
      continue
    }
    if (line) push(line)
    if (ctx.measureText(word).width <= maxWidth) {
      line = word
      continue
    }
    // A single word too wide for a line: split it by character.
    line = ''
    for (const ch of [...word]) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        push(line)
        line = ch
      } else line += ch
    }
  }
  if (line) push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = [...last].slice(0, -1).join('')
  kept[maxLines - 1] = `${last.trimEnd()}…`
  return kept
}

function fillLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number) {
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight))
  return y + lines.length * lineHeight
}

/** Title and subtitle centred under the art; returns where it ended. */
function titleBlock(ctx: CanvasRenderingContext2D, card: StoryCard, ink: string, y: number) {
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  let size = 76
  ctx.font = `700 ${size}px ${SANS}`
  if (ctx.measureText(card.title).width > 900) {
    size = 64
    ctx.font = `700 ${size}px ${SANS}`
  }
  const end = fillLines(ctx, wrap(ctx, card.title, 920, 2), STORY_W / 2, y, size * 1.12)
  ctx.globalAlpha = 0.78
  ctx.font = `500 42px ${SANS}`
  fillLines(ctx, wrap(ctx, card.subtitle, 900, 1), STORY_W / 2, end + 14, 50)
  ctx.globalAlpha = 1
}

/** The "spindle · Listen on Spindle" badge. */
function brand(ctx: CanvasRenderingContext2D, icon: HTMLImageElement | null, ink: string, cy: number) {
  ctx.font = `800 40px Anybody, ${SANS}`
  const nameW = ctx.measureText('spindle').width
  ctx.font = `500 24px ${SANS}`
  const subW = ctx.measureText('Listen on Spindle').width
  const w = 22 + 60 + 18 + Math.max(nameW, subW) + 34
  const h = 96
  const x = (STORY_W - w) / 2
  const y = cy - h / 2
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 2
  ctx.stroke()
  if (icon) {
    ctx.save()
    roundRect(ctx, x + 22, cy - 30, 60, 60, 16)
    ctx.clip()
    ctx.drawImage(icon, x + 22, cy - 30, 60, 60)
    ctx.restore()
  }
  ctx.fillStyle = ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `800 40px Anybody, ${SANS}`
  ctx.fillText('spindle', x + 100, cy + 4)
  ctx.globalAlpha = 0.75
  ctx.font = `500 24px ${SANS}`
  ctx.fillText('Listen on Spindle', x + 100, cy + 34)
  ctx.globalAlpha = 1
}

function background(ctx: CanvasRenderingContext2D, c1: string, c2: string) {
  const g = ctx.createLinearGradient(0, 0, STORY_W * 0.35, STORY_H)
  g.addColorStop(0, c1)
  g.addColorStop(0.55, shade(c1, 0.35))
  g.addColorStop(1, shade(c1, 0.75))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, STORY_W, STORY_H)
  const glow = ctx.createRadialGradient(STORY_W * 0.2, STORY_H * 0.1, 0, STORY_W * 0.2, STORY_H * 0.1, STORY_W * 1.1)
  glow.addColorStop(0, alpha(c2, 0.95))
  glow.addColorStop(1, alpha(c2, 0))
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, STORY_W, STORY_H)
}

/** Black vinyl with grooves, a light streak, and the cover on the centre label. */
function record(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, cy: number, size: number) {
  const r = size / 2
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 50
  ctx.shadowOffsetY = 26
  const disc = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  disc.addColorStop(0, '#2a2730')
  disc.addColorStop(0.6, '#121016')
  disc.addColorStop(1, '#050407')
  ctx.fillStyle = disc
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  for (const k of [0.92, 0.84, 0.76, 0.68, 0.6, 0.52]) {
    ctx.strokeStyle = `rgba(255,255,255,${k > 0.7 ? 0.07 : 0.05})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, r * k, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 14
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.8, Math.PI * 1.1, Math.PI * 1.35)
  ctx.stroke()
  const label = r * 0.38
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, label, 0, Math.PI * 2)
  ctx.clip()
  if (img) drawCover(ctx, img, cx - label, cy - label, label * 2, label * 2)
  else {
    ctx.fillStyle = '#ff3b5c'
    ctx.fill()
  }
  ctx.restore()
  ctx.fillStyle = '#f6f3ec'
  ctx.beginPath()
  ctx.arc(cx, cy, 13, 0, Math.PI * 2)
  ctx.fill()
}

// ---------- The card ----------

/** Draw the whole card onto a 1080×1920 canvas. */
export async function drawStory(canvas: HTMLCanvasElement, card: StoryCard) {
  const [imgs, icon] = await Promise.all([Promise.all(card.arts.slice(0, 4).map(loadArt)), loadBrand(), fontsReady()])
  canvas.width = STORY_W
  canvas.height = STORY_H
  const ctx = canvas.getContext('2d')!
  const ink = luminance(card.c1) > 0.45 ? '#141218' : '#ffffff'
  background(ctx, card.c1, card.c2)

  if (card.style === 'lyrics' && card.lines.length) {
    // Measure the lyric lines first so the card fits them.
    const lyricSize = card.lines.join(' ').length > 160 ? 56 : 66
    ctx.font = `700 ${lyricSize}px ${SANS}`
    const wrapped = card.lines.flatMap((l) => wrap(ctx, l, 800, 3))
    const cardH = 56 + 120 + 48 + wrapped.length * lyricSize * 1.22 + card.lines.length * 14 + 50
    const x = 80
    const y = Math.max(140, (STORY_H - cardH - 180) / 2)
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = 60
    ctx.shadowOffsetY = 26
    roundRect(ctx, x, y, 920, cardH, 48)
    const g = ctx.createLinearGradient(x, y, x + 920, y + cardH)
    g.addColorStop(0, card.c2)
    g.addColorStop(1, shade(card.c2, 0.45))
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()
    drawArt(ctx, imgs, x + 60, y + 56, 120, 16, false)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = `700 40px ${SANS}`
    fillLines(ctx, wrap(ctx, card.title, 600, 1), x + 210, y + 70, 48)
    ctx.globalAlpha = 0.8
    ctx.font = `500 30px ${SANS}`
    fillLines(ctx, wrap(ctx, card.subtitle, 600, 1), x + 210, y + 122, 36)
    ctx.globalAlpha = 1
    ctx.font = `700 ${lyricSize}px ${SANS}`
    let ly = y + 56 + 120 + 48
    for (const l of card.lines) {
      ly = fillLines(ctx, wrap(ctx, l, 800, 3), x + 60, ly, lyricSize * 1.22) + 14
    }
    brand(ctx, icon, ink, y + cardH + 110)
  } else if (card.style === 'vinyl') {
    record(ctx, imgs.find(Boolean) ?? null, 400 + 350, 210 + 350, 700)
    ctx.save()
    ctx.translate(60 + 320, 240 + 320)
    ctx.rotate((-4 * Math.PI) / 180)
    drawArt(ctx, imgs, -320, -320, 640, 18)
    ctx.restore()
    titleBlock(ctx, card, ink, 1050)
    brand(ctx, icon, ink, STORY_H - 168)
  } else {
    drawArt(ctx, imgs, 130, 220, 820, 40)
    titleBlock(ctx, card, ink, 1140)
    brand(ctx, icon, ink, STORY_H - 168)
  }
}

export function storyBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/png'))
}
