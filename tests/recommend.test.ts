import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '../src/lib/types'

const t = (id: string, title: string, artist: string, artistId?: string): Track => ({
  id, source: 'itunes', title, artist, artistId, art: '', duration: 200, streamUrl: '', preview: false,
})

// iTunes is replaced with canned answers.
const api = vi.hoisted(() => ({ artistsTopSongs: vi.fn(), search: vi.fn() }))
vi.mock('../src/api/itunes', () => api)
const { recommend } = await import('../src/lib/recommend')

beforeEach(() => {
  api.artistsTopSongs.mockReset()
  api.search.mockReset()
})

describe('recommend', () => {
  it('suggests the artists’ top songs minus what’s already there', async () => {
    const have = [t('1', 'Starboy', 'The Weeknd', '479756766'), t('2', 'Save Your Tears', 'The Weeknd', '479756766')]
    api.artistsTopSongs.mockResolvedValue([
      t('1', 'Starboy', 'The Weeknd'), // same song
      t('9', 'Save Your Tears (Remix)', 'The Weeknd'), // another version of one we have
      t('3', 'Blinding Lights', 'The Weeknd'),
      t('4', 'Blinding Lights', 'The Weeknd'), // duplicate upload
      t('5', 'Die For You', 'The Weeknd'),
    ])
    const out = await recommend(have, have, 'us')
    expect(out.map((x) => x.id)).toEqual(['3', '5'])
    expect(api.artistsTopSongs.mock.calls[0][1]).toEqual([479756766])
  })

  it('finds the artist by name for songs from YouTube or Audius', async () => {
    const yt: Track = { ...t('yt1', 'Kesariya', 'Arijit Singh'), source: 'youtube' }
    api.search.mockResolvedValue({ songs: [t('x', 'Tum Hi Ho', 'Arijit Singh', '264111789')] })
    api.artistsTopSongs.mockResolvedValue([t('6', 'Tum Hi Ho', 'Arijit Singh')])
    expect((await recommend([yt], [yt], 'in')).map((x) => x.id)).toEqual(['6'])
    expect(api.artistsTopSongs.mock.calls[0][1]).toEqual([264111789])
  })

  it('returns nothing when it can’t tell who the artists are', async () => {
    api.search.mockRejectedValue(new Error('offline'))
    expect(await recommend([t('a', 'X', 'Nobody')], [], 'us')).toEqual([])
    expect(api.artistsTopSongs).not.toHaveBeenCalled()
  })
})
