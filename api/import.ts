// Vercel serverless function: GET /api/import?url=<playlist or album link>
// Free on Vercel's Hobby plan. Locally, vite.config.ts serves the same route.
import { ImportError, importFromUrl } from '../server/import'

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url')
  if (!url) return Response.json({ error: 'Add ?url= with a playlist or album link.' }, { status: 400 })
  try {
    const result = await importFromUrl(url)
    // Public playlists change slowly; let the CDN reuse a result for a few minutes.
    return Response.json(result, { headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600' } })
  } catch (e) {
    const status = e instanceof ImportError ? e.status : 500
    const error = e instanceof ImportError ? e.message : 'Something went wrong reading that link. Try again in a moment.'
    return Response.json({ error }, { status })
  }
}
