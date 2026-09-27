export type DictLevel = 1 | 2 | 3

export function rot13(s: string): string {
  return s.replace(/[A-Z]/g, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 65 + 13) % 26) + 65))
}

export function foldAscii(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[œŒ]/g, (ch) => (ch === 'Œ' ? 'OE' : 'oe'))
    .replace(/[æÆ]/g, (ch) => (ch === 'Æ' ? 'AE' : 'ae'))
    .replace(/[ß]/g, 'ss')
    .replace(/[øØ]/g, (ch) => (ch === 'Ø' ? 'O' : 'o'))
    .replace(/\p{M}/gu, '')
}

export function toToken(input: string): string {
  return foldAscii(input)
    .toUpperCase()
    .replace(/[\s\-'’._]/g, '')
    .replace(/[^A-Z]/g, '')
}

export function canonicalLemma(input: string): string {
  return foldAscii(input)
    .replace(/_/g, ' ')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function titleCaseDisplay(input: string): string {
  const lowerWords = new Set(['and', 'of', 'the'])
  return canonicalLemma(input.toLowerCase()).replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (word, offset) => {
    if (offset > 0 && lowerWords.has(word)) return word
    return word.charAt(0).toUpperCase() + word.slice(1)
  })
}

export function scowlSizeToLevel(size: number): DictLevel | null {
  if (size <= 20) return 1
  if (size <= 35) return 2
  if (size <= 50) return 3
  return null
}

export function isAllowedDisplayForm(display: string): boolean {
  if (!/^[A-Za-z]+(?:[ \-'][A-Za-z]+)*$/.test(display)) return false
  if (/[ \-']{2,}/.test(display)) return false
  return true
}

export function splitDisplayParts(display: string): string[] {
  return foldAscii(display)
    .toLowerCase()
    .split(/[ \-']+/)
    .filter(Boolean)
}

export function hasBlocklistedToken(token: string, blocklistTokens: ReadonlySet<string>): boolean {
  for (const blocked of blocklistTokens) {
    if (blocked.length === 3) {
      if (token === blocked) return true
    } else if (blocked.length >= 4 && token.includes(blocked)) {
      return true
    }
  }
  return false
}

export function clueContainsBlockWord(clue: string, blocklistTokens: ReadonlySet<string>): boolean {
  for (const word of foldAscii(clue).toUpperCase().match(/[A-Z]+/g) ?? []) {
    if (blocklistTokens.has(word)) return true
  }
  return false
}

export type ClueResult =
  | { clue: string; reason?: undefined }
  | { clue?: undefined; reason: string }

export function makeClue(
  definition: string | undefined,
  display: string,
  blocklistTokens: ReadonlySet<string>,
): ClueResult {
  if (!definition) return { reason: 'missing-definition' }

  let clue = definition
    .split(';')[0]
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(?:of|in)\s+the\s+genus\s+[A-Z][a-z]+(?:\s+[a-z]+)?\b/g, '')
    .replace(/\bgenus\s+[A-Z][a-z]+(?:\s+[a-z]+)?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '')

  clue = clue.replace(/\s+,/g, ',').replace(/,\s*$/, '').trim()
  if (!clue) return { reason: 'empty-definition' }
  clue = clue.charAt(0).toUpperCase() + clue.slice(1)
  if (clue.length > 100) return { reason: 'long-clue' }
  if (clueContainsBlockWord(clue, blocklistTokens)) return { reason: 'blocked-clue' }

  const clueFolded = foldAscii(clue).toLowerCase()
  const clueToken = toToken(clue)
  const answerToken = toToken(display)
  if (answerToken && clueToken.includes(answerToken)) return { reason: 'answer-in-clue' }

  const lemmaParts = splitDisplayParts(display).filter((part) => part.length >= 3)
  for (const part of lemmaParts) {
    const pattern = new RegExp(`\\b${escapeRegExp(part)}\\b`, 'i')
    if (pattern.test(clueFolded)) return { reason: 'answer-part-in-clue' }
    if (part.length >= 4 && clueFolded.includes(part.slice(0, 4))) {
      return { reason: 'answer-stem-in-clue' }
    }
  }

  if (/\bgenus\s+[A-Z]/.test(clue)) return { reason: 'technical-clue' }
  return { clue }
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
