import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  title: string
  subtitle?: string
  to?: string
  children: ReactNode
  /** CSS width of each item. */
  itemWidth?: string
  rows?: number
}

/** A titled, horizontally scrolling row with arrow buttons that appear on hover. */
export function Shelf({ title, subtitle, to, children, itemWidth = 'var(--tile-w)', rows = 1 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })

  const update = () => {
    const el = ref.current
    if (!el) return
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 })
  }
  useEffect(update, [children])

  const page = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' })

  return (
    <section className="shelf">
      <header className="shelf-head">
        <div>
          {title && <h2 className="shelf-title">{title}</h2>}
          {subtitle && <p className="shelf-sub">{subtitle}</p>}
        </div>
        <div className="shelf-nav">
          {to && (
            <Link to={to} className="see-all">
              See all
            </Link>
          )}
          <button className="icon-btn arrow-btn" onClick={() => page(-1)} disabled={edges.start} aria-label="Scroll back">
            <ChevronLeft size={18} />
          </button>
          <button className="icon-btn arrow-btn" onClick={() => page(1)} disabled={edges.end} aria-label="Scroll forward">
            <ChevronRight size={18} />
          </button>
        </div>
      </header>
      <div
        className="shelf-track"
        ref={ref}
        onScroll={update}
        style={{ gridAutoColumns: itemWidth, gridTemplateRows: `repeat(${rows}, auto)` }}
      >
        {children}
      </div>
    </section>
  )
}

export function TileSkeletons({ n = 8, round }: { n?: number; round?: boolean }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div className="tile" key={i} aria-hidden="true">
          <div className={`skel skel-art ${round ? 'art-round' : ''}`} />
          <div className="skel skel-line" />
          <div className="skel skel-line short" />
        </div>
      ))}
    </>
  )
}

export function RowSkeletons({ n = 6 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div className="row" key={i} aria-hidden="true">
          <div className="skel" style={{ width: 40, height: 40, borderRadius: 4 }} />
          <div className="row-main">
            <div className="skel skel-line" />
            <div className="skel skel-line short" />
          </div>
        </div>
      ))}
    </>
  )
}

export function ErrorNote({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="note">
      Music couldn't load. Check your connection{onRetry ? ' and try again.' : '.'}
      {onRetry && (
        <button className="pill-btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
