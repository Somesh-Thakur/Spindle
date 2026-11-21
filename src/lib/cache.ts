// Small localStorage cache. iTunes allows ~20 requests a minute, so every
// network read goes through here.

const PREFIX = 'aura:c:'

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const k = PREFIX + key
  try {
    const raw = localStorage.getItem(k)
    if (raw) {
      const { t, v } = JSON.parse(raw)
      if (Date.now() - t < ttlMs) return v as T
    }
  } catch {
    /* storage unavailable */
  }
  const inflight = pending.get(k)
  if (inflight) return inflight as Promise<T>
  const p = load().then((v) => {
    try {
      localStorage.setItem(k, JSON.stringify({ t: Date.now(), v }))
    } catch {
      pruneCache()
    }
    return v
  })
  pending.set(k, p)
  // Cleanup on success or failure; the caller handles the failure itself, so this
  // copy of it must not surface as an unhandled rejection.
  const done = () => void pending.delete(k)
  p.then(done, done)
  return p
}

const pending = new Map<string, Promise<unknown>>()

/** Storage is full: drop the oldest half of the cache, keeping recent lookups. */
function pruneCache() {
  try {
    const entries = Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => {
        try {
          return { k, t: JSON.parse(localStorage.getItem(k) ?? '{}').t ?? 0 }
        } catch {
          return { k, t: 0 }
        }
      })
      .sort((a, b) => a.t - b.t)
    entries.slice(0, Math.ceil(entries.length / 2)).forEach(({ k }) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

/** Rough size of cached catalog data, in bytes (strings are UTF-16). */
export function cacheSize() {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .reduce((n, k) => n + (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2, 0)
  } catch {
    return 0
  }
}

export const clearCache = pruneCache

export const HOUR = 60 * 60 * 1000
export const DAY = 24 * HOUR
