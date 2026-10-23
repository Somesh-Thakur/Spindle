import { PencilLine, RotateCcw } from 'lucide-react'
import type { Lyrics } from '../api/lyrics'
import type { Track } from '../lib/types'
import { usePlayer } from '../store/player'
import { openLyricsEditor, resetUserLyrics } from './LyricsEditor'

/** Script switch for Hindi lyrics: Hinglish (Latin letters) or Devanagari. */
export function ScriptToggle() {
  const hinglish = usePlayer((s) => s.hinglish)
  const set = (v: boolean) => usePlayer.setState({ hinglish: v })
  return (
    <div className="seg seg-sm" role="radiogroup" aria-label="Lyrics script">
      <button role="radio" aria-checked={hinglish} className={hinglish ? 'is-on' : ''} onClick={() => set(true)}>
        Hinglish
      </button>
      <button role="radio" aria-checked={!hinglish} className={!hinglish ? 'is-on' : ''} onClick={() => set(false)} lang="hi">
        हिन्दी
      </button>
    </div>
  )
}

/** Shown when nothing was found online: the listener can add the words themselves. */
export function NoLyrics({ track, compact }: { track: Track; compact?: boolean }) {
  return (
    <div className={`no-lyrics ${compact ? 'is-compact' : ''}`}>
      <p>No lyrics found online for this song.</p>
      <button className="btn btn-primary" onClick={() => openLyricsEditor(track)}>
        <PencilLine size={15} /> Add lyrics
      </button>
      <small>Paste them in, then tap along to time each line. They're saved on this device.</small>
    </div>
  )
}

/** Credit plus the right fix-it action for whatever lyrics we have. */
export function LyricsFooter({ track, data }: { track: Track; data: Lyrics }) {
  return (
    <div className="lyrics-foot">
      <span>{data.source === 'you' ? 'Lyrics added by you' : `Lyrics from ${data.source ?? 'LRCLIB'}`}</span>
      {!data.synced && (
        <button onClick={() => openLyricsEditor(track, data.lines)}>
          <PencilLine size={13} /> Sync to the song
        </button>
      )}
      {data.source === 'you' ? (
        <button onClick={() => resetUserLyrics(track)}>
          <RotateCcw size={13} /> Use online lyrics
        </button>
      ) : (
        <button onClick={() => openLyricsEditor(track)}>
          <PencilLine size={13} /> Replace
        </button>
      )}
    </div>
  )
}
