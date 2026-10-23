import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { ImportError, importFromUrl } from './server/import'

/** Serves /api/import during development, matching the Vercel function in api/import.ts. */
function importApi(): Plugin {
  return {
    name: 'spindle-import-api',
    configureServer(server) {
      server.middlewares.use('/api/import', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost').searchParams.get('url')
        res.setHeader('content-type', 'application/json')
        if (!url) {
          res.statusCode = 400
          return res.end(JSON.stringify({ error: 'Add ?url= with a playlist or album link.' }))
        }
        try {
          res.end(JSON.stringify(await importFromUrl(url)))
        } catch (e) {
          res.statusCode = e instanceof ImportError ? e.status : 500
          res.end(JSON.stringify({ error: e instanceof ImportError ? e.message : 'Something went wrong reading that link.' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), importApi()],
})
