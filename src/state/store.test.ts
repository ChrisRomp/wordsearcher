// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { generate } from '../core/generator'
import { MAX_WORDS } from '../core/validate'
import { createDoc } from '../doc/puzzleDoc'
import { settingsKey, useStore } from './store'

beforeEach(() => {
  localStorage.clear()
  useStore.getState().reset()
})

describe('store', () => {
  it('adds pasted words, keeping phrases and reporting bad entries', () => {
    const added = useStore.getState().addWordsFromText('Black Hole, comet\nR2D2; comet')
    expect(added).toBe(2)
    expect(useStore.getState().gen.words.map((w) => w.token)).toEqual(['BLACKHOLE', 'COMET'])
    expect(useStore.getState().inputErrors.map((e) => e.text)).toEqual(['R2D2'])
  })

  it(`caps the list at ${MAX_WORDS} words`, () => {
    const many = Array.from({ length: MAX_WORDS + 40 }, (_, i) => `word${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`).join(',')
    useStore.getState().addWordsFromText(many)
    expect(useStore.getState().gen.words).toHaveLength(MAX_WORDS)
    expect(useStore.getState().inputErrors[0].error).toMatch(/at most/)
  })

  it('patches clue edits into the current puzzle without regenerating', () => {
    const s = useStore.getState()
    s.addWordsFromText('apple, banana, cherry')
    const { gen } = useStore.getState()
    const res = generate({ ...gen, words: gen.words })
    if (!res.ok) throw new Error('gen failed')
    useStore.setState({ doc: createDoc({ grid: res.grid, placements: res.placements, style: s.style, settings: gen }), docKey: settingsKey(gen, false) })
    const before = useStore.getState().doc!.grid
    useStore.getState().updateWord(gen.words[0].id, { clue: 'A red fruit' })
    const after = useStore.getState()
    expect(after.doc!.grid).toBe(before)
    expect(after.doc!.placements.find((p) => p.wordId === gen.words[0].id)?.clue).toBe('A red fruit')
    expect(after.docKey).toBe(settingsKey(after.gen, false))
    expect(after.doc!.settings.words.find((w) => w.id === gen.words[0].id)?.clue).toBe('A red fruit')
  })

  it('does not mark pending/failed settings as generated when a clue is edited', () => {
    const s = useStore.getState()
    s.addWordsFromText('apple, banana')
    const { gen } = useStore.getState()
    const res = generate({ ...gen, words: gen.words })
    if (!res.ok) throw new Error('gen failed')
    useStore.setState({ doc: createDoc({ grid: res.grid, placements: res.placements, style: s.style, settings: gen }), docKey: settingsKey(gen, false) })
    useStore.getState().addWordsFromText('supercalifragilistic')
    const staleKey = useStore.getState().docKey
    useStore.getState().updateWord(gen.words[0].id, { clue: 'A red fruit' })
    expect(useStore.getState().docKey).toBe(staleKey)
    expect(useStore.getState().docKey).not.toBe(settingsKey(useStore.getState().gen, false))
  })

  it('settings key ignores property order', () => {
    const gen = useStore.getState().gen
    const reordered = Object.fromEntries(Object.entries(gen).reverse()) as typeof gen
    expect(settingsKey(reordered, false)).toBe(settingsKey(gen, false))
  })

  it('applies presets and reports custom when tweaked', async () => {
    const { currentPreset } = await import('./store')
    useStore.getState().applyPreset('hard')
    expect(currentPreset(useStore.getState().gen)).toBe('hard')
    useStore.getState().setGen({ overlap: 'none' })
    expect(currentPreset(useStore.getState().gen)).toBe('custom')
  })
})
