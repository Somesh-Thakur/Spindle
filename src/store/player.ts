import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultCountry } from '../api/itunes'
import type { Mode } from '../lib/engine'
import type { Track } from '../lib/types'

export type Repeat = 'off' | 'all' | 'one'

export interface Palette {
  base: string
  accent: string
  glow: string
  /** Luminance of the dominant colour, 0–1. */
  light: number
}

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
  createdAt: number
  /** The listener's own image (a resized JPEG data URL). Falls back to the songs' covers. */
  cover?: string
  /** How many times it's been listened to (sessions started from it). */
  plays?: number
}

export const DEFAULT_PALETTE: Palette = { base: '#2a1d5c', accent: '#ff4f79', glow: '#7a5cff', light: 0.2 }

interface PlayerState {
  queue: Track[]
  /** Order of queue indices actually played (shuffled or not). */
  order: number[]
  pos: number
  isPlaying: boolean
  buffering: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: Repeat
  fullOpen: boolean
  /** Which backend is playing, and whether it's the whole song. */
  mode: Mode
  fullLength: boolean
  /** Looking up the full song on YouTube. */
  resolving: boolean
  /** The embed has actually started this video (cued videos show YouTube's own overlay). */
  videoStarted: boolean
  /** Full player shows the video large instead of the record. */
  videoView: boolean
  panel: 'none' | 'lyrics' | 'queue'
  /** User chose to keep the YouTube video out of sight. */
  videoHidden: boolean
  karaoke: boolean
  /** State of the instrumental swap for YouTube songs in karaoke mode. */
  instrumental: 'off' | 'loading' | 'on' | 'missing'
  /** 0–1. Direct audio is processed live; YouTube switches to an instrumental below 0.5. */
  vocals: number
  /** Seconds added to lyric timestamps, for nudging sync. */
  lyricOffset: number
  /** Show Hindi lyrics in Latin letters. */
  hinglish: boolean
  /** Bumped when the listener edits lyrics, so views refetch. */
  lyricsNonce: number
  /** Bumped to restart the current track from 0. */
  replayNonce: number
  palette: Palette
  liked: Record<string, Track>
  playlists: Playlist[]
  recent: Track[]
  country: string
  /** Appearance: the custom ring cursor, the opening animation, the animated background. */
  customCursor: boolean
  intro: boolean
  liveBackground: boolean
  /** Minutes without input before the screensaver comes on; 0 is off. */
  screensaver: number
  /** How playlist songs are laid out. */
  playlistView: 'list' | 'grid' | 'compact'
  /** Keep playing similar songs when the queue runs out. */
  autoplay: boolean
  /** Where the current queue came from, e.g. "playlist:abc123", and a number for each new start. */
  queueSource: string
  queueSession: number
  /** Songs in the queue that Autoplay or Smart Shuffle added (not chosen by the listener). */
  addedIds: string[]

  current: () => Track | undefined
  upNext: () => Track[]
  playList: (tracks: Track[], start?: number, source?: string, added?: string[]) => void
  /** Add songs to the end of the queue without interrupting (Autoplay). */
  extendQueue: (tracks: Track[], added: boolean) => void
  playTrack: (t: Track) => void
  playNext: (t: Track) => void
  addToQueue: (t: Track) => void
  jumpTo: (orderPos: number) => void
  setPlaying: (p: boolean) => void
  toggle: () => void
  next: (auto?: boolean) => void
  prev: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  toggleLike: (t: Track) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  setFull: (open: boolean) => void
  setCountry: (c: string) => void
  set: (p: Partial<PlayerState>) => void
  createPlaylist: (name?: string, tracks?: Track[]) => string
  renamePlaylist: (id: string, name: string) => void
  deletePlaylist: (id: string) => void
  /** Returns false when the song was already in the playlist. */
  addToPlaylist: (id: string, t: Track) => boolean
  removeFromPlaylist: (id: string, trackId: string) => void
  setPlaylistTracks: (id: string, tracks: Track[]) => void
  setPlaylistCover: (id: string, cover?: string) => void
}

function shuffled(n: number, first: number) {
  const rest = [...Array(n).keys()].filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [first, ...rest]
}

const linear = (n: number) => [...Array(n).keys()]

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      order: [],
      pos: 0,
      isPlaying: false,
      buffering: false,
      currentTime: 0,
      duration: 0,
      volume: 0.85,
      muted: false,
      shuffle: false,
      repeat: 'off',
      fullOpen: false,
      mode: 'none',
      fullLength: false,
      resolving: false,
      videoStarted: false,
      videoView: false,
      panel: 'none',
      videoHidden: false,
      karaoke: false,
      instrumental: 'off',
      vocals: 1,
      lyricOffset: 0,
      hinglish: true,
      lyricsNonce: 0,
      replayNonce: 0,
      palette: DEFAULT_PALETTE,
      liked: {},
      playlists: [],
      recent: [],
      country: defaultCountry(),
      customCursor: true,
      intro: true,
      liveBackground: true,
      screensaver: 5,
      playlistView: 'list',
      autoplay: true,
      queueSource: '',
      queueSession: 0,
      addedIds: [],

      current: () => {
        const { queue, order, pos } = get()
        return queue[order[pos]]
      },
      upNext: () => {
        const { queue, order, pos } = get()
        return order.slice(pos + 1).map((i) => queue[i])
      },

      playList: (tracks, start = 0, source = '', added = []) => {
        if (!tracks.length) return
        const order = get().shuffle ? shuffled(tracks.length, start) : linear(tracks.length)
        set({
          queue: tracks,
          order,
          pos: get().shuffle ? 0 : start,
          isPlaying: true,
          currentTime: 0,
          queueSource: source,
          queueSession: get().queueSession + 1,
          addedIds: added,
        })
        remember(tracks[start])
      },
      extendQueue: (tracks, added) => {
        const { queue, order, addedIds } = get()
        const have = new Set(queue.map((t) => t.id))
        const fresh = tracks.filter((t) => !have.has(t.id))
        if (!fresh.length) return
        set({
          queue: [...queue, ...fresh],
          order: [...order, ...fresh.map((_, i) => queue.length + i)],
          addedIds: added ? [...addedIds, ...fresh.map((t) => t.id)] : addedIds,
        })
      },
      playTrack: (t) => get().playList([t], 0),
      playNext: (t) => {
        const { queue, order, pos } = get()
        if (!queue.length) return get().playTrack(t)
        const idx = queue.length
        set({ queue: [...queue, t], order: [...order.slice(0, pos + 1), idx, ...order.slice(pos + 1)] })
      },
      addToQueue: (t) => {
        const { queue, order } = get()
        if (!queue.length) return get().playTrack(t)
        set({ queue: [...queue, t], order: [...order, queue.length] })
      },
      jumpTo: (p) => {
        set({ pos: p, isPlaying: true, currentTime: 0 })
        remember(get().current())
      },
      setPlaying: (p) => set({ isPlaying: p }),
      toggle: () => {
        if (!get().current()) return
        set({ isPlaying: !get().isPlaying })
      },
      next: (auto = false) => {
        const { pos, order, repeat } = get()
        if (auto && repeat === 'one') return set({ currentTime: 0, isPlaying: true, replayNonce: Date.now() })
        if (pos + 1 < order.length) set({ pos: pos + 1, isPlaying: true, currentTime: 0 })
        else if (repeat === 'all') set({ pos: 0, isPlaying: true, currentTime: 0 })
        else if (auto) return set({ isPlaying: false })
        else return
        remember(get().current())
      },
      prev: () => {
        const { pos, currentTime } = get()
        if (currentTime > 3 || pos === 0) {
          set({ currentTime: 0, replayNonce: Date.now() })
          return
        }
        set({ pos: pos - 1, isPlaying: true, currentTime: 0 })
        remember(get().current())
      },
      toggleShuffle: () => {
        const { shuffle, queue, order, pos } = get()
        const cur = order[pos]
        if (!queue.length) return set({ shuffle: !shuffle })
        if (shuffle) set({ shuffle: false, order: linear(queue.length), pos: cur })
        else set({ shuffle: true, order: shuffled(queue.length, cur), pos: 0 })
      },
      cycleRepeat: () => set({ repeat: ({ off: 'all', all: 'one', one: 'off' } as const)[get().repeat] }),
      toggleLike: (t) => {
        const liked = { ...get().liked }
        if (liked[t.id]) delete liked[t.id]
        else liked[t.id] = t
        set({ liked })
      },
      setVolume: (v) => set({ volume: Math.min(1, Math.max(0, v)), muted: false }),
      toggleMute: () => set({ muted: !get().muted }),
      setFull: (open) => set({ fullOpen: open }),
      setCountry: (country) => set({ country }),
      set: (p) => set(p),
      createPlaylist: (name, tracks = []) => {
        const id = Math.random().toString(36).slice(2, 10)
        const n = get().playlists.length + 1
        set({ playlists: [...get().playlists, { id, name: name?.trim() || `My Playlist #${n}`, tracks, createdAt: Date.now() }] })
        return id
      },
      renamePlaylist: (id, name) =>
        set({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)) }),
      deletePlaylist: (id) => set({ playlists: get().playlists.filter((p) => p.id !== id) }),
      addToPlaylist: (id, t) => {
        const p = get().playlists.find((x) => x.id === id)
        if (!p || p.tracks.some((x) => x.id === t.id)) return false
        set({ playlists: get().playlists.map((x) => (x.id === id ? { ...x, tracks: [...x.tracks, t] } : x)) })
        return true
      },
      removeFromPlaylist: (id, trackId) =>
        set({ playlists: get().playlists.map((x) => (x.id === id ? { ...x, tracks: x.tracks.filter((t) => t.id !== trackId) } : x)) }),
      setPlaylistTracks: (id, tracks) => set({ playlists: get().playlists.map((x) => (x.id === id ? { ...x, tracks } : x)) }),
      setPlaylistCover: (id, cover) => set({ playlists: get().playlists.map((x) => (x.id === id ? { ...x, cover } : x)) }),
    }),
    {
      name: 'aura:player',
      partialize: (s) => ({
        volume: s.volume,
        shuffle: s.shuffle,
        repeat: s.repeat,
        liked: s.liked,
        recent: s.recent,
        country: s.country,
        playlists: s.playlists,
        videoView: s.videoView,
        videoHidden: s.videoHidden,
        hinglish: s.hinglish,
        customCursor: s.customCursor,
        intro: s.intro,
        liveBackground: s.liveBackground,
        screensaver: s.screensaver,
        playlistView: s.playlistView,
        autoplay: s.autoplay,
        addedIds: s.addedIds,
        queueSource: s.queueSource,
        queue: s.queue,
        order: s.order,
        pos: s.pos,
      }),
    },
  ),
)

function remember(t?: Track) {
  if (!t) return
  const recent = [t, ...usePlayer.getState().recent.filter((r) => r.id !== t.id)].slice(0, 40)
  usePlayer.setState({ recent })
}

/** Convenience selector for the current track. */
export const useCurrent = () => usePlayer((s) => s.queue[s.order[s.pos]])
