// When Spindle runs inside the desktop app (desktop/), tell it what's playing
// (for Discord status and the tray), let its tray and media keys drive the
// player, and open outside links in the real browser.
import { artUrl } from './format'
import { usePlayer } from '../store/player'

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

const tauri = (globalThis as { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__

/** True inside the desktop app. */
export const isDesktop = !!tauri

const call = (cmd: string, args?: Record<string, unknown>) => tauri?.invoke(cmd, args).catch(() => {})

export function startDesktop() {
  if (!tauri) return
  document.documentElement.classList.add('is-desktop')

  // The tray menu and media keys call these (desktop/src-tauri/src/main.rs).
  const p = () => usePlayer.getState()
  Object.assign(window, {
    spindleDesktop: {
      toggle: () => p().toggle(),
      pause: () => p().setPlaying(false),
      next: () => p().next(),
      prev: () => p().prev(),
    },
  })

  // Report the song, play state and position; again after a seek, since Discord shows a progress bar.
  let last = ''
  let sentAt = 0
  let sentPos = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const report = () => {
    const s = p()
    const t = s.current()
    const duration = s.duration || t?.duration || 0
    const key = t ? `${t.id}|${s.isPlaying}|${Math.round(duration)}` : ''
    // Between reports the position moves with the clock; a jump means a seek.
    const drift = s.isPlaying ? Math.abs(s.currentTime - (sentPos + (Date.now() - sentAt) / 1000)) : 0
    if (key === last && drift < 3) return
    last = key
    sentAt = Date.now()
    sentPos = s.currentTime
    call('now_playing', {
      track: t
        ? {
            title: t.title,
            artist: t.artist,
            album: t.album ?? null,
            art: artUrl(t.art, 512).split('#')[0] || null,
            position: s.currentTime,
            duration,
            playing: s.isPlaying,
          }
        : null,
    })
  }
  // At most a few reports a second: the position changes many times a second while playing.
  usePlayer.subscribe(() => {
    timer ??= setTimeout(() => {
      timer = undefined
      report()
    }, 400)
  })

  // Outside links open in the browser instead of replacing Spindle in its own window.
  const external = (href: string) => {
    try {
      const url = new URL(href, location.href)
      return url.origin !== location.origin && /^(https?|mailto):$/.test(url.protocol) ? url.href : null
    } catch {
      return null
    }
  }
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.hasAttribute('download')) return
      const url = external(a.href)
      if (!url && a.target !== '_blank') return
      e.preventDefault()
      call('open_url', { url: url ?? a.href })
    },
    true,
  )
  const open = window.open.bind(window)
  window.open = (href?: string | URL, target?: string, features?: string) => {
    const url = href ? external(String(href)) : null
    if (url) {
      call('open_url', { url })
      return null
    }
    return open(href, target, features)
  }
}
