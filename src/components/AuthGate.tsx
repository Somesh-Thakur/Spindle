import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff, Loader2, Mail } from 'lucide-react'
import { isDesktop } from '../lib/desktop'
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import {
  redirectError,
  resendSignupCode,
  resetPassword,
  sendPasswordCode,
  signIn,
  signInWith,
  signUp,
  useAccount,
  verifySignup,
  type Provider,
} from '../lib/sync'
import { usePlayer } from '../store/player'
import { AuraField } from './AuraField'
import { Logo } from './Brand'

type Step = 'start' | 'verify' | 'forgot' | 'reset'

/** Turn Supabase's messages into plain ones. */
export function friendly(e: unknown) {
  const m = e instanceof Error ? e.message : String(e)
  if (/invalid login/i.test(m)) return 'That email and password don’t match an account.'
  if (/already registered|already exists/i.test(m)) return 'There’s already an account with that email. Sign in instead.'
  if (/email not confirmed/i.test(m)) return 'Confirm your email first. We just sent you a new code.'
  if (/token has expired|invalid.*(otp|token)|otp.*(expired|invalid)/i.test(m)) return 'That code is wrong or has expired. Check the latest email, or send a new code.'
  if (/password should be|at least 6/i.test(m)) return 'Use a password with at least 8 characters.'
  if (/weak|pwned|compromised/i.test(m)) return 'That password is too easy to guess. Try a longer one.'
  if (/rate limit|too many|security purposes/i.test(m)) return 'Too many tries. Wait a minute and try again.'
  if (/provider is not enabled|unsupported provider/i.test(m)) return 'That sign-in option isn’t switched on yet. Use email for now.'
  if (/fetch|network/i.test(m)) return 'Can’t reach the server. Check your connection.'
  return m
}

const RESEND_AFTER = 60

/** Sign-in buttons to show, e.g. VITE_AUTH_PROVIDERS=google,github, once each is set up in Supabase. */
const PROVIDERS = ((import.meta.env.VITE_AUTH_PROVIDERS as string | undefined) ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter((p): p is Provider => p === 'google' || p === 'github')

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  )
}

/** Six boxes that behave like one field: type, paste or backspace across them. */
function CodeInput({ value, onChange, onDone, disabled }: { value: string; onChange: (v: string) => void; onDone: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  useEffect(() => refs.current[0]?.focus(), [])

  const put = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, 6)
    onChange(clean)
    refs.current[Math.min(clean.length, 5)]?.focus()
    if (clean.length === 6) onDone(clean)
  }
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      e.preventDefault()
      onChange(value.slice(0, i - 1))
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    else if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault()
    put(e.clipboardData.getData('text'))
  }

  return (
    <div className="code-input" onPaste={onPaste}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          maxLength={6}
          disabled={disabled}
          value={value[i] ?? ''}
          className={value[i] ? 'is-filled' : ''}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, '')
            if (!typed) return onChange(value.slice(0, i) + value.slice(i + 1))
            put(value.slice(0, i) + typed + value.slice(i + 1))
          }}
          onKeyDown={(e) => onKey(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  )
}

function useCooldown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!left) return
    const id = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(id)
  }, [left])
  return [left, () => setLeft(RESEND_AFTER)] as const
}

const slide = {
  initial: { opacity: 0, x: 24, filter: 'blur(6px)' },
  animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -24, filter: 'blur(6px)' },
  transition: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] },
} as const

/**
 * The front door. Spindle needs an account so your library can follow you,
 * so this screen stands in for the whole app until you're signed in.
 */
export function AuthGate() {
  const status = useAccount((s) => s.status)
  const liveBackground = usePlayer((s) => s.liveBackground)
  const [step, setStep] = useState<Step>('start')
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'' | 'form' | Provider | 'code' | 'resend'>('')
  const [error, setError] = useState(redirectError)
  const [note, setNote] = useState('')
  const [cooldown, startCooldown] = useCooldown()

  const go = (s: Step) => {
    setStep(s)
    setError('')
    setNote('')
    setCode('')
  }

  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    setBusy(kind)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(friendly(e))
    } finally {
      setBusy('')
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    run('form', async () => {
      const addr = email.trim()
      if (mode === 'up') {
        const { needsCode } = await signUp(addr, password, name.trim())
        if (needsCode) {
          go('verify')
          startCooldown()
        }
        return
      }
      try {
        await signIn(addr, password)
      } catch (err) {
        if (!/email not confirmed/i.test(String((err as Error).message))) throw err
        // Signed up earlier but never entered the code: send a fresh one and ask for it.
        await resendSignupCode(addr).catch(() => {})
        go('verify')
        startCooldown()
      }
    })
  }

  const verify = (c = code) => run('code', () => verifySignup(email.trim(), c))
  const resend = () =>
    run('resend', async () => {
      await (step === 'reset' ? sendPasswordCode(email.trim()) : resendSignupCode(email.trim()))
      startCooldown()
      setNote('New code sent. It can take a minute to arrive.')
    })

  const askReset = (e: FormEvent) => {
    e.preventDefault()
    run('form', async () => {
      await sendPasswordCode(email.trim())
      go('reset')
      startCooldown()
    })
  }
  const doReset = (e: FormEvent) => {
    e.preventDefault()
    if (code.length < 6) return setError('Enter the 6-digit code from the email.')
    run('code', () => resetPassword(email.trim(), code, password))
  }

  const working = !!busy

  return (
    <div className="gate">
      {liveBackground && <AuraField />}
      <div className="gate-grain" aria-hidden="true" />

      <section className="gate-hero" aria-hidden={status === 'loading'}>
        <motion.div className="gate-record" initial={{ scale: 0.85, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}>
          <Logo size={148} spinning />
        </motion.div>
        <motion.h1 className="gate-title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}>
          Every record
          <br />
          you love.
          <br />
          <em>On every screen.</em>
        </motion.h1>
        <motion.p className="gate-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }}>
          Full songs, live lyrics and your whole library, synced between your phone and your computer. Free.
        </motion.p>
      </section>

      <motion.section
        className="gate-card"
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {status === 'loading' ? (
          <div className="gate-loading">
            <Loader2 className="spin" size={26} />
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {step === 'start' && (
              <motion.div key="start" {...slide}>
                <h2 className="gate-h">{mode === 'up' ? 'Create your account' : 'Welcome back'}</h2>
                <p className="gate-p">{mode === 'up' ? 'It takes a few seconds.' : 'Sign in to pick up where you left off.'}</p>

                {PROVIDERS.length > 0 && (
                  <>
                    <div className="gate-providers">
                      {PROVIDERS.includes('google') && (
                        <button className="gate-provider" disabled={working} onClick={() => run('google', () => signInWith('google'))}>
                          {busy === 'google' ? <Loader2 className="spin" size={18} /> : <GoogleMark />}
                          Continue with Google
                        </button>
                      )}
                      {PROVIDERS.includes('github') && (
                        <button className="gate-provider" disabled={working} onClick={() => run('github', async () => {
                            await signInWith('github')
                            if (isDesktop) setNote('Finish signing in in your browser. Spindle opens again by itself.')
                          })}>
                          {busy === 'github' ? <Loader2 className="spin" size={18} /> : <GitHubMark />}
                          Continue with GitHub
                        </button>
                      )}
                    </div>

                    <div className="gate-or">
                      <span>or with email</span>
                    </div>
                  </>
                )}

                <form className="gate-form" onSubmit={submit}>
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
                    <span className="gate-label-row">
                      Password
                      {mode === 'in' && (
                        <button type="button" className="gate-link" onClick={() => go('forgot')}>
                          Forgot?
                        </button>
                      )}
                    </span>
                    <span className="gate-pass">
                      <input
                        type={show ? 'text' : 'password'}
                        required
                        minLength={mode === 'up' ? 8 : undefined}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                        placeholder={mode === 'up' ? 'At least 8 characters' : ''}
                      />
                      <button type="button" className="gate-eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
                        {show ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </span>
                  </label>
                  {error && <p className="import-error">{error}</p>}
                  <button className="btn btn-primary acct-submit" disabled={working}>
                    {busy === 'form' && <Loader2 className="spin" size={16} />}
                    {mode === 'up' ? 'Create account' : 'Sign in'}
                  </button>
                </form>

                <p className="gate-switch">
                  {mode === 'up' ? 'Already have an account?' : 'New to Spindle?'}{' '}
                  <button className="gate-link" onClick={() => (setMode(mode === 'up' ? 'in' : 'up'), setError(''))}>
                    {mode === 'up' ? 'Sign in' : 'Create an account'}
                  </button>
                </p>
              </motion.div>
            )}

            {step === 'verify' && (
              <motion.div key="verify" {...slide}>
                <button className="gate-back" onClick={() => go('start')}>
                  <ArrowLeft size={16} /> Back
                </button>
                <span className="gate-mail">
                  <Mail size={22} />
                </span>
                <h2 className="gate-h">Check your inbox</h2>
                <p className="gate-p">
                  We sent a 6-digit code to <b>{email}</b>. Enter it to confirm it’s you.
                </p>
                <CodeInput value={code} onChange={setCode} onDone={verify} disabled={busy === 'code'} />
                {error && <p className="import-error">{error}</p>}
                {note && !error && <p className="gate-note">{note}</p>}
                <button className="btn btn-primary acct-submit" disabled={working || code.length < 6} onClick={() => verify()}>
                  {busy === 'code' && <Loader2 className="spin" size={16} />}
                  Confirm and continue
                </button>
                <p className="gate-switch">
                  Didn’t get it? Check spam, or{' '}
                  <button className="gate-link" disabled={!!cooldown || working} onClick={resend}>
                    {cooldown ? `send a new code in ${cooldown}s` : 'send a new code'}
                  </button>
                </p>
              </motion.div>
            )}

            {step === 'forgot' && (
              <motion.form key="forgot" {...slide} onSubmit={askReset} className="gate-form">
                <button type="button" className="gate-back" onClick={() => go('start')}>
                  <ArrowLeft size={16} /> Back
                </button>
                <h2 className="gate-h">Reset your password</h2>
                <p className="gate-p">Enter your email and we’ll send you a code.</p>
                <label className="acct-field">
                  <span>Email</span>
                  <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
                </label>
                {error && <p className="import-error">{error}</p>}
                <button className="btn btn-primary acct-submit" disabled={working}>
                  {busy === 'form' && <Loader2 className="spin" size={16} />}
                  Send code
                </button>
              </motion.form>
            )}

            {step === 'reset' && (
              <motion.form key="reset" {...slide} onSubmit={doReset} className="gate-form">
                <button type="button" className="gate-back" onClick={() => go('forgot')}>
                  <ArrowLeft size={16} /> Back
                </button>
                <h2 className="gate-h">Choose a new password</h2>
                <p className="gate-p">
                  Enter the code we sent to <b>{email}</b>.
                </p>
                <CodeInput value={code} onChange={setCode} onDone={() => {}} disabled={busy === 'code'} />
                <label className="acct-field">
                  <span>New password</span>
                  <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
                </label>
                {error && <p className="import-error">{error}</p>}
                {note && !error && <p className="gate-note">{note}</p>}
                <button className="btn btn-primary acct-submit" disabled={working}>
                  {busy === 'code' && <Loader2 className="spin" size={16} />}
                  Save and sign in
                </button>
                <p className="gate-switch">
                  <button type="button" className="gate-link" disabled={!!cooldown || working} onClick={resend}>
                    {cooldown ? `Send a new code in ${cooldown}s` : 'Send a new code'}
                  </button>
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        )}
        <p className="gate-legal">
          By continuing you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>. Music streams from YouTube, iTunes and Audius.
        </p>
      </motion.section>
    </div>
  )
}
