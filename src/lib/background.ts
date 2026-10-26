// YouTube's API Services policies (III.I.9) don't allow playing from a player
// that isn't on screen. So when Spindle can't be seen (the tab is in the
// background, or the desktop window is minimised or in the tray), YouTube
// songs pause, and pick up again when Spindle is visible. Songs from Audius and
// previews aren't affected and keep playing.
import { create } from 'zustand'
import { toast } from '../components/Toast'
import { usePlayer } from '../store/player'

export const useBackground = create<{ tab: boolean; window: boolean }>(() => ({
  tab: typeof document !== 'undefined' && document.hidden,
  // Set by the desktop app (src/lib/desktop.ts) when its window is hidden or minimised.
  window: false,
}))

/** True while Spindle isn't on screen. */
export const inBackground = () => {
  const b = useBackground.getState()
  return b.tab || b.window
}

/** True when the current song plays through YouTube. */
export const isYouTubeNow = () => usePlayer.getState().mode === 'yt'

let pausedFor: string | null = null
let explained = false

function enforce() {
  const s = usePlayer.getState()
  const id = s.current()?.id ?? null
  if (inBackground()) {
    if (s.isPlaying && s.mode === 'yt') {
      pausedFor = id
      s.setPlaying(false)
    }
    return
  }
  // Back on screen: carry on where it stopped, unless the song changed meanwhile.
  if (pausedFor && pausedFor === id && !s.isPlaying) {
    s.setPlaying(true)
    if (!explained) {
      explained = true
      toast('YouTube songs pause while Spindle is in the background, as YouTube requires')
    }
  }
  pausedFor = null
}

export function startBackgroundRule() {
  document.addEventListener('visibilitychange', () => useBackground.setState({ tab: document.hidden }))
  useBackground.subscribe(enforce)
  // Catches every way playback can start (keys, autoplay, the tray) while hidden.
  usePlayer.subscribe((s, prev) => {
    if ((s.isPlaying && !prev.isPlaying) || s.mode !== prev.mode) enforce()
  })
}

/**
 * For the tray, media keys and the mini player: playing a YouTube song while
 * Spindle is hidden first brings its window back, then plays.
 */
export async function playVisibly(bringBack: () => Promise<unknown> | void, then: () => void) {
  const s = usePlayer.getState()
  if (!s.isPlaying && isYouTubeNow() && inBackground()) {
    await bringBack()
    // Give the window a moment to show. Coming back may already have resumed the song,
    // and pressing play again would pause it.
    setTimeout(() => !usePlayer.getState().isPlaying && then(), 350)
    return
  }
  then()
}
