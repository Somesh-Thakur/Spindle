// Crash reports. Errors from this browser go to the client_errors table
// (supabase/schema.sql), which signed-in people can add to but nobody can read
// from the site. Kept small: each distinct error once, at most a few per visit.
import { supabase } from './supabase'

declare const __RELEASE__: string

const MAX_PER_VISIT = 5
const sent = new Set<string>()

const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n)

/** Record an error, if accounts are on and this one hasn't been sent already. */
export function reportError(error: unknown, where = 'window') {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error))
  const message = clip(`${where}: ${err.message || err.name}`, 500)
  if (import.meta.env.DEV) console.warn('[spindle] error', err)
  if (!supabase || sent.has(message) || sent.size >= MAX_PER_VISIT) return
  sent.add(message)
  void (async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return // Only members can write reports.
    await supabase.from('client_errors').insert({
      message,
      stack: clip(err.stack, 4000),
      // Path only: no query string, which may hold codes from a sign-in link.
      url: clip(location.pathname + location.hash.split('?')[0], 300),
      ua: clip(navigator.userAgent, 300),
      release: clip(__RELEASE__, 40),
    })
  })().catch(() => {})
}

/** True for "this page's code file is gone", which happens to open tabs after a new deploy. */
export const isStaleChunk = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch/i.test(String((e as Error)?.message ?? e))

/** Reload once to pick up the new deploy, instead of showing a crash. */
export function reloadForUpdate() {
  try {
    const last = Number(sessionStorage.getItem('spindle:reloaded') ?? 0)
    if (Date.now() - last < 30_000) return false // Already tried; let the crash screen show.
    sessionStorage.setItem('spindle:reloaded', String(Date.now()))
  } catch {
    return false
  }
  location.reload()
  return true
}

export function startErrorReporting() {
  addEventListener('error', (e) => {
    // Script and image load failures carry no error object and are mostly noise.
    if (e.error) reportError(e.error)
  })
  addEventListener('unhandledrejection', (e) => {
    // Network blips from music and lyrics lookups aren't bugs.
    if (e.reason instanceof TypeError && /fetch|network|load failed/i.test(e.reason.message)) return
    reportError(e.reason, 'promise')
  })
  // Vite's own signal that a split file couldn't load.
  addEventListener('vite:preloadError', (e) => {
    if (reloadForUpdate()) e.preventDefault()
  })
}
