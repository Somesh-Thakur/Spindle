/** A listener's initials in a circle (accounts have no photo yet). */
export function Initials({ name, size = 40 }: { name: string; size?: number }) {
  const letters = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {letters || '♪'}
    </span>
  )
}
