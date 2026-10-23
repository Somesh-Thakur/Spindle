import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useScrollRoot } from '../lib/scroll'

/** Wipes its child in from below the first time it scrolls into view. */
export function Reveal({ children, i = 0, className = '' }: { children: ReactNode; i?: number; className?: string }) {
  const root = useScrollRoot()
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 36, clipPath: 'inset(28% 0% 0% 0% round 14px)' }}
      whileInView={{ opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0% round 14px)' }}
      viewport={{ root, once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay: (i % 6) * 0.06, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}
