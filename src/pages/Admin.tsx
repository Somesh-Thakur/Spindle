import { Bug, Check, ChevronDown, Lightbulb, Loader2, MessageCircle, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { InsightsPanel } from '../components/Insights'
import { KineticTitle } from '../components/Kinetic'
import { toast } from '../components/Toast'
import {
  allFeedback,
  answerFeedback,
  clearCrash,
  crashGroups,
  STATUS_LABEL,
  useIsAdmin,
  type CrashGroup,
  type Feedback,
  type FeedbackStatus,
} from '../lib/feedback'

const ICON = { bug: Bug, idea: Lightbulb, other: MessageCircle }
const STATUSES = Object.keys(STATUS_LABEL) as FeedbackStatus[]
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${Math.max(1, m)} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
/** "Chrome on Windows" from a user agent, enough to reproduce a bug. */
const device = (ua: string | null) => {
  if (!ua) return 'Unknown device'
  const app = /Spindle\//.test(ua) ? 'Desktop app' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${app} on ${os}` : app
}

/** The developer's inbox: feedback to answer and crashes to fix. Admins only (public.admins). */
export function AdminPage() {
  const admin = useIsAdmin()
  const [tab, setTab] = useState<'insights' | 'feedback' | 'crashes'>('insights')
  const [open, setOpen] = useState(true)
  const [items, setItems] = useState<Feedback[] | null>(null)
  const [crashes, setCrashes] = useState<CrashGroup[] | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      if (tab === 'feedback') setItems(await allFeedback(open))
      else setCrashes(await crashGroups())
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (admin && tab !== 'insights') load()
  }, [admin, tab, open])

  if (!admin)
    return (
      <div className="page admin-page">
        <div className="sec-head">
          <KineticTitle as="h1">Admin</KineticTitle>
        </div>
        <p className="fb-lede">
          This page is for the developer. Want to report something? <Link to="/feedback">Send feedback</Link>.
        </p>
      </div>
    )

  return (
    <div className="page admin-page">
      <div className="sec-head">
        <KineticTitle as="h1">Inbox</KineticTitle>
        {tab !== 'insights' && (
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
          </button>
        )}
      </div>
      <div className="admin-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'insights'} className={tab === 'insights' ? 'is-on' : ''} onClick={() => setTab('insights')}>
          Insights
        </button>
        <button role="tab" aria-selected={tab === 'feedback'} className={tab === 'feedback' ? 'is-on' : ''} onClick={() => setTab('feedback')}>
          Feedback
        </button>
        <button role="tab" aria-selected={tab === 'crashes'} className={tab === 'crashes' ? 'is-on' : ''} onClick={() => setTab('crashes')}>
          Crashes
        </button>
        {tab === 'feedback' && (
          <label className="admin-filter">
            <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Open only
          </label>
        )}
      </div>

      {tab === 'insights' ? (
        <InsightsPanel />
      ) : tab === 'feedback' ? (
        items === null ? (
          <div className="fb-empty">
            <Loader2 size={18} className="spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="fb-empty">Inbox zero. Nothing {open ? 'open' : 'here'} right now.</div>
        ) : (
          <ul className="admin-list">
            {items.map((f) => (
              <FeedbackCard key={f.id} item={f} onSaved={(next) => setItems((xs) => xs!.map((x) => (x.id === next.id ? next : x)))} />
            ))}
          </ul>
        )
      ) : crashes === null ? (
        <div className="fb-empty">
          <Loader2 size={18} className="spin" />
        </div>
      ) : crashes.length === 0 ? (
        <div className="fb-empty">No crashes in the last 30 days.</div>
      ) : (
        <ul className="admin-list">
          {crashes.map((c) => (
            <CrashCard key={c.message} crash={c} onCleared={() => setCrashes((xs) => xs!.filter((x) => x.message !== c.message))} />
          ))}
        </ul>
      )}
    </div>
  )
}

function FeedbackCard({ item, onSaved }: { item: Feedback; onSaved: (f: Feedback) => void }) {
  const [status, setStatus] = useState(item.status)
  const [reply, setReply] = useState(item.reply ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = status !== item.status || reply !== (item.reply ?? '')
  const Icon = ICON[item.kind]

  const save = async () => {
    setSaving(true)
    try {
      await answerFeedback(item.id, status, reply)
      onSaved({ ...item, status, reply: reply.trim() || null })
      toast(reply.trim() ? 'Reply sent' : 'Saved')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className={`admin-card is-${item.kind}`}>
      <div className="admin-card-head">
        <span className={`fb-tag is-${item.kind}`}>
          <Icon size={13} /> {item.kind}
        </span>
        <b>{item.name || 'Someone'}</b>
        <span className="admin-meta">{item.email}</span>
        <time className="admin-meta">{ago(item.at)}</time>
      </div>
      <p className="fb-msg">{item.message}</p>
      <div className="admin-meta-row">
        <span>{item.page || '/'}</span>
        <span>{device(item.ua)}</span>
        <span>v {item.release ?? '?'}</span>
      </div>
      <div className="admin-answer">
        <textarea value={reply} onChange={(e) => setReply(e.target.value.slice(0, 4000))} placeholder="Reply (they’ll see it on their Feedback page)" rows={2} />
        <div className="admin-answer-row">
          <select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)} aria-label="Status">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'new' ? 'New' : STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Save
          </button>
        </div>
      </div>
    </li>
  )
}

function CrashCard({ crash, onCleared }: { crash: CrashGroup; onCleared: () => void }) {
  const [openStack, setOpenStack] = useState(false)
  const clear = async () => {
    try {
      await clearCrash(crash.message)
      onCleared()
      toast('Cleared')
    } catch (e) {
      toast((e as Error).message)
    }
  }
  return (
    <li className="admin-card is-crash">
      <div className="admin-card-head">
        <span className="admin-count">{crash.count}×</span>
        <code className="admin-crash-msg">{crash.message}</code>
      </div>
      <div className="admin-meta-row">
        <span>last {ago(crash.last)}</span>
        <span>{crash.url || '/'}</span>
        <span>{device(crash.ua)}</span>
        <span>v {crash.release ?? '?'}</span>
      </div>
      <div className="admin-answer-row">
        <button className="btn btn-ghost" onClick={() => setOpenStack((o) => !o)} aria-expanded={openStack}>
          <ChevronDown size={15} style={{ transform: openStack ? 'rotate(180deg)' : undefined }} /> Details
        </button>
        <button className="btn btn-ghost" onClick={clear}>
          <Trash2 size={15} /> Clear (fixed)
        </button>
      </div>
      {openStack && <pre className="admin-stack">{crash.stack || 'No stack trace.'}</pre>}
    </li>
  )
}
