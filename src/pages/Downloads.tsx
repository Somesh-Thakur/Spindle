import { Trash2, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { CollectionHeader } from '../components/CollectionHeader'
import { toast } from '../components/Toast'
import { removeAllDownloads, totalBytes, useDownloads } from '../lib/offline'
import { TrackList } from './Collections'

const size = (bytes: number) => (bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`)

/** Songs saved on this device, playable with no internet. */
export function DownloadsPage() {
  const saved = useDownloads((s) => s.saved)
  const list = Object.values(saved)
    .sort((a, b) => b.at - a.at)
    .map((s) => s.track)
  const [confirm, setConfirm] = useState(false)

  return (
    <div className="page page-wash">
      <CollectionHeader
        kind="On this device"
        title="Downloads"
        tint="#1f5d4a"
        tracks={list}
        meta={list.length ? `${list.length} ${list.length === 1 ? 'song' : 'songs'} · ${size(totalBytes(saved))}` : undefined}
      />
      {list.length ? (
        <>
          <TrackList tracks={list} />
          <button
            className={`btn btn-ghost dl-clear ${confirm ? 'is-danger' : ''}`}
            onClick={() => {
              if (!confirm) return setConfirm(true)
              removeAllDownloads().then(() => toast('Removed all downloads'))
            }}
            onBlur={() => setConfirm(false)}
          >
            <Trash2 size={15} /> {confirm ? 'Select again to remove all' : 'Remove all downloads'}
          </button>
        </>
      ) : (
        <div className="note dl-empty">
          <WifiOff size={20} />
          <p>
            Songs you download play with no internet, even on a plane. Look for <b>Download</b> in the ••• menu of songs from <b>Radio</b> (Audius tracks). Songs that play through YouTube can’t be saved, because YouTube doesn’t allow it.
          </p>
        </div>
      )}
    </div>
  )
}
