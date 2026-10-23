import { motion } from 'framer-motion'
import {
  Check,
  CloudOff,
  Gauge,
  Info,
  Keyboard,
  KeyRound,
  Link2,
  Languages,
  Loader2,
  LogOut,
  MonitorPlay,
  Palette,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  Volume2,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { COUNTRIES } from '../api/itunes'
import { allUserLyrics, applyUserLyrics } from '../api/lyrics'
import { friendly } from '../components/AuthGate'
import { Initials } from '../components/Avatar'
import { KineticTitle } from '../components/Kinetic'
import { toast } from '../components/Toast'
import { cacheSize, clearCache } from '../lib/cache'
import { deleteShare, myShares, shareUrl, type Share } from '../lib/share'
import { changePassword, deleteAccount, displayName, signOut, syncAgain, updateName, useAccount } from '../lib/sync'
import { usePlayer } from '../store/player'

const flag = (code: string) => `https://flagcdn.com/w40/${code}.png`

const SECTIONS = [
  { id: 'account', label: 'Account', icon: UserRound },
  { id: 'sharing', label: 'Shared links', icon: Link2 },
  { id: 'region', label: 'Region', icon: Languages },
  { id: 'playback', label: 'Playback', icon: Volume2 },
  { id: 'lyrics', label: 'Lyrics', icon: MonitorPlay },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'storage', label: 'Storage', icon: Gauge },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
] as const

const SHORTCUTS = [
  ['Space', 'Play or pause'],
  ['← →', 'Seek 5 seconds'],
  ['Shift ← →', 'Previous or next song'],
  ['↑ ↓', 'Volume'],
  ['M', 'Mute'],
  ['F', 'Open or close the full player'],
  ['/ or Ctrl K', 'Search'],
]

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
      <motion.span className="switch-knob" layout transition={{ type: 'spring', stiffness: 600, damping: 34 }} />
    </button>
  )
}

function Row({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={`set-${id}`} className="set-section">
      <h2 className="set-h">{title}</h2>
      <div className="set-card">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const jump = (id: string) => document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className="page settings-page">
      <div className="sec-head">
        <KineticTitle as="h1">Settings</KineticTitle>
      </div>
      <div className="set-layout">
        <nav className="set-nav" aria-label="Settings sections">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => jump(id)}>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="set-body">
          <AccountSection />
          <SharingSection />
          <RegionSection />
          <PlaybackSection />
          <LyricsSection />
          <AppearanceSection />
          <StorageSection />
          <Section id="shortcuts" title="Keyboard shortcuts">
            <div className="set-keys">
              {SHORTCUTS.map(([k, what]) => (
                <div key={k}>
                  <kbd>{k}</kbd>
                  <span>{what}</span>
                </div>
              ))}
            </div>
          </Section>
          <Section id="about" title="About">
            <Row title="Spindle" sub="Free music with full songs, live lyrics and karaoke. Songs stream from YouTube, iTunes previews and Audius; lyrics from LRCLIB.">
              <a className="btn btn-ghost" href="https://github.com/Somesh-Thakur/Spindle" target="_blank" rel="noreferrer">
                Source
              </a>
            </Row>
            <Row title="Privacy and terms" sub="What we store, and the rules for using Spindle.">
              <div className="set-actions">
                <a className="btn btn-ghost" href="/privacy" target="_blank" rel="noreferrer">
                  Privacy
                </a>
                <a className="btn btn-ghost" href="/terms" target="_blank" rel="noreferrer">
                  Terms
                </a>
              </div>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  )
}

// ---------- Account ----------

function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const PROVIDER_NAME: Record<string, string> = { email: 'Email and password', google: 'Google', github: 'GitHub' }

function AccountSection() {
  const status = useAccount((s) => s.status)
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
  const [pw, setPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState('')

  if (status !== 'in')
    return (
      <Section id="account" title="Account">
        <Row title="Accounts are off" sub="This copy of Spindle has no Supabase project connected, so your music is saved on this device only.">
          <CloudOff size={20} />
        </Row>
      </Section>
    )

  const providers = [...new Set((user?.identities ?? []).map((i) => i.provider))]
  const hasPassword = providers.includes('email')

  const saveName = async (e: FormEvent) => {
    e.preventDefault()
    setEditing(false)
    if (draft.trim() && draft.trim() !== name) await updateName(draft.trim()).catch((err) => toast(friendly(err)))
  }
  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPwBusy(true)
    try {
      await changePassword(pw)
      setPw('')
      toast(hasPassword ? 'Password changed' : 'Password set. You can now sign in with email too')
    } catch (err) {
      toast(friendly(err))
    } finally {
      setPwBusy(false)
    }
  }
  const out = async (forget: boolean) => {
    setLeaving(true)
    await signOut(forget).catch((err) => toast(friendly(err)))
    setLeaving(false)
  }
  const remove = async () => {
    setLeaving(true)
    try {
      await deleteAccount()
      toast('Your account and library were deleted')
    } catch (err) {
      toast(friendly(err))
      setLeaving(false)
    }
  }

  const statusText =
    sync === 'syncing' ? 'Syncing…' : sync === 'offline' ? 'Offline. Changes sync when you’re back' : sync === 'error' ? 'Couldn’t sync. Retrying' : lastSynced ? `Synced ${ago(lastSynced)}` : 'Up to date'

  return (
    <Section id="account" title="Account">
      <div className="set-profile">
        <Initials name={name} size={64} />
        <div className="acct-who">
          {editing ? (
            <form onSubmit={saveName}>
              <input className="acct-name-input" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={saveName} aria-label="Your name" />
            </form>
          ) : (
            <button className="acct-name" onClick={() => (setDraft(name), setEditing(true))} title="Change your name">
              {name}
            </button>
          )}
          <span className="acct-email">{user?.email}</span>
        </div>
      </div>

      <Row title="Sync" sub={statusText}>
        <span className={`sync-dot is-${sync}`} />
        <button className="btn btn-ghost" onClick={syncAgain} disabled={sync === 'syncing'}>
          <RefreshCw size={15} className={sync === 'syncing' ? 'spin' : ''} /> Sync now
        </button>
      </Row>
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

      <Row title="Sign-in methods" sub="How you can get into this account.">
        <div className="set-chips">
          {providers.map((p) => (
            <span key={p} className="set-chip">
              <Check size={13} /> {PROVIDER_NAME[p] ?? p}
            </span>
          ))}
        </div>
      </Row>

      <form className="set-row" onSubmit={savePassword}>
        <div className="set-row-text">
          <b>{hasPassword ? 'Change password' : 'Add a password'}</b>
          <span>{hasPassword ? 'At least 8 characters.' : 'Lets you sign in with your email as well.'}</span>
        </div>
        <div className="set-row-control set-pw">
          <span className="set-pw-field">
            <KeyRound size={15} />
            <input type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="New password" aria-label="New password" />
          </span>
          <button className="btn" disabled={pwBusy || pw.length < 8}>
            {pwBusy && <Loader2 className="spin" size={15} />}
            Save
          </button>
        </div>
      </form>

      <Row title="Sign out" sub="On a shared computer, clear this device too. Your music stays in your account.">
        <div className="set-actions">
          <button className="btn" onClick={() => out(false)} disabled={leaving}>
            <LogOut size={15} /> Sign out
          </button>
          <button className="btn btn-ghost" onClick={() => out(true)} disabled={leaving}>
            Sign out and clear
          </button>
        </div>
      </Row>

      <div className="set-row set-danger">
        <div className="set-row-text">
          <b>Delete account</b>
          <span>Removes your account and synced library for good. Type DELETE to confirm.</span>
        </div>
        <div className="set-row-control set-pw">
          <input className="set-input" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" />
          <button className="btn btn-ghost is-danger" disabled={confirmDelete !== 'DELETE' || leaving} onClick={remove}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>
    </Section>
  )
}

// ---------- Shared links ----------

const SHARE_KIND = { track: 'Song', playlist: 'Playlist', album: 'Album' } as const

function SharingSection() {
  const status = useAccount((s) => s.status)
  const [shares, setShares] = useState<Share[] | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    if (status !== 'in') return
    myShares().then(setShares, () => setShares([]))
  }, [status])

  if (status !== 'in') return null

  const remove = async (code: string) => {
    setBusy(code)
    try {
      await deleteShare(code)
      setShares((list) => list?.filter((s) => s.code !== code) ?? null)
      toast('Link turned off')
    } catch (err) {
      toast(friendly(err))
    } finally {
      setBusy('')
    }
  }
  const copy = (code: string) => navigator.clipboard.writeText(shareUrl(code)).then(() => toast('Link copied'))

  return (
    <Section id="sharing" title="Shared links">
      {shares === null ? (
        <Row title="Loading your links…">
          <Loader2 className="spin" size={18} />
        </Row>
      ) : !shares.length ? (
        <Row title="No shared links yet" sub="Share a song, playlist or album from its ••• menu or Share button. Links you make show up here." >
          <Link2 size={18} />
        </Row>
      ) : (
        shares.map((s) => (
          <div className="set-row" key={s.code}>
            <div className="set-row-text">
              <b>{s.title}</b>
              <span>
                {SHARE_KIND[s.kind]}
                {s.subtitle ? ` · ${s.subtitle}` : ''} · {shareUrl(s.code).replace(/^https?:\/\//, '')}
              </span>
            </div>
            <div className="set-row-control">
              <button className="btn btn-ghost" onClick={() => copy(s.code)}>
                Copy
              </button>
              <button className="btn btn-ghost" onClick={() => remove(s.code)} disabled={busy === s.code}>
                {busy === s.code ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />} Turn off
              </button>
            </div>
          </div>
        ))
      )}
    </Section>
  )
}

// ---------- Region ----------

function RegionSection() {
  const country = usePlayer((s) => s.country)
  const setCountry = usePlayer((s) => s.setCountry)
  const [q, setQ] = useState('')
  const list = useMemo(() => COUNTRIES.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())), [q])
  return (
    <Section id="region" title="Region">
      <Row title="Charts and new releases from" sub="Changes Home, Browse and the charts. Search still finds music from everywhere.">
        <label className="set-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a country" aria-label="Find a country" />
        </label>
      </Row>
      <div className="set-regions" role="radiogroup" aria-label="Region">
        {list.map((c) => (
          <button key={c.code} role="radio" aria-checked={c.code === country} className={c.code === country ? 'is-on' : ''} onClick={() => setCountry(c.code)}>
            <img src={flag(c.code)} alt="" />
            <span>{c.name}</span>
            {c.code === country && <Check size={15} />}
          </button>
        ))}
        {!list.length && <p className="set-empty">No country matches “{q}”.</p>}
      </div>
    </Section>
  )
}

// ---------- Playback ----------

function PlaybackSection() {
  const volume = usePlayer((s) => s.volume)
  const setVolume = usePlayer((s) => s.setVolume)
  const videoView = usePlayer((s) => s.videoView)
  const videoHidden = usePlayer((s) => s.videoHidden)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const set = usePlayer((s) => s.set)
  return (
    <Section id="playback" title="Playback">
      <Row title="Volume" sub="Saved on this device only.">
        <input
          type="range"
          className="set-range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(+e.target.value)}
          aria-label="Volume"
          style={{ ['--v' as string]: `${volume * 100}%` }}
        />
        <span className="set-value">{Math.round(volume * 100)}%</span>
      </Row>
      <Row title="Show music videos" sub="Full songs play from YouTube. Turn this off to keep the video out of sight everywhere.">
        <Switch on={!videoHidden} onChange={(v) => set({ videoHidden: !v })} label="Show music videos" />
      </Row>
      <Row title="Open the full player on the video" sub="Instead of the record player, when a video is available.">
        <Switch on={videoView} onChange={(v) => set({ videoView: v, ...(v ? { videoHidden: false } : {}) })} label="Open on the video" />
      </Row>
      <Row title="Shuffle" sub="Applies to what you play next.">
        <Switch on={shuffle} onChange={() => usePlayer.getState().toggleShuffle()} label="Shuffle" />
      </Row>
      <Row title="Repeat">
        <div className="seg seg-sm" role="radiogroup" aria-label="Repeat">
          {(['off', 'all', 'one'] as const).map((r) => (
            <button key={r} role="radio" aria-checked={repeat === r} className={repeat === r ? 'is-on' : ''} onClick={() => set({ repeat: r })}>
              {r === 'off' ? 'Off' : r === 'all' ? 'All' : 'One'}
            </button>
          ))}
        </div>
      </Row>
    </Section>
  )
}

// ---------- Lyrics ----------

function LyricsSection() {
  const hinglish = usePlayer((s) => s.hinglish)
  const set = usePlayer((s) => s.set)
  const [cleared, setCleared] = useState(0)
  usePlayer((s) => s.lyricsNonce)
  const mine = Object.keys(allUserLyrics()).length
  return (
    <Section id="lyrics" title="Lyrics">
      <Row title="Hindi lyrics" sub="Show Hindi songs in Latin letters (Hinglish) or in Devanagari.">
        <div className="seg seg-sm" role="radiogroup" aria-label="Hindi lyrics">
          <button role="radio" aria-checked={hinglish} className={hinglish ? 'is-on' : ''} onClick={() => set({ hinglish: true })}>
            Hinglish
          </button>
          <button role="radio" aria-checked={!hinglish} className={!hinglish ? 'is-on' : ''} onClick={() => set({ hinglish: false })} lang="hi">
            हिन्दी
          </button>
        </div>
      </Row>
      <Row title="Lyrics you added" sub={mine ? `${mine} ${mine === 1 ? 'song has' : 'songs have'} your own lyrics. They sync with your account.` : 'Add lyrics from the lyrics panel when a song has none.'}>
        <button
          className="btn btn-ghost"
          disabled={!mine}
          key={cleared}
          onClick={() => {
            for (const id of Object.keys(allUserLyrics())) applyUserLyrics(id, null)
            usePlayer.setState((s) => ({ lyricsNonce: s.lyricsNonce + 1 }))
            setCleared((n) => n + 1)
            toast('Removed your lyrics')
          }}
        >
          Remove all
        </button>
      </Row>
    </Section>
  )
}

// ---------- Appearance ----------

function AppearanceSection() {
  const customCursor = usePlayer((s) => s.customCursor)
  const intro = usePlayer((s) => s.intro)
  const liveBackground = usePlayer((s) => s.liveBackground)
  const set = usePlayer((s) => s.set)
  return (
    <Section id="appearance" title="Appearance">
      <Row title="Live background" sub="The moving colour field that follows the album art and the beat. Turn off to save battery.">
        <Switch on={liveBackground} onChange={(v) => set({ liveBackground: v })} label="Live background" />
      </Row>
      <Row title="Custom cursor" sub="The ring that reacts to what’s under it, and the hand on the record player.">
        <Switch on={customCursor} onChange={(v) => set({ customCursor: v })} label="Custom cursor" />
      </Row>
      <Row title="Opening animation" sub="The record spin-up when you open Spindle.">
        <Switch on={intro} onChange={(v) => set({ intro: v })} label="Opening animation" />
      </Row>
    </Section>
  )
}

// ---------- Storage ----------

function StorageSection() {
  const [size, setSize] = useState(cacheSize)
  const kb = Math.round(size / 1024)
  return (
    <Section id="storage" title="Storage">
      <Row title="Saved charts and search results" sub={`${kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`} on this device, kept so pages load instantly. Clearing it doesn’t touch your library.`}>
        <button
          className="btn btn-ghost"
          disabled={!size}
          onClick={() => {
            clearCache()
            setSize(cacheSize())
            toast('Cleared saved data')
          }}
        >
          Clear
        </button>
      </Row>
    </Section>
  )
}
