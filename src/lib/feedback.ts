// Bug reports and ideas (supabase/schema.sql, "Feedback"). Listeners see their
// own with the developer's reply; admins answer everything from #/admin.
import { useEffect, useState } from 'react'
import { isDesktop } from './desktop'
import { displayName, useAccount } from './sync'
import { supabase } from './supabase'

declare const __RELEASE__: string

export type FeedbackKind = 'bug' | 'idea' | 'other'
export type FeedbackStatus = 'new' | 'seen' | 'planned' | 'fixed' | 'closed'

export interface Feedback {
  id: number
  at: string
  kind: FeedbackKind
  message: string
  page: string | null
  ua: string | null
  release: string | null
  status: FeedbackStatus
  reply: string | null
  updated_at: string
  email?: string | null
  name?: string | null
}

export interface CrashGroup {
  message: string
  count: number
  last: string
  url: string | null
  release: string | null
  ua: string | null
  stack: string | null
}

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: 'Sent',
  seen: 'Seen',
  planned: 'Planned',
  fixed: 'Fixed',
  closed: 'Closed',
}

/** The Discord server for Spindle listeners, when one is set up (VITE_DISCORD_INVITE). */
export const DISCORD_INVITE = (import.meta.env.VITE_DISCORD_INVITE as string | undefined) || ''

const need = () => {
  if (!supabase) throw new Error('Sign in to send feedback.')
  return supabase
}

export async function sendFeedback(kind: FeedbackKind, message: string, page: string) {
  const { error } = await need()
    .from('feedback')
    .insert({
      kind,
      message: message.trim().slice(0, 4000),
      page: page.slice(0, 300),
      ua: `${navigator.userAgent}${isDesktop ? ' Spindle/desktop' : ''}`.slice(-300),
      release: __RELEASE__.slice(0, 40),
      name: displayName(useAccount.getState().user).slice(0, 80),
    })
  if (error) throw error
}

export async function myFeedback(): Promise<Feedback[]> {
  const uid = useAccount.getState().user?.id
  if (!uid) return []
  const { data, error } = await need()
    .from('feedback')
    .select('id, at, kind, message, page, ua, release, status, reply, updated_at')
    .eq('user_id', uid)
    .order('at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data as Feedback[]
}

// ---------- admin ----------

let adminCheck: Promise<boolean> | null = null
let adminFor = ''

/** Whether the signed-in person can see the admin inbox. Asked once per account. */
export function checkAdmin(): Promise<boolean> {
  const uid = useAccount.getState().user?.id ?? ''
  if (!supabase || !uid) return Promise.resolve(false)
  if (adminCheck && adminFor === uid) return adminCheck
  adminFor = uid
  adminCheck = (async () => {
    const { data, error } = await supabase!.rpc('is_admin')
    return !error && data === true
  })()
  return adminCheck
}

export function useIsAdmin() {
  const uid = useAccount((s) => s.user?.id)
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    let live = true
    checkAdmin().then((a) => live && setAdmin(a))
    return () => {
      live = false
    }
  }, [uid])
  return admin
}

export async function allFeedback(open: boolean): Promise<Feedback[]> {
  let q = need().from('feedback').select('*').order('at', { ascending: false }).limit(200)
  if (open) q = q.in('status', ['new', 'seen', 'planned'])
  const { data, error } = await q
  if (error) throw error
  return data as Feedback[]
}

export async function answerFeedback(id: number, status: FeedbackStatus, reply: string) {
  const { error } = await need()
    .from('feedback')
    .update({ status, reply: reply.trim() || null })
    .eq('id', id)
  if (error) throw error
}

/** Crash reports from the last 30 days, grouped by message, most frequent first. */
export async function crashGroups(): Promise<CrashGroup[]> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data, error } = await need()
    .from('client_errors')
    .select('at, message, url, release, ua, stack')
    .gte('at', since)
    .order('at', { ascending: false })
    .limit(1000)
  if (error) throw error
  const groups = new Map<string, CrashGroup>()
  for (const r of data) {
    const g = groups.get(r.message)
    if (g) g.count++
    else groups.set(r.message, { message: r.message, count: 1, last: r.at, url: r.url, release: r.release, ua: r.ua, stack: r.stack })
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
}

/** Clear every report of one crash, once it's fixed. */
export async function clearCrash(message: string) {
  const { error } = await need().from('client_errors').delete().eq('message', message)
  if (error) throw error
}

/** A link to the feedback page that remembers where you came from. */
export function feedbackHref(kind?: FeedbackKind, about?: string) {
  const from = location.hash.replace(/^#/, '').split('?')[0] || '/'
  const q = new URLSearchParams({ from })
  if (kind) q.set('kind', kind)
  if (about) q.set('about', about.slice(0, 300))
  return `/feedback?${q}`
}
