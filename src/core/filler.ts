import { DIRECTIONS } from './directions'
import type { Rng } from './rng'
import type { DirectionId, FillerMode } from './types'

const A = 65
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Approximate English letter frequencies (%), A–Z. */
export const ENGLISH_FREQ = [
  8.2, 1.5, 2.8, 4.3, 12.7, 2.2, 2.0, 6.1, 7.0, 0.15, 0.77, 4.0, 2.4, 6.7, 7.5, 1.9, 0.095, 6.0, 6.3, 9.1, 2.8, 0.98,
  2.4, 0.15, 2.0, 0.074,
]
const UNIFORM = new Array(26).fill(1)

export interface FillContext {
  grid: string[]
  rows: number
  cols: number
  usable: boolean[]
  /** Cells that belong to an answer (immutable during filling/repair). */
  isAnswer: boolean[]
  tokens: string[]
  directions: DirectionId[]
}

/** Letter weights for a filler mode. `escalation` > 0 broadens toward uniform to escape repair loops. */
export function letterWeights(mode: FillerMode, tokens: readonly string[], escalation = 0): number[] {
  if (escalation >= 2 || mode === 'random') return UNIFORM
  if (mode === 'frequency' || escalation === 1) return ENGLISH_FREQ
  const counts = new Array(26).fill(0)
  let total = 0
  for (const t of tokens)
    for (const ch of t) {
      counts[ch.charCodeAt(0) - A]++
      total++
    }
  const freqTotal = ENGLISH_FREQ.reduce((a, b) => a + b, 0)
  return counts.map((n, i) => (total ? (0.7 * n) / total : 0) + (0.3 * ENGLISH_FREQ[i]) / freqTotal)
}

export function randomLetter(rng: Rng, weights: readonly number[], avoid?: string): string {
  for (let tries = 0; tries < 8; tries++) {
    const ch = LETTERS[rng.weighted(weights)]
    if (ch !== avoid) return ch
  }
  return LETTERS[rng.int(26)]
}

/**
 * Fills every empty usable cell. Decoy mode first scatters fragments (prefixes/suffixes) of the
 * puzzle's words so near-misses appear, then fills the rest from the words' own letters.
 */
export function fillGrid(ctx: FillContext, mode: FillerMode, rng: Rng): void {
  const { grid, rows, cols, usable, isAnswer } = ctx
  const isFree = (i: number) => usable[i] && !isAnswer[i] && !grid[i]
  if (mode === 'decoy' && ctx.tokens.length > 0) {
    const freeCount = grid.reduce((n, _, i) => n + (isFree(i) ? 1 : 0), 0)
    const fragments = Math.floor(freeCount / 10)
    for (let f = 0; f < fragments * 3 && f < 2000; f++) {
      const token = rng.pick(ctx.tokens)
      if (token.length < 3) continue
      const len = Math.min(token.length - 1, 2 + rng.int(3))
      const frag = rng.next() < 0.7 ? token.slice(0, len) : token.slice(token.length - len)
      const d = DIRECTIONS[rng.pick(ctx.directions)]
      const r = rng.int(rows)
      const c = rng.int(cols)
      let ok = true
      for (let i = 0; i < frag.length && ok; i++) {
        const rr = r + d.dr * i
        const cc = c + d.dc * i
        ok = rr >= 0 && rr < rows && cc >= 0 && cc < cols && isFree(rr * cols + cc)
      }
      if (!ok) continue
      for (let i = 0; i < frag.length; i++) grid[(r + d.dr * i) * cols + (c + d.dc * i)] = frag[i]
    }
  }
  const weights = letterWeights(mode, ctx.tokens)
  for (let i = 0; i < grid.length; i++) if (isFree(i)) grid[i] = randomLetter(rng, weights)
}
