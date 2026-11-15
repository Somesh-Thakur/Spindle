import { Eye, EyeOff, KeyRound, Loader2, Trash2, UserPlus } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { addFamily, familyMembers, removeFamily, setFamilyPassword, type FamilyMember } from '../lib/family'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never')

/** Admin → Family: accounts for people you share Spindle with. */
export function FamilyPanel() {
  const [members, setMembers] = useState<FamilyMember[] | null>(null)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const load = () =>
    familyMembers()
      .then(setMembers)
      .catch((e) => (setError(e.message), setMembers([])))
  useEffect(() => void load(), [])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNote('')
    try {
      await addFamily(login, password)
      setNote(`Added. They sign in with the ID “${login.trim().toLowerCase()}” and the password you chose.`)
      setLogin('')
      setPassword('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async (m: FamilyMember) => {
    const next = window.prompt(`New password for ${m.login} (at least 8 characters):`)
    if (!next) return
    try {
      await setFamilyPassword(m.id, next)
      setNote(`Password changed for ${m.login}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async (m: FamilyMember) => {
    if (!window.confirm(`Remove ${m.login}? Their library, likes and history are deleted too. This can't be undone.`)) return
    try {
      await removeFamily(m.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="family">
      <p className="fb-lede">
        Give someone their own Spindle: pick an ID and a password, then tell them both. They get their own library, likes and history,
        and can’t see yours or this page.
      </p>
      <form className="family-form" onSubmit={add}>
        <label className="acct-field">
          <span>ID</span>
          <input value={login} onChange={(e) => setLogin(e.target.value)} required minLength={2} maxLength={30} pattern="[A-Za-z0-9._\-]+" placeholder="papa" autoComplete="off" />
        </label>
        <label className="acct-field">
          <span>Password</span>
          <span className="gate-pass">
            <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" autoComplete="new-password" />
            <button type="button" className="gate-eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />} Add
        </button>
      </form>
      {error && <p className="import-error">{error}</p>}
      {note && !error && <p className="gate-note">{note}</p>}

      {members === null ? (
        <div className="fb-empty">
          <Loader2 size={18} className="spin" />
        </div>
      ) : members.length === 0 ? (
        <div className="fb-empty">No family accounts yet.</div>
      ) : (
        <ul className="admin-list">
          {members.map((m) => (
            <li key={m.id} className="family-row">
              <div>
                <b>{m.login}</b>
                <span>
                  Added {when(m.created_at)} · Last signed in {when(m.last_sign_in_at)}
                </span>
              </div>
              <button className="btn btn-ghost" onClick={() => changePassword(m)}>
                <KeyRound size={15} /> Password
              </button>
              <button className="btn btn-ghost" onClick={() => remove(m)} aria-label={`Remove ${m.login}`}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
