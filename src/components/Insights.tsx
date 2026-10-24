import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { loadInsights, type Insights } from '../lib/insights'
import { toast } from './Toast'

const fmt = (n: number) => n.toLocaleString()
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Admin → Insights: visitors, accounts, activity and plays, from Spindle's own counts. */
export function InsightsPanel({ load = loadInsights }: { load?: (days: number) => Promise<Insights> }) {
  const [data, setData] = useState<Insights | null>(null)
  const [days, setDays] = useState(30)
  const [table, setTable] = useState(false)

  useEffect(() => {
    setData(null)
    load(days).then(setData, (e) => toast((e as Error).message))
  }, [days, load])

  if (!data)
    return (
      <div className="fb-empty">
        <Loader2 size={18} className="spin" />
      </div>
    )

  const t = data.totals
  const tiles = [
    { label: 'Visitors today', value: t.visitors_today, sub: `${fmt(t.visitors_week)} this week` },
    { label: 'Accounts', value: t.accounts, sub: `+${fmt(t.new_week)} this week` },
    { label: 'Active today', value: t.active_today, sub: 'signed-in listeners' },
    { label: 'Active this week', value: t.active_week, sub: `${fmt(t.active_month)} this month` },
    { label: 'Plays today', value: t.plays_today, sub: 'songs listened to' },
    { label: 'Desktop app', value: t.desktop_week, sub: 'visitors this week' },
  ]
  const series = [
    { key: 'visitors', title: 'Visitors', note: 'browsers that opened Spindle' },
    { key: 'signups', title: 'New accounts', note: 'sign-ups per day' },
    { key: 'active', title: 'Active listeners', note: 'signed-in people per day' },
    { key: 'plays', title: 'Plays', note: 'songs listened to per day' },
  ] as const

  return (
    <div className="ins">
      <div className="ins-tiles">
        {tiles.map((x) => (
          <div key={x.label} className="ins-tile">
            <span>{x.label}</span>
            <b>{fmt(x.value)}</b>
            <small>{x.sub}</small>
          </div>
        ))}
      </div>

      <div className="ins-bar">
        <div className="admin-tabs ins-range" role="radiogroup" aria-label="Period">
          {[7, 30, 90].map((d) => (
            <button key={d} role="radio" aria-checked={days === d} className={days === d ? 'is-on' : ''} onClick={() => setDays(d)}>
              {d} days
            </button>
          ))}
        </div>
        <label className="admin-filter">
          <input type="checkbox" checked={table} onChange={(e) => setTable(e.target.checked)} /> Show as table
        </label>
      </div>

      {table ? (
        <div className="ins-table-wrap">
          <table className="ins-table">
            <thead>
              <tr>
                <th>Day</th>
                {series.map((s) => (
                  <th key={s.key}>{s.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data.days].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{dayLabel(d.day)}</td>
                  {series.map((s) => (
                    <td key={s.key}>{fmt(d[s.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ins-charts">
          {series.map((s) => (
            <BarChart key={s.key} title={s.title} note={s.note} points={data.days.map((d) => ({ day: d.day, value: d[s.key] }))} />
          ))}
        </div>
      )}

      <div className="ins-lists">
        <section className="ins-card">
          <h3>Where visitors come from</h3>
          {data.sources.length ? (
            <ol className="ins-list">
              {data.sources.map((s) => (
                <li key={s.source}>
                  <span>{s.source}</span>
                  <b>{fmt(s.visitors)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ins-empty">No visits counted yet.</p>
          )}
        </section>
        <section className="ins-card">
          <h3>Most played</h3>
          {data.top_songs.length ? (
            <ol className="ins-list">
              {data.top_songs.map((s, i) => (
                <li key={i}>
                  <span>
                    {s.title ?? 'Unknown song'}
                    <small>{s.artist}</small>
                  </span>
                  <b title={`${fmt(s.listeners)} ${s.listeners === 1 ? 'listener' : 'listeners'}`}>{fmt(s.plays)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ins-empty">No plays in this period.</p>
          )}
        </section>
      </div>
      <p className="ins-foot">Counted by Spindle itself: no cookies and no third parties. Visitors are browsers, counted once a day; days are in UTC.</p>
    </div>
  )
}

/** One metric over time: thin bars from a shared baseline, with the value on hover. */
function BarChart({ title, note, points }: { title: string; note: string; points: { day: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...points.map((p) => p.value))
  const total = points.reduce((a, p) => a + p.value, 0)
  const h = hover !== null ? points[hover] : null
  return (
    <figure className="ins-chart">
      <figcaption>
        <b>{title}</b>
        <span>
          {fmt(total)} total · {note}
        </span>
      </figcaption>
      <div className="ins-plot" onMouseLeave={() => setHover(null)}>
        <span className="ins-max">{fmt(max)}</span>
        <div className="ins-bars" role="img" aria-label={`${title}: ${fmt(total)} over ${points.length} days, most on one day ${fmt(max)}`}>
          {points.map((p, i) => (
            <div key={p.day} className={`ins-col ${hover === i ? 'is-hover' : ''}`} onMouseEnter={() => setHover(i)}>
              <i style={{ height: `${(p.value / max) * 100}%` }} />
            </div>
          ))}
        </div>
        {h && (
          <div className="ins-tip" style={{ left: `${((hover! + 0.5) / points.length) * 100}%` }}>
            <b>{fmt(h.value)}</b>
            <span>{dayLabel(h.day)}</span>
          </div>
        )}
      </div>
      <div className="ins-axis">
        <span>{dayLabel(points[0].day)}</span>
        <span>{dayLabel(points[points.length - 1].day)}</span>
      </div>
    </figure>
  )
}
