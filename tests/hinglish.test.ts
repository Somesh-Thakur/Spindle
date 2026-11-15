import { describe, expect, it } from 'vitest'
import { hasIndic, toHinglish } from '../src/lib/hinglish'

describe('toHinglish', () => {
  it('reads Hindi the way people text it', () => {
    expect(toHinglish('तुम ही हो')).toBe('Tum hi ho')
    expect(toHinglish('दिल')).toBe('Dil')
  })

  it('reads Punjabi (Gurmukhi)', () => {
    expect(toHinglish('ਕਿਥੇ ਚਲਾਏ')).toBe('Kithe chalaae')
    expect(toHinglish('ਜਾਣਦਾ ਏ ਦਿਲ')).toBe('Jaanda e dil')
    // Addak doubles the next consonant.
    expect(toHinglish('ਪੱਕਾ')).toBe('Pakka')
  })

  it('keeps vowels in South Indian scripts', () => {
    expect(toHinglish('அம்மா')).toBe('Amma')
  })

  it('leaves English alone', () => {
    expect(hasIndic('Kar na kabhi')).toBe(false)
    expect(toHinglish('Kar na kabhi')).toBe('Kar na kabhi')
  })
})
