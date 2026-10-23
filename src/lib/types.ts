export type Source = 'itunes' | 'audius' | 'youtube'

export interface Track {
  id: string
  source: Source
  title: string
  artist: string
  artistId?: string
  album?: string
  albumId?: string
  /** Artwork URL template — `{s}` is replaced with a pixel size. */
  art: string
  /** Seconds. For previews this is the full song length, not the clip. */
  duration: number
  streamUrl: string
  /** YouTube video id, when the track itself came from YouTube Music. */
  videoId?: string
  /** True when only a ~30s clip is available. */
  preview: boolean
  genre?: string
  releaseDate?: string
  explicit?: boolean
}

export interface Album {
  id: string
  title: string
  artist: string
  artistId?: string
  art: string
  year?: string
  genre?: string
  trackCount?: number
  copyright?: string
}

export interface Artist {
  id: string
  name: string
  genre?: string
  art?: string
}
