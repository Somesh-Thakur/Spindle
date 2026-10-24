import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __RELEASE__: '"test"',
    // Tests never talk to the real database.
    'import.meta.env.VITE_SUPABASE_URL': '""',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    // Loading Postgres (PGlite) takes a few seconds the first time.
    testTimeout: 30_000,
  },
})
