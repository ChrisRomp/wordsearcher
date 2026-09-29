import { ALL_DIRECTIONS, DIRECTIONS, maxWordLength, pathCells } from './directions'
import { fillGrid, letterWeights, randomLetter } from './filler'
import { MIN_TOKEN_LENGTH } from './normalize'
import { createRng, type Rng } from './rng'
import { getBlocklist } from './safety'
import { Trie, cellKey, matchCells, scanGrid } from './scan'
import type {
  DirectionId,
  FillerMode,
  GenerateBudget,
  GenerateInput,
  GenerateResult,
  OverlapPolicy,
  Placement,
  ValidationIssue,
  WordEntry,
} from './types'
import { analyzeWords, anyReversible, tokensConflict } from './validate'

/** Bump when placement/fill behavior changes; stored in PuzzleDoc so old links stay reproducible. */
export const GENERATOR_VERSION = 1

export const DEFAULT_BUDGET: GenerateBudget = { restarts: 80, repairRounds: 200, timeMs: 4000 }

/** Axis bit per direction; words on the same axis may not share cells. */
const AXIS: Record<DirectionId, number> = { E: 1, W: 1, S: 2, N: 2, SE: 4, NW: 4, NE: 8, SW: 8 }
const POOL_MAX_CONSECUTIVE_MISSES = 40

const now = () => (globalThis.performance ? globalThis.performance.now() : Date.now())

interface Candidate {
  r: number
  c: number
  dir: DirectionId
  overlaps: number
}

class Board {
  readonly letters: string[]
  readonly axis: Uint8Array
  readonly isAnswer: boolean[]
  covered = 0
  readonly rows: number
  readonly cols: number
  readonly usable: boolean[]

  constructor(rows: number, cols: number, usable: boolean[]) {
    this.rows = rows
    this.cols = cols
    this.usable = usable
    this.letters = new Array(rows * cols).fill('')
    this.axis = new Uint8Array(rows * cols)
    this.isAnswer = new Array(rows * cols).fill(false)
  }

  candidates(token: string, dirs: readonly DirectionId[], overlap: OverlapPolicy): Candidate[] {
    const { rows, cols, letters, axis, usable } = this
    const L = token.length
    const out: Candidate[] = []
    for (const dir of dirs) {
      const d = DIRECTIONS[dir]
      const bit = AXIS[dir]
      const rMin = d.dr < 0 ? L - 1 : 0
      const rMax = d.dr > 0 ? rows - L : rows - 1
      const cMin = d.dc < 0 ? L - 1 : 0
      const cMax = d.dc > 0 ? cols - L : cols - 1
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          let overlaps = 0
          let ok = true
          for (let i = 0; i < L; i++) {
            const idx = (r + d.dr * i) * cols + (c + d.dc * i)
            if (!usable[idx]) {
              ok = false
              break
            }
            const ch = letters[idx]
            if (ch) {
              if (ch !== token[i] || axis[idx] & bit) {
                ok = false
                break
              }
              overlaps++
            }
          }
          if (!ok || overlaps === L) continue
          if (overlap === 'none' && overlaps > 0) continue
          out.push({ r, c, dir, overlaps })
        }
      }
    }
    return out
  }

  place(token: string, r: number, c: number, dir: DirectionId): void {
    const d = DIRECTIONS[dir]
    for (let i = 0; i < token.length; i++) {
      const idx = (r + d.dr * i) * this.cols + (c + d.dc * i)
      if (!this.letters[idx]) this.covered++
      this.letters[idx] = token[i]
      this.axis[idx] |= AXIS[dir]
      this.isAnswer[idx] = true
    }
  }
}

function choose(cands: Candidate[], overlap: OverlapPolicy, rng: Rng): Candidate {
  const byDir = new Map<DirectionId, Candidate[]>()
  for (const cand of cands) {
    const list = byDir.get(cand.dir)
    if (list) list.push(cand)
    else byDir.set(cand.dir, [cand])
  }
  const groups = [...byDir.values()]
  // Pick a direction first so directions with more room (horizontal/vertical) don't crowd out diagonals.
  const dirWeights =
    overlap === 'prefer' ? groups.map((g) => (1 + Math.max(...g.map((x) => x.overlaps))) ** 2) : groups.map(() => 1)
  const group = groups[rng.weighted(dirWeights)]
  const weights = group.map((x) => (overlap === 'prefer' ? (1 + x.overlaps) ** 3 : overlap === 'allow' ? 1 + x.overlaps : 1))
  return group[rng.weighted(weights)]
}

function toPlacement(w: WordEntry, pos: { r: number; c: number; dir: DirectionId }, fromPool: boolean): Placement {
  const p: Placement = {
    wordId: w.id,
    token: w.token,
    display: w.display,
    source: w.source,
    r: pos.r,
    c: pos.c,
    dir: pos.dir,
    fromPool,
  }
  if (w.clue) p.clue = w.clue
  return p
}

interface RepairOutcome {
  ok: boolean
  rounds: number
}

/**
 * Scans the whole grid and repairs filler until every answer appears exactly once (in the enabled
 * directions) and no blocklisted word appears in any direction. Violations made only of answer
 * letters can't be repaired here and force a placement restart.
 */
function repair(
  board: Board,
  placements: Placement[],
  dirs: DirectionId[],
  mode: FillerMode,
  maxRounds: number,
  rng: Rng,
): RepairOutcome {
  const { rows, cols, letters, isAnswer } = board
  const trie = new Trie()
  for (const p of placements) trie.add(p.token)
  const answerCount = placements.length
  for (const b of getBlocklist()) trie.add(b)

  const expected = placements.map((p) => cellKey(pathCells(p.r, p.c, p.dir, p.token.length).map(([r, c]) => r * cols + c)))
  const owners: number[][] = Array.from({ length: rows * cols }, () => [])
  placements.forEach((p, pi) => {
    for (const [r, c] of pathCells(p.r, p.c, p.dir, p.token.length)) owners[r * cols + c].push(pi)
  })
  const withinOnePlacement = (cells: number[]) =>
    owners[cells[0]].some((pi) => cells.every((cell) => owners[cell].includes(pi)))

  const tokens = placements.map((p) => p.token)
  const enabled = new Set(dirs)

  for (let round = 0; round < maxRounds; round++) {
    const violations: number[][] = []
    for (const m of scanGrid(letters, rows, cols, trie, ALL_DIRECTIONS)) {
      const cells = matchCells(m, cols)
      if (m.tokenIndex < answerCount) {
        if (!enabled.has(m.dir) || cellKey(cells) === expected[m.tokenIndex]) continue
      } else if (cells.every((i) => isAnswer[i]) && withinOnePlacement(cells)) {
        // A teacher's own word containing a blocked string is their call; we only stop filler from creating one.
        continue
      }
      violations.push(cells)
    }
    if (violations.length === 0) return { ok: true, rounds: round }

    const escalation = round < 30 ? 0 : round < 80 ? 1 : 2
    const weights = letterWeights(mode, tokens, escalation)
    for (const cells of violations) {
      const free = cells.filter((i) => !isAnswer[i])
      if (free.length === 0) return { ok: false, rounds: round }
      const i = rng.pick(free)
      letters[i] = randomLetter(rng, weights, letters[i])
    }
  }
  return { ok: false, rounds: maxRounds }
}

function usableMask(input: GenerateInput): boolean[] {
  const { rows, cols, mask } = input
  const out = new Array(rows * cols).fill(true)
  if (mask) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out[r * cols + c] = mask[r]?.[c] ?? false
  return out
}

function quoteList(items: readonly string[], max = 5): string {
  const quoted = items.map((u) => `“${u}”`)
  if (quoted.length <= max) return quoted.join(', ')
  return `${quoted.slice(0, max).join(', ')} and ${quoted.length - max} more words`
}

export function generate(input: GenerateInput): GenerateResult {
  const t0 = now()
  const budget = { ...DEFAULT_BUDGET, ...input.budget }
  const { rows, cols } = input
  const usable = usableMask(input)
  const usableCount = usable.filter(Boolean).length
  const dirs = ALL_DIRECTIONS.filter((d) => input.directions.includes(d))

  const analysis = analyzeWords(input.words, {
    rows,
    cols,
    usableCells: usableCount,
    directions: dirs,
    overlap: input.overlap,
    allowNested: input.allowNested,
  })
  const errors = analysis.issues.filter((i) => i.severity === 'error')
  const warnings = analysis.issues.filter((i) => i.severity === 'warning')
  if (input.words.length === 0 && !input.pool?.length) {
    errors.push({ code: 'empty', severity: 'error', message: 'Add some words or pick a theme.', wordIds: [] })
  }
  if (errors.length > 0) return { ok: false, reason: 'invalid-input', issues: errors, unplaced: [] }

  const rng = createRng(`${input.seed}|g${GENERATOR_VERSION}`)
  const required = input.words
  const primary = required.filter((w) => !analysis.nested.has(w.id))
  const nestedWords = required.filter((w) => analysis.nested.has(w.id))
  const reversible = anyReversible(dirs)
  const maxLen = maxWordLength(rows, cols, dirs)
  const requiredTokens = required.map((w) => w.token)
  const pool = (input.pool ?? []).filter(
    (w) =>
      w.token.length >= MIN_TOKEN_LENGTH &&
      w.token.length <= maxLen &&
      !requiredTokens.some((t) => tokensConflict(t, w.token, reversible)),
  )
  const maxWords = input.maxWords ?? Infinity
  const target = Math.min(0.95, Math.max(0, input.density)) * usableCount

  let bestUnplaced: string[] | null = null
  let totalRepairs = 0
  let attempt = 0
  for (; attempt <= budget.restarts; attempt++) {
    if (attempt > 0 && now() - t0 > budget.timeMs) break
    const board = new Board(rows, cols, usable)
    const placements: Placement[] = []

    const order = rng.shuffle([...primary]).sort((a, b) => b.token.length - a.token.length)
    const unplaced: string[] = []
    for (const w of order) {
      const cands = board.candidates(w.token, analysis.allowedDirs.get(w.id) ?? dirs, input.overlap)
      if (cands.length === 0) {
        unplaced.push(w.display)
        continue
      }
      const pick = choose(cands, input.overlap, rng)
      board.place(w.token, pick.r, pick.c, pick.dir)
      placements.push(toPlacement(w, pick, false))
    }
    if (unplaced.length > 0) {
      if (!bestUnplaced || unplaced.length < bestUnplaced.length) bestUnplaced = unplaced
      continue
    }

    for (const w of nestedWords) {
      const host = placements.find((p) => p.wordId === analysis.nested.get(w.id))!
      const offset = host.token.indexOf(w.token)
      const d = DIRECTIONS[host.dir]
      placements.push({
        ...toPlacement(w, { r: host.r + d.dr * offset, c: host.c + d.dc * offset, dir: host.dir }, false),
        nestedIn: host.wordId,
      })
    }

    if (pool.length > 0 && placements.length < maxWords && board.covered < target) {
      const chosen = [...requiredTokens]
      let misses = 0
      for (const w of rng.shuffle([...pool])) {
        if (placements.length >= maxWords || board.covered >= target || misses >= POOL_MAX_CONSECUTIVE_MISSES) break
        if (chosen.some((t) => tokensConflict(t, w.token, reversible))) continue
        const cands = board.candidates(w.token, dirs, input.overlap)
        if (cands.length === 0) {
          misses++
          continue
        }
        misses = 0
        const pick = choose(cands, input.overlap, rng)
        board.place(w.token, pick.r, pick.c, pick.dir)
        placements.push(toPlacement(w, pick, true))
        chosen.push(w.token)
      }
      if (placements.length === 0) {
        bestUnplaced ??= []
        continue
      }
    }

    fillGrid(
      {
        grid: board.letters,
        rows,
        cols,
        usable,
        isAnswer: board.isAnswer,
        tokens: placements.map((p) => p.token),
        directions: dirs,
      },
      input.filler,
      rng,
    )
    const outcome = repair(board, placements, dirs, input.filler, budget.repairRounds, rng)
    totalRepairs += outcome.rounds
    if (!outcome.ok) {
      bestUnplaced ??= []
      continue
    }

    const grid: string[][] = []
    for (let r = 0; r < rows; r++) grid.push(board.letters.slice(r * cols, (r + 1) * cols).map((ch, c) => (usable[r * cols + c] ? ch : '')))
    const inputOrder = new Map(required.map((w, i) => [w.id, i]))
    placements.sort((a, b) => (inputOrder.get(a.wordId) ?? Infinity) - (inputOrder.get(b.wordId) ?? Infinity))
    return {
      ok: true,
      grid,
      placements,
      warnings,
      stats: {
        density: board.covered / usableCount,
        coveredCells: board.covered,
        usableCells: usableCount,
        restarts: attempt,
        repairRounds: totalRepairs,
        ms: Math.round(now() - t0),
      },
    }
  }

  const unplaced = bestUnplaced ?? []
  const issue: ValidationIssue = unplaced.length
    ? {
        code: 'over-capacity',
        severity: 'error',
        message: `Couldn't fit ${quoteList(unplaced)}. Try a bigger grid, more directions, allowing overlaps, or fewer words.`,
        wordIds: required.filter((w) => unplaced.includes(w.display)).map((w) => w.id),
      }
    : {
        code: 'over-capacity',
        severity: 'error',
        message: 'Couldn’t build a clean puzzle with these settings. Try Regenerate, a bigger grid, or different words.',
        wordIds: [],
      }
  return {
    ok: false,
    reason: 'budget-exhausted',
    issues: [issue],
    unplaced,
    stats: { restarts: attempt, repairRounds: totalRepairs, ms: Math.round(now() - t0) },
  }
}
