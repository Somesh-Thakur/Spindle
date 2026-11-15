// Finds songs before they're needed, so pressing play or skipping starts right
// away. The answers land in the lookup cache (findVideos), one at a time and in
// the background, so they never compete with the song that's playing.
import { findInstrumentals, findVideos } from '../api/youtube'
import { usePlayer } from '../store/player'
import type { Track } from './types'

const AHEAD = 3
const done = new Set<string>()
let queue: Track[] = []
let running = false

const karaokeOn = () => usePlayer.getState().karaoke && usePlayer.getState().vocals < 0.5
const needsVideo = (t: Track) => !t.videoId && !usePlayer.getState().ytMatches[t.id]
// Done is per mode, so turning karaoke on later still fetches karaoke versions.
const doneKey = (t: Track) => `${t.id}${karaokeOn() ? ':k' : ''}`
const needsLookup = (t: Track) => t.source !== 'audius' && !done.has(doneKey(t)) && (karaokeOn() || needsVideo(t))

async function drain() {
  if (running) return
  running = true
  while (queue.length) {
    const t = queue.shift()!
    if (!needsLookup(t)) continue
    done.add(doneKey(t))
    if (needsVideo(t)) await findVideos(t)
    // In karaoke with vocals off, get the karaoke version ready too.
    if (karaokeOn()) await findInstrumentals(t)
    // A short breather between lookups keeps the lookup services happy.
    await new Promise((r) => setTimeout(r, 400))
  }
  running = false
}

/** Look these songs up in the background, ahead of anything already waiting. */
export function prefetch(tracks: Track[]) {
  if (!navigator.onLine) return
  const fresh = tracks.filter(needsLookup)
  if (!fresh.length) return
  queue = [...fresh, ...queue.filter((t) => !fresh.includes(t))].slice(0, 20)
  void drain()
}

/** While a song plays, get the next few in the queue ready. */
export function startPrefetch() {
  let last = ''
  usePlayer.subscribe((s) => {
    const t = s.current()
    // A new song, or karaoke switched on: get the next few ready.
    const key = t ? doneKey(t) : ''
    if (!t || key === last) return
    last = key
    const next = s.order.slice(s.pos + 1, s.pos + 1 + AHEAD).map((i) => s.queue[i]).filter(Boolean)
    // Wait a moment, so the song that just started gets the network first.
    setTimeout(() => prefetch(next), 2500)
  })
}
