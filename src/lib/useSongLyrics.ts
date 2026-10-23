import { useMemo } from 'react'
import { lyrics } from '../api/lyrics'
import { hasDevanagari, toHinglish } from './hinglish'
import type { Track } from './types'
import { useAsync } from './useAsync'
import { usePlayer } from '../store/player'

/** Lyrics for a track, in Hinglish when the listener prefers it. */
export function useSongLyrics(track: Track) {
  const nonce = usePlayer((s) => s.lyricsNonce)
  const hinglish = usePlayer((s) => s.hinglish)
  const { data, loading } = useAsync(() => lyrics(track), [track.id, nonce])
  const hindi = useMemo(() => !!data?.lines.some((l) => hasDevanagari(l.text)), [data])
  const lines = useMemo(() => {
    const src = data?.lines ?? []
    return hindi && hinglish ? src.map((l) => ({ ...l, text: toHinglish(l.text) })) : src
  }, [data, hindi, hinglish])
  return { data, loading, lines, hindi, hinglish }
}
