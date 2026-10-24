import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Ambient } from './components/Ambient'
import { InstallPrompt, OfflinePill } from './components/AppChrome'
import { AuraField } from './components/AuraField'
import { Cursor } from './components/Cursor'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AudioEngine } from './components/AudioEngine'
import { FullPlayer } from './components/FullPlayer'
import { Intro } from './components/Intro'
import { MiniPlayer } from './components/MiniPlayer'
import { Sidebar, TabBar } from './components/Nav'
import { Toasts } from './components/Toast'
import { VideoDock } from './components/VideoDock'
import { WhatsNew } from './components/WhatsNew'
import { Screensaver } from './components/Screensaver'
import { Welcome } from './components/Welcome'
import { Home } from './pages/Home'
import {
  AboutPage,
  AdminPage,
  AlbumPage,
  ArtistPage,
  AuthGate,
  BrowsePage,
  ChartsPage,
  DownloadsPage,
  EraPage,
  FeedbackPage,
  FullTracksPage,
  GenrePage,
  ImportPage,
  LibraryPage,
  LikedPage,
  LyricsEditor,
  NotFound,
  PlaylistPage,
  prefetchAll,
  PublicShare,
  RecentPage,
  Search,
  SettingsPage,
  SharedPage,
  ShareSheet,
  StatsPage,
} from './lazy'
import { ScrollRoot } from './lib/scroll'
import { codeFromPath, rememberShare, takeRememberedShare } from './lib/share'
import { useAccount } from './lib/sync'
import { useCurrent, usePlayer } from './store/player'

/** True when this browser has a saved sign-in, before Supabase has confirmed it. */
const hadSession = (() => {
  try {
    return !!localStorage.getItem('aura:auth')
  } catch {
    return false
  }
})()

export default function App() {
  const status = useAccount((s) => s.status)
  const customCursor = usePlayer((s) => s.customCursor)
  // Opened from a share link (/s/<code>): people without an account get a public preview first.
  const [linkCode] = useState(codeFromPath)
  const [wantsIn, setWantsIn] = useState(false)
  // Spindle is members-only once accounts are switched on; 'off' is local development without Supabase.
  if (status === 'loading' || status === 'out') {
    const showLink = linkCode && !wantsIn && !(status === 'loading' && hadSession)
    return (
      <Suspense fallback={<div className="gate-loading" />}>
        {showLink ? (
          <PublicShare
            code={linkCode}
            onSignIn={() => {
              rememberShare(linkCode)
              setWantsIn(true)
            }}
          />
        ) : (
          <AuthGate />
        )}
        {customCursor && <Cursor />}
      </Suspense>
    )
  }
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

  // Arrived from a share link, or signed in from one: open what was shared.
  const nav = useNavigate()
  useEffect(() => {
    const code = takeRememberedShare() ?? codeFromPath()
    if (!code) return
    history.replaceState(null, '', '/' + location.hash)
    nav(`/shared/${code}`, { replace: true })
    // Runs once, when the app first opens.
  }, [])

  // Once the first screen is up, fetch the other pages in the background.
  useEffect(prefetchAll, [])

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
            {/* A crash in one page stays in that page: the player and navigation keep working. */}
            <ErrorBoundary inline resetKey={location.pathname}>
            <Suspense fallback={<div className="page page-loading" aria-busy="true" />}>
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route path="/charts" element={<ChartsPage />} />
              <Route path="/full" element={<FullTracksPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/shared/:code" element={<SharedPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/account" element={<SettingsPage />} />
              <Route path="/liked" element={<LikedPage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/feedback" element={<FeedbackPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/playlist/:id" element={<PlaylistPage />} />
              <Route path="/recent" element={<RecentPage />} />
              <Route path="/album/:id" element={<AlbumPage />} />
              <Route path="/artist/:id" element={<ArtistPage />} />
              <Route path="/genre/:id" element={<GenrePage />} />
              <Route path="/era/:key" element={<EraPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>
      </ScrollRoot.Provider>
      <MiniPlayer />
      <TabBar />
      <FullPlayer />
      <VideoDock />
      <Suspense fallback={null}>
        <LyricsEditor />
        <ShareSheet />
      </Suspense>
      <InstallPrompt />
      <OfflinePill />
      <Toasts />
      <WhatsNew />
      <Welcome />
      <Screensaver />
      {customCursor && <Cursor />}
      {intro && <Intro />}
    </div>
    </LayoutGroup>
  )
}
