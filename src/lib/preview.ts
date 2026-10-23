// 30-second previews for people who aren't signed in (the public share page).
// iTunes songs carry Apple's own preview; Audius streams are cut at 30 seconds;
// YouTube songs borrow the matching iTunes preview, found by title and artist.
import { useEffect, useRef, useState } from 'react'
import { search } from '../api/itunes'
import type { Track } from './types'

export const PREVIEW_SECONDS = 30

const found = new Map<string, Promise<string | null>>()

function previewUrl(t: Track, country: string): Promise<string | null> {
  if (t.source !== 'youtube' && t.streamUrl) return Promise.resolve(t.streamUrl)
  let p = found.get(t.id)
  if (!p) {
    p = search(`${t.title} ${t.artist}`, country)
      .then((r) => r.songs[0]?.streamUrl ?? null)
      .catch(() => null)
    found.set(t.id, p)
  }
  return p
}

/** One shared <audio>: play a preview, see which one is playing and how far along it is. */
export function usePreview(country: string) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [missing, setMissing] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const a = new Audio()
    a.preload = 'none'
    audio.current = a
    const tick = () => {
      const end = Math.min(PREVIEW_SECONDS, a.duration || PREVIEW_SECONDS)
      setProgress(Math.min(1, a.currentTime / end))
      if (a.currentTime >= PREVIEW_SECONDS) stop()
    }
    const stop = () => {
      a.pause()
      setPlaying(null)
      setProgress(0)
    }
    a.addEventListener('timeupdate', tick)
    a.addEventListener('ended', stop)
    return () => {
      a.pause()
      a.removeEventListener('timeupdate', tick)
      a.removeEventListener('ended', stop)
    }
  }, [])

  const toggle = async (t: Track) => {
    const a = audio.current
    if (!a) return
    if (playing === t.id) {
      a.pause()
      setPlaying(null)
      return
    }
    a.pause()
    setPlaying(null)
    setProgress(0)
    setLoading(t.id)
    const url = await previewUrl(t, country)
    setLoading((l) => (l === t.id ? null : l))
    if (!url) {
      setMissing((m) => new Set(m).add(t.id))
      return
    }
    a.src = url
    a.currentTime = 0
    try {
      await a.play()
      setPlaying(t.id)
    } catch {
      setMissing((m) => new Set(m).add(t.id))
    }
  }

  return { toggle, playing, loading, progress, missing }
}
