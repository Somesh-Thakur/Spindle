import { EyeOff, Maximize2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { usePlayer } from '../store/player'
import { useVideoInSlot } from './FullPlayer'

/**
 * Hosts the single YouTube iframe. It never moves in the DOM (moving an iframe
 * reloads it); instead it's fixed-positioned over whichever slot should show
 * the video: the big slot in the full player, or the picture-in-picture card.
 * YouTube requires the player to stay visible at 200×200 or larger.
 */
export function VideoDock() {
  const ref = useRef<HTMLDivElement>(null)
  const mode = usePlayer((s) => s.mode)
  const started = usePlayer((s) => s.videoStarted)
  const hidden = usePlayer((s) => s.videoHidden)
  const fullOpen = usePlayer((s) => s.fullOpen)
  const setFull = usePlayer((s) => s.setFull)
  const slotVisible = useVideoInSlot()
  const inSlot = fullOpen && slotVisible

  useEffect(() => {
    const el = ref.current!
    if (!inSlot) {
      el.style.cssText = ''
      return
    }
    // Follow the slot every frame so it rides along with the sheet animation.
    let raf = 0
    let last = ''
    const follow = () => {
      const slot = document.querySelector<HTMLElement>('[data-video-slot]')
      if (slot) {
        const r = slot.getBoundingClientRect()
        const css = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;right:auto;bottom:auto;`
        if (css !== last) el.style.cssText = last = css
      }
      raf = requestAnimationFrame(follow)
    }
    raf = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(raf)
  }, [inSlot])

  return (
    <div
      ref={ref}
      className={`vdock ${mode === 'yt' && (started || inSlot) ? 'is-on' : ''} ${inSlot ? 'in-slot' : 'is-pip'} ${fullOpen ? 'over-full' : ''} ${hidden && !inSlot ? 'is-hidden' : ''}`}
      aria-hidden={mode !== 'yt'}
    >
      <div className="vdock-frame">
        <div id="yt-player" />
      </div>
      {!inSlot && (
        <div className="vdock-tools">
          <button onClick={() => usePlayer.setState({ videoHidden: true })} aria-label="Hide video">
            <EyeOff size={14} />
          </button>
          <button onClick={() => (usePlayer.setState({ videoView: true }), setFull(true))} aria-label="Show video in player">
            <Maximize2 size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
