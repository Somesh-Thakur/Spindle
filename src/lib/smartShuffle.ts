// Smart Shuffle, like Spotify's: play a playlist shuffled with a recommended
// song you don't have yet after about every three, marked so you can keep it.
import { usePlayer, type Playlist } from '../store/player'
import { recommend } from './recommend'
import type { Track } from './types'

const EVERY = 3
const MAX_PICKS = 20

function shuffled<T>(xs: T[]) {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Start Smart Shuffle for a playlist. Resolves to how many picks were mixed in. */
export async function smartShuffle(p: Playlist): Promise<number> {
  const st = usePlayer.getState()
  const recs = await recommend(p.tracks, p.tracks, st.country).catch(() => [] as Track[])
  const picks = shuffled(recs).slice(0, Math.min(MAX_PICKS, Math.max(1, Math.ceil(p.tracks.length / EVERY))))
  const out: Track[] = []
  let r = 0
  shuffled(p.tracks).forEach((t, i) => {
    out.push(t)
    if ((i + 1) % EVERY === 0 && picks[r]) out.push(picks[r++])
  })
  // The order is already shuffled; regular shuffle would undo the spacing.
  usePlayer.setState({ shuffle: false })
  usePlayer.getState().playList(out, 0, `playlist:${p.id}`, picks.slice(0, r).map((t) => t.id))
  return r
}

/** The playlist the current queue came from, if any. */
export function sourcePlaylist() {
  const s = usePlayer.getState()
  if (!s.queueSource.startsWith('playlist:')) return null
  return s.playlists.find((pl) => pl.id === s.queueSource.slice('playlist:'.length)) ?? null
}
