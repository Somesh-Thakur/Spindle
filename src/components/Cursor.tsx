import { Grab, Hand } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

type Mode = '' | 'link' | 'play' | 'open' | 'text' | 'drag' | 'hand' | 'grab'

function modeFor(el: HTMLElement | null): Mode {
  if (!el) return ''
  if (el.closest('input:not([type=range]), textarea, [contenteditable]')) return 'text'
  const tagged = el.closest<HTMLElement>('[data-cursor]')
  if (tagged) return tagged.dataset.cursor as Mode
  if (el.closest('.pl-grip, [role="slider"]')) return 'drag'
  if (el.closest('a, button, select, [role="button"], [role="tab"], [role="radio"], [role="option"], label')) return 'link'
  return ''
}

/**
 * Desktop cursor. The system pointer is hidden (except over text fields),
 * replaced by a dot that tracks the pointer exactly and a ring that eases
 * after it. The ring reads what's underneath: it tightens on links, fills
 * with a play glyph on anything playable, and shows an arrow on things that open.
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!matchMedia('(pointer: fine)').matches) return
    const root = document.documentElement
    root.classList.add('has-cursor')
    let x = -100
    let y = -100
    let rx = x
    let ry = y
    let raf = 0
    let mode: Mode = ''
    let shown = false

    const setMode = (m: Mode) => {
      if (m === mode) return
      mode = m
      ring.current!.dataset.mode = m
      dot.current!.dataset.mode = m
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      x = e.clientX
      y = e.clientY
      if (!shown) {
        shown = true
        rx = x
        ry = y
        root.classList.add('cursor-on')
      }
      // The dot is never late: it's moved here, not in the animation loop.
      // Position with `translate`, not `transform`: CSS applies it last, so the
      // press/hover `scale` shrinks around the cursor instead of pulling it toward 0,0.
      dot.current!.style.translate = `${x}px ${y}px`
      setMode(modeFor(e.target as HTMLElement))
    }
    const onDown = () => root.classList.add('cursor-down')
    const onUp = () => root.classList.remove('cursor-down')
    const onLeave = () => {
      shown = false
      root.classList.remove('cursor-on')
    }
    const loop = () => {
      rx += (x - rx) * 0.28
      ry += (y - ry) * 0.28
      ring.current!.style.translate = `${rx}px ${ry}px`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('pointerdown', onDown)
    addEventListener('pointerup', onUp)
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerdown', onDown)
      removeEventListener('pointerup', onUp)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      root.classList.remove('has-cursor', 'cursor-on', 'cursor-down')
    }
  }, [])

  // On the page itself, above everything: inside the app it would be offset by
  // the desktop title bar and covered by popups.
  return createPortal(
    <>
      <div ref={ring} className="cur-ring" aria-hidden="true">
        <svg className="cur-glyph cur-play" viewBox="0 0 24 24">
          <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
        </svg>
        <Hand className="cur-glyph cur-hand" strokeWidth={1.8} />
        <Grab className="cur-glyph cur-grab" strokeWidth={1.8} />
        <svg className="cur-glyph cur-open" viewBox="0 0 24 24">
          <path d="M8 16 16 8M10 8h6v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div ref={dot} className="cur-dot" aria-hidden="true" />
    </>,
    document.body,
  )
}
