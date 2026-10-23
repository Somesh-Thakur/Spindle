/** Little bouncing bars that mark the track that's playing. */
export function Equalizer({ paused }: { paused?: boolean }) {
  return (
    <span className={`eq ${paused ? 'eq-paused' : ''}`} aria-label={paused ? 'Paused' : 'Now playing'}>
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}
