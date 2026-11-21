// Like Spotify and YouTube Music: once you've added a couple of songs to a
// playlist, search results show a + that adds straight to that playlist (and a
// ✓ that takes the song out again). It goes away after a while without adding.
import { usePlayer } from '../store/player'

/** Adds in a row to the same playlist before the + shows up. */
export const QUICK_ADD_AFTER = 2
/** How long the + stays without another add. */
export const QUICK_ADD_FOR = 2 * 60 * 60 * 1000

/** The playlist the + adds to, or null when it shouldn't show. */
export function useQuickAddPlaylist() {
  return usePlayer((s) => {
    const q = s.quickAdd
    if (!q || q.count < QUICK_ADD_AFTER || Date.now() - q.at > QUICK_ADD_FOR) return null
    return s.playlists.find((p) => p.id === q.id) ?? null
  })
}
