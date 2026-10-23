import { motion, useMotionTemplate, useScroll, useTransform } from 'framer-motion'
import { useRef, type ReactNode } from 'react'
import { useBeat } from '../lib/beat'
import { useScrollRoot } from '../lib/scroll'

/** Section title whose letters widen from condensed to extended as it scrolls into view. */
export function KineticTitle({ children, as = 'h2', className = '' }: { children: ReactNode; as?: 'h1' | 'h2'; className?: string }) {
  const root = useScrollRoot()
  const ref = useRef<HTMLHeadingElement>(null)
  const { scrollYProgress } = useScroll({ container: root, target: ref, offset: ['start end', 'center 45%'] })
  const wdth = useTransform(scrollYProgress, [0, 1], [52, 118], { clamp: true })
  const opacity = useTransform(scrollYProgress, [0, 0.4], [0, 1])
  const fvs = useMotionTemplate`'wdth' ${wdth}, 'wght' 800`
  const Tag = as === 'h1' ? motion.h1 : motion.h2
  return (
    <Tag ref={ref} className={`kinetic ${className}`} style={{ fontVariationSettings: fvs, opacity }}>
      {children}
    </Tag>
  )
}

/** Endless strip of text, outlined and filled in turn. */
export function Marquee({ items, speed = 60 }: { items: string[]; speed?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useBeat(ref)
  if (!items.length) return null
  const row = (
    <div className="marquee-row">
      {items.map((t, i) => (
        <span key={i} className={i % 2 ? 'mq-outline' : 'mq-fill'}>
          {t}
          <svg className="mq-disc" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="9" />
            <circle cx="10" cy="10" r="2.5" />
          </svg>
        </span>
      ))}
    </div>
  )
  return (
    <div className="marquee" ref={ref} aria-hidden="true" style={{ ['--dur' as string]: `${Math.max(20, items.length * (240 / speed))}s` }}>
      <div className="marquee-track">
        {row}
        {row}
      </div>
    </div>
  )
}
