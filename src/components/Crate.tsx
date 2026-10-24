import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { trackArt } from '../lib/format'
import { useScrollRoot } from '../lib/scroll'
import type { Track } from '../lib/types'
import { usePlayer } from '../store/player'

const DEPTH = 6

/**
 * A crate of records you dig through by scrolling. The section is tall and the
 * crate is pinned; scroll progress picks the front record, and the ones you've
 * passed tip forward out of the way.
 */
export function Crate({ tracks, title, lede }: { tracks: Track[]; title: string; lede: string }) {
  const root = useScrollRoot()
  const sec = useRef<HTMLElement>(null)
  const cards = useRef<(HTMLButtonElement | null)[]>([])
  const headRef = useRef<HTMLHeadingElement>(null)
  const [active, setActive] = useState(0)
  const playList = usePlayer((s) => s.playList)
  const n = tracks.length
  const { scrollYProgress } = useScroll({ container: root, target: sec, offset: ['start start', 'end end'] })

  const layout = (v: number) => {
    const pos = v * (n - 1)
    cards.current.forEach((el, i) => {
      if (!el) return
      const d = i - pos
      let tf: string
      let op = 1
      let br = 1
      if (d < 0) {
        // Tipping forward, toward the viewer and down.
        const k = Math.min(1, -d)
        tf = `translate3d(0, ${k * 38}%, ${k * 120}px) rotateX(${-k * 82}deg)`
        op = 1 - k
      } else {
        tf = `translate3d(0, ${-d * 7.5}%, ${-d * 90}px) rotateX(${Math.min(d, 1) * 6}deg)`
        op = d > DEPTH ? 0 : 1
        br = 1 - Math.min(d, DEPTH) * 0.12
      }
      el.style.transform = tf
      el.style.opacity = String(op)
      el.style.filter = `brightness(${br})`
      el.style.zIndex = String(1000 - i)
      el.style.pointerEvents = Math.abs(d) < 0.5 ? 'auto' : 'none'
    })
    const a = Math.round(pos)
    setActive((cur) => (cur === a ? cur : a))
    if (headRef.current) headRef.current.style.fontVariationSettings = `'wdth' ${60 + v * 60}, 'wght' 800`
  }

  useMotionValueEvent(scrollYProgress, 'change', layout)
  useEffect(() => layout(scrollYProgress.get()), [n])

  const t = tracks[active]

  return (
    <section ref={sec} className="crate" style={{ height: `${100 + n * 22}vh` }}>
      <div className="crate-pin">
        <div className="crate-copy">
          <h1 ref={headRef} className="crate-title">
            {title}
          </h1>
          <p className="crate-lede">{lede}</p>
          <div className="crate-now" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              {t && (
                <motion.div
                  key={t.id}
                  className="crate-now-text"
                  initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
                  transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <div className="crate-rank">{String(active + 1).padStart(2, '0')}</div>
                  <div className="crate-song">{t.title}</div>
                  <div className="crate-artist">{t.artist}</div>
                </motion.div>
              )}
            </AnimatePresence>
            <button className="btn btn-primary crate-play" onClick={() => playList(tracks, active)} disabled={!t} aria-label="Play from here">
              <Play size={15} fill="currentColor" strokeWidth={0} /> <span className="crate-play-label">Play from here</span>
            </button>
          </div>
          <div className="crate-progress" aria-hidden="true">
            {tracks.map((_, i) => (
              <i key={i} className={i === active ? 'is-on' : i < active ? 'is-past' : ''} />
            ))}
          </div>
        </div>

        <div className="crate-stage">
          <div className="crate-box" aria-hidden="true" />
          <div className="crate-stack">
            {tracks.map((tr, i) => (
              <button
                key={tr.id}
                ref={(el) => (cards.current[i] = el)}
                className="crate-card"
                data-cursor="play"
                onClick={() => playList(tracks, i)}
                aria-label={`Play ${tr.title} by ${tr.artist}`}
                tabIndex={i === active ? 0 : -1}
              >
                <img src={trackArt(tr, 600)} alt="" draggable={false} loading={i < 8 ? 'eager' : 'lazy'} />
                <span className="crate-sheen" />
              </button>
            ))}
          </div>
          <div className="crate-front" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}
