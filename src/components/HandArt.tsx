import type { CSSProperties } from 'react'

/**
 * Drawn hands for the turntable cursor: the back of a right hand seen from
 * above, reaching for the record (open), or with the fingers curled under,
 * pressing into the vinyl to turn it (grab).
 *
 * What keeps it from looking like an icon: fingers taper from knuckle to tip,
 * each gets a soft blurred highlight down its length so it reads as round,
 * there are no hard outlines (only a faint darker edge), and nails are small.
 */

type P = [number, number]

interface Finger {
  base: P
  tip: P
  /** Width at the knuckle and at the tip. */
  wb: number
  wt: number
  /** Curled under (grab): no nail, a rounded knuckle end that falls into shadow. */
  curled?: boolean
}

const OPEN: Finger[] = [
  { base: [22.5, 45], tip: [14.2, 35.5], wb: 8.6, wt: 6.4 }, // thumb
  { base: [27.2, 35], tip: [26.2, 10.5], wb: 7.2, wt: 5.5 },
  { base: [33.2, 34], tip: [33, 6.5], wb: 7.6, wt: 5.8 },
  { base: [39.2, 35], tip: [39.8, 10.8], wb: 7.1, wt: 5.4 },
  { base: [44.4, 38], tip: [45.8, 20], wb: 6.2, wt: 4.8 },
]

const GRAB: Finger[] = [
  { base: [22.5, 45], tip: [15.8, 36], wb: 8.6, wt: 7.2, curled: true },
  { base: [27.2, 35], tip: [26, 23.5], wb: 7.6, wt: 7, curled: true },
  { base: [33.2, 34], tip: [33, 21], wb: 8, wt: 7.4, curled: true },
  { base: [39.2, 35], tip: [40.2, 23.5], wb: 7.5, wt: 6.9, curled: true },
  { base: [44.4, 38], tip: [46.4, 28.5], wb: 6.6, wt: 6.1, curled: true },
]

/** How far the hand leans, as if reaching across the record. */
const LEAN = -24
export const HAND_SIZE = 88

/** Pixel position of the middle fingertip in the rendered SVG, so it can sit on the pointer. */
function tipPx(pose: Finger[]): [number, number] {
  const [x, y] = pose[2].tip
  const a = (LEAN * Math.PI) / 180
  const dx = x - 32
  const dy = y - 40
  const k = HAND_SIZE / 64
  return [(32 + dx * Math.cos(a) - dy * Math.sin(a)) * k, (40 + dx * Math.sin(a) + dy * Math.cos(a)) * k]
}
export const HAND_TIP = { open: tipPx(OPEN), grab: tipPx(GRAB) }

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]]
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k]
const f1 = (n: number) => n.toFixed(2)

/** A tapered capsule from base to tip, rounded at the tip. */
function capsule(base: P, tip: P, wb: number, wt: number) {
  const d = sub(tip, base)
  const len = Math.hypot(d[0], d[1])
  const u = mul(d, 1 / len)
  const n: P = [-u[1], u[0]]
  const bl = add(base, mul(n, wb / 2))
  const br = add(base, mul(n, -wb / 2))
  const tl = add(tip, mul(n, wt / 2))
  const tr = add(tip, mul(n, -wt / 2))
  const r = wt / 2
  return `M${f1(bl[0])} ${f1(bl[1])} L${f1(tl[0])} ${f1(tl[1])} A${f1(r)} ${f1(r)} 0 0 0 ${f1(tr[0])} ${f1(tr[1])} L${f1(br[0])} ${f1(br[1])} Z`
}

function FingerShape({ f }: { f: Finger }) {
  const d = sub(f.tip, f.base)
  const len = Math.hypot(d[0], d[1])
  const u = mul(d, 1 / len)
  const n: P = [-u[1], u[0]]
  const angle = (Math.atan2(u[1], u[0]) * 180) / Math.PI + 90
  // Highlight: a narrower capsule nudged toward the light (upper left).
  const hl = mul(n, f.wb * 0.12)
  const hBase = add(add(f.base, mul(u, len * 0.1)), hl)
  const hTip = add(add(f.tip, mul(u, -f.wt * 0.35)), hl)
  const nail = add(f.tip, mul(u, -f.wt * 0.55))
  const crease = (t: number, w: number) => {
    const c = add(f.base, mul(d, t))
    const a = add(c, mul(n, w / 2.6))
    const b = add(c, mul(n, -w / 2.6))
    const ctl = add(c, mul(u, 0.7))
    return `M${f1(a[0])} ${f1(a[1])} Q${f1(ctl[0])} ${f1(ctl[1])} ${f1(b[0])} ${f1(b[1])}`
  }
  const wMid = (f.wb + f.wt) / 2
  return (
    <g>
      <path d={capsule(f.base, f.tip, f.wb, f.wt)} fill="url(#hand-skin)" stroke="#8f5a3d" strokeOpacity=".22" strokeWidth=".5" />
      <path d={capsule(hBase, hTip, f.wb * 0.42, f.wt * 0.38)} fill="#fbe6d6" opacity=".55" filter="url(#hand-soft)" />
      {f.curled ? (
        // The curled finger turns down into the record; its end falls into shadow.
        <ellipse cx={f1(f.tip[0] - u[0] * 0.6)} cy={f1(f.tip[1] - u[1] * 0.6)} rx={f1(f.wt * 0.4)} ry={f1(f.wt * 0.22)} transform={`rotate(${f1(angle)} ${f1(f.tip[0])} ${f1(f.tip[1])})`} fill="#a86c4b" opacity=".2" filter="url(#hand-soft)" />
      ) : (
        <g transform={`rotate(${f1(angle)} ${f1(nail[0])} ${f1(nail[1])})`}>
          <rect x={f1(nail[0] - f.wt * 0.33)} y={f1(nail[1] - f.wt * 0.5)} width={f1(f.wt * 0.66)} height={f1(f.wt * 0.95)} rx={f1(f.wt * 0.3)} fill="#efc7b4" stroke="#b9826a" strokeOpacity=".35" strokeWidth=".35" />
          <rect x={f1(nail[0] - f.wt * 0.18)} y={f1(nail[1] - f.wt * 0.38)} width={f1(f.wt * 0.22)} height={f1(f.wt * 0.55)} rx={f1(f.wt * 0.11)} fill="#fff" opacity=".35" />
        </g>
      )}
      <path d={crease(f.curled ? 0.72 : 0.5, wMid)} stroke="#8f5a3d" strokeOpacity=".28" strokeWidth=".45" fill="none" strokeLinecap="round" />
      {!f.curled && <path d={crease(0.53, wMid * 0.8)} stroke="#8f5a3d" strokeOpacity=".18" strokeWidth=".35" fill="none" strokeLinecap="round" />}
    </g>
  )
}

export function HandArt({ grab = false, className = '', style }: { grab?: boolean; className?: string; style?: CSSProperties }) {
  const fingers = grab ? GRAB : OPEN
  const [thumb, ...rest] = fingers
  return (
    <svg className={className} style={style} viewBox="0 0 64 64" width={HAND_SIZE} height={HAND_SIZE} aria-hidden="true">
      <defs>
        <linearGradient id="hand-skin" gradientUnits="userSpaceOnUse" x1="12" y1="10" x2="52" y2="50">
          <stop offset="0" stopColor="#efc8a9" />
          <stop offset=".55" stopColor="#dca784" />
          <stop offset="1" stopColor="#c08463" />
        </linearGradient>
        <radialGradient id="hand-back" gradientUnits="userSpaceOnUse" cx="30" cy="40" r="22">
          <stop offset="0" stopColor="#eec6a6" />
          <stop offset=".65" stopColor="#d9a481" />
          <stop offset="1" stopColor="#bd8160" />
        </radialGradient>
        <filter id="hand-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation=".9" />
        </filter>
      </defs>
      <g transform={`rotate(${LEAN} 32 40)`}>
        {/* Thumb sits under the palm's edge; the fingers rise from the knuckle line. */}
        <FingerShape f={thumb} />
        {rest.map((f, i) => (
          <FingerShape key={i} f={f} />
        ))}
        {/* Back of the hand and wrist as one shape: wide at the knuckles, narrowing to the wrist. */}
        <path
          d="M20.6 38.4 C21 33.8 25 32 33 32 C41 32 47.2 34 47.1 39.6 C47 45.4 44.8 50.6 41.4 57 L42 74 L25.6 74 L26 57 C22.8 51.4 20.4 45.6 20.6 38.4 Z"
          fill="url(#hand-back)"
          stroke="#8f5a3d"
          strokeOpacity=".2"
          strokeWidth=".5"
        />
        {/* Knuckles catch the light; tendons fan out faintly toward the wrist. */}
        <g fill="#fbe6d6" opacity=".5" filter="url(#hand-soft)">
          <ellipse cx="27" cy="35.2" rx="2.8" ry="1.7" />
          <ellipse cx="33.2" cy="34.2" rx="3" ry="1.8" />
          <ellipse cx="39.3" cy="35.3" rx="2.7" ry="1.6" />
          <ellipse cx="44.3" cy="38.4" rx="2.1" ry="1.4" />
          <ellipse cx="30" cy="44" rx="5.5" ry="6" opacity=".45" />
        </g>
        <path
          d="M27.4 38 C28.3 44 29.6 50 30.6 56 M33.2 37 C33.4 44 33.6 50 33.7 56 M39 38 C38.4 44 37.6 50 36.9 56"
          stroke="#a56b4a"
          strokeOpacity=".09"
          strokeWidth=".7"
          strokeLinecap="round"
          fill="none"
        />
        {grab && <path d="M23 36.5 C28 34.6 38 34.6 46 37.6" stroke="#8f5a3d" strokeOpacity=".22" strokeWidth=".5" fill="none" />}
      </g>
    </svg>
  )
}
