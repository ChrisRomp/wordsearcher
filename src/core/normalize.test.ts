import { describe, expect, it } from 'vitest'
import { normalizeWord, splitWordInput } from './normalize'

describe('normalizeWord', () => {
  it.each([
    ['Black Hole', 'BLACKHOLE'],
    ['  café ', 'CAFE'],
    ['T-Rex', 'TREX'],
    ["O'Brien", 'OBRIEN'],
    ['Straße', 'STRASSE'],
    ['Mt. Everest', 'MTEVEREST'],
    ['naïve', 'NAIVE'],
    ['Æsop', 'AESOP'],
  ])('%s → %s', (input, token) => {
    const n = normalizeWord(input)
    expect(n.error).toBeUndefined()
    expect(n.token).toBe(token)
  })

  it('keeps display text tidy', () => {
    expect(normalizeWord('  Black   Hole ').display).toBe('Black Hole')
  })

  it('rejects characters it cannot convert', () => {
    expect(normalizeWord('R2D2').error).toMatch(/2/)
    expect(normalizeWord('猫').error).toBeDefined()
    expect(normalizeWord('A').error).toMatch(/at least/)
  })
})

describe('splitWordInput', () => {
  it('splits on newlines, commas, semicolons and tabs but keeps phrases', () => {
    expect(splitWordInput('Black Hole, comet;moon\nsolar  flare\t sun,,')).toEqual(['Black Hole', 'comet', 'moon', 'solar  flare', 'sun'])
  })
})
