import { compressToEncodedURIComponent } from 'lz-string'
import { describe, expect, it } from 'vitest'
import { ALL_DIRECTIONS } from '../core/directions'
import { generate } from '../core/generator'
import { normalizeWord } from '../core/normalize'
import { DEFAULT_STYLE, defaultGenSettings } from '../state/settings'
import { createDoc, docHash, parseDoc, DocError, type PuzzleDoc } from './puzzleDoc'
import { decodeDoc, docFromHash, encodeDoc, shareUrl } from './share'

function makeDoc(clueMode = false, n = 15, size = 15): PuzzleDoc {
  const words = 'Astronaut Comet Galaxy Nebula Orbit Planet Rocket Saturn Jupiter Meteor Black Hole Crater Eclipse Gravity Lunar Pulsar Quasar Venus Mars Earth'
    .split(' ')
    .slice(0, n)
    .map((w, i) => ({ id: `id${i}`, display: w, token: normalizeWord(w).token, source: 'curated' as const, clue: `A clue for word number ${i}` }))
  const settings = { ...defaultGenSettings(), words, rows: size, cols: size, directions: [...ALL_DIRECTIONS], seed: 'share' }
  const res = generate({ ...settings, words, overlap: 'allow', filler: 'frequency', density: 0.5 })
  if (!res.ok) throw new Error('generation failed')
  return createDoc({ grid: res.grid, placements: res.placements, style: { ...DEFAULT_STYLE, clueMode, title: 'Space!' }, settings })
}

describe('share links', () => {
  it('round-trips a puzzle exactly', () => {
    const doc = makeDoc()
    const back = decodeDoc(encodeDoc(doc))
    expect(back.grid).toBe(doc.grid)
    expect(back.rows).toBe(doc.rows)
    expect(back.placements.map((p) => [p.token, p.display, p.r, p.c, p.dir, p.source])).toEqual(
      doc.placements.map((p) => [p.token, p.display, p.r, p.c, p.dir, p.source]),
    )
    expect(back.style.title).toBe('Space!')
    expect(back.settings.directions).toEqual(doc.settings.directions)
    expect(back.settings.words.map((w) => w.token)).toEqual(doc.placements.map((p) => p.token))
    expect(docHash(back)).toBe(docHash(doc))
  })

  it('keeps clues', () => {
    for (const clueMode of [false, true]) {
      const back = decodeDoc(encodeDoc(makeDoc(clueMode)))
      expect(back.placements.every((p) => p.clue?.startsWith('A clue'))).toBe(true)
      expect(back.settings.words.every((w) => w.clue)).toBe(true)
    }
  })

  it('keeps typical links short', () => {
    expect(shareUrl(makeDoc(false, 15, 15), 'https://example.org/').length).toBeLessThan(1500)
    expect(shareUrl(makeDoc(false, 20, 20), 'https://example.org/').length).toBeLessThan(2000)
  })

  it('reads docs from a location hash', () => {
    const doc = makeDoc()
    expect(docFromHash(`#p=${encodeDoc(doc)}`)?.grid).toBe(doc.grid)
    expect(docFromHash('#other')).toBeNull()
  })

  it('rejects damaged or hostile input', () => {
    expect(() => decodeDoc('not-a-link')).toThrow(DocError)
    expect(() => decodeDoc(compressToEncodedURIComponent('{"v":99}'))).toThrow(/version/)
    const doc = makeDoc()
    const p0 = doc.placements[0]
    const at = p0.r * doc.cols + p0.c
    const flipped = doc.grid[at] === 'Z' ? 'Y' : 'Z'
    const tampered = { ...doc, grid: doc.grid.slice(0, at) + flipped + doc.grid.slice(at + 1) }
    expect(() => parseDoc(tampered)).toThrow(/doesn't match/)
    expect(() => parseDoc({ ...doc, rows: 500 })).toThrow(DocError)
    expect(() => parseDoc({ ...doc, grid: '<script>' })).toThrow(DocError)
    expect(() => parseDoc({ ...doc, placements: [{ ...doc.placements[0], r: 999 }] })).toThrow(DocError)
  })

  it('sanitizes style and settings from untrusted docs', () => {
    const doc = makeDoc()
    const evil = parseDoc({
      ...doc,
      style: { ...doc.style, titleColor: 'red;background:url(x)', title: 'x'.repeat(500), titleFont: 'comic' },
      settings: { ...doc.settings, rows: 9999, directions: ['E', 'UP'], themes: [{ kind: 'dict', id: '../../etc' }] },
    })
    expect(evil.style.titleColor).toBe(DEFAULT_STYLE.titleColor)
    expect(evil.style.title.length).toBeLessThanOrEqual(120)
    expect(evil.style.titleFont).toBe('fredoka')
    expect(evil.settings.rows).toBeLessThanOrEqual(30)
    expect(evil.settings.directions).toEqual(['E'])
    expect(evil.settings.themes).toEqual([])
  })
})
