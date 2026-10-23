import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { COUNTRIES } from '../api/itunes'
import { usePlayer } from '../store/player'

// Windows doesn't draw flag emoji, so use small images from a free flag CDN.
const flag = (code: string) => `https://flagcdn.com/w40/${code}.png`

/** Glass popover for the chart region. `up` opens above the trigger (sidebar footer). */
export function RegionPicker({ up, label = 'Charts from' }: { up?: boolean; label?: string }) {
  const country = usePlayer((s) => s.country)
  const setCountry = usePlayer((s) => s.setCountry)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = COUNTRIES.find((c) => c.code === country) ?? COUNTRIES[0]

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('pointerdown', away)
    addEventListener('keydown', esc)
    return () => {
      removeEventListener('pointerdown', away)
      removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className={`region ${up ? 'region-up' : ''}`} ref={ref}>
      <button className="region-trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <img src={flag(current.code)} alt="" className="region-flag" />
        <span className="region-text">
          <small>{label}</small>
          <b>{current.name}</b>
        </span>
        <ChevronsUpDown size={15} className="region-chev" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            className="region-menu glass"
            role="listbox"
            aria-label="Chart region"
            initial={{ opacity: 0, y: up ? 8 : -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: up ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {COUNTRIES.map((c, i) => (
              <motion.li key={c.code} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.015 }}>
                <button
                  role="option"
                  aria-selected={c.code === country}
                  className={c.code === country ? 'is-on' : ''}
                  onClick={() => {
                    setCountry(c.code)
                    setOpen(false)
                  }}
                >
                  <img src={flag(c.code)} alt="" className="region-flag" loading="lazy" />
                  <span>{c.name}</span>
                  {c.code === country && <Check size={15} />}
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
