// Devanagari → Hinglish: Hindi written the way people text it ("tum hi ho",
// not "tuma hī ho"), so it's easy to sing along to.
//
// Each word is split into units of consonant + vowel. Consonants carry an
// implicit "a" (the schwa) unless a vowel sign or virama replaces it. Spoken
// Hindi drops many of those schwas, so we do too, right to left:
//   - at the end of a word ("दिल" → dil, not dila)
//   - between two pronounced syllables ("समझना" → samajhna, "धड़कन" → dhadkan)

const CONS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n',
  च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm',
  य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh', ष: 'sh', स: 's', ह: 'h',
  क़: 'q', ख़: 'kh', ग़: 'gh', ज़: 'z', ड़: 'd', ढ़: 'dh', फ़: 'f', य़: 'y',
}

// Nukta forms written as base + ़ (U+093C).
const NUKTA: Record<string, string> = { क: 'q', ख: 'kh', ग: 'gh', ज: 'z', ड: 'd', ढ: 'dh', फ: 'f', य: 'y' }

const VOWELS: Record<string, string> = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऑ: 'o', ऍ: 'e',
}

const SIGNS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e',
}

const VIRAMA = '्'
const NUKTA_SIGN = '़'
const NASAL = new Set(['ं', 'ँ'])

interface Unit {
  c: string
  v: string
  /** The vowel is the implicit schwa, so it may be dropped. */
  schwa: boolean
  nasal: boolean
}

function word(w: string): string {
  const units: Unit[] = []
  const chars = [...w]
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const last = units[units.length - 1]
    if (CONS[ch] !== undefined) {
      let c = CONS[ch]
      if (chars[i + 1] === NUKTA_SIGN) {
        c = NUKTA[ch] ?? c
        i++
      }
      units.push({ c, v: 'a', schwa: true, nasal: false })
    } else if (VOWELS[ch]) {
      units.push({ c: '', v: VOWELS[ch], schwa: false, nasal: false })
    } else if (SIGNS[ch] && last) {
      last.v = SIGNS[ch]
      last.schwa = false
    } else if (ch === VIRAMA && last) {
      last.v = ''
      last.schwa = false
    } else if (NASAL.has(ch) && last) {
      last.nasal = true
      if (last.schwa) last.schwa = false
    } else if (ch === 'ः' && last) {
      last.v += 'h'
    } else {
      // Latin letters, digits or punctuation inside a word: keep as is.
      units.push({ c: ch, v: '', schwa: false, nasal: false })
    }
  }

  // Schwa deletion, right to left.
  const n = units.length
  if (n > 1 && units[n - 1].schwa) units[n - 1].v = ''
  for (let i = n - 2; i > 0; i--) {
    const u = units[i]
    if (!u.schwa) continue
    const prev = units[i - 1]
    // Keep it if dropping would stack three consonants ("ज़िंदगी" stays zindagi).
    const prevOpen = prev.v !== '' && !prev.nasal
    const nextVoiced = units[i + 1].v !== ''
    if (prevOpen && nextVoiced) u.v = ''
  }

  let out = ''
  units.forEach((u, i) => {
    let v = u.v
    const final = i === n - 1
    // Word-final long vowels read short in casual spelling: teri, tu, mujhe.
    if (final && v === 'ee') v = 'i'
    if (final && v === 'aa' && u.c) v = 'a'
    if (final && v === 'oo' && u.c) v = 'u'
    let nasal = ''
    if (u.nasal) {
      const next = units[i + 1]?.c ?? ''
      nasal = /^(p|ph|b|bh|m)$/.test(next) ? 'm' : 'n'
      // में → mein, हमें → humein
      if (v === 'e' && final) v = 'ei'
    }
    out += u.c + v + nasal
  })
  return out
}

const DEVANAGARI = /[ऀ-ॿ]/

export const hasDevanagari = (s: string) => DEVANAGARI.test(s)

export function toHinglish(line: string): string {
  if (!hasDevanagari(line)) return line
  return line
    .replace(/[।॥]/g, ',')
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/[ऀ-ॿ‌‍]+/g, (w) => word(w.replace(/[‌‍]/g, '')))
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase())
}
