// Vercel function behind /s/<code> (see vercel.json): the app's page, with the
// shared item's title and preview image filled in for link previews.
import { envFromProcess, fetchShare, shareHtml } from '../server/share.js'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code') ?? ''
  const origin = `${url.protocol}//${url.host}`
  const [share, index] = await Promise.all([fetchShare(code, envFromProcess()), fetch(`${origin}/`).then((r) => r.text())])
  // An unknown or deleted link still opens the app, which explains it.
  const html = share ? shareHtml(index, share, origin, request.headers.get('user-agent') ?? '') : index
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', // Not cached at the edge: the preview image depends on which app is asking.
      'cache-control': 'public, max-age=0, must-revalidate' },
  })
}
