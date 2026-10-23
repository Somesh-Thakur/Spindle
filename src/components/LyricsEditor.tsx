import { AnimatePresence, motion } from 'framer-motion'
import { Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { deleteUserLyrics, parsePasted, saveUserLyrics, type LyricLine } from '../api/lyrics'
import { currentTime } from '../lib/engine'
import type { Track } from '../lib/types'
import { usePlayer } from '../store/player'
import { seek } from './AudioEngine'
import { toast } from './Toast'

interface EditorState {
  open: boolean
  /** Lines to start from: existing unsynced lyrics, or empty for a fresh paste. */
  seed: LyricLine[]
  track?: Track
}
const useEditor = create<EditorState>(() => ({ open: false, seed: [] }))

export function openLyricsEditor(track: Track, seed: LyricLine[] = []) {
  useEditor.setState({ open: true, track, seed })
}

const close = () => useEditor.setState({ open: false })
const refresh = () => usePlayer.setState((s) => ({ lyricsNonce: s.lyricsNonce + 1 }))

/**
 * Add lyrics to any song: paste the words, then tap along while it plays to
 * time each line. Saved on this device and used in place of any online lyrics.
 */
export function LyricsEditor() {
  const { open, track, seed } = useEditor()
  return <AnimatePresence>{open && track && <Editor key={track.id} track={track} seed={seed} />}</AnimatePresence>
}

function Editor({ track, seed }: { track: Track; seed: LyricLine[] }) {
  const [step, setStep] = useState<'paste' | 'sync'>(seed.length ? 'sync' : 'paste')
  const [text, setText] = useState(seed.map((l) => l.text).join('\n'))
  const [lines, setLines] = useState<LyricLine[]>(seed.filter((l) => l.text.trim()))
  const [times, setTimes] = useState<number[]>([])
  const [started, setStarted] = useState(false)
  const done = times.length >= lines.length && lines.length > 0

  const savePlain = () => {
    const ls = parsePasted(text)
    if (!ls.some((l) => l.text)) return
    const synced = ls.every((l) => l.time != null || !l.text)
    saveUserLyrics(track.id, { lines: ls, synced })
    refresh()
    toast(synced ? 'Lyrics saved' : 'Lyrics saved. Sync them to sing along in karaoke.')
    close()
  }

  const toSync = () => {
    const ls = parsePasted(text).filter((l) => l.text)
    if (!ls.length) return
    setLines(ls)
    setTimes([])
    setStep('sync')
  }

  const start = () => {
    setTimes([])
    setStarted(true)
    seek(0)
    usePlayer.getState().setPlaying(true)
  }

  // People react a little after a line starts; pull each tap back to compensate.
  const tap = () => {
    if (!started || done) return
    setTimes((t) => [...t, Math.max(0, currentTime() - 0.2)])
  }
  const undo = () => {
    setTimes((t) => t.slice(0, -1))
    seek(Math.max(0, (times.at(-2) ?? 0) - 1))
  }

  const saveSynced = () => {
    saveUserLyrics(track.id, { lines: lines.map((l, i) => ({ text: l.text, time: times[i] ?? null })), synced: true })
    refresh()
    toast('Synced lyrics saved')
    close()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close()
      if (step !== 'sync' || !started) return
      if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopImmediatePropagation()
        tap()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const i = times.length

  return (
    <motion.div className="ledit-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
      <motion.div
        className="ledit glass"
        role="dialog"
        aria-modal="true"
        aria-label={`Lyrics for ${track.title}`}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ledit-head">
          <div>
            <h2>{step === 'paste' ? 'Add lyrics' : 'Sync lyrics'}</h2>
            <p>
              {track.title}, {track.artist}
            </p>
          </div>
          <button className="ctl" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {step === 'paste' ? (
          <>
            <p className="ledit-help">Paste the words, one line per row. Timed LRC files work too.</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste lyrics here" autoFocus spellCheck={false} />
            <footer className="ledit-foot">
              <button className="btn" onClick={savePlain} disabled={!text.trim()}>
                Save without timing
              </button>
              <button className="btn btn-primary" onClick={toSync} disabled={!text.trim()}>
                Next: sync to the song
              </button>
            </footer>
          </>
        ) : (
          <>
            <p className="ledit-help">
              {started
                ? 'Tap, or press Space, the moment each highlighted line starts.'
                : 'The song restarts from the beginning. Tap, or press Space, each time a new line starts.'}
            </p>
            <div className="ledit-sync">
              <p className="ls-prev">{lines[i - 1]?.text ?? ' '}</p>
              <p className="ls-now">{done ? 'All lines timed.' : lines[i]?.text}</p>
              <p className="ls-next">{lines[i + 1]?.text ?? ' '}</p>
              <div className="ls-progress">
                <i style={{ width: `${(i / lines.length) * 100}%` }} />
              </div>
              <span className="ls-count">
                {Math.min(i, lines.length)} of {lines.length} lines
              </span>
            </div>
            <footer className="ledit-foot">
              {!started ? (
                <>
                  <button className="btn" onClick={() => setStep('paste')}>
                    Edit text
                  </button>
                  <button className="btn btn-primary" onClick={start}>
                    Start syncing
                  </button>
                </>
              ) : done ? (
                <>
                  <button className="btn" onClick={start}>
                    Start over
                  </button>
                  <button className="btn btn-primary" onClick={saveSynced}>
                    Save synced lyrics
                  </button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={undo} disabled={!i}>
                    <Undo2 size={15} /> Undo
                  </button>
                  <button className="btn btn-primary ls-tap" onClick={tap}>
                    Line starts now
                  </button>
                </>
              )}
            </footer>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

/** Remove the listener's own lyrics and go back to the online ones. */
export function resetUserLyrics(track: Track) {
  deleteUserLyrics(track.id)
  refresh()
  toast('Back to the online lyrics')
}
