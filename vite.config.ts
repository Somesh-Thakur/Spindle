import { readFile } from 'node:fs/promises'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { ImportError, importFromUrl } from './server/import'
import { fetchShare, shareHtml, shareImage, type Env } from './server/share'

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

/** Serves /s/<code> and /api/og during development, matching the functions in api/. */
function shareApi(env: Env): Plugin {
  return {
    name: 'spindle-share-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost')
        const origin = `http://${req.headers.host}`
        try {
          const page = url.pathname.match(/^\/s\/([\w-]+)\/?$/)
          if (page) {
            const share = await fetchShare(page[1], env)
            const index = await server.transformIndexHtml(req.url ?? '/', await readFile('index.html', 'utf8'))
            res.setHeader('content-type', 'text/html; charset=utf-8')
            return res.end(share ? shareHtml(index, share, origin, req.headers['user-agent'] ?? '') : index)
          }
          if (url.pathname === '/api/og') {
            const share = await fetchShare(url.searchParams.get('code') ?? '', env)
            if (!share) {
              res.statusCode = 404
              return res.end()
            }
            const img = await shareImage(share, origin)
            res.setHeader('content-type', 'image/png')
            return res.end(Buffer.from(await img.arrayBuffer()))
          }
        } catch (e) {
          return next(e)
        }
        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    // Which deploy an error report came from (Vercel sets the commit during builds).
    define: { __RELEASE__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)) },
    plugins: [react(), importApi(), shareApi({ supabaseUrl: env.VITE_SUPABASE_URL, supabaseKey: env.VITE_SUPABASE_ANON_KEY })],
    build: {
      rollupOptions: {
        output: {
          // Libraries change less often than the app, so they get their own long-cached files.
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (/[\/](react|react-dom|react-router|react-router-dom|scheduler)[\/]/.test(id)) return 'react'
            if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'motion'
            if (id.includes('@supabase')) return 'supabase'
          },
        },
      },
    },
  }
})
