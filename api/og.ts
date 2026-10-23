// Vercel function behind /api/og?code=<code>: the 1200×630 card shown in link previews.
import { envFromProcess, fetchShare, shareImage } from '../server/share.js'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const share = await fetchShare(url.searchParams.get('code') ?? '', envFromProcess())
  if (!share) return Response.redirect(`${url.protocol}//${url.host}/brand/og-image.png`, 302)
  return shareImage(share, `${url.protocol}//${url.host}`)
}
