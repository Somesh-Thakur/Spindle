import { AnimatePresence, motion } from 'framer-motion'
import { Heart, ListMusic, Mic2, Captions, PictureInPicture2, SkipForward } from 'lucide-react'
import { canPopOut, popOut } from '../lib/popout'
import { useIsPhone } from '../lib/useIsPhone'
import { useCurrent, usePlayer } from '../store/player'
import { Artwork } from './Artwork'
import { PlayButton, Scrubber, TransportControls, VolumeControl } from './Controls'

export function MiniPlayer() {
  const track = useCurrent()
  const fullOpen = usePlayer((s) => s.fullOpen)
  const resolving = usePlayer((s) => s.resolving)
  const liked = usePlayer((s) => (track ? !!s.liked[track.id] : false))
  const { setFull, toggleLike, next, prev } = usePlayer.getState()
  const phone = useIsPhone()

  return (
    <AnimatePresence>
      {track && (
        <motion.div
          className="bar glass"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          role="region"
          aria-label="Player"
        >
          {/* Phones: swipe sideways to skip, swipe up to open, like Apple Music's mini player. */}
          <motion.button
            className="bar-now"
            // onTap, not onClick: a swipe shouldn't also count as a tap.
            onTap={() => setFull(true)}
            aria-label="Open player"
            drag={phone}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={0.35}
            dragSnapToOrigin
            onDragEnd={(_, i) => {
              const { x, y } = i.offset
              if (Math.abs(x) > Math.abs(y) && Math.abs(x) > 50) (x < 0 ? next() : prev())
              else if (y < -30 || i.velocity.y < -400) setFull(true)
            }}
          >
            {!fullOpen ? (
              <motion.div layoutId="np-art" className="bar-art" transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
                <Artwork src={track.art} size={48} />
              </motion.div>
            ) : (
              <div className="bar-art" />
            )}
            <span className="bar-text">
              <span className="bar-title">{track.title}</span>
              <span className="bar-sub">{resolving ? 'Finding the full song…' : track.artist}</span>
            </span>
          </motion.button>
          <button
            className={`ctl ctl-minor bar-like ${liked ? 'is-on' : ''}`}
            onClick={() => toggleLike(track)}
            aria-label={liked ? 'Remove from liked songs' : 'Add to liked songs'}
            aria-pressed={liked}
          >
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
          </button>

          <div className="bar-center">
            <TransportControls />
            <Scrubber compact />
          </div>

          <div className="bar-right">
            <button className="ctl ctl-minor" onClick={() => (usePlayer.setState({ karaoke: true }), setFull(true))} aria-label="Karaoke mode">
              <Mic2 size={16} />
            </button>
            <button className="ctl ctl-minor" onClick={() => (usePlayer.setState({ panel: 'lyrics' }), setFull(true))} aria-label="Lyrics">
              <Captions size={16} />
            </button>
            <button className="ctl ctl-minor" onClick={() => (usePlayer.setState({ panel: 'queue' }), setFull(true))} aria-label="Up next">
              <ListMusic size={16} />
            </button>
            {canPopOut && (
              <button className="ctl ctl-minor" onClick={popOut} aria-label="Pop out mini player" title="Mini player, always on top">
                <PictureInPicture2 size={16} />
              </button>
            )}
            <VolumeControl />
          </div>

          <div className="bar-phone">
            <PlayButton size={18} />
            <button className="ctl" onClick={() => next()} aria-label="Next">
              <SkipForward size={18} fill="currentColor" strokeWidth={0} />
            </button>
          </div>
          <div className="bar-progress-phone" aria-hidden="true">
            <Scrubber compact />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
