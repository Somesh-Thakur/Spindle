import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface RecentSearches {
  items: string[]
  add: (q: string) => void
  remove: (q: string) => void
  clear: () => void
}

/** Searches that led somewhere (a song played, a page opened). Kept on this device. */
export const useRecentSearches = create<RecentSearches>()(
  persist(
    (set, get) => ({
      items: [],
      add: (q) => {
        const v = q.trim()
        if (!v) return
        set({ items: [v, ...get().items.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 8) })
      },
      remove: (q) => set({ items: get().items.filter((x) => x !== q) }),
      clear: () => set({ items: [] }),
    }),
    { name: 'spindle:searches' },
  ),
)
