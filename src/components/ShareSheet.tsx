import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Link2, Loader2, Mail, Share2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createShare, shareUrl, useShareSheet, type ShareItem } from '../lib/share'
import { Artwork } from './Artwork'
import { PlaylistCover } from './PlaylistCover'
import { toast } from './Toast'

const KIND = { track: 'Song', playlist: 'Playlist', album: 'Album' } as const

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 0 1 12 2.2a9.8 9.8 0 0 1 9.8 9.8c0 5.4-4.4 9.8-9.8 9.8zM12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6A12 12 0 0 0 24 12C24 5.4 18.6 0 12 0z" />
    </svg>
  )
}
function TelegramMark() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor" aria-hidden="true">
      <path d="M21.9 3.6 18.6 19.3c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6 12.8 1.1 11.3c-1.1-.3-1.1-1.1.2-1.6l19.2-7.4c.9-.3 1.7.2 1.4 1.3z" />
    </svg>
  )
}
function XMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.3 5.5-6.3zm-1.2 17.9h1.9L6.9 4.2H4.9l12.1 16z" />
    </svg>
  )
}

function Preview({ item }: { item: ShareItem }) {
  const count = item.tracks.length
  return (
    <div className="share-preview">
      <div className="share-preview-art">
        {item.kind === 'playlist' ? <PlaylistCover tracks={item.tracks} cover={item.cover} size={120} /> : <Artwork src={item.art ?? ''} size={160} eager />}
      </div>
      <div className="share-preview-text">
        <small>{KIND[item.kind]}</small>
        <b>{item.title}</b>
        <span>{item.kind === 'track' ? item.subtitle : `${item.subtitle ? `${item.subtitle} · ` : ''}${count} ${count === 1 ? 'song' : 'songs'}`}</span>
      </div>
    </div>
  )
}

/** The share panel. Opens from any song, playlist or album via openShare(). */
export function ShareSheet() {
  const item = useShareSheet((s) => s.item)
  const close = useShareSheet((s) => s.close)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!item) return
    let alive = true
    setCode(null)
    setError('')
    setCopied(false)
    ;(item.code ? Promise.resolve(item.code) : createShare(item))
      .then((c) => alive && setCode(c))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Couldn’t make a link. Try again.'))
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', esc)
    return () => {
      alive = false
      removeEventListener('keydown', esc)
    }
  }, [item, close])

  const url = code ? shareUrl(code) : ''
  const text = item ? (item.kind === 'track' ? `${item.title} by ${item.subtitle} on Spindle` : `${item.title} on Spindle`) : ''

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const input = document.querySelector<HTMLInputElement>('.share-link input')
      input?.select()
      document.execCommand('copy')
    }
    setCopied(true)
    toast('Link copied')
    setTimeout(() => setCopied(false), 1800)
  }
  const openTarget = (href: string) => window.open(href, '_blank', 'noopener,noreferrer')
  const enc = encodeURIComponent
  const targets = [
    { label: 'WhatsApp', icon: <WhatsAppMark />, tint: '#25d366', go: () => openTarget(`https://wa.me/?text=${enc(`${text} ${url}`)}`) },
    { label: 'Telegram', icon: <TelegramMark />, tint: '#2aabee', go: () => openTarget(`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`) },
    { label: 'X', icon: <XMark />, tint: '#e7e9ea', go: () => openTarget(`https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`) },
    { label: 'Email', icon: <Mail size={20} />, tint: '#ffb36b', go: () => (location.href = `mailto:?subject=${enc(text)}&body=${enc(`${text}\n${url}`)}`) },
  ]
  const canNative = typeof navigator.share === 'function'

  return (
    <AnimatePresence>
      {item && (
        <motion.div className="share-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={close}>
          <motion.div
            className="share-sheet glass"
            role="dialog"
            aria-modal="true"
            aria-label={`Share ${item.title}`}
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="share-head">
              <h2>Share</h2>
              <button className="icon-btn" onClick={close} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <Preview item={item} />

            <div className={`share-link ${code ? '' : 'is-loading'}`}>
              <Link2 size={16} />
              <input readOnly value={url || (error ? 'No link' : 'Making your link…')} aria-label="Share link" onFocus={(e) => e.target.select()} />
              <button className="btn btn-primary" onClick={copy} disabled={!code}>
                {!code && !error ? <Loader2 size={15} className="spin" /> : copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {error && <p className="import-error">{error}</p>}

            <div className="share-targets">
              {targets.map((t) => (
                <button key={t.label} onClick={t.go} disabled={!code} style={{ ['--tint' as string]: t.tint }}>
                  <span className="share-target-icon">{t.icon}</span>
                  {t.label}
                </button>
              ))}
              {canNative && (
                <button onClick={() => navigator.share({ title: item.title, text, url }).catch(() => {})} disabled={!code} style={{ ['--tint' as string]: '#b69cff' }}>
                  <span className="share-target-icon">
                    <Share2 size={20} />
                  </span>
                  More
                </button>
              )}
            </div>
            <p className="share-note">Anyone with the link can see this {KIND[item.kind].toLowerCase()} and play a preview. They sign in to hear full songs.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
