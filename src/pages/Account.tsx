import { AnimatePresence, motion } from 'framer-motion'
import { Check, CloudOff, Heart, ListMusic, Loader2, LogOut, Mic2, MonitorSmartphone, RefreshCw, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Initials } from '../components/Avatar'
import { KineticTitle } from '../components/Kinetic'
import { toast } from '../components/Toast'
import { allUserLyrics } from '../api/lyrics'
import { displayName, signIn, signOut, signUp, syncAgain, updateName, useAccount } from '../lib/sync'
import { usePlayer } from '../store/player'

const PERKS = [
  { icon: Heart, text: 'Liked songs' },
  { icon: ListMusic, text: 'Playlists and their covers' },
  { icon: Mic2, text: 'Lyrics you wrote or synced' },
  { icon: MonitorSmartphone, text: 'Pick up your queue on another device' },
]

/** Turn Supabase's messages into plain ones. */
function friendly(e: unknown) {
  const m = e instanceof Error ? e.message : String(e)
  if (/invalid login/i.test(m)) return 'That email and password don’t match an account.'
  if (/already registered|already exists/i.test(m)) return 'There’s already an account with that email. Sign in instead.'
  if (/email not confirmed/i.test(m)) return 'Confirm your email first. The link is in your inbox.'
  if (/password should be|at least 6/i.test(m)) return 'Use a password with at least 6 characters.'
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.'
  if (/fetch|network/i.test(m)) return 'Can’t reach the server. Check your connection.'
  return m
}

export function AccountPage() {
  const status = useAccount((s) => s.status)
  return (
    <div className="page account-page">
      <div className="sec-head">
        <KineticTitle as="h1">Account</KineticTitle>
      </div>
      {status === 'off' && (
        <div className="acct-card">
          <CloudOff size={26} />
          <p className="acct-lede">Accounts aren’t switched on for this copy of Spindle yet. Your music is saved on this device.</p>
        </div>
      )}
      {status === 'loading' && (
        <div className="acct-card">
          <Loader2 className="spin" size={22} />
        </div>
      )}
      {status === 'out' && <AuthForm />}
      {status === 'in' && <SignedIn />}
    </div>
  )
}

function AuthForm() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'up') {
        const { needsConfirm } = await signUp(email.trim(), password, name.trim())
        if (needsConfirm) setSent(true)
        else toast('Welcome to Spindle')
      } else {
        await signIn(email.trim(), password)
        toast('Signed in. Syncing your library')
      }
    } catch (err) {
      setError(friendly(err))
    } finally {
      setBusy(false)
    }
  }

  if (sent)
    return (
      <div className="acct-card">
        <Check size={26} />
        <p className="acct-lede">Check {email} for a link to confirm your account, then come back and sign in.</p>
        <button className="btn" onClick={() => (setSent(false), setMode('in'))}>
          Back to sign in
        </button>
      </div>
    )

  return (
    <div className="acct-split">
      <form className="acct-form" onSubmit={submit}>
        <div className="acct-tabs" role="tablist">
          {(['in', 'up'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'is-on' : ''} onClick={() => (setMode(m), setError(''))}>
              {mode === m && <motion.span layoutId="acct-tab" className="acct-tab-pill" transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }} />}
              <span>{m === 'in' ? 'Sign in' : 'Create account'}</span>
            </button>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {mode === 'up' && (
            <motion.label className="acct-field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="What should we call you?" />
            </motion.label>
          )}
        </AnimatePresence>
        <label className="acct-field">
          <span>Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
        </label>
        <label className="acct-field">
          <span>Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            placeholder={mode === 'up' ? 'At least 6 characters' : ''}
          />
        </label>
        {error && <p className="import-error">{error}</p>}
        <button className="btn btn-primary acct-submit" disabled={busy}>
          {busy && <Loader2 className="spin" size={16} />}
          {mode === 'up' ? 'Create account' : 'Sign in'}
        </button>
        <p className="acct-fine">Free, no ads. What’s already on this device is added to your account when you sign in.</p>
      </form>
      <div className="acct-perks">
        <p className="acct-perks-title">Your music, on every device</p>
        <ul>
          {PERKS.map(({ icon: Icon, text }) => (
            <li key={text}>
              <Icon size={18} />
              {text}
            </li>
          ))}
        </ul>
        <p className="acct-fine">Sign in with the same account on your phone and laptop, and an import or a new playlist shows up on both within seconds.</p>
      </div>
    </div>
  )
}

function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function SignedIn() {
  const user = useAccount((s) => s.user)
  const sync = useAccount((s) => s.sync)
  const lastSynced = useAccount((s) => s.lastSynced)
  const liked = usePlayer((s) => Object.keys(s.liked).length)
  const playlists = usePlayer((s) => s.playlists.length)
  usePlayer((s) => s.lyricsNonce)
  const lyrics = Object.keys(allUserLyrics()).length
  const name = displayName(user)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [leaving, setLeaving] = useState(false)

  const saveName = async (e: FormEvent) => {
    e.preventDefault()
    setEditing(false)
    if (draft.trim() && draft.trim() !== name) {
      try {
        await updateName(draft.trim())
      } catch (err) {
        toast(friendly(err))
      }
    }
  }

  const out = async (forget: boolean) => {
    setLeaving(true)
    await signOut(forget).catch((err) => toast(friendly(err)))
    toast(forget ? 'Signed out and cleared this device' : 'Signed out')
    setLeaving(false)
  }

  const statusText =
    sync === 'syncing' ? 'Syncing…' : sync === 'offline' ? 'Offline. Changes will sync when you’re back' : sync === 'error' ? 'Couldn’t sync. Retrying' : lastSynced ? `Synced ${ago(lastSynced)}` : 'Up to date'

  return (
    <div className="acct-signed">
      <div className="acct-profile">
        <Initials name={name} size={76} />
        <div className="acct-who">
          {editing ? (
            <form onSubmit={saveName}>
              <input className="acct-name-input" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={saveName} />
            </form>
          ) : (
            <button className="acct-name" onClick={() => (setDraft(name), setEditing(true))} title="Change your name">
              {name}
            </button>
          )}
          <span className="acct-email">{user?.email}</span>
        </div>
      </div>

      <div className="acct-sync">
        <span className={`sync-dot is-${sync}`} />
        <span className="acct-sync-text">{statusText}</span>
        <button className="btn btn-ghost" onClick={syncAgain} disabled={sync === 'syncing'}>
          <RefreshCw size={15} className={sync === 'syncing' ? 'spin' : ''} /> Sync now
        </button>
      </div>

      <div className="acct-stats">
        <div>
          <b>{liked}</b>
          <span>liked songs</span>
        </div>
        <div>
          <b>{playlists}</b>
          <span>playlists</span>
        </div>
        <div>
          <b>{lyrics}</b>
          <span>lyrics</span>
        </div>
      </div>
      <p className="acct-fine">Everything here is on every device you sign in to. Changes show up on the others within a few seconds.</p>

      <div className="acct-actions">
        <button className="btn" onClick={() => out(false)} disabled={leaving}>
          <LogOut size={15} /> Sign out
        </button>
        <button className="btn btn-ghost" onClick={() => out(true)} disabled={leaving} title="For shared computers: your music stays safe in your account">
          <Trash2 size={15} /> Sign out and clear this device
        </button>
      </div>
    </div>
  )
}
