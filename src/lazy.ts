// Pages and big extras that load on first use, so the first screen comes up
// fast. After start-up they're fetched in the background (prefetchAll), so
// opening them later is still instant.
import { lazy, type ComponentType } from 'react'

type Loader = () => Promise<Record<string, unknown>>
const loaders: Loader[] = []

/** React.lazy for a named export. */
function named<P = object>(load: Loader, name: string) {
  loaders.push(load)
  return lazy(() => load().then((m) => ({ default: m[name] as ComponentType<P> })))
}

const collections = () => import('./pages/Collections')
const playlists = () => import('./pages/Playlists')

export const Search = named(() => import('./pages/Search'), 'Search')
export const BrowsePage = named(() => import('./pages/Browse'), 'BrowsePage')
export const ChartsPage = named(collections, 'ChartsPage')
export const FullTracksPage = named(collections, 'FullTracksPage')
export const LikedPage = named(collections, 'LikedPage')
export const RecentPage = named(collections, 'RecentPage')
export const AlbumPage = named(collections, 'AlbumPage')
export const ArtistPage = named(collections, 'ArtistPage')
export const GenrePage = named(collections, 'GenrePage')
export const EraPage = named(collections, 'EraPage')
export const NotFound = named(collections, 'NotFound')
export const LibraryPage = named(playlists, 'LibraryPage')
export const PlaylistPage = named(playlists, 'PlaylistPage')
export const ImportPage = named(() => import('./pages/Import'), 'ImportPage')
export const SharedPage = named(() => import('./pages/Shared'), 'SharedPage')
export const SettingsPage = named(() => import('./pages/Settings'), 'SettingsPage')
export const DownloadsPage = named(() => import('./pages/Downloads'), 'DownloadsPage')
export const StatsPage = named(() => import('./pages/Stats'), 'StatsPage')
export const AboutPage = named(() => import('./pages/About'), 'AboutPage')

export const ShareSheet = named(() => import('./components/ShareSheet'), 'ShareSheet')
export const LyricsEditor = named(() => import('./components/LyricsEditor'), 'LyricsEditor')
export const AuthGate = named(() => import('./components/AuthGate'), 'AuthGate')
export const PublicShare = named<{ code: string; onSignIn: () => void }>(() => import('./components/PublicShare'), 'PublicShare')

/** Fetch every on-demand piece while the browser is idle. */
export function prefetchAll() {
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 1500))
  idle(() => loaders.forEach((load) => load().catch(() => {})))
}
