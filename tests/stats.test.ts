import { describe, expect, it } from 'vitest'
import { computeStats, leadArtist, type Play } from '../src/lib/history'
import type { Track } from '../src/lib/types'

const track = (id: string, artist: string, genre = 'Pop'): Track => ({
  id, source: 'itunes', title: `Song ${id}`, artist, art: `art-${id}`, duration: 200, streamUrl: '', preview: false, genre,
})
const DAY = 86_400_000
const now = Date.now()

const tracks = {
  a: track('a', 'Badshah & Seedhe Maut', 'Hip-Hop'),
  b: track('b', 'Badshah'),
  c: track('c', 'The Weeknd'),
}

describe('leadArtist', () => {
  it('takes the first credited artist', () => {
    expect(leadArtist('Badshah & Seedhe Maut')).toBe('Badshah')
    expect(leadArtist('Drake, Future')).toBe('Drake')
    expect(leadArtist('Calvin Harris feat. Rihanna')).toBe('Calvin Harris')
    expect(leadArtist('Diplo x Sleepy Tom')).toBe('Diplo')
  })
})

describe('computeStats', () => {
  const plays: Play[] = [
    { id: 'a', at: now - 1000, secs: 120 },
    { id: 'a', at: now - 2000, secs: 120 },
    { id: 'b', at: now - DAY, secs: 60 },
    { id: 'c', at: now - 2 * DAY, secs: 180 },
    // Long ago: only counts for "All time".
    { id: 'c', at: now - 300 * DAY, secs: 600 },
    // A song we no longer know about adds no minutes.
    { id: 'gone', at: now - 500, secs: 999 },
  ]

  it('counts minutes, songs and artists in the period', () => {
    const s = computeStats(plays, tracks, '4w')
    expect(s.minutes).toBe(Math.round((120 + 120 + 60 + 180) / 60))
    expect(s.songs).toBe(3)
    // "Badshah & Seedhe Maut" and "Badshah" share a lead artist.
    expect(s.artists).toBe(2)
  })

  it('ranks top songs and artists', () => {
    const s = computeStats(plays, tracks, '4w')
    expect(s.topSongs[0]).toMatchObject({ track: { id: 'a' }, count: 2 })
    expect(s.topArtists[0]).toMatchObject({ name: 'Badshah', count: 3, minutes: 5 })
    expect(s.topGenre).toBe('Hip-Hop')
  })

  it('includes old plays only for all time', () => {
    expect(computeStats(plays, tracks, 'all').minutes).toBe(Math.round((480 + 600) / 60))
  })

  it('counts days in a row ending today', () => {
    expect(computeStats(plays, tracks, '4w').streak).toBe(3)
    expect(computeStats([], tracks, 'all')).toMatchObject({ streak: 0, plays: 0, peakHour: undefined })
  })
})
