import { motion } from 'framer-motion'
import { ArrowLeft, Check, Copy, Download, Loader2, Share2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { extractPalette } from '../lib/color'
import { artUrl } from '../lib/format'
import { shareUrl, type ShareItem } from '../lib/share'
import { useSongLyrics } from '../lib/useSongLyrics'
import type { Track } from '../lib/types'
import { toast } from './Toast'

type Style = 'cover' | 'vinyl' | 'lyrics'

const PRESETS: [string, string][] = [
  ['#1d1b4b', '#7a5cff'],
  ['#3b0a1e', '#ff3b5c'],
  ['#0f3d3e', '#3fd6a3'],
  ['#3a2a0c', '#f4b23b'],
  ['#101014', '#5a5a66'],
]

const MAX_LINES = 4

/** Lyric lines to tap; picks up to four lines in a row, like Spotify's lyric cards. */
function LyricPicker({ track, onLines }: { track: Track; onLines: (lines: string[]) => void }) {
  const { lines, loading } = useSongLyrics(track)
  const [picked, setPicked] = useState<number[]>([])
  const onPick = (next: number[]) => {
    setPicked(next)
    onLines(next.map((i) => lines[i]?.text ?? '').filter(Boolean))
  }
  const usable = lines.map((l, i) => ({ ...l, i })).filter((l) => l.text.trim())
  if (loading) return <p className="story-hint"><Loader2 size={14} className="spin" /> Finding the lyrics…</p>
  if (!usable.length) return <p className="story-hint">No lyrics found for this song, so the lyrics card isn’t available.</p>
  const toggle = (i: number) => {
    if (picked.includes(i)) return onPick(picked.filter((p) => p !== i))
    // Keep the selection a run of neighbouring lines; start over if it's far away.
    const next = [...picked, i].sort((a, b) => a - b)
    const run = next[next.length - 1] - next[0] < MAX_LINES * 2 ? next : [i]
    onPick(run.slice(-MAX_LINES))
  }
  return (
    <div className="story-lyrics" role="listbox" aria-multiselectable="true" aria-label="Lyric lines">
      {usable.map((l) => (
        <button key={l.i} role="option" aria-selected={picked.includes(l.i)} className={picked.includes(l.i) ? 'is-on' : ''} onClick={() => toggle(l.i)}>
          {l.text}
        </button>
      ))}
    </div>
  )
}

/**
 * Story cards (1080×1920) for Instagram, WhatsApp and Snapchat stories:
 * pick a look and colours, preview it, then download or share the image.
 */
export function StoryMaker({ item, code, onBack }: { item: ShareItem; code: string; onBack: () => void }) {
  const track = item.kind === 'track' ? item.tracks[0] : undefined
  const [style, setStyle] = useState<Style>('cover')
  const [colors, setColors] = useState<[string, string] | null>(null)
  const [suggested, setSuggested] = useState<[string, string][]>([])
  const [lyricText, setLyricText] = useState<string[]>([])
  const [loaded, setLoaded] = useState('')
  const [failed, setFailed] = useState('')
  const [busy, setBusy] = useState<'' | 'download' | 'share'>('')

  // Colours from the artwork, the way Spotify tints its story backgrounds.
  useEffect(() => {
    const art = item.cover || item.art
    if (!art) return setColors(PRESETS[0])
    let alive = true
    extractPalette(item.cover ? art : artUrl(art, 100)).then(
      (p) => {
        if (!alive) return
        const own: [string, string][] = [
          [p.base, p.accent],
          [p.glow, p.base],
          [p.accent, p.glow],
        ]
        setSuggested(own)
        setColors((c) => c ?? own[0])
      },
      () => alive && setColors((c) => c ?? PRESETS[0]),
    )
    return () => {
      alive = false
    }
  }, [item.cover, item.art])

  /** The card's address. The preview shows it and Download reuses the browser's copy. */
  const src = useMemo(() => {
    if (!colors) return ''
    const q = new URLSearchParams({ code, style, c1: colors[0].replace('#', ''), c2: colors[1].replace('#', '') })
    if (style === 'lyrics' && lyricText.length) q.set('lines', lyricText.join('\n'))
    return `/api/story?${q}`
  }, [code, style, colors, lyricText])

  // Wait for a pause in clicking before drawing a new preview (the first one shows at once).
  const [preview, setPreview] = useState('')
  const shown = useRef(false)
  useEffect(() => {
    if (!src) return
    const id = setTimeout(() => setPreview(src), shown.current ? 280 : 0)
    shown.current = true
    return () => clearTimeout(id)
  }, [src])

  const fileName = `spindle-${item.title.replace(/[^\w]+/g, '-').toLowerCase().slice(0, 40)}-story.png`
  const blob = async () => {
    const res = await fetch(src)
    if (!res.ok) throw new Error(String(res.status))
    return res.blob()
  }
  const download = async () => {
    setBusy('download')
    try {
      const url = URL.createObjectURL(await blob())
      const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      toast('Saved your story image')
    } catch {
      toast('Couldn’t make the image. Try again.')
    } finally {
      setBusy('')
    }
  }
  const file = typeof File !== 'undefined' ? new File([], fileName, { type: 'image/png' }) : null
  const canShareFiles = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  const share = async () => {
    setBusy('share')
    try {
      const f = new File([await blob()], fileName, { type: 'image/png' })
      await navigator.share({ files: [f], title: item.title, text: shareUrl(code) })
    } catch {
      /* cancelled */
    } finally {
      setBusy('')
    }
  }

  const waiting = !!preview && loaded !== preview
  const lyricsReady = style !== 'lyrics' || lyricText.length > 0

  return (
    <motion.div className="story-maker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <div className="story-stage">
        <div className="story-phone">
          {preview && lyricsReady && failed !== preview && (
            <img src={preview} alt="Story preview" onLoad={() => setLoaded(preview)} onError={() => setFailed(preview)} className={waiting ? 'is-loading' : ''} />
          )}
          {!lyricsReady && <p className="story-empty">Pick up to four lines from the lyrics →</p>}
          {failed === preview && lyricsReady && <p className="story-empty">Couldn’t draw this one. Try another look or colour.</p>}
          {waiting && lyricsReady && failed !== preview && (
            <span className="story-spinner">
              <Loader2 size={24} className="spin" />
            </span>
          )}
        </div>
      </div>

      <div className="story-controls">
        <button className="gate-back" onClick={onBack}>
          <ArrowLeft size={16} /> Back to share
        </button>
        <h2 className="story-h">Share to your story</h2>
        <p className="story-sub">A tall image for Instagram, WhatsApp or Snapchat stories. Add the link sticker so friends can tap through to Spindle.</p>

        <div className="story-label">Look</div>
        <div className="seg story-seg" role="radiogroup" aria-label="Look">
          {(['cover', 'vinyl', ...(track ? (['lyrics'] as const) : [])] as Style[]).map((s) => (
            <button key={s} role="radio" aria-checked={style === s} className={style === s ? 'is-on' : ''} onClick={() => setStyle(s)}>
              {s === 'cover' ? 'Cover' : s === 'vinyl' ? 'Vinyl' : 'Lyrics'}
            </button>
          ))}
        </div>

        <div className="story-label">Colours</div>
        <div className="story-swatches" role="radiogroup" aria-label="Colours">
          {[...suggested, ...PRESETS].map(([a, b], i) => {
            const on = colors?.[0] === a && colors?.[1] === b
            return (
              <button
                key={`${a}${b}${i}`}
                role="radio"
                aria-checked={on}
                aria-label={i < suggested.length ? 'Colours from the artwork' : 'Preset colours'}
                className={`story-swatch ${on ? 'is-on' : ''}`}
                style={{ background: `linear-gradient(135deg, ${b}, ${a})` }}
                onClick={() => setColors([a, b])}
              >
                {on && <Check size={14} />}
              </button>
            )
          })}
        </div>

        {style === 'lyrics' && track && (
          <>
            <div className="story-label">
              Lines <small>{lyricText.length}/{MAX_LINES}</small>
            </div>
            <LyricPicker track={track} onLines={setLyricText} />
          </>
        )}

        <div className="story-actions">
          <button className="btn btn-primary" onClick={download} disabled={!src || !lyricsReady || !!busy}>
            {busy === 'download' ? <Loader2 size={16} className="spin" /> : <Download size={16} />} Download image
          </button>
          {canShareFiles && (
            <button className="btn" onClick={share} disabled={!src || !lyricsReady || !!busy}>
              {busy === 'share' ? <Loader2 size={16} className="spin" /> : <Share2 size={16} />} Share
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(shareUrl(code)).then(() => toast('Link copied for your link sticker'))}>
            <Copy size={16} /> Copy link
          </button>
        </div>
      </div>
    </motion.div>
  )
}
