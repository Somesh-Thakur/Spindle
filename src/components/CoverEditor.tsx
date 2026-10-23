import { ImagePlus, RotateCcw } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import type { Playlist } from '../store/player'
import { usePlayer } from '../store/player'
import { PlaylistCover } from './PlaylistCover'
import { toast } from './Toast'

const SIZE = 640

/** Centre-crop to a square and shrink, so the image fits comfortably in local storage. */
async function toCover(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const c = document.createElement('canvas')
  c.width = c.height = Math.min(SIZE, side)
  c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, c.width, c.height)
  bmp.close()
  return c.toDataURL('image/jpeg', 0.86)
}

/** Playlist artwork you can click or drop an image onto. Song covers stay the default. */
export function CoverEditor({ playlist }: { playlist: Playlist }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const setCover = usePlayer((s) => s.setPlaylistCover)

  const use = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('That file isn’t an image. Choose a JPG, PNG or WebP.')
    setBusy(true)
    try {
      setCover(playlist.id, await toCover(file))
      toast('Cover updated')
    } catch {
      toast('That image couldn’t be read. Try a different file.')
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    use(e.dataTransfer.files[0])
  }

  return (
    <div
      className={`cover-edit ${over ? 'is-over' : ''} ${busy ? 'is-busy' : ''}`}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <PlaylistCover tracks={playlist.tracks} cover={playlist.cover} size={360} />
      <div className="cover-edit-veil">
        <button className="cover-edit-btn" onClick={() => input.current?.click()}>
          <ImagePlus size={18} /> {playlist.cover ? 'Change cover' : 'Choose a cover'}
        </button>
        {playlist.cover && (
          <button className="cover-edit-link" onClick={() => (setCover(playlist.id, undefined), toast('Back to song covers'))}>
            <RotateCcw size={13} /> Use song covers
          </button>
        )}
        <span className="cover-edit-hint">or drop an image here</span>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => (use(e.target.files?.[0]), (e.target.value = ''))} />
    </div>
  )
}
