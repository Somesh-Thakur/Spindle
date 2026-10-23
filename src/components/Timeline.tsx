import { useMotionValueEvent, useScroll } from 'framer-motion'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ERAS } from '../lib/catalog'
import { useScrollRoot } from '../lib/scroll'

/** Vertical scroll drives a horizontal walk through the decades. */
export function Timeline() {
  const root = useScrollRoot()
  const sec = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ container: root, target: sec, offset: ['start start', 'end end'] })

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const t = track.current
    const p = pin.current
    if (!t || !p) return
    const max = t.scrollWidth - p.clientWidth
    t.style.transform = `translate3d(${-v * max}px, 0, 0)`
    // Each year's outline fills in as it reaches the centre.
    t.querySelectorAll<HTMLElement>('.tl-panel').forEach((el) => {
      const r = el.getBoundingClientRect()
      const mid = r.left + r.width / 2 - (p.getBoundingClientRect().left + p.clientWidth / 2)
      const k = Math.max(0, 1 - Math.abs(mid) / (p.clientWidth * 0.6))
      el.style.setProperty('--k', k.toFixed(3))
    })
  })

  return (
    <section ref={sec} className="timeline" style={{ height: `${ERAS.length * 70 + 60}vh` }}>
      <div className="tl-pin" ref={pin}>
        <h2 className="tl-head">Through the decades</h2>
        <div className="tl-track" ref={track}>
          {ERAS.map((e) => (
            <Link key={e.key} to={`/era/${e.key}`} className="tl-panel" data-cursor="open" style={{ ['--tint' as string]: e.tint }}>
              <span className="tl-year" style={{ ['--len' as string]: e.short.length }}>
                {e.short}
              </span>
              <span className="tl-blurb">{e.blurb}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
