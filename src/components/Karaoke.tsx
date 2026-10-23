import { motion } from 'framer-motion'
import { Minus, Plus, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { currentTime } from '../lib/engine'
import { useSongLyrics } from '../lib/useSongLyrics'
import type { Track } from '../lib/types'
import { usePlayer } from '../store/player'
import { Scrubber, TransportControls } from './Controls'
import { LineWords, useLyricClock, useTimed } from './LyricText'
import { openLyricsEditor } from './LyricsEditor'
import { NoLyrics, ScriptToggle } from './LyricsTools'

/** Vocals control: a live slider for direct audio, Original/Instrumental for YouTube songs. */
function VocalsControl() {
  const mode = usePlayer((s) => s.mode)
  const vocals = usePlayer((s) => s.vocals)
  const inst = usePlayer((s) => s.instrumental)
  const set = (v: number) => usePlayer.setState({ vocals: v })

  if (mode === 'audio')
    return (
      <label className="k-vocals">
        <span>Vocals {Math.round(vocals * 100)}%</span>
        <input type="range" min={0} max={100} value={Math.round(vocals * 100)} onChange={(e) => set(Number(e.target.value) / 100)} aria-label="Vocal level" />
      </label>
    )

  return (
    <div className="k-vocals">
      <span>{inst === 'loading' ? 'Finding instrumental…' : 'Vocals'}</span>
      <div className="seg" role="radiogroup" aria-label="Vocals">
        <button role="radio" aria-checked={vocals >= 0.5} className={vocals >= 0.5 ? 'is-on' : ''} onClick={() => set(1)}>
          On
        </button>
        <button role="radio" aria-checked={vocals < 0.5} className={vocals < 0.5 ? 'is-on' : ''} onClick={() => set(0)}>
          Off
        </button>
      </div>
    </div>
  )
}

function SyncNudge() {
  const offset = usePlayer((s) => s.lyricOffset)
  const nudge = (d: number) => usePlayer.setState({ lyricOffset: Math.round((offset + d) * 100) / 100 })
  return (
    <div className="k-sync">
      <span>Lyrics {offset === 0 ? 'in sync' : `${Math.abs(offset).toFixed(2)}s ${offset > 0 ? 'earlier' : 'later'}`}</span>
      <button className="ctl ctl-minor" onClick={() => nudge(-0.25)} aria-label="Show lyrics later">
        <Minus size={15} />
      </button>
      <button className="ctl ctl-minor" onClick={() => nudge(0.25)} aria-label="Show lyrics earlier">
        <Plus size={15} />
      </button>
    </div>
  )
}

export function KaraokeStage({ track }: { track: Track }) {
  const { data, loading, lines: shown, hindi } = useSongLyrics(track)
  const fullLength = usePlayer((s) => s.fullLength)
  const stageRef = useRef<HTMLDivElement>(null)
  const dotsRef = useRef<HTMLDivElement>(null)
  const synced = !!data?.synced && fullLength
  const timed = useTimed(shown)
  const active = useLyricClock(timed, synced, stageRef)

  // Countdown dots light up over the 3 seconds before the next line, when nothing is being sung.
  useEffect(() => {
    if (!synced) return
    let raf = 0
    const loop = () => {
      const t = currentTime() + usePlayer.getState().lyricOffset
      const { lines, words } = timed
      const next = lines.findIndex((l) => l.text && (l.time ?? -1) > t)
      const prev = next === -1 ? lines.length - 1 : next - 1
      const lastWord = words[prev]?.at(-1)
      const idle = !lastWord || t > lastWord.end + 0.6
      const until = next >= 0 ? (lines[next].time ?? 0) - t : Infinity
      const k = idle && until < 3.2 ? 1 - until / 3.2 : -1
      if (dotsRef.current) {
        dotsRef.current.style.setProperty('--k', String(Math.max(0, k)))
        dotsRef.current.dataset.show = String(k >= 0)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [timed, synced])

  const lines = shown
  const sung = lines.map((l, i) => ({ l, i })).filter((x) => x.l.text)
  const at = Math.max(0, sung.findIndex((x) => x.i >= active))
  const visible = sung.slice(Math.max(0, at - 1), at + 3)

  return (
    <motion.div className="karaoke" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <header className="k-top">
        <div className="k-title">
          <span className="k-badge">Karaoke</span>
          <span className="k-song">
            {track.title} <em>{track.artist}</em>
          </span>
        </div>
        <div className="k-tools">
          {hindi && <ScriptToggle />}
          <VocalsControl />
          {synced && <SyncNudge />}
          <button className="ctl" onClick={() => usePlayer.setState({ karaoke: false })} aria-label="Exit karaoke">
            <X size={20} />
          </button>
        </div>
      </header>

      <div className="k-stage" ref={stageRef}>
        {loading && <p className="k-msg">Finding lyrics…</p>}
        {!loading && !data && <NoLyrics track={track} />}
        {!loading && data && !synced && (
          <div className="k-msg">
            {fullLength ? (
              <>
                <p>These lyrics aren't timed yet, so they can't follow the music.</p>
                <button className="btn btn-primary" onClick={() => openLyricsEditor(track, data.lines)}>
                  Sync them by tapping along
                </button>
              </>
            ) : (
              <p>Karaoke needs the full song. This one is only a preview.</p>
            )}
          </div>
        )}
        {synced && (
          <>
            <div className="k-dots" ref={dotsRef} aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            {visible.map(({ l, i }) => (
              <motion.p
                layout
                key={i}
                data-l={i}
                className={`k-line ${i === active ? 'is-active' : i < active ? 'is-past' : 'is-next'}`}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: i === active ? 1 : i < active ? 0.32 : 0.5, y: 0 }}
                transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <LineWords text={l.text} />
              </motion.p>
            ))}
          </>
        )}
      </div>

      <footer className="k-bottom">
        <Scrubber />
        <TransportControls />
      </footer>
    </motion.div>
  )
}
