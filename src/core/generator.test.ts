import { describe, expect, it } from 'vitest'
import { ALL_DIRECTIONS, DIRECTIONS } from './directions'
import { generate, generateAutoSize } from './generator'
import { normalizeWord, reverse } from './normalize'
import { createRng } from './rng'
import { getBlocklist } from './safety'
import type { DirectionId, GenerateInput, GenerateResult, WordEntry } from './types'

let nextId = 0
function words(...list: string[]): WordEntry[] {
  return list.map((display) => ({ id: `w${nextId++}`, display, token: normalizeWord(display).token, source: 'custom' }))
}

function base(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    rows: 12,
    cols: 12,
    words: words('APPLE', 'BANANA', 'CHERRY', 'GRAPE', 'LEMON', 'MANGO', 'PEACH', 'PLUM'),
    directions: ['E', 'S', 'SE', 'NE'],
    overlap: 'allow',
    filler: 'frequency',
    density: 0.5,
    seed: 'test',
    ...overrides,
  }
}

/** Every line through the grid in a direction, with cell indices. Independent of the generator's scanner. */
function lines(grid: string[][], dir: DirectionId): { text: string; cells: number[] }[] {
  const rows = grid.length
  const cols = grid[0].length
  const d = DIRECTIONS[dir]
  const out: { text: string; cells: number[] }[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const pr = r - d.dr
      const pc = c - d.dc
      if (pr >= 0 && pr < rows && pc >= 0 && pc < cols) continue // not a line start
      let text = ''
      const cells: number[] = []
      for (let rr = r, cc = c; rr >= 0 && rr < rows && cc >= 0 && cc < cols; rr += d.dr, cc += d.dc) {
        text += grid[rr][cc]
        cells.push(rr * cols + cc)
      }
      out.push({ text, cells })
    }
  return out
}

function occurrences(grid: string[][], token: string, dirs: DirectionId[]): Set<string> {
  const found = new Set<string>()
  for (const dir of dirs)
    for (const line of lines(grid, dir)) {
      let i = line.text.indexOf(token)
      while (i !== -1) {
        found.add(
          line.cells
            .slice(i, i + token.length)
            .sort((a, b) => a - b)
            .join(','),
        )
        i = line.text.indexOf(token, i + 1)
      }
    }
  return found
}

/** Asserts the full puzzle contract on a successful result. */
function assertValid(res: GenerateResult, input: GenerateInput) {
  expect(res.ok).toBe(true)
  if (!res.ok) return
  const { grid, placements } = res
  const cols = grid[0].length
  const isAnswer = new Set<number>()
  for (const p of placements) {
    const d = DIRECTIONS[p.dir]
    expect(input.directions).toContain(p.dir)
    for (let i = 0; i < p.token.length; i++) {
      const r = p.r + d.dr * i
      const c = p.c + d.dc * i
      expect(grid[r][c]).toBe(p.token[i])
      isAnswer.add(r * cols + c)
    }
  }
  for (const row of grid) for (const ch of row) expect(ch).toMatch(/^[A-Z]$/)
  for (const w of input.words) expect(placements.some((p) => p.wordId === w.id)).toBe(true)
  for (const p of placements) {
    expect(occurrences(grid, p.token, input.directions).size, `${p.token} occurs once`).toBe(1)
  }
  // No blocklisted word may use a filler cell, in any direction.
  for (const bad of getBlocklist())
    for (const dir of ALL_DIRECTIONS)
      for (const line of lines(grid, dir)) {
        let i = line.text.indexOf(bad)
        while (i !== -1) {
          const cells = line.cells.slice(i, i + bad.length)
          expect(
            cells.every((cell) => isAnswer.has(cell)),
            `blocked word in filler at ${cells}`,
          ).toBe(true)
          i = line.text.indexOf(bad, i + 1)
        }
      }
}

describe('generate', () => {
  it('is deterministic for a seed', () => {
    const input = base()
    const a = generate(input)
    const b = generate(input)
    expect(a).toMatchObject({ ok: true })
    if (a.ok && b.ok) {
      expect(a.grid).toEqual(b.grid)
      expect(a.placements).toEqual(b.placements)
    }
    const c = generate({ ...input, seed: 'other' })
    if (a.ok && c.ok) expect(c.grid).not.toEqual(a.grid)
  })

  it('produces valid puzzles across presets and seeds', () => {
    const configs: Partial<GenerateInput>[] = [
      { directions: ['E', 'S'], overlap: 'none', filler: 'random', rows: 10, cols: 10 },
      { directions: ['E', 'S', 'SE', 'NE'], overlap: 'allow', filler: 'frequency', rows: 12, cols: 12 },
      { directions: [...ALL_DIRECTIONS], overlap: 'prefer', filler: 'decoy', rows: 12, cols: 12 },
      { directions: [...ALL_DIRECTIONS], overlap: 'prefer', filler: 'decoy', rows: 8, cols: 14 },
    ]
    for (const cfg of configs)
      for (let s = 0; s < 12; s++) {
        const input = base({ ...cfg, seed: `seed-${s}` })
        assertValid(generate(input), input)
      }
  })

  it('respects overlap: none', () => {
    const input = base({ overlap: 'none', directions: [...ALL_DIRECTIONS], rows: 14, cols: 14 })
    const res = generate(input)
    assertValid(res, input)
    if (!res.ok) return
    const seen = new Set<string>()
    for (const p of res.placements)
      for (let i = 0; i < p.token.length; i++) {
        const key = `${p.r + DIRECTIONS[p.dir].dr * i},${p.c + DIRECTIONS[p.dir].dc * i}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
  })

  it('prefer overlap produces more crossings than none', () => {
    const count = (overlap: 'none' | 'prefer') => {
      let shared = 0
      for (let s = 0; s < 8; s++) {
        const res = generate(base({ overlap, directions: [...ALL_DIRECTIONS], seed: `o${s}` }))
        if (res.ok) shared += res.placements.reduce((n, p) => n + p.token.length, 0) - res.stats.coveredCells
      }
      return shared
    }
    expect(count('none')).toBe(0)
    expect(count('prefer')).toBeGreaterThan(8)
  })

  it('uses only the enabled directions', () => {
    const input = base({ directions: ['W', 'N'] })
    const res = generate(input)
    assertValid(res, input)
    if (res.ok) for (const p of res.placements) expect(['W', 'N']).toContain(p.dir)
  })
})

describe('adversarial inputs', () => {
  it('rejects a word contained in another unless nesting is allowed', () => {
    const list = words('CAT', 'CATALOG', 'DOG')
    const res = generate(base({ words: list }))
    expect(res).toMatchObject({ ok: false, reason: 'invalid-input' })
    if (!res.ok) {
      const issue = res.issues.find((i) => i.code === 'contained')!
      expect(issue.wordIds).toEqual([list[0].id])
      expect(issue.hostId).toBe(list[1].id)
      expect(issue.nestable).toBe(true)
    }
    const input = base({ words: list, allowNested: ['CAT'] })
    const ok = generate(input)
    assertValid(ok, input)
    if (ok.ok) {
      const cat = ok.placements.find((p) => p.token === 'CAT')!
      const host = ok.placements.find((p) => p.token === 'CATALOG')!
      expect(cat.nestedIn).toBe(host.wordId)
      expect(cat.dir).toBe(host.dir)
    }
  })

  it('refuses nesting when the short word appears more than once', () => {
    const list = words('CAT', 'CATALOG', 'BOBCAT')
    const res = generate(base({ words: list, allowNested: ['CAT'] }))
    expect(res).toMatchObject({ ok: false, reason: 'invalid-input' })
    if (!res.ok) expect(res.issues.find((i) => i.code === 'contained')?.nestable).toBe(false)
  })

  it('handles reverse pairs depending on directions', () => {
    const list = words('LIVE', 'EVIL', 'STAR')
    const all = generate(base({ words: list, directions: [...ALL_DIRECTIONS] }))
    expect(all).toMatchObject({ ok: false, reason: 'invalid-input' })
    if (!all.ok) expect(all.issues.some((i) => i.code === 'reverse-conflict')).toBe(true)

    const forward = base({ words: list, directions: ['E', 'S', 'SE', 'NE'] })
    assertValid(generate(forward), forward)

    // E+W+S: reversal possible horizontally, so both must go vertically.
    const mixed = base({ words: list, directions: ['E', 'W', 'S'] })
    const res = generate(mixed)
    assertValid(res, mixed)
    if (res.ok) for (const p of res.placements.filter((p) => p.token !== 'STAR')) expect(p.dir).toBe('S')
  })

  it('handles a word containing another reversed (TAC inside ATTACK)', () => {
    const input = base({ words: words('CAT', 'ATTACK'), directions: [...ALL_DIRECTIONS] })
    const res = generate(input)
    expect(res).toMatchObject({ ok: false })
    const oneWay = base({ words: words('CAT', 'ATTACK'), directions: ['E', 'S', 'W'] })
    assertValid(generate(oneWay), oneWay)
  })

  it('places palindromes exactly once', () => {
    const input = base({ words: words('RACECAR', 'LEVEL', 'NOON', 'KAYAK'), directions: [...ALL_DIRECTIONS] })
    for (let s = 0; s < 5; s++) assertValid(generate({ ...input, seed: `p${s}` }), input)
  })

  it('handles repetitive words with decoy filler (AAA)', () => {
    const input = base({ words: words('AAA', 'ABAB', 'BAA'), filler: 'decoy', directions: [...ALL_DIRECTIONS], rows: 6, cols: 6 })
    for (let s = 0; s < 5; s++) {
      const res = generate({ ...input, seed: `a${s}` })
      if (res.ok) assertValid(res, input)
      else expect(res.reason).toBe('budget-exhausted')
    }
  })

  it('reports words too long for the enabled directions', () => {
    const res = generate(base({ rows: 10, cols: 15, directions: ['S'], words: words('ENCYCLOPEDIA', 'CAT') }))
    expect(res).toMatchObject({ ok: false, reason: 'invalid-input' })
    if (!res.ok) expect(res.issues[0]).toMatchObject({ code: 'too-long' })
    const ok = base({ rows: 10, cols: 15, directions: ['E'], words: words('ENCYCLOPEDIA', 'CAT') })
    assertValid(generate(ok), ok)
  })

  it('rejects impossible capacity up front', () => {
    const res = generate(base({ rows: 5, cols: 5, overlap: 'none', words: words('ABCDE', 'FGHIJ', 'KLMNO', 'PQRST', 'UVWXY', 'ZABCD') }))
    expect(res).toMatchObject({ ok: false, reason: 'invalid-input' })
    if (!res.ok) expect(res.issues[0].code).toBe('over-capacity')
  })

  it('returns an explicit failure (never a partial puzzle) when the budget runs out', () => {
    const res = generate(
      base({
        rows: 6,
        cols: 6,
        overlap: 'none',
        directions: ['E'],
        words: words('ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWX', 'YZABCD', 'EFGHIJ'),
        budget: { restarts: 3, timeMs: 200 },
      }),
    )
    // Exactly fills the grid; possible, so it must either succeed validly or fail explicitly.
    if (!res.ok) expect(res.reason).toBe('budget-exhausted')
    const impossible = generate(
      base({ rows: 5, cols: 5, directions: ['E'], words: words('ABCDE', 'FGHIJ', 'KLMNO', 'PQRST', 'UVWXY'), overlap: 'none', budget: { restarts: 2 } }),
    )
    expect(impossible.ok || impossible.reason === 'budget-exhausted').toBe(true)
  })

  it('reports duplicates after normalization', () => {
    const res = generate(base({ words: words('Black Hole', 'blackhole', 'Star') }))
    expect(res).toMatchObject({ ok: false })
    if (!res.ok) expect(res.issues[0]).toMatchObject({ code: 'duplicate' })
  })

  it('requires at least one direction and one word', () => {
    const a = generate(base({ directions: [] }))
    expect(a.ok).toBe(false)
    if (!a.ok) expect(a.issues.map((i) => i.code)).toContain('no-directions')
    const b = generate(base({ words: [] }))
    expect(b.ok).toBe(false)
    if (!b.ok) expect(b.issues.map((i) => i.code)).toContain('empty')
  })
})

describe('pool / density', () => {
  const pool = words(
    ...'ANT BEE CAT DOG EEL FOX GNU HEN IBIS JAY KOALA LLAMA MOLE NEWT OTTER PANDA QUAIL RAVEN SEAL TIGER URCHIN VOLE WHALE YAK ZEBRA BISON CAMEL DINGO EAGLE FERRET GOOSE HERON IGUANA JACKAL LEMUR MOOSE'.split(
      ' ',
    ),
  )

  it('fills toward the density target', () => {
    for (const density of [0.35, 0.55, 0.75]) {
      const input = base({ words: [], pool, density, rows: 12, cols: 12, directions: [...ALL_DIRECTIONS] })
      const res = generate(input)
      assertValid(res, { ...input, words: [] })
      if (res.ok) {
        expect(res.stats.density).toBeGreaterThanOrEqual(density - 0.02)
        expect(res.stats.density).toBeLessThan(density + 0.15)
        expect(res.placements.every((p) => p.fromPool)).toBe(true)
      }
    }
  })

  it('keeps required words and skips conflicting pool words', () => {
    const required = words('CATERPILLAR')
    const input = base({ words: required, pool, density: 0.6, directions: [...ALL_DIRECTIONS] })
    const res = generate(input)
    assertValid(res, input)
    if (res.ok) {
      expect(res.placements[0].token).toBe('CATERPILLAR')
      expect(res.placements.some((p) => p.token === 'CAT')).toBe(false)
    }
  })

  it('respects maxWords', () => {
    const res = generate(base({ words: [], pool, density: 0.9, maxWords: 5 }))
    expect(res.ok && res.placements.length).toBe(5)
  })
})

describe('auto size', () => {
  it('grows to fit', () => {
    const input = base({ words: words('ENCYCLOPEDIA', 'DICTIONARY', 'THESAURUS', 'ALMANAC', 'ATLAS', 'GLOSSARY') })
    const res = generateAutoSize(input)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.grid.length).toBeGreaterThanOrEqual(12)
  })
})

describe('stress', () => {
  it('random lists always yield valid puzzles or explicit failures', () => {
    const rng = createRng('stress')
    const alphabet = 'ABCDEFGHIJKLMNOPRSTUW'
    for (let t = 0; t < 40; t++) {
      const n = 4 + rng.int(12)
      const list = new Set<string>()
      while (list.size < n) {
        let w = ''
        const len = 3 + rng.int(6)
        for (let i = 0; i < len; i++) w += alphabet[rng.int(alphabet.length)]
        list.add(w)
      }
      const dirs = rng.shuffle([...ALL_DIRECTIONS]).slice(0, 1 + rng.int(8))
      const size = 8 + rng.int(8)
      const input = base({
        words: words(...list),
        directions: dirs,
        rows: size,
        cols: size,
        overlap: rng.pick(['none', 'allow', 'prefer'] as const),
        filler: rng.pick(['random', 'frequency', 'decoy'] as const),
        seed: `s${t}`,
        budget: { timeMs: 1500 },
      })
      const res = generate(input)
      if (res.ok) assertValid(res, input)
      else expect(res.issues.length).toBeGreaterThan(0)
    }
  })
})

describe('reverse helper', () => {
  it('reverses', () => expect(reverse('ABC')).toBe('CBA'))
})
