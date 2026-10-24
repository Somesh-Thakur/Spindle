import { motion } from 'framer-motion'
import { ArrowLeft, Check, Copy, Download, Loader2, Share2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { extractPalette } from '../lib/color'
import { artUrl } from '../lib/format'
import { shareUrl, type ShareItem } from '../lib/share'
import { drawStory, STORY_H, STORY_W, storyBlob } from '../lib/storyCard'
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
  const [drawn, setDrawn] = useState<HTMLCanvasElement | null>(null)
  const [drawing, setDrawing] = useState(true)
  const [busy, setBusy] = useState<'' | 'share'>('')
  const view = useRef<HTMLCanvasElement>(null)

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

  const arts = useMemo(() => {
    if (item.cover) return [item.cover]
    if (item.kind === 'playlist') return [...new Set(item.tracks.map((t) => t.art).filter(Boolean))].slice(0, 4)
    return [item.art || item.tracks[0]?.art || ''].filter(Boolean)
  }, [item])
  const count = item.tracks.length
  const subtitle =
    item.kind === 'track' ? item.subtitle ?? '' : item.kind === 'album' ? `Album · ${item.subtitle ?? ''}` : `Playlist · ${count} ${count === 1 ? 'song' : 'songs'}`
  const lyricsReady = style !== 'lyrics' || lyricText.length > 0

  // Draw the card in the browser: instant, works offline, any language.
  // Each draw goes to its own canvas and only the newest is shown.
  const latest = useRef(0)
  useEffect(() => {
    if (!colors || !lyricsReady) return
    const token = ++latest.current
    const canvas = document.createElement('canvas')
    setDrawing(true)
    drawStory(canvas, { style, c1: colors[0], c2: colors[1], title: item.title, subtitle, arts, lines: style === 'lyrics' ? lyricText : [] })
      .then(() => {
        if (token !== latest.current) return
        const v = view.current
        if (v) {
          v.width = canvas.width
          v.height = canvas.height
          v.getContext('2d')!.drawImage(canvas, 0, 0)
        }
        setDrawn(canvas)
      })
      .catch(() => toast('Couldn’t draw the card. Try again.'))
      .finally(() => token === latest.current && setDrawing(false))
  }, [style, colors, lyricText, lyricsReady, item.title, subtitle, arts])

  const fileName = `spindle-${item.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'song'}-story.png`
  const download = async () => {
    if (!drawn) return
    try {
      const url = URL.createObjectURL(await storyBlob(drawn))
      const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      toast('Saved your story image')
    } catch {
      toast('Couldn’t save the image. Try again.')
    }
  }
  const file = typeof File !== 'undefined' ? new File([], fileName, { type: 'image/png' }) : null
  const canShareFiles = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  const share = async () => {
    if (!drawn) return
    setBusy('share')
    try {
      const f = new File([await storyBlob(drawn)], fileName, { type: 'image/png' })
      await navigator.share({ files: [f], title: item.title, text: shareUrl(code) })
    } catch {
      /* cancelled */
    } finally {
      setBusy('')
    }
  }

  return (
    <motion.div className="story-maker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <div className="story-stage">
        <div className="story-phone">
          <canvas ref={view} width={STORY_W} height={STORY_H} className={drawing && !drawn ? 'is-loading' : ''} aria-label="Story preview" role="img" hidden={!lyricsReady} />
          {!lyricsReady && <p className="story-empty">Pick up to four lines from the lyrics →</p>}
          {drawing && !drawn && lyricsReady && (
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
          <button className="btn btn-primary" onClick={download} disabled={!drawn || !lyricsReady}>
            <Download size={16} /> Download image
          </button>
          {canShareFiles && (
            <button className="btn" onClick={share} disabled={!drawn || !lyricsReady || !!busy}>
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
