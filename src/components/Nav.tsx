import { motion } from 'framer-motion'
import { Clock3, Compass, Download, Heart, Home, Library, Plus, Radio, Search } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { usePlayer } from '../store/player'
import { Logo, Wordmark } from './Brand'
import { PlaylistCover } from './PlaylistCover'
import { RegionPicker } from './RegionPicker'

const MAIN = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/browse', label: 'Browse', icon: Compass },
  { to: '/full', label: 'Radio', icon: Radio },
]
const LIBRARY = [
  { to: '/library', label: 'Your Library', icon: Library },
  { to: '/liked', label: 'Liked Songs', icon: Heart },
  { to: '/recent', label: 'Recently Played', icon: Clock3 },
  { to: '/import', label: 'Import Music', icon: Download },
]

function isActive(path: string, to: string) {
  return to === '/' ? path === '/' : path.startsWith(to)
}

function SideLink({ to, label, icon: Icon }: (typeof MAIN)[number]) {
  const { pathname } = useLocation()
  const on = isActive(pathname, to)
  return (
    <NavLink to={to} className={`side-link ${on ? 'is-on' : ''}`} end={to === '/'}>
      {on && <motion.span layoutId="side-pill" className="side-pill" transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }} />}
      <Icon size={17} strokeWidth={2} />
      <span>{label}</span>
    </NavLink>
  )
}

/**
 * The sidebar's search is a launcher: it shares a layoutId with the big field
 * on the Search page, so selecting it makes the box grow into place there.
 * Typing a character into it carries that character across.
 */
function SideSearch() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const onSearch = pathname === '/search'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable]')
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        nav('/search')
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [nav])

  if (onSearch)
    return (
      <div className="side-search is-placeholder" aria-hidden="true">
        <Search size={15} />
        <span>Searching</span>
      </div>
    )
  return (
    <motion.label layoutId="searchbox" className="side-search" transition={{ type: 'spring', stiffness: 210, damping: 30, mass: 0.9 }}>
      <Search size={15} />
      <input
        value=""
        readOnly
        placeholder="Search"
        aria-label="Search songs, artists, albums"
        onFocus={() => nav('/search')}
        onKeyDown={(e) => e.key.length === 1 && (e.preventDefault(), nav(`/search?q=${encodeURIComponent(e.key)}`))}
      />
      <kbd className="side-kbd">/</kbd>
    </motion.label>
  )
}

export function Sidebar() {
  const playlists = usePlayer((s) => s.playlists)
  const playing = usePlayer((s) => s.isPlaying)
  const nav = useNavigate()
  const { pathname } = useLocation()

  return (
    <aside className="sidebar">
      <NavLink to="/" className="brand" aria-label="Spindle home">
        <Logo size={30} spinning={playing} />
        <Wordmark />
      </NavLink>
      <SideSearch />
      <nav className="side-nav" aria-label="Main">
        {MAIN.map((l) => (
          <SideLink key={l.to} {...l} />
        ))}
      </nav>
      <div className="side-group">Library</div>
      <nav className="side-nav" aria-label="Library">
        {LIBRARY.map((l) => (
          <SideLink key={l.to} {...l} />
        ))}
      </nav>

      <div className="side-group side-group-row">
        Playlists
        <button className="side-add" onClick={() => nav(`/playlist/${usePlayer.getState().createPlaylist()}?rename=1`)} aria-label="New playlist">
          <Plus size={14} />
        </button>
      </div>
      <nav className="side-nav side-playlists" aria-label="Playlists">
        {playlists.length === 0 && <p className="side-hint">Make a playlist with the + button, or from any song's ••• menu.</p>}
        {playlists.map((p) => (
          <NavLink key={p.id} to={`/playlist/${p.id}`} className={`side-link ${pathname === `/playlist/${p.id}` ? 'is-on' : ''}`}>
            <PlaylistCover tracks={p.tracks} cover={p.cover} size={40} className="side-pl-cover" />
            <span className="side-pl-name">{p.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="side-region">
        <RegionPicker up />
      </div>
    </aside>
  )
}

const TABS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/browse', label: 'Browse', icon: Compass },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/library', label: 'Library', icon: Heart },
]

export function TabBar() {
  const { pathname } = useLocation()
  return (
    <nav className="tabbar glass" aria-label="Main">
      {TABS.map(({ to, label, icon: Icon }) => {
        const on = isActive(pathname, to)
        return (
          <NavLink key={to} to={to} className={`tab ${on ? 'is-on' : ''}`} end={to === '/'}>
            <Icon size={21} strokeWidth={on ? 2.3 : 1.8} />
            <span>{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
