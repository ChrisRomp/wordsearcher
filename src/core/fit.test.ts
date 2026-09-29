import { describe, expect, it } from 'vitest'
import { CURATED_PACKS } from '../words/themes'
import { TRIAL_RESTARTS, findFit, generateAutoSize, generateWithFit, suggestSize } from './fit'
import { generate } from './generator'
import { GRID_MAX } from './limits'
import { normalizeWord } from './normalize'
import { createRng } from './rng'
import type { GenerateInput, GenerateResult, WordEntry } from './types'
import { tokensConflict } from './validate'

/** Real classroom words, skipping any that would conflict with an earlier one. */
function packWords(count: number): WordEntry[] {
  const out: WordEntry[] = []
  for (const pack of CURATED_PACKS)
    for (const w of pack.words) {
      const n = normalizeWord(w.w)
      if (out.some((o) => tokensConflict(o.token, n.token, true))) continue
      out.push({ id: `${pack.id}:${n.token}`, display: n.display, token: n.token, source: 'curated' })
      if (out.length === count) return out
    }
  throw new Error(`only ${out.length} words available`)
}

function base(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    rows: 10,
    cols: 10,
    words: packWords(40),
    directions: ['E', 'S', 'SE', 'NE'],
    overlap: 'allow',
    filler: 'frequency',
    density: 0.5,
    seed: 'fit',
    ...overrides,
  }
}

function fitOf(res: GenerateResult) {
  expect(res.ok).toBe(false)
  return res.ok ? undefined : res.fit
}

describe('fit suggestions', () => {
  it('suggests a bigger grid that a full run then fills', () => {
    const input = base()
    const fit = fitOf(generateWithFit(input, false))
    expect(fit).toMatchObject({ kind: 'grow' })
    if (fit?.kind !== 'grow') return
    expect(fit.rows).toBe(fit.cols)
    expect(fit.rows).toBeGreaterThan(10)
    expect(fit.rows).toBeLessThan(GRID_MAX)
    expect(generate({ ...input, rows: fit.rows, cols: fit.cols }).ok).toBe(true)
  })

  it('finds the smallest working size even when a bigger size fails', () => {
    // With this seed, success isn't monotonic in size, so a plain binary search skips the smallest grid.
    const input = base({ words: packWords(80), seed: 'c' })
    const fit = fitOf(generateWithFit(input, false))
    expect(fit).toMatchObject({ kind: 'grow' })
    if (fit?.kind !== 'grow') return
    const trialOk = (n: number) => generate({ ...input, rows: n, cols: n, budget: { restarts: TRIAL_RESTARTS } }).ok
    for (let n = input.rows + 1; n < fit.rows; n++) expect(trialOk(n), `${n} × ${n}`).toBe(false)
    expect(trialOk(fit.rows)).toBe(true)
    const failsAbove = Array.from({ length: GRID_MAX - fit.rows }, (_, i) => fit.rows + 1 + i).filter((n) => !trialOk(n))
    expect(failsAbove.length, 'this case should have a failing size above the smallest working one').toBeGreaterThan(0)
    expect(generate({ ...input, rows: fit.rows, cols: fit.cols }).ok).toBe(true)
  })

  it('keeps the grid shape when growing', () => {
    const input = base({ rows: 8, cols: 14 })
    const fit = fitOf(generateWithFit(input, false))
    expect(fit).toMatchObject({ kind: 'grow' })
    if (fit?.kind !== 'grow') return
    expect(fit.cols - fit.rows).toBe(6)
    expect(generate({ ...input, rows: fit.rows, cols: fit.cols }).ok).toBe(true)
  })

  it('suggests a size for words too long for the grid', () => {
    const input = base({ rows: 12, cols: 12, directions: ['E'], words: [...packWords(10), ...words('ABCDEFGHIJKLMNOPQRST')] })
    const res = generateWithFit(input, false)
    expect(res).toMatchObject({ ok: false, reason: 'invalid-input' })
    const fit = fitOf(res)
    expect(fit).toMatchObject({ kind: 'grow' })
    if (fit?.kind !== 'grow') return
    expect(fit.cols).toBeGreaterThanOrEqual(20)
    expect(generate({ ...input, rows: fit.rows, cols: fit.cols }).ok).toBe(true)
  })

  it('removes the words that did not fit when even the largest grid is too small', { timeout: 20_000 }, () => {
    for (const overlap of ['allow', 'none'] as const) {
      const input = base({ rows: 20, cols: 20, words: packWords(150), overlap })
      const fit = fitOf(generateWithFit(input, false))
      expect(fit).toMatchObject({ kind: 'trim', rows: GRID_MAX, cols: GRID_MAX })
      if (fit?.kind !== 'trim') return
      const ids = new Set(input.words.map((w) => w.id))
      expect(new Set(fit.removeIds).size).toBe(fit.removeIds.length)
      expect(fit.removeIds.every((id) => ids.has(id))).toBe(true)
      expect(fit.removeIds.length).toBeGreaterThan(0)
      expect(fit.removeIds.length).toBeLessThan(input.words.length / 2)

      const drop = new Set(fit.removeIds)
      const kept = input.words.filter((w) => !drop.has(w.id))
      const removed = input.words.filter((w) => drop.has(w.id))
      const avg = (list: WordEntry[]) => list.reduce((n, w) => n + w.token.length, 0) / list.length
      expect(avg(removed)).toBeLessThan(avg(kept))
      expect(generate({ ...input, rows: GRID_MAX, cols: GRID_MAX, words: kept }).ok).toBe(true)
    }
  })

  it('offers nothing while other errors need fixing first', () => {
    const list = packWords(40)
    const input = base({ overlap: 'none', words: [...list, { ...list[0], id: 'dupe' }] })
    const res = generateWithFit(input, false)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.issues.map((i) => i.code)).toContain('duplicate')
    expect(res.fit).toBeUndefined()
    expect(findFit(input, res)).toBeNull()
  })

  it('offers nothing for a word longer than the largest grid', () => {
    const input = base({ words: [...packWords(5), ...words('ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKL')] })
    const res = generateWithFit(input, false)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.fit).toBeUndefined()
  })

  it('attaches nothing to a success', () => {
    const res = generateWithFit(base({ rows: 20, cols: 20, words: packWords(10) }), false)
    expect(res.ok).toBe(true)
    expect(res).not.toHaveProperty('fit')
  })
})

describe('auto size', () => {
  it('grows to fit', () => {
    const input = base({ words: words('ENCYCLOPEDIA', 'DICTIONARY', 'THESAURUS', 'ALMANAC', 'ATLAS', 'GLOSSARY') })
    const res = generateAutoSize(input)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.grid.length).toBeGreaterThanOrEqual(12)
  })

  it('keeps searching well past the density estimate', () => {
    // Rightward-only 13-letter words pack badly, so the estimate is far too small.
    const rng = createRng('long')
    const list = Array.from({ length: 26 }, () => Array.from({ length: 13 }, () => 'ABCDEFGHIJKLMNOPRSTUW'[rng.int(21)]).join(''))
    const input = base({ words: words(...list), directions: ['E'], overlap: 'none', density: 0.85 })
    const start = suggestSize(input.words, input.density)
    const res = generateAutoSize(input)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.grid.length).toBeGreaterThan(start + 3)
  })

  it('suggests removing words when even the largest grid is too small, and then fits', { timeout: 20_000 }, () => {
    const input = base({ words: packWords(150), density: 0.85 })
    const fit = fitOf(generateAutoSize(input))
    expect(fit).toMatchObject({ kind: 'trim', rows: GRID_MAX, cols: GRID_MAX })
    if (fit?.kind !== 'trim') return
    const drop = new Set(fit.removeIds)
    const res = generateAutoSize({ ...input, words: input.words.filter((w) => !drop.has(w.id)) })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.grid.length).toBeLessThanOrEqual(GRID_MAX)
  })
})

let nextId = 0
function words(...list: string[]): WordEntry[] {
  return list.map((display) => ({ id: `x${nextId++}`, display, token: normalizeWord(display).token, source: 'custom' }))
}
