// The pop-out mini player (remote.html). It shows what the main Spindle window
// is playing and sends button presses back over a BroadcastChannel (lib/remote.ts).
import '@fontsource-variable/geist/wght.css'
import './styles/remote.css'
import type { RemoteCommand, RemoteState } from './lib/remote'

const CHANNEL = 'spindle-remote'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
const tauri = (globalThis as { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__

const icon = (d: string, fill = false) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${d}</svg>`
const ICONS = {
  play: icon('<path d="M7 4.5v15l12.5-7.5z"/>', true),
  pause: icon('<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>', true),
  prev: icon('<path d="M18 5v14l-10-7z"/><rect x="5" y="5" width="2.6" height="14" rx="1"/>', true),
  next: icon('<path d="M6 5v14l10-7z"/><rect x="16.4" y="5" width="2.6" height="14" rx="1"/>', true),
  heart: icon('<path d="M19.5 12.6 12 20l-7.5-7.4A4.9 4.9 0 0 1 12 6.1a4.9 4.9 0 0 1 7.5 6.5z"/>'),
  heartOn: icon('<path d="M19.5 12.6 12 20l-7.5-7.4A4.9 4.9 0 0 1 12 6.1a4.9 4.9 0 0 1 7.5 6.5z"/>', true),
  pin: icon('<path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>'),
  open: icon('<path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
}

const ch = new BroadcastChannel(CHANNEL)
const send = (cmd: RemoteCommand) => ch.postMessage({ cmd })
let state: RemoteState | null = null

$('prev').innerHTML = ICONS.prev
$('next').innerHTML = ICONS.next
$('open').innerHTML = ICONS.open
$('close').innerHTML = ICONS.close
$('pin').innerHTML = ICONS.pin

function render() {
  const s = state
  document.body.classList.toggle('is-empty', !s)
  $('title').textContent = s?.title ?? 'Nothing playing'
  $('artist').textContent = s?.artist ?? 'Play something in Spindle'
  const art = $<HTMLImageElement>('art')
  if (s?.art && art.src !== s.art) art.src = s.art
  art.hidden = !s?.art
  $('bg').style.backgroundImage = s?.art ? `url("${s.art}")` : ''
  $('play').innerHTML = s?.playing ? ICONS.pause : ICONS.play
  $('play').setAttribute('aria-label', s?.playing ? 'Pause' : 'Play')
  $('like').innerHTML = s?.liked ? ICONS.heartOn : ICONS.heart
  $('like').classList.toggle('is-on', !!s?.liked)
  document.title = s ? `${s.title} · ${s.artist}` : 'Spindle mini player'
  progress()
}

/** The bar moves on its own between updates while playing. */
function progress() {
  const s = state
  if (!s || !s.duration) return void ($('fill').style.width = '0')
  const t = s.playing ? s.time + (Date.now() - s.at) / 1000 : s.time
  $('fill').style.width = `${Math.min(100, (t / s.duration) * 100)}%`
}
setInterval(progress, 500)

ch.onmessage = ({ data }: MessageEvent<{ state?: RemoteState | null }>) => {
  if (data && 'state' in data) {
    state = data.state ?? null
    render()
  }
}
send('hello')
render()

$('play').onclick = () => send('toggle')
$('next').onclick = () => send('next')
$('prev').onclick = () => send('prev')
$('like').onclick = () => send('like')
$('bar').onclick = (e) => {
  if (!state?.duration) return
  const r = $('bar').getBoundingClientRect()
  send({ seek: ((e.clientX - r.left) / r.width) * state.duration })
}

// Window buttons: a real window in the desktop app, Picture-in-Picture in the browser.
if (tauri) {
  let pinned = true
  const pin = $('pin')
  pin.hidden = false
  pin.classList.add('is-on')
  pin.onclick = async () => {
    pinned = !pinned
    await tauri.invoke('plugin:window|set_always_on_top', { label: 'mini', value: pinned }).catch(() => {})
    pin.classList.toggle('is-on', pinned)
    pin.title = pinned ? 'Unpin from top' : 'Keep on top'
    pin.setAttribute('aria-label', pin.title)
  }
  $('open').onclick = () => tauri.invoke('show_main').catch(() => {})
  $('close').onclick = () => tauri.invoke('plugin:window|close', { label: 'mini' }).catch(() => {})
} else {
  $('open').onclick = () => send('focus')
  // Inside the Picture-in-Picture window, this page is an iframe: close that window.
  $('close').onclick = () => (window.top ?? window).close()
}
