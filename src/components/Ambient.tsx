import { useEffect } from 'react'
import { usePlayer } from '../store/player'

/** Publishes the current artwork palette as CSS variables for the player and headers. */
export function Ambient() {
  const palette = usePlayer((s) => s.palette)
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--art-base', palette.base)
    r.setProperty('--art-accent', palette.accent)
    r.setProperty('--art-glow', palette.glow)
  }, [palette])
  return null
}
