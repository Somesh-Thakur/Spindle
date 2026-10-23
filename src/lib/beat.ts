// A shared, per-frame "energy" signal (0–1) from the music. AuraField drives it;
// elements that want to pulse register here instead of every component running
// its own animation loop. Writes go to registered elements only, so the whole
// document isn't restyled every frame.
import { useEffect, type RefObject } from 'react'

const targets = new Set<HTMLElement>()
let energy = 0

export function setEnergy(e: number) {
  energy = e
  const v = e.toFixed(3)
  targets.forEach((el) => el.style.setProperty('--e', v))
}

export const getEnergy = () => energy

/** Keeps `--e` on this element in step with the music. */
export function useBeat(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    targets.add(el)
    return () => {
      targets.delete(el)
    }
  }, [ref])
}
