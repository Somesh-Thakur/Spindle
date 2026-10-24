// Offline listening: songs saved inside the app (Cache Storage), playable with
// no internet, like a music app's downloads. Only songs that play as audio
// files can be saved (Audius); YouTube's player can't be stored, by its terms.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Track } from './types'

const CACHE = 'spindle-audio'
const keyFor = (id: string) => `https://spindle.offline/track/${encodeURIComponent(id)}`

export const canDownload = (t: Track) => t.source === 'audius' && !!t.streamUrl

interface Saved {
  track: Track
  bytes: number
  at: number
}

interface DownloadState {
  saved: Record<string, Saved>
  /** 0–1 while downloading. */
  progress: Record<string, number>
}

export const useDownloads = create<DownloadState>()(
  persist(() => ({ saved: {}, progress: {} }), {
    name: 'spindle:downloads',
    partialize: (s) => ({ saved: s.saved }),
  }),
)

const set = useDownloads.setState

export const isSaved = (id: string) => !!useDownloads.getState().saved[id]

export async function download(t: Track) {
  if (!canDownload(t) || isSaved(t.id) || useDownloads.getState().progress[t.id] != null) return
  set((s) => ({ progress: { ...s.progress, [t.id]: 0 } }))
  try {
    const res = await fetch(t.streamUrl)
    if (!res.ok || !res.body) throw new Error(String(res.status))
    const total = Number(res.headers.get('content-length')) || 0
    const reader = res.body.getReader()
    const parts: BlobPart[] = []
    let got = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value as BlobPart)
      got += value.length
      if (total) set((s) => ({ progress: { ...s.progress, [t.id]: got / total } }))
    }
    const blob = new Blob(parts, { type: res.headers.get('content-type') || 'audio/mpeg' })
    await (await caches.open(CACHE)).put(keyFor(t.id), new Response(blob, { headers: { 'content-type': blob.type } }))
    set((s) => ({ saved: { ...s.saved, [t.id]: { track: t, bytes: blob.size, at: Date.now() } } }))
    // Ask the browser not to clear downloads when space runs low.
    navigator.storage?.persist?.().catch(() => {})
  } finally {
    set((s) => {
      const progress = { ...s.progress }
      delete progress[t.id]
      return { progress }
    })
  }
}

export async function removeDownload(id: string) {
  await (await caches.open(CACHE)).delete(keyFor(id))
  set((s) => {
    const saved = { ...s.saved }
    delete saved[id]
    return { saved }
  })
}

export async function removeAllDownloads() {
  await caches.delete(CACHE)
  set({ saved: {} })
}

let current: string | null = null

/** A playable address for a saved song (a local blob), or null if it isn't saved. */
export async function offlineUrl(id: string): Promise<string | null> {
  if (!isSaved(id)) return null
  const hit = await (await caches.open(CACHE)).match(keyFor(id))
  if (!hit) {
    // The browser cleared it; forget the entry.
    removeDownload(id)
    return null
  }
  if (current) URL.revokeObjectURL(current)
  current = URL.createObjectURL(await hit.blob())
  return current
}

export const totalBytes = (saved: Record<string, Saved>) => Object.values(saved).reduce((n, s) => n + s.bytes, 0)
