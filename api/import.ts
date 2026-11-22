// Vercel serverless function: GET /api/import?url=<playlist or album link>
// Free on Vercel's Hobby plan. Locally, vite.config.ts serves the same route.
import { ImportError, importFromUrl } from '../server/import.js'

// The app on GitHub Pages calls this from another address, so say that's allowed.
const ALLOWED = ['https://someshthakur.tech', 'https://www.someshthakur.tech', 'https://somesh-thakur.github.io']
const cors = (request: Request) => {
  const origin = request.headers.get('origin') ?? ''
  return { 'access-control-allow-origin': ALLOWED.includes(origin) ? origin : ALLOWED[0], vary: 'origin' }
}

export async function GET(request: Request) {
  const CORS = cors(request)
  const url = new URL(request.url).searchParams.get('url')
  if (!url) return Response.json({ error: 'Add ?url= with a playlist or album link.' }, { status: 400, headers: CORS })
  try {
    const result = await importFromUrl(url)
    // Public playlists change slowly; let the CDN reuse a result for a few minutes.
    return Response.json(result, { headers: { ...CORS, 'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600' } })
  } catch (e) {
    const status = e instanceof ImportError ? e.status : 500
    const error = e instanceof ImportError ? e.message : 'Something went wrong reading that link. Try again in a moment.'
    return Response.json({ error }, { status, headers: CORS })
  }
}
