import { GripVertical, Sparkles, X } from 'lucide-react'
import { Reorder, useDragControls } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { useSongLyrics } from '../lib/useSongLyrics'
import type { Track } from '../lib/types'
import { usePlayer } from '../store/player'
import { Artwork } from './Artwork'
import { seek } from './AudioEngine'
import { Equalizer } from './Equalizer'
import { LineWords, useLyricClock, useTimed } from './LyricText'
import { LyricsFooter, NoLyrics, ScriptToggle } from './LyricsTools'

export function LyricsPanel({ track }: { track: Track }) {
  const { data, loading, lines, hindi } = useSongLyrics(track)
  const fullLength = usePlayer((s) => s.fullLength)
  const offset = usePlayer((s) => s.lyricOffset)
  const listRef = useRef<HTMLDivElement>(null)
  // Previews are a clip from somewhere mid-song, so timestamps wouldn't line up.
  const synced = !!data?.synced && fullLength
  const timed = useTimed(lines)
  const active = useLyricClock(timed, synced, listRef)

  useEffect(() => {
    if (active < 0) return
    listRef.current?.querySelector<HTMLElement>(`[data-l="${active}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])

  if (loading) return <div className="panel-empty">Finding lyrics…</div>
  if (!data) return <NoLyrics track={track} compact />
  if (data.instrumental) return <div className="panel-empty">This one's instrumental. Just listen.</div>

  return (
    <div className={`lyrics ${synced ? 'is-synced' : ''}`} ref={listRef}>
      {hindi && (
        <div className="lyrics-script">
          <ScriptToggle />
        </div>
      )}
      {!fullLength && <p className="lyrics-note">Lyrics for the full song. You're hearing a 30-second preview.</p>}
      {lines.map((l, i) =>
        l.text ? (
          <p
            key={i}
            data-l={i}
            className={`lyric ${i === active ? 'is-active' : ''} ${synced && i < active ? 'is-past' : ''}`}
            onClick={() => synced && l.time != null && seek(l.time - offset)}
          >
            {synced ? <LineWords text={l.text} /> : l.text}
          </p>
        ) : (
          <p key={i} className="lyric-gap" aria-hidden="true">
            ♪
          </p>
        ),
      )}
      <LyricsFooter track={track} data={data} />
    </div>
  )
}

const SHOWN = 100

function QueueItem({ qi, track, added, onPlay, onRemove }: { qi: number; track: Track; added: boolean; onPlay: () => void; onRemove: () => void }) {
  const controls = useDragControls()
  return (
    <Reorder.Item as="div" value={qi} dragListener={false} dragControls={controls} className="q-item q-drag" whileDrag={{ scale: 1.02, boxShadow: '0 18px 40px rgba(0,0,0,.55)', zIndex: 2 }}>
      <span className="q-grip" onPointerDown={(e) => controls.start(e)} aria-label="Drag to reorder" role="button" tabIndex={-1}>
        <GripVertical size={16} />
      </span>
      <button className="q-play" onClick={onPlay} aria-label={`Play ${track.title}`}>
        <Artwork src={track.art} size={44} />
        <span className="q-text">
          <b>{track.title}</b>
          <small>{track.artist}</small>
        </span>
      </button>
      {added && <Sparkles size={14} className="q-added" aria-label="Added for you" />}
      <button className="icon-btn q-remove" onClick={onRemove} aria-label="Remove from queue">
        <X size={15} />
      </button>
    </Reorder.Item>
  )
}

export function QueuePanel() {
  const queue = usePlayer((s) => s.queue)
  const order = usePlayer((s) => s.order)
  const pos = usePlayer((s) => s.pos)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const jumpTo = usePlayer((s) => s.jumpTo)
  const added = usePlayer((s) => s.addedIds)
  const setUpNext = usePlayer((s) => s.setUpNext)
  const removeUpNext = usePlayer((s) => s.removeUpNext)
  const current = queue[order[pos]]
  const upcoming = order.slice(pos + 1)
  const shown = upcoming.slice(0, SHOWN)

  return (
    <div className="queue">
      {current && (
        <>
          <h3 className="queue-head">Now playing</h3>
          <div className="q-item is-active">
            <Artwork src={current.art} size={44} />
            <div className="q-text">
              <b>{current.title}</b>
              <small>{current.artist}</small>
            </div>
            <Equalizer paused={!isPlaying} />
          </div>
        </>
      )}
      <h3 className="queue-head">Up next</h3>
      {upcoming.length === 0 && <div className="panel-empty small">Nothing queued. Use “Play next” on any song to add one.</div>}
      {/* Drag the handle to reorder; the first 100 are draggable, which covers any real queue. */}
      <Reorder.Group as="div" axis="y" values={shown} onReorder={(next) => setUpNext([...next, ...upcoming.slice(SHOWN)])} className="q-list">
        {shown.map((qi, i) => (
          <QueueItem key={qi} qi={qi} track={queue[qi]} added={added.includes(queue[qi].id)} onPlay={() => jumpTo(pos + 1 + i)} onRemove={() => removeUpNext(pos + 1 + i)} />
        ))}
      </Reorder.Group>
      {upcoming.length > SHOWN && <div className="panel-empty small">and {upcoming.length - SHOWN} more</div>}
    </div>
  )
}
