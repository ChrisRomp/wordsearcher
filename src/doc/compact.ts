import { ALL_DIRECTIONS } from '../core/directions'
import { normalizeWord } from '../core/normalize'
import type { Placement, WordEntry, WordSource } from '../core/types'
import { DEFAULT_STYLE, defaultGenSettings, type GenSettings, type StyleSettings } from '../state/settings'
import { DOC_VERSION, type PuzzleDoc } from './puzzleDoc'

/**
 * Compact share format: each word appears once and defaults are omitted. Expanded back into a
 * PuzzleDoc and then validated by parseDoc like any other untrusted input.
 */
export const COMPACT_FORMAT = 1

const SOURCES: WordSource[] = ['custom', 'curated', 'dict']

/** [display, dirIndex, r, c, flags, token?, clue?, nestedInIndex?] ; flags = pool*4 + sourceIndex */
type CompactWord = (string | number)[]

export interface CompactDoc {
  f: typeof COMPACT_FORMAT
  gen: number
  data?: string
  s: string
  R: number
  C: number
  G: string
  W: CompactWord[]
  st?: Partial<StyleSettings>
  set?: Partial<Omit<GenSettings, 'words' | 'seed'>>
}

function diff<T extends object>(value: T, defaults: T): Partial<T> | undefined {
  const out: Partial<T> = {}
  for (const k of Object.keys(value) as (keyof T)[]) {
    if (JSON.stringify(value[k]) !== JSON.stringify(defaults[k])) out[k] = value[k]
  }
  return Object.keys(out).length ? out : undefined
}

export function toCompact(doc: PuzzleDoc): CompactDoc {
  const index = new Map(doc.placements.map((p, i) => [p.wordId, i]))
  const W = doc.placements.map((p) => {
    const w: CompactWord = [p.display, ALL_DIRECTIONS.indexOf(p.dir), p.r, p.c, (p.fromPool ? 4 : 0) + SOURCES.indexOf(p.source)]
    const token = normalizeWord(p.display).token === p.token ? '' : p.token
    const clue = p.clue ?? ''
    const nested = p.nestedIn !== undefined ? (index.get(p.nestedIn) ?? -1) : -1
    if (token || clue || nested >= 0) w.push(token)
    if (clue || nested >= 0) w.push(clue)
    if (nested >= 0) w.push(nested)
    return w
  })
  const { words: _words, seed: _seed, ...settings } = doc.settings
  const { words: _dw, seed: _ds, ...defaults } = defaultGenSettings()
  const out: CompactDoc = { f: COMPACT_FORMAT, gen: doc.gen, s: doc.seed, R: doc.rows, C: doc.cols, G: doc.grid, W }
  if (doc.data) out.data = doc.data
  const st = diff(doc.style, DEFAULT_STYLE)
  if (st) out.st = st
  const set = diff(settings, defaults)
  if (set) out.set = set
  return out
}

/** Expands a compact doc into the full (still unvalidated) PuzzleDoc shape. */
export function fromCompact(raw: Record<string, unknown>): unknown {
  const W = Array.isArray(raw.W) ? (raw.W as unknown[]).slice(0, 200) : []
  const placements: Partial<Placement>[] = W.map((entry, i) => {
    const w = Array.isArray(entry) ? entry : []
    const display = typeof w[0] === 'string' ? w[0] : ''
    const flags = typeof w[4] === 'number' ? w[4] : 0
    const token = typeof w[5] === 'string' && w[5] ? w[5] : normalizeWord(display).token
    const p: Partial<Placement> = {
      wordId: `w${i}`,
      display,
      token,
      dir: ALL_DIRECTIONS[typeof w[1] === 'number' ? w[1] : -1],
      r: w[2] as number,
      c: w[3] as number,
      fromPool: flags >= 4,
      source: SOURCES[flags % 4] ?? 'custom',
    }
    if (typeof w[6] === 'string' && w[6]) p.clue = w[6]
    if (typeof w[7] === 'number' && w[7] >= 0) p.nestedIn = `w${w[7]}`
    return p
  })
  const words: WordEntry[] = placements
    .filter((p) => !p.fromPool)
    .map((p) => ({ id: p.wordId!, display: p.display!, token: p.token!, source: p.source!, ...(p.clue ? { clue: p.clue } : {}) }))
  const set = raw.set && typeof raw.set === 'object' ? raw.set : {}
  const st = raw.st && typeof raw.st === 'object' ? raw.st : {}
  return {
    v: DOC_VERSION,
    gen: raw.gen,
    data: raw.data,
    seed: raw.s,
    rows: raw.R,
    cols: raw.C,
    grid: raw.G,
    placements,
    style: { ...DEFAULT_STYLE, ...st },
    settings: { ...defaultGenSettings(), ...set, words, seed: raw.s },
    createdAt: Date.now(),
  }
}
