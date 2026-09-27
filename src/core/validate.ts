import { ALL_DIRECTIONS, DIRECTIONS, maxWordLength } from './directions'
import { MIN_TOKEN_LENGTH, countOccurrences, reverse } from './normalize'
import type { DirectionId, OverlapPolicy, ValidationIssue, WordEntry } from './types'

export const MAX_WORDS = 150

export interface AnalyzeOptions {
  rows: number
  cols: number
  usableCells: number
  directions: DirectionId[]
  overlap: OverlapPolicy
  allowNested?: string[]
}

export interface WordAnalysis {
  issues: ValidationIssue[]
  /** Directions each word may be placed in (reverse-containment can restrict these). */
  allowedDirs: Map<string, DirectionId[]>
  /** Nested word id → host word id. */
  nested: Map<string, string>
}

/** Directions that can't be read backwards within the enabled set. */
function oneWayDirections(dirs: readonly DirectionId[]): DirectionId[] {
  return dirs.filter((d) => !dirs.includes(DIRECTIONS[d].opposite))
}

export function anyReversible(dirs: readonly DirectionId[]): boolean {
  return dirs.some((d) => dirs.includes(DIRECTIONS[d].opposite))
}

/**
 * True if two tokens can't safely share a puzzle without special handling: one contains the other,
 * or (when words can be read backwards) one contains the other's reverse.
 */
export function tokensConflict(a: string, b: string, reversible: boolean): boolean {
  if (a === b || a.includes(b) || b.includes(a)) return true
  if (!reversible) return false
  const ra = reverse(a)
  return b.includes(ra) || ra.includes(b)
}

export function analyzeWords(words: readonly WordEntry[], opts: AnalyzeOptions): WordAnalysis {
  const issues: ValidationIssue[] = []
  const allowedDirs = new Map<string, DirectionId[]>()
  const nested = new Map<string, string>()
  const dirs = ALL_DIRECTIONS.filter((d) => opts.directions.includes(d))
  const allowNested = new Set(opts.allowNested ?? [])

  if (dirs.length === 0) {
    issues.push({ code: 'no-directions', severity: 'error', message: 'Turn on at least one word direction.', wordIds: [] })
  }
  if (words.length > MAX_WORDS) {
    issues.push({
      code: 'too-many-words',
      severity: 'error',
      message: `That's ${words.length} words — the limit is ${MAX_WORDS}.`,
      wordIds: [],
    })
  }

  const maxLen = maxWordLength(opts.rows, opts.cols, dirs)
  const valid: WordEntry[] = []
  for (const w of words) {
    if (w.token.length < MIN_TOKEN_LENGTH) {
      issues.push({ code: 'too-short', severity: 'error', message: `“${w.display}” is too short.`, wordIds: [w.id] })
    } else if (dirs.length > 0 && w.token.length > maxLen) {
      issues.push({
        code: 'too-long',
        severity: 'error',
        message: `“${w.display}” has ${w.token.length} letters, but only ${maxLen} fit with these directions and grid size.`,
        wordIds: [w.id],
      })
    } else {
      valid.push(w)
    }
  }

  const byToken = new Map<string, WordEntry[]>()
  for (const w of valid) byToken.set(w.token, [...(byToken.get(w.token) ?? []), w])
  const unique: WordEntry[] = []
  for (const [token, group] of byToken) {
    unique.push(group[0])
    if (group.length > 1) {
      issues.push({
        code: 'duplicate',
        severity: 'error',
        message: `${token} is in the list ${group.length} times${group.some((g) => g.display !== group[0].display) ? ' (after removing spaces and accents)' : ''}.`,
        wordIds: group.map((g) => g.id),
      })
    }
  }

  const oneWay = oneWayDirections(dirs)
  for (const w of unique) allowedDirs.set(w.id, [...dirs])

  for (const a of unique) {
    const others = unique.filter((b) => b.id !== a.id)
    const hosts = others.filter((b) => b.token.includes(a.token))
    if (hosts.length > 0) {
      const total = hosts.reduce((n, b) => n + countOccurrences(b.token, a.token), 0)
      const nestable = total === 1
      if (nestable && allowNested.has(a.token)) {
        nested.set(a.id, hosts[0].id)
      } else {
        issues.push({
          code: 'contained',
          severity: 'error',
          message: nestable
            ? `${a.token} is hidden inside ${hosts[0].token}, so it would appear twice.`
            : `${a.token} appears inside ${hosts.map((h) => h.token).join(', ')} more than once, so it can't be found uniquely.`,
          wordIds: [a.id],
          hostId: hosts[0].id,
          nestable,
        })
      }
    }

    // B contains reverse(A): reading B backwards would reveal A, so B must go one-way.
    const ra = reverse(a.token)
    if (ra === a.token) continue
    for (const b of others) {
      if (!b.token.includes(ra)) continue
      const restricted = (allowedDirs.get(b.id) ?? []).filter((d) => oneWay.includes(d))
      allowedDirs.set(b.id, restricted)
      if (restricted.length === 0 && dirs.length > 0) {
        issues.push({
          code: 'reverse-conflict',
          severity: 'error',
          message:
            b.token === ra
              ? `${a.token} and ${b.token} are each other spelled backwards, so one would reveal the other.`
              : `${b.token} spelled backwards contains ${a.token}, so ${a.token} would appear twice.`,
          wordIds: [a.id, b.id],
        })
      }
    }
  }

  const letters = unique.filter((w) => !nested.has(w.id)).reduce((n, w) => n + w.token.length, 0)
  if (opts.overlap === 'none' && letters > opts.usableCells) {
    issues.push({
      code: 'over-capacity',
      severity: 'error',
      message: `The words have ${letters} letters but the grid only has ${opts.usableCells} squares. Use a bigger grid, fewer words, or allow overlaps.`,
      wordIds: [],
    })
  } else if (letters > opts.usableCells * 0.85) {
    issues.push({
      code: 'over-capacity',
      severity: 'warning',
      message: `The grid is very full (${letters} letters in ${opts.usableCells} squares), so it might not fit.`,
      wordIds: [],
    })
  }

  return { issues, allowedDirs, nested }
}
