import { describe, expect, it } from 'vitest'
import { artUrl, fmtTime, year } from '../src/lib/format'

describe('fmtTime', () => {
  it('shows minutes and padded seconds', () => {
    expect(fmtTime(0)).toBe('0:00')
    expect(fmtTime(65)).toBe('1:05')
    expect(fmtTime(3599.9)).toBe('59:59')
  })
  it('treats broken values as zero', () => {
    expect(fmtTime(NaN)).toBe('0:00')
    expect(fmtTime(-4)).toBe('0:00')
    expect(fmtTime(Infinity)).toBe('0:00')
  })
})

describe('artUrl', () => {
  it('fills in the size for iTunes-style templates', () => {
    expect(artUrl('https://is1.mzstatic.com/a/{s}x{s}bb.jpg', 300)).toBe('https://is1.mzstatic.com/a/300x300bb.jpg')
  })
  it('picks the nearest Audius size and keeps mirrors after #', () => {
    const a = 'https://audius.co/c/480x480.jpg#mirror'
    expect(artUrl(a, 100)).toBe('https://audius.co/c/150x150.jpg#mirror')
    expect(artUrl(a, 400)).toBe('https://audius.co/c/480x480.jpg#mirror')
    expect(artUrl(a, 900)).toBe('https://audius.co/c/1000x1000.jpg#mirror')
  })
  it('leaves other images alone', () => {
    expect(artUrl('https://i.ytimg.com/vi/x/hqdefault.jpg', 300)).toBe('https://i.ytimg.com/vi/x/hqdefault.jpg')
    expect(artUrl(undefined, 300)).toBe('')
  })
})

it('year takes the first four characters of a date', () => {
  expect(year('2019-11-29T08:00:00Z')).toBe('2019')
  expect(year()).toBe('')
})
