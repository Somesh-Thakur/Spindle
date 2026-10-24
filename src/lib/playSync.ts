// Listening history sync. Plays live in their own table (supabase/schema.sql)
// rather than the library document, so years of listening never slow down a
// library sync. New and growing plays are sent in batches; other devices' plays
// come back in pages and are merged by play (same song + start time).
import type { RealtimeChannel } from '@supabase/supabase-js'
import { mergeHistory, useHistory, type Play } from './history'
import { supabase } from './supabase'
import type { Track } from './types'

/** A play older than this has stopped growing, so it never needs sending again. */
const SETTLED = 3 * 3600_000
const BATCH = 2000
const PAGE = 1000

interface State {
  /** Every play that started before this has been sent. */
  upTo: number
  /** Plays since upTo, and the listening time last sent for each. */
  sent: Record<string, number>
  /** Server time of the newest play pulled. */
  pulled: string
}

const keyOf = (p: Play) => `${p.at}.${p.id}`
const stateKey = (uid: string) => `spindle:plays:${uid}`

function load(uid: string): State {
  try {
    const raw = localStorage.getItem(stateKey(uid))
    if (raw) return JSON.parse(raw) as State
  } catch {
    /* fall through */
  }
  return { upTo: 0, sent: {}, pulled: '' }
}

export function startPlays(uid: string) {
  if (!supabase) return { flush: async () => {}, stop() {} }
  const sb = supabase
  let state = load(uid)
  let stopped = false
  let pushing = false
  let pushTimer: ReturnType<typeof setTimeout> | undefined
  let pullTimer: ReturnType<typeof setTimeout> | undefined
  const save = () => {
    try {
      localStorage.setItem(stateKey(uid), JSON.stringify(state))
    } catch {
      /* storage full: plays are re-sent next time, which is harmless */
    }
  }

  async function push() {
    if (stopped || pushing) return
    const h = useHistory.getState()
    const dirty = h.plays.filter((p) => p.at >= state.upTo && state.sent[keyOf(p)] !== p.secs)
    if (!dirty.length) return
    pushing = true
    try {
      for (let i = 0; i < dirty.length; i += BATCH) {
        const batch = dirty.slice(i, i + BATCH)
        const tracks: Record<string, Track> = {}
        for (const p of batch) if (h.tracks[p.id]) tracks[p.id] = h.tracks[p.id]
        const { error } = await sb.rpc('add_plays', { p_plays: batch, p_tracks: tracks })
        if (error) throw error
        for (const p of batch) state.sent[keyOf(p)] = p.secs
      }
      settle()
      save()
    } catch (e) {
      console.warn('[plays]', e)
      schedulePush(60_000)
    } finally {
      pushing = false
    }
  }

  /** Forget plays that can't change any more, so the bookkeeping stays small. */
  function settle() {
    const upTo = Date.now() - SETTLED
    const pending = useHistory.getState().plays.some((p) => p.at < upTo && p.at >= state.upTo && state.sent[keyOf(p)] !== p.secs)
    if (pending) return
    state.upTo = Math.max(state.upTo, upTo)
    for (const k of Object.keys(state.sent)) if (Number(k.split('.')[0]) < state.upTo) delete state.sent[k]
  }

  async function pull() {
    if (stopped) return
    try {
      // A little overlap, so plays saved while the last pull ran aren't missed.
      const since = state.pulled ? new Date(new Date(state.pulled).getTime() - 120_000).toISOString() : '1970-01-01T00:00:00Z'
      const plays: Play[] = []
      let newest = state.pulled
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb
          .from('plays')
          .select('at, track_id, secs, updated_at')
          .gte('updated_at', since)
          .order('updated_at')
          .order('at')
          .order('track_id')
          .range(from, from + PAGE - 1)
        if (error) throw error
        for (const r of data) {
          plays.push({ id: r.track_id, at: Number(r.at), secs: r.secs })
          if (!newest || r.updated_at > newest) newest = r.updated_at
        }
        if (data.length < PAGE || stopped) break
      }
      if (stopped || !plays.length) return

      // Details for songs this device hasn't seen.
      const known = useHistory.getState().tracks
      const missing = [...new Set(plays.map((p) => p.id))].filter((id) => !known[id])
      const tracks: Record<string, Track> = {}
      for (let i = 0; i < missing.length; i += 100) {
        const { data, error } = await sb.from('play_tracks').select('track_id, track').in('track_id', missing.slice(i, i + 100))
        if (error) throw error
        for (const r of data) tracks[r.track_id] = r.track as Track
      }
      // What came from the server doesn't need sending back.
      for (const p of plays) if (p.at >= state.upTo) state.sent[keyOf(p)] = Math.max(state.sent[keyOf(p)] ?? 0, p.secs)
      mergeHistory(plays, tracks)
      state.pulled = newest
      save()
    } catch (e) {
      console.warn('[plays]', e)
    }
  }

  const schedulePush = (ms = 3000) => {
    clearTimeout(pushTimer)
    pushTimer = setTimeout(push, ms)
  }
  const schedulePull = (ms = 1500) => {
    clearTimeout(pullTimer)
    pullTimer = setTimeout(pull, ms)
  }

  const unsub = useHistory.subscribe((h, prev) => {
    if (h.plays !== prev.plays) schedulePush()
  })
  const channel: RealtimeChannel = sb
    .channel(`plays:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'plays', filter: `user_id=eq.${uid}` }, () => schedulePull())
    .subscribe()
  const onFocus = () => document.visibilityState === 'visible' && schedulePull(200)
  document.addEventListener('visibilitychange', onFocus)

  void pull().then(push)

  return {
    flush: push,
    stop() {
      stopped = true
      clearTimeout(pushTimer)
      clearTimeout(pullTimer)
      unsub()
      document.removeEventListener('visibilitychange', onFocus)
      void sb.removeChannel(channel)
    },
  }
}
