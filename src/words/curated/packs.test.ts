import { describe, expect, it } from 'vitest'
import { normalizeWord, reverse } from '../../core/normalize'
import { isBlocked } from '../../core/safety'
import { CURATED_PACKS } from '../themes'

const CATEGORIES = ['Animals', 'Science', 'Food', 'Seasons & Holidays', 'School & Community', 'Hobbies & Fun', 'Places & Geography', 'Me & My World']

describe('curated packs', () => {
  it('has ~30 packs with unique ids', () => {
    expect(CURATED_PACKS.length).toBeGreaterThanOrEqual(30)
    expect(new Set(CURATED_PACKS.map((p) => p.id)).size).toBe(CURATED_PACKS.length)
  })

  for (const pack of CURATED_PACKS) {
    describe(pack.id, () => {
      it('has valid metadata', () => {
        expect(pack.name).toBeTruthy()
        expect(pack.emoji).toBeTruthy()
        expect(pack.description).toBeTruthy()
        expect(CATEGORIES).toContain(pack.category)
        expect(pack.words.length).toBeGreaterThanOrEqual(45)
        expect(pack.words.length).toBeLessThanOrEqual(60)
      })

      it('has clean, generator-compatible words and non-revealing clues', () => {
        const tokens = pack.words.map((w) => {
          const n = normalizeWord(w.w)
          expect(n.error, w.w).toBeUndefined()
          expect(n.token, w.w).toMatch(/^[A-Z]{3,15}$/)
          expect([1, 2, 3]).toContain(w.level)
          expect(isBlocked(n.token), w.w).toBe(false)
          const clue = w.clue.toUpperCase().replace(/[^A-Z ]/g, '')
          expect(w.clue.length, w.w).toBeLessThanOrEqual(100)
          expect(w.clue.endsWith('.'), w.w).toBe(false)
          expect(clue.replace(/ /g, '').includes(n.token), `${w.w}: ${w.clue}`).toBe(false)
          for (const part of w.w.toUpperCase().split(/[\s-]+/))
            if (part.length >= 3) expect(clue.split(' ').includes(part), `${w.w}: ${w.clue}`).toBe(false)
          return n.token
        })
        expect(new Set(tokens).size).toBe(tokens.length)
        for (const a of tokens)
          for (const b of tokens) {
            if (a === b) continue
            expect(b.includes(a), `${a} inside ${b}`).toBe(false)
            expect(b.includes(reverse(a)), `${a} reversed inside ${b}`).toBe(false)
          }
      })
    })
  }
})
