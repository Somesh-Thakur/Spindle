// Autoplay: when the queue reaches its last song, add similar music to the end
// so it never stops, like Spotify's Autoplay and YouTube Music's radio. The
// songs are fetched while the last one plays, so the change is seamless.
import { usePlayer } from '../store/player'
import { recommend } from './recommend'

const BATCH = 10

let running = false
let busyFor = -1

export function startAutoplay() {
  if (running) return
  running = true
  usePlayer.subscribe((s) => {
    if (!s.autoplay || s.repeat !== 'off' || !s.queue.length) return
    // Only on the last song, once per queue length (so a failed lookup doesn't loop).
    if (s.pos < s.order.length - 1 || busyFor === s.order.length) return
    busyFor = s.order.length
    // Seeds: the end of what's been playing, plus a little of what you like.
    const played = s.order.slice(Math.max(0, s.pos - 14), s.pos + 1).map((i) => s.queue[i]).filter(Boolean)
    const seed = [...played, ...Object.values(s.liked).slice(-6)]
    const avoid = [...s.queue, ...s.recent.slice(0, 50)]
    recommend(seed, avoid, s.country)
      .then((songs) => {
        // Mix artists rather than playing one artist's whole catalogue in a row.
        const picked = songs.sort(() => Math.random() - 0.5).slice(0, BATCH)
        if (picked.length) usePlayer.getState().extendQueue(picked, true)
      })
      .catch(() => {})
  })
}
