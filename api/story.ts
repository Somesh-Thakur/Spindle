// Vercel function behind /api/story?code=&style=&c1=&c2=&lines=: a 1080×1920
// story card for a shared song, album or playlist (see server/story.ts).
import { envFromProcess, fetchShare } from '../server/share.js'
import { storyImage, storyOptions } from '../server/story.js'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const share = await fetchShare(url.searchParams.get('code') ?? '', envFromProcess())
  if (!share) return Response.json({ error: 'Share link not found.' }, { status: 404 })
  return storyImage(share, `${url.protocol}//${url.host}`, storyOptions(url.searchParams))
}
