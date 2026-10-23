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
  p.finally(() => pending.delete(k))
  return p
}

const pending = new Map<string, Promise<unknown>>()

function pruneCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

export const HOUR = 60 * 60 * 1000
export const DAY = 24 * HOUR
