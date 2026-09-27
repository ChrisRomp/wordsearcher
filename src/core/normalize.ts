export interface NormalizedWord {
  display: string
  token: string
  error?: string
}

const SPECIAL: Record<string, string> = {
  ß: 'SS',
  ẞ: 'SS',
  æ: 'AE',
  Æ: 'AE',
  œ: 'OE',
  Œ: 'OE',
  ø: 'O',
  Ø: 'O',
  ł: 'L',
  Ł: 'L',
  đ: 'D',
  Đ: 'D',
  ð: 'D',
  Ð: 'D',
  þ: 'TH',
  Þ: 'TH',
  ı: 'I',
}

/** Characters dropped from the grid token but kept in the display text. */
const JOINERS = /[\s\-‐‑–—'’‘.·_]/g

export const MIN_TOKEN_LENGTH = 2

/**
 * Converts a teacher-entered word/phrase to its grid token.
 * "Black Hole" → BLACKHOLE, "Café" → CAFE, "T-Rex" → TREX.
 * Characters that can't be converted to A–Z produce an error instead of being silently dropped.
 */
export function normalizeWord(input: string): NormalizedWord {
  const display = input.trim().replace(/\s+/g, ' ')
  let folded = ''
  for (const ch of display) folded += SPECIAL[ch] ?? ch
  folded = folded.normalize('NFD').replace(/\p{M}/gu, '')
  const stripped = folded.replace(JOINERS, '').toUpperCase()
  const bad = [...new Set(stripped.replace(/[A-Z]/g, ''))]
  if (bad.length > 0) {
    return { display, token: '', error: `Can't use ${bad.map((b) => `“${b}”`).join(' ')} in a word search` }
  }
  if (stripped.length < MIN_TOKEN_LENGTH) {
    return { display, token: stripped, error: `Needs at least ${MIN_TOKEN_LENGTH} letters` }
  }
  return { display, token: stripped }
}

/**
 * Splits pasted text into entries. Newlines, commas, semicolons and tabs separate words;
 * spaces are kept so phrases like "Black Hole" stay together.
 */
export function splitWordInput(text: string): string[] {
  return text
    .split(/[\n\r,;\t]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function reverse(s: string): string {
  return [...s].reverse().join('')
}

/** Count (possibly overlapping) occurrences of `needle` in `hay`. */
export function countOccurrences(hay: string, needle: string): number {
  if (!needle) return 0
  let n = 0
  let i = hay.indexOf(needle)
  while (i !== -1) {
    n++
    i = hay.indexOf(needle, i + 1)
  }
  return n
}
