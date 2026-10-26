// The pop-out mini player (remote.html) is a separate little page, opened as an
// always-on-top window in the desktop app or a Picture-in-Picture window in the
// browser. It doesn't play anything itself: this side tells it what's playing
// and carries out its buttons, over a BroadcastChannel.
import { inBackground, playVisibly, useBackground } from './background'
import { currentTime, seekTo } from './engine'
import { artUrl } from './format'
import { usePlayer } from '../store/player'

export const CHANNEL = 'spindle-remote'

export interface RemoteState {
  title: string
  artist: string
  art: string
  playing: boolean
  liked: boolean
  time: number
  duration: number
  /** When `time` was read, so the pop-out can move the progress bar on its own. */
  at: number
  /** Why it can't play right now, if it can't. */
  hint?: string
}

export type RemoteCommand = 'hello' | 'toggle' | 'next' | 'prev' | 'like' | 'focus' | { seek: number }

export function startRemoteHost(onFocus: () => void) {
  if (typeof BroadcastChannel === 'undefined') return
  const ch = new BroadcastChannel(CHANNEL)

  const state = (): RemoteState | null => {
    const s = usePlayer.getState()
    const t = s.current()
    if (!t) return null
    return {
      title: t.title,
      artist: t.artist,
      art: artUrl(t.art, 300).split('#')[0],
      playing: s.isPlaying,
      liked: !!s.liked[t.id],
      time: currentTime(),
      duration: s.duration || t.duration || 0,
      at: Date.now(),
      // YouTube songs only play while Spindle is on screen.
      hint: s.mode === 'yt' && !s.isPlaying && inBackground() ? 'Open Spindle to play this song' : undefined,
    }
  }

  let last = ''
  const send = (force = false) => {
    const st = state()
    const key = st ? `${st.title}|${st.artist}|${st.playing}|${st.liked}|${Math.round(st.duration)}|${st.hint ?? ''}` : ''
    if (!force && key === last) return
    last = key
    ch.postMessage({ state: st })
  }
  usePlayer.subscribe(() => send())
  useBackground.subscribe(() => send())
  // Resync the position now and then, and right after seeking (key unchanged, so forced).
  setInterval(() => send(true), 5000)

  ch.onmessage = ({ data }: MessageEvent<{ cmd?: RemoteCommand }>) => {
    const cmd = data?.cmd
    const s = usePlayer.getState()
    if (!cmd) return
    if (cmd === 'hello') return send(true)
    if (cmd === 'toggle') void playVisibly(onFocus, () => usePlayer.getState().toggle())
    else if (cmd === 'next') s.next()
    else if (cmd === 'prev') s.prev()
    else if (cmd === 'focus') onFocus()
    else if (cmd === 'like') {
      const t = s.current()
      if (t) s.toggleLike(t)
    } else if (typeof cmd === 'object' && Number.isFinite(cmd.seek)) {
      seekTo(cmd.seek)
      setTimeout(() => send(true), 300)
    }
  }
}
