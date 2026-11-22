// Where Spindle lives. The app is on GitHub Pages at someshthakur.tech/spindle/
// (a folder, not the domain root), and Vercel still runs the two server jobs Pages
// can't: reading playlist links (/api/import) and share-link previews (/s/<code>).
// The Vercel copy is built with BASE "/" and no server origin, so it uses itself.

/** The folder the app is served from: "/spindle/" on GitHub Pages, "/" elsewhere. */
export const BASE = import.meta.env.BASE_URL

/** A file shipped with the app (public/), at the right folder on any host. */
export const at = (path: string) => BASE + path.replace(/^\//, '')

/** Where /api/import and /s/<code> live. */
export const SERVER = (import.meta.env.VITE_SERVER_ORIGIN as string | undefined) || location.origin

/** Where share links point: Spindle's own address on Vercel, which can draw link previews. */
export const SHARE_ORIGIN = import.meta.env.DEV ? SERVER : 'https://spindle.someshthakur.tech'
