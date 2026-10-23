import { useEffect, useMemo, useRef, useState } from 'react'
import { wordsOf, type LyricLine, type Word } from '../api/lyrics'
import { currentTime } from '../lib/engine'
import { usePlayer } from '../store/player'

export interface Timed {
  lines: LyricLine[]
  words: Word[][]
}

export function useTimed(lines: LyricLine[]): Timed {
  return useMemo(() => ({ lines, words: lines.map((_, i) => wordsOf(lines, i)) }), [lines])
}

/**
 * Runs the lyric clock: returns the active line, and every frame writes each
 * word's fill (`--p`, 0–1) straight onto its span in `root`, so the sweep is
 * smooth without re-rendering React 60 times a second.
 */
export function useLyricClock(timed: Timed, enabled: boolean, root: React.RefObject<HTMLElement>) {
  const [active, setActive] = useState(-1)
  const activeRef = useRef(-1)

  useEffect(() => {
    if (!enabled) return
    let raf = 0
    const loop = () => {
      const t = currentTime() + usePlayer.getState().lyricOffset
      const { lines, words } = timed
      let idx = -1
      for (let i = 0; i < lines.length; i++) if ((lines[i].time ?? Infinity) <= t + 0.15) idx = i
      if (idx !== activeRef.current) {
        // Clear inline fills on the line we're leaving; CSS takes over (past = full).
        root.current?.querySelectorAll<HTMLElement>(`[data-l="${activeRef.current}"] .w`).forEach((el) => {
          el.style.removeProperty('--p')
          el.classList.remove('on')
        })
        activeRef.current = idx
        setActive(idx)
      }
      if (idx >= 0) {
        const spans = root.current?.querySelectorAll<HTMLElement>(`[data-l="${idx}"] .w`)
        spans?.forEach((el, k) => {
          const w = words[idx][k]
          if (!w) return
          const p = Math.min(1, Math.max(0, (t - w.start) / (w.end - w.start)))
          el.style.setProperty('--p', p.toFixed(3))
          el.classList.toggle('on', p > 0 && p < 1)
        })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [timed, enabled, root])

  return active
}

/** One lyric line split into word spans that the clock can fill. */
export function LineWords({ text }: { text: string }) {
  const parts = text.split(/\s+/).filter(Boolean)
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className="w" data-text={p}>
          {p}
          {i < parts.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  )
}
