// Keeps a signed-in listener's library the same on every device.
//
// The library is projected into sections of keyed entries (liked songs,
// playlists, lyrics, settings, what's playing). A local "shadow" remembers when
// each entry last changed and what it looked like, so a store change becomes a
// small patch of only the entries that moved, and deletions become tombstones.
// The server merges patches entry by entry, newest first (supabase/schema.sql),
// and Realtime tells the other devices to pull the result.
import type { RealtimeChannel, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { allUserLyrics, applyUserLyrics } from '../api/lyrics'
import { mergeHistory, type Play } from './history'
import { startPlays } from './playSync'
import { toast } from '../components/Toast'
import { usePlayer, type Playlist } from '../store/player'
import { supabase } from './supabase'
import type { Track } from './types'

type Entry = { at: number; v?: unknown; del?: true }
type Doc = Record<string, Record<string, Entry>>
type Shadow = Record<string, Record<string, { at: number; h: string; del?: true }>>
type Projection = Record<string, Record<string, unknown>>

interface Session {
  queue: Track[]
  order: number[]
  pos: number
  device: string
}

export interface AccountState {
  /** 'off' when the site has no Supabase project configured. */
  status: 'off' | 'loading' | 'out' | 'in'
  user: User | null
  sync: 'idle' | 'syncing' | 'offline' | 'error'
  lastSynced: number
}

export const useAccount = create<AccountState>(() => ({
  status: supabase ? 'loading' : 'off',
  user: null,
  sync: 'idle',
  lastSynced: 0,
}))

const DEVICE = (() => {
  try {
    let id = localStorage.getItem('aura:device')
    if (!id) localStorage.setItem('aura:device', (id = Math.random().toString(36).slice(2, 12)))
    return id
  } catch {
    return Math.random().toString(36).slice(2, 12)
  }
})()

const QUEUE_LIMIT = 200

/** Settings that follow the account. Volume stays per device: speakers differ. */
const PREFS = ['country', 'hinglish', 'recent', 'videoHidden', 'videoView', 'customCursor', 'intro', 'liveBackground', 'playlistView', 'autoplay'] as const

// ---------- projection: store → sections ----------

function project(): Projection {
  const s = usePlayer.getState()
  const playlists: Record<string, Playlist> = {}
  for (const p of s.playlists) playlists[p.id] = p
  // Only the window around the current song travels, so huge queues stay light.
  const start = Math.max(0, s.pos - 20)
  const order = s.order.slice(start, start + QUEUE_LIMIT)
  const session: Session | null = s.queue.length
    ? { queue: order.map((i) => s.queue[i]).filter(Boolean), order: order.map((_, i) => i), pos: s.pos - start, device: DEVICE }
    : null
  return {
    liked: { ...s.liked },
    playlists,
    lyrics: allUserLyrics(),
    prefs: Object.fromEntries(PREFS.map((k) => [k, s[k]])),
    session: session ? { now: session } : {},
    // Listening history syncs separately (playSync.ts).
  }
}

// ---------- stable hashing, so key order from the database doesn't look like a change ----------

function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`
}

// Items rarely change once made, so each object's fingerprint is kept (thousands of plays).
const hashes = new WeakMap<object, string>()

function hash(v: unknown) {
  if (v && typeof v === 'object') {
    const known = hashes.get(v)
    if (known) return known
  }
  const s = stable(v)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  const out = `${(h >>> 0).toString(36)}.${s.length}`
  if (v && typeof v === 'object') hashes.set(v, out)
  return out
}

// ---------- per-account local bookkeeping ----------

const shadowKey = (uid: string) => `aura:sync:shadow:${uid}`
const pendingKey = (uid: string) => `aura:sync:pending:${uid}`

function load<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* storage full; the next sync will redo the diff */
  }
}

/** Newest entry per key wins, same rule as the server. */
function mergeDocs(a: Doc, b: Doc): Doc {
  const out: Doc = { ...a }
  for (const [sec, entries] of Object.entries(b)) {
    const merged = { ...(out[sec] || {}) }
    for (const [k, e] of Object.entries(entries)) if (!merged[k] || e.at >= merged[k].at) merged[k] = e
    out[sec] = merged
  }
  return out
}

const isEmpty = (d: Doc) => Object.values(d).every((s) => !Object.keys(s).length)

// ---------- the engine ----------

let uid: string | null = null
let shadow: Shadow = {}
let channel: RealtimeChannel | null = null
let unsubStore: (() => void) | null = null
let plays: ReturnType<typeof startPlays> | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let busy = false
let again = false
let applying = false

/** Compare the store with the shadow and queue what changed. */
function collect() {
  if (!uid || applying) return
  const now = Date.now()
  const local = project()
  const patch: Doc = {}
  for (const [sec, entries] of Object.entries(local)) {
    const sh = (shadow[sec] ||= {})
    for (const [k, v] of Object.entries(entries)) {
      const h = hash(v)
      if (sh[k] && !sh[k].del && sh[k].h === h) continue
      sh[k] = { at: now, h }
      ;(patch[sec] ||= {})[k] = { at: now, v }
    }
    for (const [k, e] of Object.entries(sh)) {
      if (e.del || k in entries) continue
      sh[k] = { at: now, h: '', del: true }
      ;(patch[sec] ||= {})[k] = { at: now, del: true }
    }
  }
  if (isEmpty(patch)) return
  save(shadowKey(uid), shadow)
  save(pendingKey(uid), mergeDocs(load<Doc>(pendingKey(uid), {}), patch))
}

/** Fold remote entries that are newer than ours into the store. */
function apply(doc: Doc) {
  const s = usePlayer.getState()
  const liked = { ...s.liked }
  const playlists = new Map(s.playlists.map((p) => [p.id, p]))
  const prefs: Partial<Pick<typeof s, (typeof PREFS)[number]>> = {}
  let likedChanged = false
  let playlistsChanged = false
  let lyricsChanged = false
  let session: Session | null = null
  const newPlays: Play[] = []
  const newTracks: Record<string, Track> = {}

  for (const [sec, entries] of Object.entries(doc)) {
    const sh = (shadow[sec] ||= {})
    for (const [k, e] of Object.entries(entries)) {
      if (sh[k] && sh[k].at >= e.at) continue
      if (sec === 'session') {
        // Only pick up another device's queue while this one is idle.
        const next = e.v as Session | undefined
        if (e.del || !next || next.device === DEVICE || s.isPlaying) continue
        session = next
      } else if (sec === 'liked') {
        if (e.del) delete liked[k]
        else liked[k] = e.v as Track
        likedChanged = true
      } else if (sec === 'playlists') {
        if (e.del) playlists.delete(k)
        else playlists.set(k, e.v as Playlist)
        playlistsChanged = true
      } else if (sec === 'lyrics') {
        applyUserLyrics(k, e.del ? null : (e.v as { lines: never[]; synced: boolean }))
        lyricsChanged = true
      } else if (sec === 'plays' && !e.del && e.v) {
        // Only from before history moved to its own table.
        newPlays.push(e.v as Play)
      } else if (sec === 'ptracks' && !e.del && e.v) {
        newTracks[k] = e.v as Track
      } else if (sec === 'prefs' && !e.del && (PREFS as readonly string[]).includes(k)) {
        ;(prefs as Record<string, unknown>)[k] = e.v
      } else continue
      sh[k] = e.del ? { at: e.at, h: '', del: true } : { at: e.at, h: hash(e.v) }
    }
  }

  const patch: Partial<typeof s> = { ...prefs }
  if (likedChanged) {
    // Liked songs read newest-last, so keep them in the order they were liked.
    const at = (id: string) => doc.liked?.[id]?.at ?? shadow.liked?.[id]?.at ?? 0
    patch.liked = Object.fromEntries(Object.entries(liked).sort(([a], [b]) => at(a) - at(b)))
  }
  if (playlistsChanged) patch.playlists = [...playlists.values()].sort((a, b) => a.createdAt - b.createdAt)
  if (lyricsChanged) patch.lyricsNonce = s.lyricsNonce + 1
  if (session) {
    Object.assign(patch, { queue: session.queue, order: session.order, pos: session.pos, isPlaying: false, currentTime: 0 })
    // Hash it the way this device will project it, so adopting it isn't seen as a new change.
    shadow.session = { now: { at: doc.session!.now.at, h: hash({ ...session, device: DEVICE }) } }
  }

  applying = true
  try {
    if (Object.keys(patch).length) usePlayer.setState(patch)
    if (newPlays.length || Object.keys(newTracks).length) mergeHistory(newPlays, newTracks)
  } finally {
    applying = false
  }
  if (uid) save(shadowKey(uid), shadow)
  if (session && s.queue.length && !toldHandoff) {
    toldHandoff = true
    toast('Picked up where you left off on your other device')
  }
}

let toldHandoff = false

/** Send queued changes (if any) and fold in whatever the server has. */
async function syncNow(pullOnly = false) {
  if (!supabase || !uid) return
  if (busy) {
    again = true
    return
  }
  busy = true
  useAccount.setState({ sync: 'syncing' })
  try {
    const pending = pullOnly ? {} : load<Doc>(pendingKey(uid), {})
    let doc: Doc
    if (isEmpty(pending)) {
      const { data, error } = await supabase.from('libraries').select('doc').eq('user_id', uid).maybeSingle()
      if (error) throw error
      doc = (data?.doc as Doc) || {}
    } else {
      const { data, error } = await supabase.rpc('sync_library', { patch: pending, device: DEVICE })
      if (error) throw error
      doc = (data as Doc) || {}
      // Anything changed while we were away stays queued for the next round.
      const left = load<Doc>(pendingKey(uid), {})
      for (const [sec, entries] of Object.entries(pending))
        for (const [k, e] of Object.entries(entries)) if (left[sec]?.[k]?.at === e.at) delete left[sec][k]
      save(pendingKey(uid), left)
      if (!isEmpty(left)) again = true
    }
    if (uid) apply(doc)
    useAccount.setState({ sync: 'idle', lastSynced: Date.now() })
  } catch (e) {
    console.warn('[sync]', e)
    useAccount.setState({ sync: navigator.onLine ? 'error' : 'offline' })
    if (navigator.onLine) schedule(15000)
  } finally {
    busy = false
    if (again) {
      again = false
      schedule(400)
    }
  }
}

function schedule(ms = 1200) {
  clearTimeout(timer)
  timer = setTimeout(() => syncNow(), ms)
}

const onFocus = () => document.visibilityState === 'visible' && syncNow(true)
const onOnline = () => syncNow()

function start(user: User) {
  if (uid === user.id) return
  stop()
  uid = user.id
  shadow = load<Shadow>(shadowKey(uid), {})
  // Plays used to travel in the library; drop that bookkeeping (and any unsent plays, which playSync sends).
  if (shadow.plays || shadow.ptracks) {
    delete shadow.plays
    delete shadow.ptracks
    save(shadowKey(uid), shadow)
    const pending = load<Doc>(pendingKey(uid), {})
    delete pending.plays
    delete pending.ptracks
    save(pendingKey(uid), pending)
  }
  collect()
  syncNow()
  plays = startPlays(uid)

  // Watch only the parts of the store that belong to the library.
  let last = ''

  unsubStore = usePlayer.subscribe((s) => {
    const sig = [s.liked, s.playlists, s.lyricsNonce, s.queue, s.order, s.pos, ...PREFS.map((k) => s[k])]
    const ref = sig.map((x) => (typeof x === 'object' ? identity(x) : String(x))).join('|')
    if (ref === last) return
    last = ref
    collect()
    if (!isEmpty(load<Doc>(pendingKey(user.id), {}))) schedule()
  })

  channel = supabase!
    .channel(`library:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'libraries', filter: `user_id=eq.${uid}` }, (payload) => {
      const device = (payload.new as { device?: string } | undefined)?.device
      if (device !== DEVICE) syncNow(true)
    })
    .subscribe()

  document.addEventListener('visibilitychange', onFocus)
  addEventListener('online', onOnline)
}

function stop() {
  clearTimeout(timer)
  unsubStore?.()
  unsubStore = null
  plays?.stop()
  plays = null
  if (channel) supabase?.removeChannel(channel)
  channel = null
  document.removeEventListener('visibilitychange', onFocus)
  removeEventListener('online', onOnline)
  uid = null
  shadow = {}
}

// Cheap change detection: the store replaces objects when they change.
const ids = new WeakMap<object, number>()
let nextId = 1
function identity(o: object) {
  let id = ids.get(o)
  if (!id) ids.set(o, (id = nextId++))
  return String(id)
}

// ---------- auth ----------

/** Message from a failed OAuth or email-link redirect, shown on the sign-in screen. */
export const redirectError = (() => {
  const q = new URLSearchParams(location.search)
  return q.get('error_description') || q.get('error') || ''
})()

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (/[?&](code|error)=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash)
    const user = session?.user ?? null
    useAccount.setState({ user, status: user ? 'in' : 'out' })
    // Supabase warns against awaiting its own calls inside this callback.
    setTimeout(() => (user ? start(user) : stop()), 0)
  })
}

export type Provider = 'google' | 'github'

const back = () => location.origin + location.pathname

export async function signInWith(provider: Provider) {
  const { error } = await supabase!.auth.signInWithOAuth({ provider, options: { redirectTo: back() } })
  if (error) throw error
}

/** Creates the account and emails a 6-digit code; there's no session until it's entered. */
export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase!.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: back() } })
  if (error) throw error
  // Signing up again with an address that's already confirmed returns a user with no identities.
  if (data.user && !data.user.identities?.length) throw new Error('already registered')
  return { needsCode: !data.session }
}

export async function verifySignup(email: string, code: string) {
  const first = await supabase!.auth.verifyOtp({ email, token: code, type: 'email' })
  if (!first.error) return
  const second = await supabase!.auth.verifyOtp({ email, token: code, type: 'signup' })
  if (second.error) throw first.error
}

export async function resendSignupCode(email: string) {
  const { error } = await supabase!.auth.resend({ type: 'signup', email, options: { emailRedirectTo: back() } })
  if (error) throw error
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/** Emails a 6-digit code for choosing a new password. */
export async function sendPasswordCode(email: string) {
  const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: back() })
  if (error) throw error
}

/** Checks the reset code (which signs in), then sets the new password. */
export async function resetPassword(email: string, code: string, password: string) {
  const { error } = await supabase!.auth.verifyOtp({ email, token: code, type: 'recovery' })
  if (error) throw error
  await changePassword(password)
}

export async function changePassword(password: string) {
  const { error } = await supabase!.auth.updateUser({ password })
  if (error) throw error
}

/** Deletes the account and its synced library for good, then clears this device. */
export async function deleteAccount() {
  const { error } = await supabase!.rpc('delete_account')
  if (error) throw error
  await signOut(true, false)
}

/** Push anything unsent, then sign out. `forget` also clears this device's library. */
export async function signOut(forget = false, flush = true) {
  if (uid && flush) {
    collect()
    await Promise.all([syncNow(), plays?.flush()])
  }
  const was = uid
  await supabase!.auth.signOut()
  if (was) {
    try {
      localStorage.removeItem(shadowKey(was))
      localStorage.removeItem(pendingKey(was))
    } catch {
      /* ignore */
    }
  }
  if (forget) {
    for (const id of Object.keys(allUserLyrics())) applyUserLyrics(id, null)
    usePlayer.setState({ liked: {}, playlists: [], recent: [], queue: [], order: [], pos: 0, isPlaying: false })
  }
}

export async function updateName(name: string) {
  const { data, error } = await supabase!.auth.updateUser({ data: { name } })
  if (error) throw error
  useAccount.setState({ user: data.user })
}

export const syncAgain = () => syncNow()

export function displayName(user: User | null) {
  const n = (user?.user_metadata?.name as string | undefined)?.trim()
  return n || user?.email?.split('@')[0] || 'You'
}
