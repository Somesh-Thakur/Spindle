import { motion } from 'framer-motion'
import { BarChart3, ChevronDown, Download, Mic2, Monitor, Music2, RefreshCw, Share2, Sparkles } from 'lucide-react'
import { DISCORD_INVITE } from '../lib/feedback'
import { Logo } from './Brand'

const FEATURES = [
  { icon: Music2, title: 'Full songs, free', text: 'Almost any song, start to finish, matched to the right recording automatically. No ads and no subscription.' },
  { icon: Mic2, title: 'Live lyrics and karaoke', text: 'Lyrics that follow the song line by line, a word-by-word karaoke mode, and a vocal remover for singing along.' },
  { icon: RefreshCw, title: 'Your library everywhere', text: 'Liked songs, playlists and stats sync live between your phone, your laptop and the desktop app.' },
  { icon: Download, title: 'Bring your playlists', text: 'Paste a Spotify, Apple Music or YouTube Music link and the whole playlist comes over, song by song.' },
  { icon: Share2, title: 'Share it beautifully', text: 'Links with rich previews in WhatsApp, Discord and iMessage, and 1080×1920 story cards for Instagram.' },
  { icon: BarChart3, title: 'Your listening stats', text: 'Minutes listened, top songs and artists, streaks, and a stats card worth posting.' },
  { icon: Sparkles, title: 'Never runs dry', text: 'Smart Shuffle mixes in songs you’ll like, and Autoplay keeps going with similar music when your queue ends.' },
  { icon: Monitor, title: 'A real desktop app', text: 'Discord “Listening to” status, media keys, a pinned mini player, and music that keeps playing from the tray.' },
]

const SHOTS = [
  { src: '/landing/player.jpg', alt: 'The Spindle player with a spinning record and the up-next queue', caption: 'A record player for every song, with what’s up next beside it.' },
  { src: '/landing/home.jpg', alt: 'The Spindle home page with a crate of today’s top songs', caption: 'Dig through the charts like a crate of records.' },
  { src: '/landing/playlist.jpg', alt: 'A Spindle playlist with recommended songs', caption: 'Playlists with recommendations that actually fit.' },
]

const FAQ = [
  { q: 'Is Spindle really free?', a: 'Yes. No ads, no subscription and no limits. Spindle is a personal project, made because music should be easy to enjoy.' },
  { q: 'Where does the music come from?', a: 'Full songs play through YouTube’s official player, with Apple’s 30-second previews and independent artists on Audius as fallbacks. Lyrics come from LRCLIB. Spindle doesn’t host or sell any music.' },
  { q: 'Can I use it on my phone?', a: 'Yes. Open Spindle in Safari or Chrome and choose “Add to Home Screen” to use it like an app. Your library syncs with your computer.' },
  { q: 'How do I bring my Spotify playlists?', a: 'Sign in, open Import, and paste a playlist link. For private playlists and Liked Songs, export them with a free tool like Exportify and drop the file in.' },
  { q: 'Why do I need an account?', a: 'So your library, playlists and stats can follow you to every device. It takes a few seconds with email or GitHub, and you can delete it any time.' },
]

const RELEASES = 'https://github.com/Somesh-Thakur/Spindle/releases/latest'

const rise = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] as const },
}

/**
 * The public front page below the sign-in card: what Spindle is, for visitors
 * and for search engines. `onStart` brings the sign-up form back into view.
 */
export function Landing({ onStart }: { onStart: (mode: 'up' | 'in') => void }) {
  return (
    <div className="landing">
      <a className="landing-more" href="#features" aria-label="See what Spindle can do">
        <ChevronDown size={22} />
      </a>

      <section id="features" className="landing-section">
        <motion.div className="landing-head" {...rise}>
          <span className="landing-kicker">What you get</span>
          <h2>Everything a music app should do. Plus a turntable.</h2>
        </motion.div>
        <div className="landing-features">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <motion.article key={title} className="landing-feature" {...rise} transition={{ ...rise.transition, delay: (i % 4) * 0.06 }}>
              <span className="landing-feature-icon">
                <Icon size={20} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <motion.div className="landing-head" {...rise}>
          <span className="landing-kicker">Take a look</span>
          <h2>Built like an after-hours record store.</h2>
        </motion.div>
        <div className="landing-shots">
          {SHOTS.map((s, i) => (
            <motion.figure key={s.src} className={`landing-shot ${i === 0 ? 'is-big' : ''}`} {...rise} transition={{ ...rise.transition, delay: i * 0.08 }}>
              <img src={s.src} alt={s.alt} loading="lazy" width={1440} height={900} />
              <figcaption>{s.caption}</figcaption>
            </motion.figure>
          ))}
        </div>
      </section>

      <motion.section className="landing-section landing-desktop" {...rise}>
        <div>
          <span className="landing-kicker">Spindle for desktop</span>
          <h2>Your music, one click away.</h2>
          <p>A light app for Windows and Mac with Discord “Listening to” status, media keys, a mini player that stays on top, and updates that install themselves.</p>
          <div className="landing-actions">
            <a className="btn btn-primary" href={RELEASES} target="_blank" rel="noreferrer">
              <Download size={16} /> Download for Windows or Mac
            </a>
          </div>
        </div>
        <Logo size={160} spinning />
      </motion.section>

      <section className="landing-section landing-faq">
        <motion.div className="landing-head" {...rise}>
          <span className="landing-kicker">Questions</span>
          <h2>Good to know</h2>
        </motion.div>
        <div className="landing-faq-list">
          {FAQ.map(({ q, a }) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <motion.section className="landing-section landing-cta" {...rise}>
        <h2>Ready to press play?</h2>
        <p>Create your free account in a few seconds.</p>
        <div className="landing-actions">
          <button className="btn btn-primary" onClick={() => onStart('up')}>
            Start listening
          </button>
          <button className="btn btn-ghost" onClick={() => onStart('in')}>
            I have an account
          </button>
        </div>
      </motion.section>

      <footer className="landing-foot">
        <span>
          <Logo size={18} /> Spindle · Made by Somesh Sanjay Thakur
        </span>
        <nav>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          {DISCORD_INVITE && (
            <a href={DISCORD_INVITE} target="_blank" rel="noreferrer">
              Discord
            </a>
          )}
          <a href="https://github.com/Somesh-Thakur/Spindle" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </footer>
    </div>
  )
}
