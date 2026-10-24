// Spindle's own visitor counting (supabase/schema.sql, "Insights"): no third
// party and no cookies. A random ID kept in this browser is counted once a day,
// with the site the visit came from. Admins see the totals in #/admin.
import { isDesktop } from './desktop'
import { supabase } from './supabase'
import { useAccount } from './sync'

const ID = 'spindle:visitor'

function visitorId() {
  try {
    let id = localStorage.getItem(ID)
    if (!id) localStorage.setItem(ID, (id = crypto.randomUUID()))
    return id
  } catch {
    return null
  }
}

/** Where the visit came from: another site's address, or ?utm_source=. Never a full URL. */
function source() {
  const utm = new URLSearchParams(location.search).get('utm_source')
  if (utm) return utm.slice(0, 100)
  try {
    const ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''
    return ref && ref !== location.hostname ? ref : null
  } catch {
    return null
  }
}

async function track(signedIn: boolean) {
  if (!supabase) return
  const id = visitorId()
  if (!id) return
  const today = new Date().toISOString().slice(0, 10)
  const key = `spindle:visit:${today}:${signedIn ? 'in' : 'out'}`
  try {
    if (localStorage.getItem(key)) return
  } catch {
    return
  }
  const { error } = await supabase.rpc('track_visit', { p_visitor: id, p_source: source(), p_desktop: isDesktop })
  if (!error) localStorage.setItem(key, '1')
}

export function startInsights() {
  if (!supabase) return
  // Count once the sign-in state is known, and again on signing in (that visit then counts as signed in).
  const onStatus = (status: string) => {
    if (status === 'out') void track(false)
    if (status === 'in') void track(true)
  }
  onStatus(useAccount.getState().status)
  return useAccount.subscribe((s, prev) => s.status !== prev.status && onStatus(s.status))
}

export interface Insights {
  totals: {
    accounts: number
    new_week: number
    visitors_today: number
    visitors_week: number
    active_today: number
    active_week: number
    active_month: number
    plays_today: number
    desktop_week: number
    open_feedback: number
  }
  days: { day: string; visitors: number; signups: number; active: number; plays: number }[]
  sources: { source: string; visitors: number }[]
  top_songs: { title: string | null; artist: string | null; plays: number; listeners: number }[]
}

export async function loadInsights(days = 30): Promise<Insights> {
  const { data, error } = await supabase!.rpc('admin_insights', { p_days: days })
  if (error) throw error
  return data as Insights
}
