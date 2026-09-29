import { DIRECTIONS, pathCells } from '../core/directions'
import { GENERATOR_VERSION } from '../core/generator'
import { ID_ALPHABET } from '../core/rng'
import type { DirectionId, Placement, WordSource } from '../core/types'
import { DEFAULT_STYLE, GRID_MAX, defaultGenSettings, type GenSettings, type StyleSettings } from '../state/settings'

export const DOC_VERSION = 1

/**
 * A complete, self-contained puzzle snapshot. Opening a doc renders it exactly as saved; it is never
 * regenerated implicitly, so changes to the generator or word data can't alter shared puzzles.
 */
export interface PuzzleDoc {
  v: typeof DOC_VERSION
  /** Generator version that produced the grid. */
  gen: number
  /** Dictionary data version, if dictionary words were used. */
  data?: string
  seed: string
  rows: number
  cols: number
  /** Row-major letters, rows × cols characters ('.' = unused cell). */
  grid: string
  placements: Placement[]
  style: StyleSettings
  settings: GenSettings
  createdAt: number
}

export function createDoc(args: {
  grid: string[][]
  placements: Placement[]
  style: StyleSettings
  settings: GenSettings
  data?: string
}): PuzzleDoc {
  const rows = args.grid.length
  const cols = args.grid[0]?.length ?? 0
  const doc: PuzzleDoc = {
    v: DOC_VERSION,
    gen: GENERATOR_VERSION,
    seed: args.settings.seed,
    rows,
    cols,
    grid: args.grid.map((row) => row.map((ch) => ch || '.').join('')).join(''),
    placements: args.placements,
    style: args.style,
    settings: args.settings,
    createdAt: Date.now(),
  }
  if (args.data) doc.data = args.data
  return doc
}

export function docGrid(doc: Pick<PuzzleDoc, 'grid' | 'rows' | 'cols'>): string[][] {
  const out: string[][] = []
  for (let r = 0; r < doc.rows; r++)
    out.push([...doc.grid.slice(r * doc.cols, (r + 1) * doc.cols)].map((ch) => (ch === '.' ? '' : ch)))
  return out
}

type PuzzleContent = Pick<PuzzleDoc, 'grid' | 'placements' | 'cols'>

function contentHash(doc: PuzzleContent): number {
  const s = `${doc.cols}|${doc.grid}|${doc.placements.map((p) => `${p.token}@${p.r},${p.c},${p.dir}`).join(';')}`
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** Stable identity of the puzzle content (grid + answers); used to key play progress. */
export function docHash(doc: PuzzleContent): string {
  return contentHash(doc).toString(36)
}

/**
 * Short ID printed on worksheets so a sheet can be matched to its answer key. It fingerprints the
 * finished grid: any change to the letters or answers gives a new ID; clue, title, and style edits don't.
 */
export function puzzleId(doc: PuzzleContent): string {
  let n = contentHash(doc)
  let id = ''
  for (let i = 0; i < 6; i++) {
    id += ID_ALPHABET[n % ID_ALPHABET.length]
    n = Math.floor(n / ID_ALPHABET.length)
  }
  return id
}

/** Fraction of usable cells covered by answer letters. */
export function docDensity(doc: Pick<PuzzleDoc, 'grid' | 'placements' | 'cols'>): number {
  const cells = new Set<number>()
  for (const p of doc.placements) for (const [r, c] of pathCells(p.r, p.c, p.dir, p.token.length)) cells.add(r * doc.cols + c)
  const usable = [...doc.grid].filter((ch) => ch !== '.').length
  return usable ? cells.size / usable : 0
}

// ---------- validation for untrusted docs (share links, imported files, localStorage) ----------

const LIMITS = { display: 60, clue: 200, title: 120, words: 200 }
const SOURCES: WordSource[] = ['custom', 'curated', 'dict']
const DIR_IDS = Object.keys(DIRECTIONS) as DirectionId[]

export class DocError extends Error {}

function str(v: unknown, max: number, fallback = ''): string {
  return typeof v === 'string' ? v.slice(0, max) : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

function int(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

export function sanitizeStyle(raw: unknown): StyleSettings {
  const s = record(raw)
  const d = DEFAULT_STYLE
  return {
    title: str(s.title, LIMITS.title, d.title),
    titleFont: oneOf(s.titleFont, ['fredoka', 'nunito', 'patrick', 'atkinson', 'bree'], d.titleFont),
    titleColor: typeof s.titleColor === 'string' && /^#[0-9a-f]{6}$/i.test(s.titleColor) ? s.titleColor : d.titleColor,
    titleSize: oneOf(s.titleSize, ['sm', 'md', 'lg'], d.titleSize),
    gridFont: oneOf(s.gridFont, ['atkinson', 'nunito', 'fredoka'], d.gridFont),
    letterCase: oneOf(s.letterCase, ['upper', 'lower'], d.letterCase),
    listOrder: oneOf(s.listOrder, ['entered', 'alpha', 'length', 'hidden'], d.listOrder),
    clueMode: bool(s.clueMode, d.clueMode),
    showInstructions: bool(s.showInstructions, d.showInstructions),
    nameDate: bool(s.nameDate, d.nameDate),
    pageSize: oneOf(s.pageSize, ['letter', 'a4'], d.pageSize),
    orientation: oneOf(s.orientation, ['portrait', 'landscape'], d.orientation),
    answerKey: bool(s.answerKey, d.answerKey),
  }
}

export function sanitizeSettings(raw: unknown): GenSettings {
  const s = record(raw)
  const d = defaultGenSettings()
  const words = Array.isArray(s.words)
    ? s.words.slice(0, LIMITS.words).flatMap((w) => {
        const o = record(w)
        const token = str(o.token, 40)
        if (!/^[A-Z]{1,40}$/.test(token)) return []
        const entry: GenSettings['words'][number] = {
          id: str(o.id, 40) || Math.random().toString(36).slice(2),
          display: str(o.display, LIMITS.display) || token,
          token,
          source: oneOf(o.source, SOURCES, 'custom'),
        }
        const clue = str(o.clue, LIMITS.clue)
        if (clue) entry.clue = clue
        if (o.level === 1 || o.level === 2 || o.level === 3) entry.level = o.level
        if (typeof o.themeId === 'string') entry.themeId = str(o.themeId, 60)
        return [entry]
      })
    : d.words
  const dirs = Array.isArray(s.directions)
    ? s.directions.filter((x): x is DirectionId => DIR_IDS.includes(x as DirectionId))
    : d.directions
  const levels = Array.isArray(s.levels) ? s.levels.filter((x): x is 1 | 2 | 3 => x === 1 || x === 2 || x === 3) : d.levels
  return {
    words,
    rows: int(s.rows, 5, GRID_MAX, d.rows),
    cols: int(s.cols, 5, GRID_MAX, d.cols),
    autoSize: bool(s.autoSize, d.autoSize),
    directions: [...new Set(dirs)],
    overlap: oneOf(s.overlap, ['none', 'allow', 'prefer'], d.overlap),
    filler: oneOf(s.filler, ['random', 'frequency', 'decoy'], d.filler),
    density: typeof s.density === 'number' && s.density >= 0.1 && s.density <= 0.9 ? s.density : d.density,
    minLen: int(s.minLen, 2, 30, d.minLen),
    maxLen: int(s.maxLen, 2, 30, d.maxLen),
    levels: levels.length ? [...new Set(levels)] : d.levels,
    allowNested: Array.isArray(s.allowNested)
      ? s.allowNested.filter((x): x is string => typeof x === 'string' && /^[A-Z]{1,40}$/.test(x)).slice(0, 100)
      : d.allowNested,
    seed: str(s.seed, 40, d.seed) || d.seed,
  }
}

/**
 * Puzzles made with the old theme auto-fill feature have placements that aren't in the word list.
 * Fold them into the list so the puzzle can be edited without losing words.
 */
function adoptPoolWords(doc: PuzzleDoc): void {
  const listed = new Set(doc.settings.words.map((w) => w.token))
  const extra = doc.placements.filter((p) => !listed.has(p.token))
  if (extra.length === 0 && !doc.placements.some((p) => p.fromPool)) return
  doc.placements = doc.placements.map((p) => ({ ...p, fromPool: false }))
  doc.settings = {
    ...doc.settings,
    words: [
      ...doc.settings.words,
      ...extra.map((p) => ({ id: p.wordId, display: p.display, token: p.token, source: p.source, ...(p.clue ? { clue: p.clue } : {}) })),
    ],
  }
}

/** Validates an untrusted doc and returns a clean copy, or throws DocError. */
export function parseDoc(raw: unknown): PuzzleDoc {
  const o = record(raw)
  if (o.v !== DOC_VERSION) throw new DocError(o.v === undefined ? 'Not a puzzle' : `Unsupported puzzle version ${String(o.v)}`)
  const rows = int(o.rows, 1, GRID_MAX, -1)
  const cols = int(o.cols, 1, GRID_MAX, -1)
  if (rows < 0 || cols < 0) throw new DocError('Bad grid size')
  if (typeof o.grid !== 'string' || o.grid.length !== rows * cols || !/^[A-Z.]+$/.test(o.grid)) throw new DocError('Bad grid')
  if (!Array.isArray(o.placements) || o.placements.length > LIMITS.words) throw new DocError('Bad word list')
  const grid = o.grid
  const placements: Placement[] = o.placements.map((p, i) => {
    const q = record(p)
    const token = str(q.token, 40)
    const r = int(q.r, 0, rows - 1, -1)
    const c = int(q.c, 0, cols - 1, -1)
    if (!/^[A-Z]{2,40}$/.test(token) || r < 0 || c < 0 || !DIR_IDS.includes(q.dir as DirectionId))
      throw new DocError(`Bad word #${i + 1}`)
    const dir = q.dir as DirectionId
    pathCells(r, c, dir, token.length).forEach(([rr, cc], k) => {
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) throw new DocError(`Word #${i + 1} runs off the grid`)
      if (grid[rr * cols + cc] !== token[k]) throw new DocError(`Word #${i + 1} doesn't match the grid`)
    })
    const out: Placement = {
      wordId: str(q.wordId, 40) || `w${i}`,
      token,
      display: str(q.display, LIMITS.display) || token,
      source: oneOf(q.source, SOURCES, 'custom'),
      r,
      c,
      dir,
      fromPool: q.fromPool === true,
    }
    const clue = str(q.clue, LIMITS.clue)
    if (clue) out.clue = clue
    if (typeof q.nestedIn === 'string') out.nestedIn = str(q.nestedIn, 40)
    return out
  })
  const doc: PuzzleDoc = {
    v: DOC_VERSION,
    gen: int(o.gen, 0, 1000, 0),
    seed: str(o.seed, 40),
    rows,
    cols,
    grid,
    placements,
    style: sanitizeStyle(o.style),
    settings: sanitizeSettings(o.settings),
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
  }
  adoptPoolWords(doc)
  if (typeof o.data === 'string') doc.data = str(o.data, 60)
  return doc
}
