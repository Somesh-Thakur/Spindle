// One interface over the two playback backends:
// 'yt'    — full songs through the YouTube embed
// 'audio' — direct streams (Audius full tracks, iTunes previews)
import { audio, bassLevel, readBins } from './audio'
import { yt } from './yt'

export type Mode = 'yt' | 'audio' | 'none'

let mode: Mode = 'none'
export const setMode = (m: Mode) => (mode = m)
export const getMode = () => mode

export function currentTime() {
  return mode === 'yt' ? yt.time() : audio.currentTime
}

export function totalTime(fallback: number) {
  const d = mode === 'yt' ? yt.duration() : audio.duration
  return isFinite(d) && d > 0 ? d : fallback
}

export function seekTo(sec: number) {
  if (mode === 'yt') yt.get()?.seekTo(sec, true)
  else audio.currentTime = sec
}

// The embed doesn't expose its audio, so visuals use a soft synthetic signal
// that breathes with the beat-ish tempo instead of real analysis.
const fake = new Uint8Array(128)
function synth() {
  const t = performance.now() / 1000
  for (let i = 0; i < fake.length; i++) {
    const fall = Math.max(0, 1 - i / 90)
    const pulse = 0.55 + 0.45 * Math.sin(t * 4.2 + i * 0.13) * Math.sin(t * 1.7 + i * 0.05)
    fake[i] = Math.min(255, 255 * fall * (0.35 + 0.55 * pulse * pulse))
  }
  return fake
}

export function spectrum() {
  return (mode !== 'yt' && readBins()) || synth()
}

export function bass() {
  if (mode !== 'yt' && readBins()) return bassLevel()
  const b = synth()
  return (b[2] + b[4] + b[6]) / (3 * 255)
}
