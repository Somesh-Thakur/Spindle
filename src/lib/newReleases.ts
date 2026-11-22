// New albums and singles from the artists you follow, for Home.
import { latestReleases } from '../api/itunes'
import type { Album } from './types'
import { useAsync } from './useAsync'
import { usePlayer } from '../store/player'

/** How far back counts as "new". */
const NEW_FOR_DAYS = 90
/** Gets a NEW tag on its tile. */
export const FRESH_DAYS = 14

const daysAgo = (iso?: string) => (iso ? (Date.now() - Date.parse(iso)) / 86400000 : Infinity)

export const isFresh = (a: Album) => daysAgo(a.released) <= FRESH_DAYS

/** Releases from followed artists in the last few months, newest first. */
export function useNewReleases() {
  const country = usePlayer((s) => s.country)
  const ids = usePlayer((s) => Object.keys(s.following).sort().join(','))
  const { data, loading } = useAsync(
    () => (ids ? latestReleases(ids.split(','), country) : Promise.resolve([] as Album[])),
    [ids, country],
  )
  const releases = (data ?? []).filter((a) => daysAgo(a.released) <= NEW_FOR_DAYS && daysAgo(a.released) >= -1)
  return { releases, loading: loading && !!ids, following: !!ids }
}
