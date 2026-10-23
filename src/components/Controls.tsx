import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { currentTime, totalTime } from '../lib/engine'
import { fmtTime } from '../lib/format'
import { usePlayer } from '../store/player'
import { seek } from './AudioEngine'

export function PlayButton({ size = 22, className = '' }: { size?: number; className?: string }) {
  const isPlaying = usePlayer((s) => s.isPlaying)
  const busy = usePlayer((s) => s.isPlaying && (s.buffering || s.resolving))
  const toggle = usePlayer((s) => s.toggle)
  return (
    <button className={`play-btn ${busy ? 'is-busy' : ''} ${className}`} onClick={(e) => (e.stopPropagation(), toggle())} aria-label={isPlaying ? 'Pause' : 'Play'}>
      {isPlaying ? <Pause size={size} fill="currentColor" strokeWidth={0} /> : <Play size={size} fill="currentColor" strokeWidth={0} />}
    </button>
  )
}

export function TransportControls({ big }: { big?: boolean }) {
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const { next, prev, toggleShuffle, cycleRepeat } = usePlayer.getState()
  const skip = big ? 30 : 18
  const minor = big ? 20 : 16
  return (
    <div className={`transport ${big ? 'transport-big' : ''}`}>
      <button className={`ctl ctl-minor ${shuffle ? 'is-on' : ''}`} onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle}>
        <Shuffle size={minor} />
      </button>
      <button className="ctl" onClick={() => prev()} aria-label="Previous">
        <SkipBack size={skip} fill="currentColor" strokeWidth={0} />
      </button>
      <PlayButton size={big ? 40 : 20} className={big ? 'play-btn-big' : ''} />
      <button className="ctl" onClick={() => next()} aria-label="Next">
        <SkipForward size={skip} fill="currentColor" strokeWidth={0} />
      </button>
      <button className={`ctl ctl-minor ${repeat !== 'off' ? 'is-on' : ''}`} onClick={cycleRepeat} aria-label={`Repeat: ${repeat}`}>
        {repeat === 'one' ? <Repeat1 size={minor} /> : <Repeat size={minor} />}
      </button>
    </div>
  )
}

/** Drag-to-seek progress bar. Reads the playback clock each frame so it glides. */
export function Scrubber({ compact }: { compact?: boolean }) {
  const barRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [, force] = useState(0)
  const duration = usePlayer((s) => s.duration)
  const fullLength = usePlayer((s) => s.fullLength)
  const mode = usePlayer((s) => s.mode)

  useEffect(() => {
    let raf = 0
    let lastSec = -1
    const loop = () => {
      const d = totalTime(duration || 1)
      const t = currentTime()
      if (fillRef.current && drag == null) fillRef.current.style.transform = `scaleX(${Math.min(1, t / d)})`
      const sec = Math.floor(t)
      if (sec !== lastSec) ((lastSec = sec), force((n) => n + 1))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [drag, duration])

  const ratioAt = (e: PointerEvent) => {
    const r = barRef.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  }
  const d = totalTime(duration)
  const shown = drag != null ? drag * d : currentTime()
  const paint = (r: number) => fillRef.current && (fillRef.current.style.transform = `scaleX(${r})`)

  return (
    <div className={`scrub ${compact ? 'scrub-compact' : ''} ${drag != null ? 'is-drag' : ''}`}>
      {compact && <span className="scrub-time">{fmtTime(shown)}</span>}
      <div
        className="scrub-bar"
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(d)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={fmtTime(shown)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          const r = ratioAt(e)
          setDrag(r)
          paint(r)
        }}
        onPointerMove={(e) => {
          if (drag == null) return
          const r = ratioAt(e)
          setDrag(r)
          paint(r)
        }}
        onPointerUp={(e) => {
          if (drag == null) return
          seek(ratioAt(e) * d)
          setDrag(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') (e.stopPropagation(), seek(currentTime() + 5))
          if (e.key === 'ArrowLeft') (e.stopPropagation(), seek(currentTime() - 5))
        }}
      >
        <div className="scrub-rail">
          <div className="scrub-fill" ref={fillRef} />
        </div>
      </div>
      {compact ? (
        <span className="scrub-time">-{fmtTime(Math.max(0, d - shown))}</span>
      ) : (
        <div className="scrub-times">
          <span>{fmtTime(shown)}</span>
          {mode !== 'none' && !fullLength && <span className="scrub-tag">Preview</span>}
          <span>-{fmtTime(Math.max(0, d - shown))}</span>
        </div>
      )}
    </div>
  )
}

export function VolumeControl({ wide }: { wide?: boolean }) {
  const volume = usePlayer((s) => s.volume)
  const muted = usePlayer((s) => s.muted)
  const { setVolume, toggleMute } = usePlayer.getState()
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
  const v = muted ? 0 : volume
  const Icon = v === 0 ? VolumeX : v < 0.5 ? Volume1 : Volume2
  const at = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    setVolume((e.clientX - r.left) / r.width)
  }
  return (
    <div className={`volume ${wide ? 'volume-wide' : ''} ${drag ? 'is-drag' : ''}`}>
      <button className="ctl ctl-minor" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
        <Icon size={16} />
      </button>
      <div
        className="vol-bar"
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
        onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), setDrag(true), at(e))}
        onPointerMove={(e) => drag && at(e)}
        onPointerUp={() => setDrag(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), e.stopPropagation(), setVolume(volume + 0.05))
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), e.stopPropagation(), setVolume(volume - 0.05))
        }}
      >
        <div className="scrub-rail">
          <div className="scrub-fill" style={{ transform: `scaleX(${v})` }} />
        </div>
      </div>
      {wide && <Volume2 size={16} className="vol-max" aria-hidden="true" />}
    </div>
  )
}
