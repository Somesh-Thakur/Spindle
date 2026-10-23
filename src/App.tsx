import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Ambient } from './components/Ambient'
import { AuthGate } from './components/AuthGate'
import { AuraField } from './components/AuraField'
import { Cursor } from './components/Cursor'
import { AudioEngine } from './components/AudioEngine'
import { FullPlayer } from './components/FullPlayer'
import { Intro } from './components/Intro'
import { LyricsEditor } from './components/LyricsEditor'
import { MiniPlayer } from './components/MiniPlayer'
import { Sidebar, TabBar } from './components/Nav'
import { Toasts } from './components/Toast'
import { VideoDock } from './components/VideoDock'
import {
  AlbumPage,
  ArtistPage,
  ChartsPage,
  EraPage,
  FullTracksPage,
  GenrePage,
  LikedPage,
  NotFound,
  RecentPage,
} from './pages/Collections'
import { Home } from './pages/Home'
import { SettingsPage } from './pages/Settings'
import { ImportPage } from './pages/Import'
import { LibraryPage, PlaylistPage } from './pages/Playlists'
import { BrowsePage } from './pages/Browse'
import { Search } from './pages/Search'
import { ScrollRoot } from './lib/scroll'
import { useAccount } from './lib/sync'
import { useCurrent, usePlayer } from './store/player'

export default function App() {
  const status = useAccount((s) => s.status)
  const customCursor = usePlayer((s) => s.customCursor)
  // Spindle is members-only once accounts are switched on; 'off' is local development without Supabase.
  if (status === 'loading' || status === 'out')
    return (
      <>
        <AuthGate />
        {customCursor && <Cursor />}
      </>
    )
  return <Shell />
}

function Shell() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const hasTrack = !!useCurrent()
  const hasVideo = usePlayer((s) => s.mode === 'yt' && s.videoStarted && !s.videoHidden)
  const { customCursor, intro, liveBackground } = usePlayer(useShallow((s) => ({ customCursor: s.customCursor, intro: s.intro, liveBackground: s.liveBackground })))

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <LayoutGroup>
    <div className={`app ${hasTrack ? 'has-player' : ''} ${hasVideo ? 'has-video' : ''} ${liveBackground ? '' : 'no-live-bg'}`}>
      <Ambient />
      {liveBackground && <AuraField />}
      <AudioEngine />
      <Sidebar />
      <ScrollRoot.Provider value={mainRef}>
      <main className="main" ref={mainRef}>
        {/* popLayout mounts the next page at once, so shared elements (the search box) can glide between pages. */}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route path="/charts" element={<ChartsPage />} />
              <Route path="/full" element={<FullTracksPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/account" element={<SettingsPage />} />
              <Route path="/liked" element={<LikedPage />} />
              <Route path="/playlist/:id" element={<PlaylistPage />} />
              <Route path="/recent" element={<RecentPage />} />
              <Route path="/album/:id" element={<AlbumPage />} />
              <Route path="/artist/:id" element={<ArtistPage />} />
              <Route path="/genre/:id" element={<GenrePage />} />
              <Route path="/era/:key" element={<EraPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
      </ScrollRoot.Provider>
      <MiniPlayer />
      <TabBar />
      <FullPlayer />
      <VideoDock />
      <LyricsEditor />
      <Toasts />
      {customCursor && <Cursor />}
      {intro && <Intro />}
    </div>
    </LayoutGroup>
  )
}
