import { DEFAULT_PALETTE, type Palette } from '../store/player'

type RGB = [number, number, number]

const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const lum = ([r, g, b]: RGB) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

function sat([r, g, b]: RGB) {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  return mx === 0 ? 0 : (mx - mn) / mx
}

/** Push a colour toward a target lightness while keeping its hue. */
function tone(c: RGB, target: number): RGB {
  const l = Math.max(lum(c), 0.01)
  const k = target / l
  return c.map((v) => Math.min(255, v * k)) as RGB
}

/** Force a colour into a vivid, readable range in HSL so it works as a UI accent. */
function vivid([r, g, b]: RGB, minS: number, l: number): RGB {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  let h = 0
  const d = mx - mn
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l0 = (mx + mn) / 2
  const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1))
  // Near-greys have no meaningful hue; keep them neutral instead of tinting.
  const s = s0 < 0.08 ? 0 : Math.max(minS, s0)
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [(rr + m) * 255, (gg + m) * 255, (bb + m) * 255]
}

const memo = new Map<string, Palette>()

/** Pull a three-colour palette out of an artwork image. */
export async function extractPalette(url: string): Promise<Palette> {
  if (!url) return DEFAULT_PALETTE
  const hit = memo.get(url)
  if (hit) return hit
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  try {
    await img.decode()
  } catch {
    return DEFAULT_PALETTE
  }
  const S = 48
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0, S, S)
  let data: Uint8ClampedArray
  try {
    data = g.getImageData(0, 0, S, S).data
  } catch {
    return DEFAULT_PALETTE
  }

  // Bucket into a 4-bit-per-channel histogram.
  const buckets = new Map<number, { n: number; sum: RGB }>()
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], gg = data[i + 1], b = data[i + 2]
    const key = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4)
    const e = buckets.get(key) ?? { n: 0, sum: [0, 0, 0] as RGB }
    e.n++
    e.sum[0] += r
    e.sum[1] += gg
    e.sum[2] += b
    buckets.set(key, e)
  }
  const colors = [...buckets.values()]
    .map((e) => ({ n: e.n, c: e.sum.map((v) => v / e.n) as RGB }))
    .sort((a, b) => b.n - a.n)

  const dominant = colors[0].c
  // Accent: most "colourful" frequent colour, weighted by population.
  const accent =
    [...colors.slice(0, 40)]
      .filter((x) => lum(x.c) > 0.15 && lum(x.c) < 0.92)
      .sort((a, b) => sat(b.c) * Math.sqrt(b.n) - sat(a.c) * Math.sqrt(a.n))[0]?.c ?? dominant
  // Glow: a frequent colour far from the accent in RGB space.
  const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  const glow = colors.slice(0, 30).find((x) => dist(x.c, accent) > 90 && dist(x.c, dominant) > 40)?.c ?? accent

  const p: Palette = {
    base: hex(tone(dominant, 0.13)),
    accent: hex(vivid(accent, 0.62, 0.6)),
    glow: hex(vivid(glow, 0.45, 0.42)),
    light: lum(dominant),
  }
  memo.set(url, p)
  return p
}
