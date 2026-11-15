// When Spindle runs inside the desktop app (desktop/), tell it what's playing
// (for Discord status and the tray), let its tray and media keys drive the
// player, and open outside links in the real browser.
import { create } from 'zustand'
import { toast } from '../components/Toast'
import { artUrl } from './format'
import { usePlayer } from '../store/player'

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

const tauri = (globalThis as { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__

/** True inside the desktop app. */
export const isDesktop = !!tauri

const call = (cmd: string, args?: Record<string, unknown>) => tauri?.invoke(cmd, args).catch(() => {})

/** True on a Mac, where the window keeps its own traffic-light buttons. */
export const isMac = /Mac OS/.test(navigator.userAgent)

export interface DesktopUpdate {
  version: string
  notes: string | null
}

/** Desktop window and update state, for the title bar and update banner. */
export const useDesktop = create<{ maximized: boolean; update: DesktopUpdate | null; installing: boolean }>(() => ({
  maximized: false,
  update: null,
  installing: false,
}))

/** Open a web link in the real browser. */
export async function openExternal(url: string) {
  if (!tauri) return void window.open(url, '_blank', 'noopener')
  await tauri.invoke('open_url', { url })
}

/** Window buttons for the custom title bar. */
export const win = {
  minimize: () => call('plugin:window|minimize', { label: 'main' }),
  toggleMaximize: () => call('plugin:window|toggle_maximize', { label: 'main' }),
  close: () => call('plugin:window|close', { label: 'main' }),
}

/** Download and install the waiting update; Spindle restarts when it's done. */
export async function installUpdate() {
  if (!tauri || useDesktop.getState().installing) return
  useDesktop.setState({ installing: true })
  try {
    await tauri.invoke('install_update')
  } catch (e) {
    useDesktop.setState({ installing: false })
    toast(`Couldn’t update: ${(e as Error)?.message ?? e}`)
  }
}

async function checkUpdate() {
  try {
    const found = (await tauri!.invoke('check_update')) as DesktopUpdate | null
    if (found) useDesktop.setState({ update: found })
  } catch {
    /* offline, or no release yet */
  }
}

export function startDesktop() {
  if (!tauri) return
  document.documentElement.classList.add('is-desktop', isMac ? 'is-mac' : 'is-win')

  // Keep the title bar's maximise button in step with the window.
  const syncMaximized = async () => {
    const max = await tauri.invoke('plugin:window|is_maximized', { label: 'main' }).catch(() => false)
    useDesktop.setState({ maximized: !!max })
  }
  addEventListener('resize', syncMaximized)
  void syncMaximized()

  // F11 fills the screen (the title bar steps aside); F11 or Esc comes back.
  const setFullscreen = async (value: boolean) => {
    await tauri.invoke('plugin:window|set_fullscreen', { label: 'main', value }).catch(() => toast('Update Spindle to use fullscreen'))
    const fs = !!(await tauri.invoke('plugin:window|is_fullscreen', { label: 'main' }).catch(() => false))
    document.documentElement.classList.toggle('is-fullscreen', fs)
  }
  addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault()
      void setFullscreen(!document.documentElement.classList.contains('is-fullscreen'))
    } else if (e.key === 'Escape' && document.documentElement.classList.contains('is-fullscreen') && !usePlayer.getState().fullOpen) {
      void setFullscreen(false)
    }
  })

  // Look for a new version of the app shortly after start, then every few hours.
  setTimeout(checkUpdate, 8000)
  setInterval(checkUpdate, 4 * 3600_000)

  // GitHub sign-in finishes in the browser, which sends the code back here.
  const auth = async (link: string) => {
    try {
      const { finishDesktopSignIn } = await import('./sync')
      await finishDesktopSignIn(link)
    } catch (e) {
      toast(`Sign-in didn’t finish: ${(e as Error)?.message ?? e}`)
    }
  }

  // The tray menu and media keys call these (desktop/src-tauri/src/main.rs).
  const p = () => usePlayer.getState()
  Object.assign(window, {
    spindleDesktop: {
      toggle: () => p().toggle(),
      pause: () => p().setPlaying(false),
      next: () => p().next(),
      prev: () => p().prev(),
      auth,
    },
  })
  const pending = (window as { __spindleAuth?: string }).__spindleAuth
  if (pending) {
    delete (window as { __spindleAuth?: string }).__spindleAuth
    void auth(pending)
  }

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
