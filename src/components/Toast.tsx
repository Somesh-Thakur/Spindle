import { AnimatePresence, motion } from 'framer-motion'
import { create } from 'zustand'

interface ToastState {
  items: { id: number; text: string }[]
}
const useToasts = create<ToastState>(() => ({ items: [] }))

export function toast(text: string) {
  const id = Date.now() + Math.random()
  useToasts.setState((s) => ({ items: [...s.items.slice(-2), { id, text }] }))
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((i) => i.id !== id) })), 2600)
}

export function Toasts() {
  const items = useToasts((s) => s.items)
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            className="toast glass"
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
