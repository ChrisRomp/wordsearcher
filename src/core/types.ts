export type DirectionId = 'E' | 'W' | 'S' | 'N' | 'SE' | 'NW' | 'NE' | 'SW'
export type OverlapPolicy = 'none' | 'allow' | 'prefer'
export type FillerMode = 'random' | 'frequency' | 'decoy'
export type WordSource = 'custom' | 'curated' | 'dict'
export type Level = 1 | 2 | 3

/** A word as the teacher sees it (`display`) and as it appears in the grid (`token`). */
export interface WordEntry {
  id: string
  display: string
  token: string
  source: WordSource
  clue?: string
  level?: Level
  themeId?: string
}

export interface Placement {
  wordId: string
  token: string
  display: string
  clue?: string
  source: WordSource
  r: number
  c: number
  dir: DirectionId
  /** Word was drawn from the auto-fill pool rather than the teacher's list. */
  fromPool: boolean
  /** Word id of the host word this one is nested inside (e.g. CAT inside CATALOG). */
  nestedIn?: string
}

export interface GenerateBudget {
  /** Full placement restarts before giving up. */
  restarts: number
  /** Filler repair rounds per placement attempt. */
  repairRounds: number
  /** Wall-clock cap in milliseconds. */
  timeMs: number
}

export interface GenerateInput {
  rows: number
  cols: number
  /** Optional usable-cell mask (true = usable). Defaults to the full rectangle. */
  mask?: boolean[][]
  words: WordEntry[]
  /** Optional words used to fill toward the density target. */
  pool?: WordEntry[]
  directions: DirectionId[]
  overlap: OverlapPolicy
  filler: FillerMode
  /** Target fraction of usable cells covered by answer letters (0–1). Only drives pool filling. */
  density: number
  maxWords?: number
  /** Tokens the teacher allowed to be nested inside a longer word. */
  allowNested?: string[]
  seed: string
  budget?: Partial<GenerateBudget>
}

export type IssueCode =
  | 'empty'
  | 'no-directions'
  | 'too-short'
  | 'too-long'
  | 'duplicate'
  | 'contained'
  | 'reverse-conflict'
  | 'over-capacity'
  | 'too-many-words'

export interface ValidationIssue {
  code: IssueCode
  severity: 'error' | 'warning'
  message: string
  wordIds: string[]
  /** For `contained`: the host word id and whether nesting is possible. */
  hostId?: string
  nestable?: boolean
}

/**
 * A verified way out of a capacity failure: a trial run with the same seed succeeded, so applying it
 * regenerates successfully. `grow` is the smallest larger grid found within the time budget. `trim`
 * means the trial at the largest grid failed (a reduced budget, so a full run or another seed might
 * still fit every word); with exactly `removeIds` removed, the other words fit there. It's one working
 * set, not the only one, and it may include words that were placed in some attempts.
 */
export type FitSuggestion =
  | { kind: 'grow'; rows: number; cols: number }
  | { kind: 'trim'; rows: number; cols: number; removeIds: string[] }

export interface GenerateStats {
  density: number
  coveredCells: number
  usableCells: number
  restarts: number
  repairRounds: number
  ms: number
}

export type GenerateResult =
  | {
      ok: true
      /** Row-major letters; '' for masked-out cells. */
      grid: string[][]
      placements: Placement[]
      stats: GenerateStats
      warnings: ValidationIssue[]
    }
  | {
      ok: false
      reason: 'invalid-input' | 'budget-exhausted'
      issues: ValidationIssue[]
      /** Words that could not be placed in the best attempt (budget-exhausted only). */
      unplaced: string[]
      stats?: Partial<GenerateStats>
      fit?: FitSuggestion
    }
