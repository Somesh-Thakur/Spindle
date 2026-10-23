import type { Track } from './types'

export function fmtTime(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function artUrl(art: string | undefined, size: number) {
  if (!art) return ''
  if (art.includes('{s}')) return art.replaceAll('{s}', String(size))
  // Audius only serves three fixed sizes.
  const [base, hash] = art.split('#')
  if (base.endsWith('/480x480.jpg')) {
    const s = size <= 150 ? 150 : size <= 480 ? 480 : 1000
    return base.replace('/480x480.jpg', `/${s}x${s}.jpg`) + (hash ? `#${hash}` : '')
  }
  return art
}

export function trackArt(t: Pick<Track, 'art'>, size: number) {
  return artUrl(t.art, size)
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Late night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function year(date?: string) {
  return date ? date.slice(0, 4) : ''
}
