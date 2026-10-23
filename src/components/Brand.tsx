import { usePlayer } from '../store/player'

export const BRAND = 'Spindle'

/**
 * The mark: a record seen from above, grooves catching the light, the centre
 * spindle in the brand colour, and a tonearm resting on the outer groove.
 */
export function Logo({ size = 28, spinning = false }: { size?: number; spinning?: boolean }) {
  return (
    <svg className={`logo ${spinning ? 'is-spinning' : ''}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <radialGradient id="lg-disc" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#2a2730" />
          <stop offset="1" stopColor="#0b0a0e" />
        </radialGradient>
        <linearGradient id="lg-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="logo-disc">
        <circle cx="15" cy="17" r="13" fill="url(#lg-disc)" />
        <circle cx="15" cy="17" r="10.2" fill="none" stroke="#fff" strokeOpacity=".09" />
        <circle cx="15" cy="17" r="7.6" fill="none" stroke="#fff" strokeOpacity=".07" />
        <path d="M6 9.5a13 13 0 0 1 9-5.4" fill="none" stroke="url(#lg-shine)" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="15" cy="17" r="4.6" fill="var(--accent, #ff3b5c)" />
        <circle cx="15" cy="17" r="1.3" fill="#f6f3ec" />
      </g>
      {/* Tonearm */}
      <path d="M28.5 2.5v11.5l-6 5.5" fill="none" stroke="#e9e6df" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="28.5" cy="2.8" r="2" fill="#e9e6df" />
      <rect x="20.2" y="18.2" width="3.6" height="2.4" rx=".6" transform="rotate(-42 22 19.4)" fill="#e9e6df" />
    </svg>
  )
}

/** "spindle", with the dot of the i drawn as a tiny record that spins while music plays. */
export function Wordmark() {
  const playing = usePlayer((s) => s.isPlaying)
  return (
    <span className={`wordmark ${playing ? 'is-playing' : ''}`} aria-label={BRAND}>
      <span aria-hidden="true">sp</span>
      <span className="wm-i" aria-hidden="true">
        ı<span className="wm-dot" />
      </span>
      <span aria-hidden="true">ndle</span>
    </span>
  )
}
