import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, Clock3, FileUp, Link2, Loader2, Video } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Artwork } from '../components/Artwork'
import { KineticTitle } from '../components/Kinetic'
import { toast } from '../components/Toast'
import { readFile, readLink, resolveAll, type ImportResult, type Resolved } from '../lib/importer'
import { usePlayer } from '../store/player'

interface Job {
  key: number
  result: ImportResult
  rows: (Resolved | undefined)[]
  done: boolean
  playlistId?: string
}

const SOURCE: Record<ImportResult['source'], string> = { spotify: 'Spotify', apple: 'Apple Music', youtube: 'YouTube' }
const rise = (i: number) => ({ ['--i' as string]: Math.min(i, 24) }) as CSSProperties

const HELP = [
  {
    service: 'Spotify',
    how: 'Liked Songs and every playlist, in one file',
    steps: 'Open Exportify, sign in with Spotify, select Export All, then drop the CSV here.',
    link: 'https://exportify.app',
    cta: 'Open Exportify',
  },
  {
    service: 'YouTube Music',
    how: 'Your whole library, including likes',
    steps: 'In Google Takeout, choose only YouTube and YouTube Music, then the playlists folder. Drop each playlist CSV here.',
    link: 'https://takeout.google.com',
    cta: 'Open Google Takeout',
  },
  {
    service: 'Apple Music and others',
    how: 'Any service, up to 500 songs free',
    steps: 'In TuneMyMusic, pick your service as the source and choose Export to file, then drop the CSV here.',
    link: 'https://www.tunemymusic.com/transfer',
    cta: 'Open TuneMyMusic',
  },
]

export function ImportPage() {
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cancel = useRef({ cancelled: false })
  const country = usePlayer((s) => s.country)

  // Stop matching if the listener leaves the page. Reset on mount too: React's
  // dev mode mounts twice, and the first cleanup would otherwise cancel for good.
  useEffect(() => {
    cancel.current.cancelled = false
    return () => {
      cancel.current.cancelled = true
    }
  }, [])

  const run = async (results: ImportResult[]) => {
    for (const result of results) {
      const key = Date.now() + Math.random()
      setJobs((js) => [{ key, result, rows: new Array(result.items.length), done: false }, ...js])
      const update = (fn: (j: Job) => Job) => setJobs((js) => js.map((j) => (j.key === key ? fn(j) : j)))
      const resolved = await resolveAll(
        result,
        country,
        (i, r) =>
          update((j) => {
            const rows = j.rows.slice()
            rows[i] = r
            return { ...j, rows }
          }),
        cancel.current,
      )
      if (cancel.current.cancelled) return
      const st = usePlayer.getState()
      const id = st.createPlaylist(result.name, resolved.map((r) => r.track))
      if (result.cover) st.setPlaylistCover(id, result.cover)
      update((j) => ({ ...j, done: true, playlistId: id }))
      toast(`Imported ${result.name}`)
    }
  }

  const fromLink = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!link.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await readLink(link)
      setLink('')
      await run([result])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const fromFile = async (file?: File) => {
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      await run(await readFile(file))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    fromFile(e.dataTransfer.files[0])
  }

  return (
    <div className="page import-page">
      <div className="sec-head">
        <KineticTitle as="h1">Bring your music</KineticTitle>
        <p className="sec-lede">Paste a playlist or album link from Spotify, Apple Music, YouTube or YouTube Music. Every song is matched and saved here as a playlist.</p>
      </div>

      <form className={`import-box ${busy ? 'is-busy' : ''}`} onSubmit={fromLink}>
        <Link2 size={20} className="import-box-icon" />
        <input
          value={link}
          onChange={(e) => (setLink(e.target.value), setError(''))}
          onPaste={(e) => {
            const v = e.clipboardData.getData('text')
            if (/^https?:\/\//.test(v.trim())) setTimeout(() => (e.target as HTMLInputElement).form?.requestSubmit(), 0)
          }}
          placeholder="https://open.spotify.com/playlist/…"
          aria-label="Playlist or album link"
          spellCheck={false}
          disabled={busy}
        />
        <button className="btn btn-primary" disabled={!link.trim() || busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />} Import
        </button>
      </form>
      <AnimatePresence>
        {error && (
          <motion.p className="import-error" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {jobs.map((j) => (
          <JobCard key={j.key} job={j} />
        ))}
      </AnimatePresence>

      <label
        className={`import-drop ${over ? 'is-over' : ''}`}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <FileUp size={26} />
        <span className="import-drop-title">Drop an export file to bring in a whole library or your liked songs</span>
        <span className="import-drop-sub">CSV from Exportify, Google Takeout, TuneMyMusic or Soundiiz, or a TXT list with one song per line</span>
        <span className="btn">Choose a file</span>
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => (fromFile(e.target.files?.[0]), (e.target.value = ''))} />
      </label>

      <h2 className="section-title">Bring everything, including Liked Songs</h2>
      <p className="page-lede import-help-lede">Links only see public playlists. For private ones and your likes, export a file with one of these free tools, then drop it above.</p>
      <div className="import-help">
        {HELP.map((h, i) => (
          <div key={h.service} className="import-help-card rise" style={rise(i)}>
            <span className="ih-service">{h.service}</span>
            <span className="ih-how">{h.how}</span>
            <p>{h.steps}</p>
            <a href={h.link} target="_blank" rel="noreferrer" className="ih-link">
              {h.cta} <ArrowRight size={14} />
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

function JobCard({ job }: { job: Job }) {
  const nav = useNavigate()
  const { result, rows, done } = job
  const total = result.items.length
  const finished = rows.filter(Boolean).length
  const matched = rows.filter((r) => r && r.status !== 'later').length
  const later = finished - matched

  return (
    <motion.section
      className="import-job glass"
      layout
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <header className="ij-head">
        <div className="ij-cover">
          {result.cover ? <img src={result.cover} alt="" /> : <Artwork src={rows.find(Boolean)?.track.art} size={120} />}
        </div>
        <div className="ij-text">
          <span className="ij-source">
            {SOURCE[result.source]} {result.kind}
          </span>
          <h3 className="ij-name">{result.name}</h3>
          <span className="ij-count">
            {done
              ? `${matched} of ${total} songs matched${later ? `, ${later} will be found when played` : ''}`
              : `Matching ${finished} of ${total}…`}
            {result.truncated && ' Spotify links show the first 100 songs; use Exportify for the rest.'}
          </span>
        </div>
        {done && job.playlistId && (
          <motion.button className="btn btn-primary" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} onClick={() => nav(`/playlist/${job.playlistId}`)}>
            Open playlist <ArrowRight size={15} />
          </motion.button>
        )}
      </header>
      <div className="ij-bar" aria-hidden="true">
        <i style={{ width: `${(finished / Math.max(1, total)) * 100}%` }} />
      </div>
      <ol className="ij-list">
        {result.items.map((it, i) => {
          const r = rows[i]
          return (
            <li key={i} className={`ij-row ${r ? `is-${r.status}` : 'is-waiting'}`}>
              <span className="ij-art">{r ? <Artwork src={r.track.art} size={40} /> : <span className="skel" />}</span>
              <span className="ij-row-text">
                <b>{r?.track.title ?? it.title ?? 'Looking up…'}</b>
                <small>{r?.track.artist ?? it.artist}</small>
              </span>
              <span className="ij-status" title={r ? { matched: 'Matched', video: 'Plays the original video', later: 'Found when you play it' }[r.status] : 'Matching'}>
                {!r ? <Loader2 size={14} className="spin" /> : r.status === 'matched' ? <Check size={15} /> : r.status === 'video' ? <Video size={14} /> : <Clock3 size={14} />}
              </span>
            </li>
          )
        })}
      </ol>
    </motion.section>
  )
}
