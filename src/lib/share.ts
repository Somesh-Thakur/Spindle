// Share links: a public snapshot of a song, playlist or album at /s/<code>.
// The server side (server/share.ts) turns that address into a page with a
// proper link preview; inside the app the same code opens #/shared/<code>.
import { create } from 'zustand'
import type { Playlist } from '../store/player'
import { artUrl } from './format'
import { displayName, useAccount } from './sync'
import { supabase } from './supabase'
import type { Track } from './types'

export type ShareKind = 'track' | 'playlist' | 'album'

export interface ShareItem {
  kind: ShareKind
  key: string
  title: string
  subtitle?: string
  /** Artwork template or URL for the preview; a playlist's own cover goes in `cover`. */
  art?: string
  cover?: string
  tracks: Track[]
  /** An existing link to pass on as it is, instead of making one. */
  code?: string
}

export interface Share {
  code: string
  kind: ShareKind
  title: string
  subtitle: string | null
  image: string | null
  owner_name: string | null
  updated_at: string
  payload: { track?: Track; tracks?: Track[]; cover?: string; count?: number }
}

/** Playlists can be long; the link carries the first 500 songs. */
const MAX_TRACKS = 500

export const shareUrl = (code: string) => `${location.origin}/s/${code}`

export const trackShare = (t: Track): ShareItem => ({ kind: 'track', key: t.id, title: t.title, subtitle: t.artist, art: t.art, tracks: [t] })

export const playlistShare = (p: Playlist): ShareItem => ({
  kind: 'playlist',
  key: p.id,
  title: p.name,
  cover: p.cover,
  art: p.tracks[0]?.art,
  tracks: p.tracks,
})

export const albumShare = (id: string, title: string, artist: string, art: string, tracks: Track[]): ShareItem => ({
  kind: 'album',
  key: id,
  title,
  subtitle: artist,
  art,
  tracks,
})

/** Creates the link, or refreshes the existing one for the same item, and returns its code. */
export async function createShare(item: ShareItem): Promise<string> {
  if (!supabase) throw new Error('Sharing needs accounts, which are off on this copy of Spindle.')
  const tracks = item.tracks.slice(0, MAX_TRACKS)
  const payload =
    item.kind === 'track' ? { track: tracks[0] } : { tracks, count: item.tracks.length, ...(item.cover ? { cover: item.cover } : {}) }
  const { data, error } = await supabase.rpc('share_item', {
    p_kind: item.kind,
    p_item_key: item.key,
    p_title: item.title,
    p_subtitle: item.subtitle ?? null,
    // Playlists without their own cover get a mosaic of their songs' covers in the preview.
    p_image: item.kind === 'playlist' || !item.art ? null : artUrl(item.art, 600),
    p_payload: payload,
    p_owner_name: displayName(useAccount.getState().user),
  })
  if (error) throw error
  return data as string
}

export async function loadShare(code: string): Promise<Share | null> {
  const preloaded = (window as { __SHARE__?: Share }).__SHARE__
  if (preloaded?.code === code) return preloaded
  if (!supabase) return null
  const { data } = await supabase.from('shares').select('code,kind,title,subtitle,image,owner_name,updated_at,payload').eq('code', code).maybeSingle()
  return (data as Share | null) ?? null
}

export async function myShares() {
  const uid = useAccount.getState().user?.id
  if (!supabase || !uid) return []
  const { data, error } = await supabase.from('shares').select('code,kind,title,subtitle,image,updated_at,payload').eq('owner', uid).order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Share[]
}

export async function deleteShare(code: string) {
  const { error } = await supabase!.from('shares').delete().eq('code', code)
  if (error) throw error
}

export function shareTracks(s: Share): Track[] {
  return s.payload.track ? [s.payload.track] : s.payload.tracks ?? []
}

// ---------- Opening a link ----------

const PENDING = 'spindle:share'

/** The code in a /s/<code> address, if the page was opened from a share link. */
export function codeFromPath(path = location.pathname) {
  return path.match(/^\/s\/([a-z0-9]{6,16})\/?$/i)?.[1] ?? null
}

/** Remember a link across signing in, so it opens once you're in. */
export function rememberShare(code: string) {
  try {
    sessionStorage.setItem(PENDING, code)
  } catch {
    /* private mode */
  }
}
export function takeRememberedShare() {
  try {
    const code = sessionStorage.getItem(PENDING)
    sessionStorage.removeItem(PENDING)
    return code
  } catch {
    return null
  }
}

/** Move from /s/<code> to the in-app page, keeping one clean history entry. */
export function openInApp(code: string) {
  history.replaceState(null, '', `/#/shared/${code}`)
  dispatchEvent(new HashChangeEvent('hashchange'))
}

// ---------- The share sheet ----------

interface SheetState {
  item: ShareItem | null
  open: (item: ShareItem) => void
  close: () => void
}

export const useShareSheet = create<SheetState>((set) => ({
  item: null,
  open: (item) => set({ item }),
  close: () => set({ item: null }),
}))

export const openShare = (item: ShareItem) => useShareSheet.getState().open(item)
