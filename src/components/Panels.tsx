import { motion } from 'framer-motion'
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

export function QueuePanel() {
  const queue = usePlayer((s) => s.queue)
  const order = usePlayer((s) => s.order)
  const pos = usePlayer((s) => s.pos)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const jumpTo = usePlayer((s) => s.jumpTo)
  const current = queue[order[pos]]
  const upcoming = order.slice(pos + 1)

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
      {upcoming.map((qi, i) => {
        const t = queue[qi]
        return (
          <motion.button
            layout
            key={`${t.id}-${qi}`}
            className="q-item"
            onClick={() => jumpTo(pos + 1 + i)}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.02 }}
          >
            <Artwork src={t.art} size={44} />
            <div className="q-text">
              <b>{t.title}</b>
              <small>{t.artist}</small>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
