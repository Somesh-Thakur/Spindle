import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanYouTube, ImportError, importFromUrl } from '../server/import'

afterEach(() => vi.restoreAllMocks())

describe('importFromUrl', () => {
  it('only fetches from the music services it knows', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    for (const url of ['http://169.254.169.254/latest/meta-data', 'http://localhost:5432', 'https://evil.example/open.spotify.com/playlist/x', 'file:///etc/passwd']) {
      await expect(importFromUrl(url)).rejects.toBeInstanceOf(ImportError)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('explains what’s wrong with a bad link', async () => {
    await expect(importFromUrl('not a link')).rejects.toThrow(/doesn’t look like a link/)
    await expect(importFromUrl('https://www.youtube.com/watch?v=abc')).rejects.toThrow(/no playlist/)
    await expect(importFromUrl('https://open.spotify.com/user/x')).rejects.toThrow(/Spotify playlist or album/)
  })
})

describe('cleanYouTube', () => {
  it('splits "Artist - Song" and drops the video labels', () => {
    expect(cleanYouTube('The Weeknd - Blinding Lights (Official Video)', 'TheWeekndVEVO')).toEqual({ title: 'Blinding Lights', artist: 'The Weeknd' })
  })
  it('handles "Song - Artist" when the channel says which is which', () => {
    expect(cleanYouTube('Kesariya - Arijit Singh | Brahmastra', 'Arijit Singh - Topic')).toEqual({ title: 'Kesariya', artist: 'Arijit Singh' })
  })
  it('falls back to the channel name', () => {
    expect(cleanYouTube('Levitating [Lyrics]', 'Dua Lipa')).toEqual({ title: 'Levitating', artist: 'Dua Lipa' })
  })
})
