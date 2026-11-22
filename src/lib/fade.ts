// Sound fading between songs: each song fades out over its last few seconds
// and the next one fades in, so changes are smooth instead of abrupt. The
// length comes from Settings → Playback (0 is off). The fade multiplies the
// listener's own volume, for both players (YouTube and direct audio).
import { audio } from './audio'
import { currentTime, getMode, totalTime } from './engine'
import { yt } from './yt'
import { usePlayer } from '../store/player'

let gain = 1
/** Seconds before the reported end that the fade reaches silence and the next song starts. */
const END_EARLY = 0.6
/** The song already moved on early, so it isn't done twice. */
let advancedFrom = ''
/** Right after a song change, until the new song is actually playing from its start. */
let startingUntil = 0

/** Push the listener's volume, times the current fade, to whichever player is in use. */
export function applyVolume() {
  const s = usePlayer.getState()
  const v = s.volume * s.volume * gain // perceptual curve
  audio.volume = Math.min(1, Math.max(0, v))
  const p = yt.get()
  if (p?.setVolume) p.setVolume(Math.round(v * 100))
}

/** 0–1: how loud this moment of the song should be. */
function target(): number {
  const s = usePlayer.getState()
  const secs = s.fade
  if (!secs || !s.isPlaying || getMode() === 'none') return 1
  const t = currentTime()
  const d = totalTime(s.duration)
  if (!isFinite(t) || !d) return 1
  // Just switched: the player may still report the old song's position, so stay quiet
  // until the new one is at its start (or a moment has passed, for songs resumed midway).
  if (performance.now() < startingUntil) {
    if (t > 1.5) return 0.05
    startingUntil = 0
  }
  // In: a little quicker than out, so the song starts promptly.
  const fadeIn = Math.max(0.6, secs * 0.6)
  const inGain = Math.min(1, Math.max(0.05, t / fadeIn))
  // Out: only when the next song follows on its own (not on repeat-one). It finishes a
  // little before the reported end (YouTube's length runs slightly long), and drops
  // along a curve, which the ear hears as an even fade rather than a late cut.
  const left = Math.min(1, Math.max(0, (d - END_EARLY - t) / secs))
  const outGain = s.repeat === 'one' ? 1 : left * left
  return Math.min(inGain, outGain)
}

export function startFading() {
  // A new song (skipped to, or picked) starts quiet straight away, before the player makes a sound.
  let last = ''
  usePlayer.subscribe((s) => {
    const id = s.current()?.id ?? ''
    if (id === last) return
    last = id
    advancedFrom = ''
    if (s.fade && id) {
      gain = 0.05
      startingUntil = performance.now() + 3000
      applyVolume()
    }
  })
  setInterval(() => {
    const next = target()
    // Faded all the way out: go straight to the next song instead of waiting out the tail.
    const s = usePlayer.getState()
    const id = s.current()?.id ?? ''
    if (s.fade && s.isPlaying && s.repeat !== 'one' && next === 0 && id && advancedFrom !== id && getMode() !== 'none') {
      const d = totalTime(s.duration)
      if (d > 10 && currentTime() >= d - END_EARLY - 0.05) {
        advancedFrom = id
        s.next(true)
        return
      }
    }
    if (Math.abs(next - gain) < 0.015 && next !== 1) return
    if (next === gain) return
    gain = next
    applyVolume()
  }, 100)
}
