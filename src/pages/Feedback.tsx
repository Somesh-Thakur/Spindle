import { AnimatePresence, motion } from 'framer-motion'
import { Bug, Lightbulb, Loader2, MessageCircle, MessageSquareReply, Send, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { KineticTitle } from '../components/Kinetic'
import { toast } from '../components/Toast'
import { DISCORD_INVITE, myFeedback, sendFeedback, STATUS_LABEL, useIsAdmin, type Feedback, type FeedbackKind } from '../lib/feedback'
import { useAccount } from '../lib/sync'

const KINDS: { id: FeedbackKind; label: string; hint: string; icon: typeof Bug; placeholder: string }[] = [
  { id: 'bug', label: 'Report a bug', hint: 'Something broke or looks wrong', icon: Bug, placeholder: 'What happened, and what did you expect? For example: “The lyrics run ahead of the song on Kesariya.”' },
  { id: 'idea', label: 'Suggest an idea', hint: 'A feature or change you’d love', icon: Lightbulb, placeholder: 'What would make Spindle better for you?' },
  { id: 'other', label: 'Something else', hint: 'Questions, thanks, anything', icon: MessageCircle, placeholder: 'Tell us anything.' },
]

const TAG: Record<FeedbackKind, string> = { bug: 'Bug', idea: 'Idea', other: 'Other' }

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Send a bug report or idea, and see the replies to what you've sent. */
export function FeedbackPage() {
  const [params] = useSearchParams()
  const signedIn = useAccount((s) => s.status === 'in')
  const admin = useIsAdmin()
  const [kind, setKind] = useState<FeedbackKind>((['bug', 'idea', 'other'] as const).find((k) => k === params.get('kind')) ?? 'bug')
  const about = params.get('about')
  const [message, setMessage] = useState(about ? `\n\n(It said: ${about})` : '')
  const [sending, setSending] = useState(false)
  const [mine, setMine] = useState<Feedback[] | null>(null)
  const from = params.get('from') || '/'

  const refresh = () => myFeedback().then(setMine, () => setMine([]))
  useEffect(() => {
    if (signedIn) refresh()
  }, [signedIn])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (message.trim().length < 3) return
    setSending(true)
    try {
      await sendFeedback(kind, message, from)
      setMessage('')
      toast(kind === 'bug' ? 'Thanks! Bug report sent' : 'Thanks! Sent to the developer')
      refresh()
    } catch (err) {
      toast((err as Error).message || 'Couldn’t send that. Try again in a moment.')
    } finally {
      setSending(false)
    }
  }

  const current = KINDS.find((k) => k.id === kind)!
  return (
    <div className="page feedback-page">
      <div className="sec-head">
        <KineticTitle as="h1">Feedback</KineticTitle>
        {admin && (
          <Link className="btn btn-ghost" to="/admin">
            <ShieldCheck size={16} /> Admin inbox
          </Link>
        )}
      </div>
      <p className="fb-lede">Found a bug or have an idea? It goes straight to the developer, and you’ll see the reply here.</p>

      <div className="fb-layout">
        <form className="fb-form" onSubmit={submit}>
          <div className="fb-kinds" role="radiogroup" aria-label="What is it?">
            {KINDS.map(({ id, label, hint, icon: Icon }) => (
              <button type="button" key={id} role="radio" aria-checked={kind === id} className={`fb-kind ${kind === id ? 'is-on' : ''}`} onClick={() => setKind(id)}>
                <Icon size={20} />
                <b>{label}</b>
                <span>{hint}</span>
              </button>
            ))}
          </div>
          <label className="fb-field">
            <span className="visually-hidden">Your message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
              placeholder={current.placeholder}
              rows={7}
              autoFocus={!!about}
              required
            />
            <small>{message.length} / 4000</small>
          </label>
          <div className="fb-send">
            <p>We include the page you came from ({from}), your browser and the app version, so it’s easier to fix.</p>
            <button className="btn btn-primary" disabled={sending || !signedIn || message.trim().length < 3}>
              {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Send
            </button>
          </div>
          {!signedIn && <p className="fb-note">Sign in to send feedback.</p>}
        </form>

        <aside className="fb-side">
          {DISCORD_INVITE && (
            <a className="fb-discord" href={DISCORD_INVITE} target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M19.3 5.3A17 17 0 0 0 15 4l-.5 1.1a15.7 15.7 0 0 0-5 0L9 4a17 17 0 0 0-4.3 1.3C2 9.4 1.3 13.4 1.6 17.3A17 17 0 0 0 6.9 20l1.1-1.8c-.6-.2-1.2-.5-1.7-.9l.4-.3a12.2 12.2 0 0 0 10.6 0l.4.3c-.5.4-1.1.7-1.7.9l1.1 1.8a17 17 0 0 0 5.3-2.7c.4-4.5-.7-8.5-3.1-12ZM8.7 14.9c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm6.6 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z"
                />
              </svg>
              <span>
                <b>Join the Spindle Discord</b>
                <small>Chat with other listeners, share playlists and hear about updates first.</small>
              </span>
            </a>
          )}

          <h2 className="fb-h">What you’ve sent</h2>
          {mine === null ? (
            <div className="fb-empty">{signedIn ? <Loader2 size={18} className="spin" /> : 'Sign in to see your reports.'}</div>
          ) : mine.length === 0 ? (
            <div className="fb-empty">Nothing yet. Your reports and their replies show up here.</div>
          ) : (
            <ul className="fb-list">
              <AnimatePresence initial={false}>
                {mine.map((f) => (
                  <motion.li key={f.id} className="fb-item" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="fb-item-head">
                      <span className={`fb-tag is-${f.kind}`}>{TAG[f.kind]}</span>
                      <span className={`fb-status is-${f.status}`}>{STATUS_LABEL[f.status]}</span>
                      <time>{when(f.at)}</time>
                    </div>
                    <p className="fb-msg">{f.message}</p>
                    {f.reply && (
                      <div className="fb-reply">
                        <MessageSquareReply size={15} />
                        <div>
                          <b>Reply from the developer</b>
                          <p>{f.reply}</p>
                        </div>
                      </div>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
