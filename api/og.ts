// Vercel function behind /api/og?code=<code>: the 1200×630 card shown in link previews.
import { artAt, envFromProcess, fetchShare, shareImage } from '../server/share.js'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const share = await fetchShare(url.searchParams.get('code') ?? '', envFromProcess())
  if (!share) return Response.redirect(`${url.protocol}//${url.host}/brand/og-image.png`, 302)
  const origin = `${url.protocol}//${url.host}`
  // If the card can't be drawn (an odd cover picture), show the cover itself, or the Spindle card.
  return shareImage(share, origin).catch(() => {
    const cover = artAt(share.payload.cover?.startsWith('http') ? share.payload.cover : share.image ?? share.payload.track?.art ?? share.payload.tracks?.[0]?.art, 600)
    return Response.redirect(cover || `${origin}/brand/og-image.png`, 302)
  })
}
