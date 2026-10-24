import { describe, expect, it } from 'vitest'
import { describe as describeShare, shareHtml, type Share } from '../server/share'
import { codeFromPath } from '../src/lib/share'

describe('codeFromPath', () => {
  it('reads the code from a share link', () => {
    expect(codeFromPath('/s/abc123def0')).toBe('abc123def0')
    expect(codeFromPath('/s/abc123def0/')).toBe('abc123def0')
  })
  it('ignores everything else', () => {
    expect(codeFromPath('/')).toBeNull()
    expect(codeFromPath('/s/ab')).toBeNull()
    expect(codeFromPath('/s/abc123/extra')).toBeNull()
    expect(codeFromPath('/s/<script>')).toBeNull()
  })
})

const share = (over: Partial<Share> = {}) =>
  ({
    code: 'abc123def0',
    kind: 'playlist',
    title: 'Late night',
    subtitle: null,
    image: null,
    owner_name: 'Somesh',
    payload: { tracks: [{ id: '1', title: 'One', artist: 'A', art: 'https://x/{s}.jpg' }] },
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    ...over,
  }) as Share

const INDEX = `<html><head><title>Spindle</title><meta name="description" content="old" /><meta property="og:title" content="old" /></head><body></body></html>`

describe('share pages', () => {
  it('describes playlists and songs', () => {
    expect(describeShare(share()).line).toBe('Playlist by Somesh · 1 song')
    expect(describeShare(share({ kind: 'track', subtitle: 'The Weeknd' })).line).toBe('Song · The Weeknd')
  })

  it('replaces the default tags with the share’s', () => {
    const html = shareHtml(INDEX.replace('</head>', '<link rel="canonical" href="https://spindle.test/" /></head>'), share(), 'https://spindle.test')
    expect(html.match(/rel="canonical"/g)).toHaveLength(1)
    expect(html).toContain('<title>Late night | Spindle</title>')
    expect(html).not.toContain('content="old"')
    expect(html).toContain('og:url" content="https://spindle.test/s/abc123def0"')
  })

  it('escapes titles so a share can’t inject markup or script', () => {
    const evil = `"><script>alert(1)</script><img src=x onerror=alert(2)>`
    const html = shareHtml(INDEX, share({ title: evil, owner_name: '</script><script>alert(3)</script>' }), 'https://spindle.test')
    // The only script tag is the one Spindle adds, and nothing breaks out of it.
    expect(html.match(/<script>/g)).toHaveLength(1)
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })

  it('gives WhatsApp the plain cover, others the preview card', () => {
    expect(shareHtml(INDEX, share(), 'https://spindle.test', 'WhatsApp/2.23')).toContain('og:image" content="https://x/600.jpg"')
    expect(shareHtml(INDEX, share(), 'https://spindle.test', 'Discordbot')).toContain('/api/og?code=abc123def0')
  })
})
