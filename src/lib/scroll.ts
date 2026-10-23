import { createContext, useContext, type RefObject } from 'react'

/** The app scrolls inside <main>, not the window, so scroll animations need this element. */
export const ScrollRoot = createContext<RefObject<HTMLElement> | null>(null)

export function useScrollRoot() {
  const ref = useContext(ScrollRoot)
  if (!ref) throw new Error('useScrollRoot outside <ScrollRoot.Provider>')
  return ref
}
