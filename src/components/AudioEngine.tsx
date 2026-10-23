import { useEffect, useRef } from 'react'
import { findInstrumentals, findVideos } from '../api/youtube'
import { audio, ensureAudioGraph, setVocalLevel } from '../lib/audio'
import { extractPalette } from '../lib/color'
import { currentTime, getMode, seekTo, setMode, totalTime, type Mode } from '../lib/engine'
import { trackArt } from '../lib/format'
import type { Track } from '../lib/types'
import { YT_STATE, yt, ytPlayer } from '../lib/yt'
import { DEFAULT_PALETTE, useCurrent, usePlayer } from '../store/player'
import { toast } from './Toast'

const st = usePlayer.setState
const get = usePlayer.getState

// Candidate video IDs for the current track, tried in order if one won't embed.
let candidates: string[] = []
let loadToken = 0
// Which lookup source the current candidates came from (see findVideos).
let searchDepth = 0
// Karaoke: YouTube songs swap between the original upload and an instrumental one.
let originalId = ''
let variant: 'original' | 'instrumental' = 'original'
let instCandidates: string[] = []
// Where a swap should resume. Retries after an embed error can't ask the failed video.
let resumeAt = 0

const wantsInstrumental = () => get().karaoke && get().vocals < 0.5

function switchMode(m: Mode, fullLength: boolean) {
  setMode(m)
  st({ mode: m, fullLength })
}

function playAudio(t: Track, autoplay: boolean, fullLength: boolean) {
  yt.get()?.stopVideo?.()
  switchMode('audio', fullLength)
  audio.src = t.streamUrl
  st({ duration: t.preview ? 30 : t.duration, buffering: autoplay })
  if (autoplay) startAudio()
}

function startAudio() {
  ensureAudioGraph()
  audio.play().catch((err) => {
    if (err?.name === 'NotAllowedError') st({ isPlaying: false })
  })
}

async function playVideo(id: string, autoplay: boolean, start = 0) {
  audio.pause()
  audio.removeAttribute('src')
  switchMode('yt', true)
  st({ videoStarted: false })
  const p = await ytPlayer(ytListener)
  const opts = { videoId: id, startSeconds: start }
  if (autoplay) p.loadVideoById(opts)
  else p.cueVideoById(opts)
}

/** Swap the current YouTube song to (or from) its instrumental, keeping the position. */
async function setVariant(inst: boolean, start = currentTime()) {
  const t = get().current()
  if (!t) return
  resumeAt = start
  const token = loadToken
  if (!inst) {
    variant = 'original'
    st({ instrumental: 'off' })
    if (originalId) playVideo(originalId, get().isPlaying, start)
    return
  }
  st({ instrumental: 'loading' })
  const ids = await findInstrumentals(t)
  if (token !== loadToken) return
  if (!ids.length) {
    st({ instrumental: 'missing', vocals: 1 })
    toast('No instrumental version found for this song. Playing it with vocals.')
    if (getMode() !== 'yt' && originalId) playVideo(originalId, get().isPlaying, start)
    return
  }
  variant = 'instrumental'
  instCandidates = ids
  st({ instrumental: 'on' })
  playVideo(ids[0], get().isPlaying, start)
}

/** Fallback when no video exists or none of them will embed. */
function fallBack(t: Track) {
  candidates = []
  if (t.source === 'itunes') {
    toast("Couldn't find the full song. Playing a 30-second preview.")
    playAudio(t, get().isPlaying, false)
  } else {
    toast("This track couldn't be played. Skipping to the next one.")
    setTimeout(() => get().next(true), 600)
  }
}

const ytListener = {
  onReady: () => {
    const s = get()
    yt.get()?.setVolume(Math.round(s.volume * s.volume * 100))
    if (s.muted) yt.get()?.mute()
  },
  onState: (state: number) => {
    if (getMode() !== 'yt') return
    if (state === YT_STATE.ENDED) get().next(true)
    else if (state === YT_STATE.PLAYING) st({ buffering: false, isPlaying: true, videoStarted: true, duration: totalTime(get().duration) })
    else if (state === YT_STATE.BUFFERING) st({ buffering: true })
    else if (state === YT_STATE.PAUSED) {
      // Only a pause of the song that's actually playing means "the listener paused".
      // Switching songs pauses the old video first; that must not stop the new one.
      if (get().resolving || !get().videoStarted) return
      st({ buffering: false, isPlaying: false })
    }
  },
  onError: () => {
    if (getMode() !== 'yt') return
    if (variant === 'instrumental') {
      instCandidates.shift()
      if (instCandidates[0]) return playVideo(instCandidates[0], true, resumeAt)
      variant = 'original'
      st({ instrumental: 'missing', vocals: 1 })
      toast("The instrumental version won't play here. Back to the original.")
      if (originalId) playVideo(originalId, true, resumeAt)
      return
    }
    candidates.shift()
    const t = get().current()
    if (!t) return
    if (candidates[0]) return playVideo((originalId = candidates[0]), get().isPlaying)
    // Every match refused to embed (some labels block it). Try the next search source.
    if (searchDepth < 2) {
      searchDepth++
      const token = loadToken
      findVideos(t, searchDepth).then((ids) => {
        if (token !== loadToken) return
        candidates = ids
        if (ids[0]) playVideo((originalId = ids[0]), get().isPlaying)
        else fallBack(t)
      })
    } else fallBack(t)
  },
}

/** Bridges the store and the two playback backends. Renders nothing. */
export function AudioEngine() {
  const track = useCurrent()
  const isPlaying = usePlayer((s) => s.isPlaying)
  const volume = usePlayer((s) => s.volume)
  const muted = usePlayer((s) => s.muted)
  const replayNonce = usePlayer((s) => s.replayNonce)
  const loadedId = useRef<string>()

  // Pick a source whenever the track changes.
  useEffect(() => {
    if (!track) {
      audio.removeAttribute('src')
      switchMode('none', false)
      return
    }
    if (loadedId.current === track.id) return
    loadedId.current = track.id
    const token = ++loadToken
    st({ currentTime: 0, duration: track.duration, lyricOffset: 0 })

    if (track.source === 'audius') {
      playAudio(track, get().isPlaying, true)
      return
    }
    st({ resolving: true, buffering: get().isPlaying, instrumental: 'off' })
    yt.get()?.pauseVideo?.()
    audio.pause()
    searchDepth = 0
    variant = 'original'
    // Songs found on YouTube Music already know their video.
    ;(track.videoId ? Promise.resolve([track.videoId]) : findVideos(track)).then((ids) => {
      if (token !== loadToken) return
      st({ resolving: false })
      candidates = ids
      originalId = ids[0] ?? ''
      if (!ids[0]) fallBack(track)
      else if (wantsInstrumental()) setVariant(true, 0)
      else playVideo(ids[0], get().isPlaying)
    })
  }, [track])

  // Karaoke vocals: live processing for direct audio, instrumental swap for YouTube.
  const karaoke = usePlayer((s) => s.karaoke)
  const vocals = usePlayer((s) => s.vocals)
  const mode = usePlayer((s) => s.mode)
  const resolving = usePlayer((s) => s.resolving)
  useEffect(() => {
    if (mode === 'audio') setVocalLevel(karaoke ? vocals : 1)
    else setVocalLevel(1)
    if (mode !== 'yt' || resolving) return
    const want = wantsInstrumental()
    if (want !== (variant === 'instrumental') && get().instrumental !== 'loading') setVariant(want)
  }, [karaoke, vocals, mode, resolving])

  useEffect(() => {
    if (!track || get().resolving) return
    const m = getMode()
    if (m === 'yt') {
      const p = yt.get()
      if (!p?.getPlayerState) return
      const s = p.getPlayerState()
      if (isPlaying && s !== YT_STATE.PLAYING && s !== YT_STATE.BUFFERING) p.playVideo()
      if (!isPlaying && s === YT_STATE.PLAYING) p.pauseVideo()
    } else if (m === 'audio') {
      if (isPlaying) startAudio()
      else audio.pause()
    }
  }, [isPlaying, track])

  useEffect(() => {
    if (!replayNonce) return
    seekTo(0)
    if (get().isPlaying) getMode() === 'yt' ? yt.get()?.playVideo() : startAudio()
  }, [replayNonce])

  useEffect(() => {
    audio.volume = volume * volume // perceptual curve
    audio.muted = muted
    const p = yt.get()
    if (p?.setVolume) {
      p.setVolume(Math.round(volume * volume * 100))
      muted ? p.mute() : p.unMute()
    }
  }, [volume, muted])

  // Ambient palette from artwork.
  useEffect(() => {
    let alive = true
    if (!track) {
      st({ palette: DEFAULT_PALETTE })
      return
    }
    extractPalette(trackArt(track, 100)).then((p) => alive && st({ palette: p }))
    return () => {
      alive = false
    }
  }, [track?.id])

  // The embed has no timeupdate event, so poll it.
  useEffect(() => {
    const id = setInterval(() => {
      if (getMode() === 'yt') st({ currentTime: currentTime() })
    }, 250)
    return () => clearInterval(id)
  }, [])

  // <audio> events → store.
  useEffect(() => {
    const onTime = () => getMode() === 'audio' && st({ currentTime: audio.currentTime })
    const onMeta = () => isFinite(audio.duration) && st({ duration: audio.duration })
    const onEnd = () => get().next(true)
    const onWait = () => st({ buffering: true })
    const onPlaying = () => st({ buffering: false })
    const onPause = () => {
      if (get().resolving) return // switching songs, not a listener pause
      if (!audio.ended && get().isPlaying && audio.paused && audio.readyState > 2 && getMode() === 'audio') st({ isPlaying: false })
    }
    const onError = () => {
      if (!audio.src || getMode() !== 'audio') return
      st({ buffering: false })
      toast("This track couldn't be played. Skipping to the next one.")
      setTimeout(() => get().next(true), 600)
    }
    const events: [string, () => void][] = [
      ['timeupdate', onTime],
      ['loadedmetadata', onMeta],
      ['ended', onEnd],
      ['waiting', onWait],
      ['playing', onPlaying],
      ['canplay', onPlaying],
      ['pause', onPause],
      ['error', onError],
    ]
    events.forEach(([e, f]) => audio.addEventListener(e, f))
    return () => events.forEach(([e, f]) => audio.removeEventListener(e, f))
  }, [])

  // Media Session: lock screen, hardware keys, OS media overlay.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: [256, 512].map((s) => ({ src: trackArt(track, s), sizes: `${s}x${s}`, type: 'image/jpeg' })),
    })
    navigator.mediaSession.setActionHandler('play', () => get().setPlaying(true))
    navigator.mediaSession.setActionHandler('pause', () => get().setPlaying(false))
    navigator.mediaSession.setActionHandler('nexttrack', () => get().next())
    navigator.mediaSession.setActionHandler('previoustrack', () => get().prev())
    navigator.mediaSession.setActionHandler('seekto', (d) => d.seekTime != null && seek(d.seekTime))
  }, [track?.id])

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]')) return
      const s = get()
      if (e.code === 'Space') {
        e.preventDefault()
        s.toggle()
      } else if (e.key === 'ArrowRight' && e.shiftKey) s.next()
      else if (e.key === 'ArrowLeft' && e.shiftKey) s.prev()
      else if (e.key === 'ArrowRight') seek(currentTime() + 5)
      else if (e.key === 'ArrowLeft') seek(currentTime() - 5)
      else if (e.key === 'ArrowUp') (e.preventDefault(), s.setVolume(s.volume + 0.05))
      else if (e.key === 'ArrowDown') (e.preventDefault(), s.setVolume(s.volume - 0.05))
      else if (e.key.toLowerCase() === 'm') s.toggleMute()
      else if (e.key.toLowerCase() === 'f' && s.current()) s.setFull(!s.fullOpen)
      else if (e.key === 'Escape' && s.fullOpen) s.setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return null
}

export function seek(sec: number) {
  const d = totalTime(get().duration)
  const t = Math.max(0, Math.min(d - 0.5, sec))
  seekTo(t)
  st({ currentTime: t })
}
