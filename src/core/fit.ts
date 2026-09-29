import { maxWordLength } from './directions'
import { DEFAULT_BUDGET, generate } from './generator'
import { GRID_MAX } from './limits'
import type { FitSuggestion, GenerateInput, GenerateResult, WordEntry } from './types'

/**
 * Trial runs use the same seed with fewer restarts. A trial that succeeds is replayed exactly by a
 * full run (which only allows more restarts), so a suggestion built from one is safe to apply.
 */
const TRIAL_RESTARTS = 16
const TRIAL_MS = 600
/**
 * Auto-size trials get more time than the trials that verify a trim, so after the teacher removes the
 * suggested words, timing jitter can't stop auto-size from replaying the verified success.
 */
const AUTO_TRIAL_MS = TRIAL_MS * 2
/**
 * Latency budget for a whole call, shared by the initial run and the search. If the initial full-budget
 * run was slow, the search still gets MIN_SEARCH_MS, so the worst case is the generator's own time
 * budget plus MIN_SEARCH_MS (and one placement attempt, since generate() checks its clock between
 * attempts). MIN_SEARCH_MS exceeds TRIAL_MS so the first trial at the largest grid always gets its full time.
 */
const TOTAL_MS = 3000
const MIN_SEARCH_MS = 1000
/** Without overlaps, trim until words cover at most this share of the largest grid before trying. */
const NO_OVERLAP_FILL = 0.85

type Failure = Extract<GenerateResult, { ok: false }>

const now = () => (globalThis.performance ? globalThis.performance.now() : Date.now())

/** A reduced-budget run that never plans to run past `deadline`. */
function trial(input: GenerateInput, deadline: number, rows: number, cols: number, words: WordEntry[] = input.words, timeMs = TRIAL_MS): GenerateResult {
  const full = { ...DEFAULT_BUDGET, ...input.budget }
  const left = Math.max(1, deadline - now())
  const budget = { ...full, restarts: Math.min(full.restarts, TRIAL_RESTARTS), timeMs: Math.min(full.timeMs, timeMs, left) }
  return generate({ ...input, rows, cols, words, budget })
}

/** True if a bigger grid or fewer words could fix this failure (no other errors in the way). */
function sizeRelated(res: Failure, input: GenerateInput): boolean {
  if (input.mask) return false
  if (res.reason === 'budget-exhausted') return true
  const longest = maxWordLength(GRID_MAX, GRID_MAX, input.directions)
  return (
    res.issues.length > 0 &&
    res.issues.every((i) => {
      if (i.code === 'over-capacity') return true
      if (i.code !== 'too-long') return false
      const w = input.words.find((x) => x.id === i.wordIds[0])
      return !!w && w.token.length <= longest
    })
  )
}

/** Smallest step in (lo, hi] whose trial succeeds, given that `hi` already has. */
function smallest(lo: number, hi: number, hiResult: GenerateResult, at: (k: number) => GenerateResult, deadline: number) {
  let best = { k: hi, result: hiResult }
  while (hi - lo > 1 && now() < deadline) {
    const mid = (lo + hi) >> 1
    const res = at(mid)
    if (res.ok) {
      hi = mid
      best = { k: mid, result: res }
    } else {
      lo = mid
    }
  }
  return best
}

/** Shortest first; among equal lengths, the most recently added first. */
function shortestFirst(words: readonly WordEntry[]): WordEntry[] {
  return words
    .map((w, i) => ({ w, i }))
    .sort((a, b) => a.w.token.length - b.w.token.length || b.i - a.i)
    .map((x) => x.w)
}

/**
 * Words to remove so the rest fit the largest grid. Repeatedly drops the words that didn't fit the
 * last trial there, then binary-searches back to the shortest removal that still worked. Returns null
 * if no trial succeeded before the deadline.
 */
function trimToFit(input: GenerateInput, atMax: Failure, deadline: number): string[] | null {
  const order: string[] = []
  const without = (count: number) => {
    const drop = new Set(order.slice(0, count))
    return input.words.filter((w) => !drop.has(w.id))
  }
  const at = (count: number) => trial(input, deadline, GRID_MAX, GRID_MAX, without(count))

  if (input.overlap === 'none') {
    // Every letter needs its own square, so drop short words until there's room to place the rest.
    let letters = input.words.reduce((n, w) => n + w.token.length, 0)
    for (const w of shortestFirst(input.words)) {
      if (letters <= GRID_MAX * GRID_MAX * NO_OVERLAP_FILL) break
      order.push(w.id)
      letters -= w.token.length
    }
  }

  let failed = 0
  let res: GenerateResult = order.length ? at(order.length) : atMax
  const started = now()
  while (true) {
    if (res.ok) return order.slice(0, smallest(failed, order.length, res, at, deadline).k)
    if (!sizeRelated(res, input)) return null
    failed = order.length
    const kept = without(failed)
    if (now() > deadline) return null
    const unplaced = new Set(res.unplaced)
    const ids = kept.filter((w) => unplaced.has(w.display)).map((w) => w.id)
    // Near the limit a trial may leave out only a word or two. Once time runs short, top up with the
    // shortest words in growing steps so the search finishes; the binary search trims any overshoot.
    const elapsed = (now() - started) / Math.max(1, deadline - started)
    const minStep = elapsed < 0.4 ? 1 : 2 ** Math.round((elapsed - 0.4) * 10)
    for (const w of shortestFirst(kept)) {
      if (ids.length >= minStep) break
      if (!ids.includes(w.id)) ids.push(w.id)
    }
    if (ids.length >= kept.length) return null
    order.push(...ids)
    res = at(order.length)
  }
}

/**
 * After a capacity failure at the input's size: the smallest larger grid that works (growing rows and
 * columns together, up to GRID_MAX), or, if even the largest grid fails, which words to remove.
 */
export function findFit(input: GenerateInput, failure: Failure, deadline = now() + TOTAL_MS): FitSuggestion | null {
  if (!sizeRelated(failure, input)) return null
  const { rows, cols } = input
  const steps = GRID_MAX - Math.min(rows, cols)
  const size = (k: number) => [Math.min(GRID_MAX, rows + k), Math.min(GRID_MAX, cols + k)] as const

  let atMax: GenerateResult = failure
  if (steps > 0) {
    atMax = trial(input, deadline, GRID_MAX, GRID_MAX)
    if (atMax.ok) {
      const [r, c] = size(smallest(0, steps, atMax, (k) => trial(input, deadline, ...size(k)), deadline).k)
      return { kind: 'grow', rows: r, cols: c }
    }
    if (!sizeRelated(atMax, input)) return null
  }
  const removeIds = trimToFit(input, atMax, deadline)
  return removeIds ? { kind: 'trim', rows: GRID_MAX, cols: GRID_MAX, removeIds } : null
}

/** Smallest square grid likely to fit the words at the target density. */
export function suggestSize(words: readonly WordEntry[], density: number, min = 6, max = GRID_MAX): number {
  const letters = words.reduce((n, w) => n + w.token.length, 0)
  const longest = words.reduce((n, w) => Math.max(n, w.token.length), 0)
  const d = Math.min(0.9, Math.max(0.15, density))
  return Math.min(max, Math.max(min, longest, Math.ceil(Math.sqrt(letters / d))))
}

/**
 * Auto-size mode: starts from the density estimate and searches up to GRID_MAX for the smallest square
 * that fits. If even the largest grid fails, the failure carries a `trim` suggestion.
 */
export function generateAutoSize(input: GenerateInput, min = 6): GenerateResult {
  const deadline = now() + TOTAL_MS
  const start = suggestSize(input.words, input.density, min, GRID_MAX)
  const at = (n: number) => trial(input, deadline, n, n, input.words, AUTO_TRIAL_MS)
  const first = at(start)
  if (first.ok || !sizeRelated(first, input)) return first

  let atMax: GenerateResult = first
  if (start < GRID_MAX) {
    atMax = at(GRID_MAX)
    if (atMax.ok) return smallest(start, GRID_MAX, atMax, at, deadline).result
    if (!sizeRelated(atMax, input)) return atMax
  }
  const removeIds = trimToFit(input, atMax, deadline)
  return removeIds ? { ...atMax, fit: { kind: 'trim', rows: GRID_MAX, cols: GRID_MAX, removeIds } } : atMax
}

/** Generates, and on a capacity failure attaches a verified `fit` suggestion. */
export function generateWithFit(input: GenerateInput, autoSize: boolean): GenerateResult {
  if (autoSize) return generateAutoSize(input)
  const t0 = now()
  const res = generate(input)
  if (res.ok) return res
  const fit = findFit(input, res, Math.max(t0 + TOTAL_MS, now() + MIN_SEARCH_MS))
  return fit ? { ...res, fit } : res
}
