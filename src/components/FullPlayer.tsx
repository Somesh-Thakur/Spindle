import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { ChevronDown, Disc3, Heart, ListMusic, Mic2, Captions, Video, Share } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { trackArt, year } from '../lib/format'
import { useIsPhone } from '../lib/useIsPhone'
import { openShare, trackShare } from '../lib/share'
import { useCurrent, usePlayer } from '../store/player'
import { AddedBadge } from './AddedBadge'
import { Scrubber, TransportControls, VolumeControl } from './Controls'
import { Deck } from './Deck'
import { KaraokeStage } from './Karaoke'
import { LyricsPanel, QueuePanel } from './Panels'
import { TrackMenu } from './TrackRow'

export function FullPlayer() {
  const open = usePlayer((s) => s.fullOpen)
  const track = useCurrent()
  return <AnimatePresence>{open && track && <Sheet key="full" />}</AnimatePresence>
}

/** Whether the big video slot is showing (phones always show video for YouTube playback). */
export function useVideoInSlot() {
  const mode = usePlayer((s) => s.mode)
  const videoView = usePlayer((s) => s.videoView)
  const karaoke = usePlayer((s) => s.karaoke)
  const phone = useIsPhone()
  return mode === 'yt' && !karaoke && (videoView || phone)
}

const ease = [0.2, 0.8, 0.2, 1] as const

function Sheet() {
  const track = useCurrent()!
  const isPlaying = usePlayer((s) => s.isPlaying)
  const mode = usePlayer((s) => s.mode)
  const panel = usePlayer((s) => s.panel)
  const karaoke = usePlayer((s) => s.karaoke)
  const liked = usePlayer((s) => !!s.liked[track.id])
  const { setFull, toggleLike } = usePlayer.getState()
  const showVideo = useVideoInSlot()
  const phone = useIsPhone()
  const drag = useDragControls()
  const nav = useNavigate()

  const togglePanel = (p: 'lyrics' | 'queue') => usePlayer.setState({ panel: panel === p ? 'none' : p })
  const goArtist = () => {
    if (track.source !== 'itunes' || !track.artistId) return
    setFull(false)
    nav(`/artist/${track.artistId}`)
  }

  return (
    <motion.div
      className={`full ${panel !== 'none' ? 'has-panel' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ duration: 0.42, ease }}
      drag="y"
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.5 }}
      onDragEnd={(_, info) => (info.offset.y > 140 || info.velocity.y > 600) && setFull(false)}
    >
      <div className="full-bg" aria-hidden="true">
        <AnimatePresence>
          <motion.img
            key={track.id}
            src={trackArt(track, 200)}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
          />
        </AnimatePresence>
        <div className="full-bg-scrim" />
      </div>

      <AnimatePresence>{karaoke && <KaraokeStage key="k" track={track} />}</AnimatePresence>
      <header className="full-top" onPointerDown={(e) => drag.start(e)} hidden={karaoke}>
        <button className="ctl full-close" onClick={() => setFull(false)} aria-label="Close player">
          <ChevronDown size={24} />
        </button>
        {mode === 'yt' && !phone ? (
          <div className="seg" role="tablist" aria-label="View">
            <button role="tab" aria-selected={!showVideo} className={!showVideo ? 'is-on' : ''} onClick={() => usePlayer.setState({ videoView: false })}>
              <Disc3 size={15} /> Record
            </button>
            <button role="tab" aria-selected={showVideo} className={showVideo ? 'is-on' : ''} onClick={() => usePlayer.setState({ videoView: true })}>
              <Video size={15} /> Video
            </button>
          </div>
        ) : (
          <span className="grabber" aria-hidden="true" />
        )}
        <div className="full-tabs">
          <button className="k-enter" onClick={() => usePlayer.setState({ karaoke: true })} aria-label="Karaoke mode">
            <Mic2 size={16} /> <span>Karaoke</span>
          </button>
          <button className={`ctl ctl-minor ${panel === 'lyrics' ? 'is-on' : ''}`} onClick={() => togglePanel('lyrics')} aria-pressed={panel === 'lyrics'} aria-label="Lyrics">
            <Captions size={18} />
          </button>
          <button className={`ctl ctl-minor ${panel === 'queue' ? 'is-on' : ''}`} onClick={() => togglePanel('queue')} aria-pressed={panel === 'queue'} aria-label="Up next">
            <ListMusic size={18} />
          </button>
        </div>
      </header>

      <div className="full-body" hidden={karaoke}>
        <div className="full-main">
          <div className="full-stage">
            {showVideo ? <div className="video-slot" data-video-slot /> : <Deck track={track} playing={isPlaying} onToggle={() => usePlayer.getState().toggle()} />}
          </div>

          <div className="full-info">
            <div className="full-meta">
              <div className="full-meta-text">
                <h1 className="full-title">{track.title}</h1>
                <p className="full-artist">
                  <button onClick={goArtist} disabled={track.source !== 'itunes'}>
                    {track.artist}
                  </button>
                  {track.album && <span className="full-album"> — {track.album}</span>}
                  {track.releaseDate && <span className="full-album">, {year(track.releaseDate)}</span>}
                </p>
              </div>
              <div className="full-actions">
                <button
                  className={`ctl ctl-minor ${liked ? 'is-on' : ''}`}
                  onClick={() => toggleLike(track)}
                  aria-label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
                  aria-pressed={liked}
                >
                  <Heart size={20} fill={liked ? 'currentColor' : 'none'} />
                </button>
                <button className="ctl ctl-minor" onClick={() => openShare(trackShare(track))} aria-label="Share song">
                  <Share size={19} />
                </button>
                <TrackMenu track={track} className="menu-up" />
              </div>
            </div>
            <AddedBadge track={track} />
            <Scrubber />
            <TransportControls big />
            <div className="full-volume">
              <VolumeControl wide />
            </div>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {panel !== 'none' && (
            <motion.aside
              key={panel}
              className="full-panel"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.25, ease }}
            >
              {panel === 'lyrics' ? <LyricsPanel track={track} /> : <QueuePanel />}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
