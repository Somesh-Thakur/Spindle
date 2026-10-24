// Spindle's service worker: opens instantly and works without internet.
//
// - The app itself (HTML, scripts, styles) is kept so Spindle boots offline.
//   Pages are network-first (you get updates right away), falling back to the
//   saved copy; hashed /assets/ files never change, so they're cache-first.
// - Fonts and artwork are cache-first: covers you've seen show up offline.
// - Search, sign-in and music APIs always go to the network; downloads for
//   offline listening are stored by the app itself (src/lib/offline.ts).
const VERSION = 'v1'
const SHELL = `spindle-shell-${VERSION}`
const ASSETS = `spindle-assets-${VERSION}`
const ART = `spindle-art-${VERSION}`
// Browsers pad cross-site images in storage, so keep a modest number.
const ART_LIMIT = 250

const PRECACHE = ['/', '/manifest.webmanifest', '/brand/spindle-favicon.svg', '/brand/spindle-icon-192.png', '/brand/apple-touch-icon.png']

/** The page's own scripts and styles, so offline start-up works after the very first visit. */
async function precacheBuild() {
  const html = await (await fetch('/', { cache: 'no-cache' })).text()
  const files = [...new Set(html.match(/\/assets\/[\w.-]+\.(js|css)/g) ?? [])]
  const assets = await caches.open(ASSETS)
  await assets.addAll(files)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(precacheBuild)
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('spindle-') && !k.endsWith(VERSION) && !k.startsWith('spindle-audio')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const ART_HOSTS = /(^|\.)(mzstatic\.com|ytimg\.com|ggpht\.com|googleusercontent\.com|audius\.co|flagcdn\.com)$/
const FONT_HOSTS = /^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k)
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  // Opaque (no-cors) images are fine to keep; they still render.
  if (res.ok || res.type === 'opaque') {
    cache.put(request, res.clone())
    if (limit) trim(cacheName, limit)
  }
  return res
}

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL)
  try {
    const res = await fetch(request)
    if (res.ok) cache.put('/', res.clone())
    return res
  } catch {
    return (await cache.match('/')) || Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // The app shell. Share pages (/s/…) carry their own previews, so they stay live.
  if (request.mode === 'navigate' && url.origin === location.origin) {
    if (url.pathname.startsWith('/s/') || url.pathname.startsWith('/api/')) return
    event.respondWith(networkFirstPage(request))
    return
  }
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(request, ASSETS, 150))
    if (url.pathname.startsWith('/brand/') || url.pathname.startsWith('/email/')) return event.respondWith(cacheFirst(request, ASSETS, 150))
    return
  }
  if (FONT_HOSTS.test(url.hostname)) return event.respondWith(cacheFirst(request, ASSETS, 150))
  // Artwork only, never audio or video.
  if (request.destination === 'image' && ART_HOSTS.test(url.hostname)) return event.respondWith(cacheFirst(request, ART, ART_LIMIT))
})
