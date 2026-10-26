// Spindle's own visitor counting (supabase/schema.sql, "Insights"): no
// cookies, no third party, and nothing stored in the browser. The database
// counts each browser once a day under a code that changes daily. Browsers that
// ask not to be tracked, and people who switch it off in Settings, aren't counted.
import { isDesktop } from './desktop'
import { supabase } from './supabase'
import { useAccount } from './sync'

const OPT_OUT = 'spindle:no-visit-count'

/** True if this browser asks not to be tracked, or the visitor turned counting off. */
export function countingOff() {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  if (nav.globalPrivacyControl || nav.doNotTrack === '1') return true
  try {
    return localStorage.getItem(OPT_OUT) === '1'
  } catch {
    return false
  }
}

export function setCounting(on: boolean) {
  try {
    if (on) localStorage.removeItem(OPT_OUT)
    else localStorage.setItem(OPT_OUT, '1')
  } catch {
    /* private mode */
  }
}

/** Where the visit came from: another site's name, or ?utm_source=. Never a full address. */
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

const sent = new Set<boolean>()

async function track(signedIn: boolean) {
  if (!supabase || countingOff() || sent.has(signedIn)) return
  sent.add(signedIn)
  await supabase.rpc('track_visit', { p_source: source(), p_desktop: isDesktop })
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
  countries: { country: string; visitors: number }[]
  sources: { source: string; visitors: number }[]
  top_songs: { title: string | null; artist: string | null; plays: number; listeners: number }[]
}

export async function loadInsights(days = 30): Promise<Insights> {
  const { data, error } = await supabase!.rpc('admin_insights', { p_days: days })
  if (error) throw error
  return data as Insights
}
