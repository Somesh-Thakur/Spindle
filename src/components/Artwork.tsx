import { useState } from 'react'
import { nextMirror } from '../api/audius'
import { artUrl } from '../lib/format'

interface Props {
  src?: string
  size: number
  alt?: string
  className?: string
  round?: boolean
  /** Load right away, for art that starts off screen and slides in (sheets, dialogs). */
  eager?: boolean
}

/** Artwork with a soft placeholder and a blur-up fade when it arrives. */
export function Artwork({ src, size, alt = '', className = '', round, eager }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [alt2, setAlt] = useState<string | null>(null)
  const url = alt2 ?? artUrl(src, size * 2 > 1200 ? 1200 : size * 2)
  return (
    <div className={`art ${round ? 'art-round' : ''} ${loaded ? 'is-loaded' : ''} ${className}`}>
      {url && !failed ? (
        <img
          src={url}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            // Not every YouTube video has an HD thumbnail.
            if (url.includes('/hq720.jpg')) return setAlt(url.replace('/hq720.jpg', '/hqdefault.jpg'))
            // Google's image hosts rate-limit bursts (429). The same image lives on
            // a second host and behind the Piped proxy, so try those in turn.
            if (url.startsWith('https://yt3.googleusercontent.com/')) return setAlt(url.replace('//yt3.', '//lh3.'))
            if (url.startsWith('https://lh3.googleusercontent.com/'))
              return setAlt(`https://piped-proxy.ducks.party${new URL(url).pathname}?host=yt3.googleusercontent.com`)
            const m = nextMirror(url)
            if (m) setAlt(m)
            else setFailed(true)
          }}
        />
      ) : (
        <div className="art-fallback" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="38%" height="38%">
            <path fill="currentColor" d="M9 18.5A2.5 2.5 0 1 1 6.5 16c.17 0 .34.02.5.05V6.3l11-2.2v11.4a2.5 2.5 0 1 1-2-2.45V7.2l-7 1.4v9.9Z" />
          </svg>
        </div>
      )}
    </div>
  )
}
