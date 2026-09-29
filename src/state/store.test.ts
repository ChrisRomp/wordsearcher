// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { generate } from '../core/generator'
import type { DirectionId, WordEntry } from '../core/types'
import { MAX_WORDS } from '../core/validate'
import { createDoc } from '../doc/puzzleDoc'
import { themeTitle } from '../words/themes'
import { settingsKey, useStore } from './store'

beforeEach(() => {
  localStorage.clear()
  useStore.getState().reset()
})

function legacySettingsKey(gen: Record<string, unknown>, clueMode: boolean) {
  const themes = gen.themes
  return `${settingsKey(gen as unknown as Parameters<typeof settingsKey>[0])}${gen.autoFill && Array.isArray(themes) && themes.length > 0 ? `|clues:${clueMode ? 1 : 0}` : ''}`
}

function makeLegacyAutoFillState() {
  const entered: WordEntry[] = [
    { id: 'w-astronaut', display: 'Astronaut', token: 'ASTRONAUT', source: 'custom' },
    { id: 'w-comet', display: 'Comet', token: 'COMET', source: 'custom' },
    { id: 'w-galaxy', display: 'Galaxy', token: 'GALAXY', source: 'custom' },
  ]
  const pool: WordEntry[] = [
    { id: 'w-nebula', display: 'Nebula', token: 'NEBULA', source: 'curated' },
    { id: 'w-orbit', display: 'Orbit', token: 'ORBIT', source: 'curated' },
    { id: 'w-rocket', display: 'Rocket', token: 'ROCKET', source: 'curated' },
  ]
  const settings = {
    ...useStore.getState().gen,
    words: [...entered, ...pool],
    rows: 15,
    cols: 15,
    directions: ['E', 'S', 'SE', 'NE'] as DirectionId[],
    overlap: 'allow' as const,
    filler: 'frequency' as const,
    density: 0.5,
    seed: 'legacy-autofill',
  }
  const res = generate(settings)
  if (!res.ok) throw new Error('generation failed')

  const poolIds = new Set(pool.map((w) => w.id))
  const legacyGen = {
    ...settings,
    words: entered,
    autoFill: true,
    themes: [{ kind: 'curated' as const, id: 'outer-space' }],
    maxWords: 40,
  }
  const style = { ...useStore.getState().style, clueMode: true, title: 'Space!' }
  const doc = createDoc({
    grid: res.grid,
    placements: res.placements.map((p) => (poolIds.has(p.wordId) ? { ...p, fromPool: true } : p)),
    style,
    settings: legacyGen,
  })
  return { doc, gen: legacyGen, style, entered, pool }
}

async function rehydrateLegacy(state: Record<string, unknown>) {
  localStorage.setItem('wordsearcher:v1', JSON.stringify({ state, version: 1 }))
  await useStore.persist.rehydrate()
}

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
    useStore.setState({ doc: createDoc({ grid: res.grid, placements: res.placements, style: s.style, settings: gen }), docKey: settingsKey(gen) })
    const before = useStore.getState().doc!.grid
    useStore.getState().updateWord(gen.words[0].id, { clue: 'A red fruit' })
    const after = useStore.getState()
    expect(after.doc!.grid).toBe(before)
    expect(after.doc!.placements.find((p) => p.wordId === gen.words[0].id)?.clue).toBe('A red fruit')
    expect(after.docKey).toBe(settingsKey(after.gen))
    expect(after.doc!.settings.words.find((w) => w.id === gen.words[0].id)?.clue).toBe('A red fruit')
  })

  it('does not mark pending/failed settings as generated when a clue is edited', () => {
    const s = useStore.getState()
    s.addWordsFromText('apple, banana')
    const { gen } = useStore.getState()
    const res = generate({ ...gen, words: gen.words })
    if (!res.ok) throw new Error('gen failed')
    useStore.setState({ doc: createDoc({ grid: res.grid, placements: res.placements, style: s.style, settings: gen }), docKey: settingsKey(gen) })
    useStore.getState().addWordsFromText('supercalifragilistic')
    const staleKey = useStore.getState().docKey
    useStore.getState().updateWord(gen.words[0].id, { clue: 'A red fruit' })
    expect(useStore.getState().docKey).toBe(staleKey)
    expect(useStore.getState().docKey).not.toBe(settingsKey(useStore.getState().gen))
  })

  it('settings key ignores property order', () => {
    const gen = useStore.getState().gen
    const reordered = Object.fromEntries(Object.entries(gen).reverse()) as typeof gen
    expect(settingsKey(reordered)).toBe(settingsKey(gen))
  })

  it('adopts auto-filled words from a current legacy document', async () => {
    const legacy = makeLegacyAutoFillState()
    await rehydrateLegacy({
      gen: legacy.gen,
      style: legacy.style,
      doc: legacy.doc,
      docKey: legacySettingsKey(legacy.gen, legacy.style.clueMode),
    })

    const state = useStore.getState()
    expect(state.doc?.grid).toBe(legacy.doc.grid)
    expect(state.gen.words.map((w) => w.token).sort()).toEqual(legacy.doc.placements.map((p) => p.token).sort())
    expect(state.gen.words.some((w) => w.token === legacy.pool[0].token)).toBe(true)
    expect(state.docKey).toBe(settingsKey(state.gen))
  })

  it('keeps edited settings when a legacy auto-fill document is stale', async () => {
    const legacy = makeLegacyAutoFillState()
    const edited: WordEntry = { id: 'w-edited', display: 'Satellite', token: 'SATELLITE', source: 'custom' }
    const editedGen = { ...legacy.gen, words: [...legacy.gen.words, edited] }
    await rehydrateLegacy({
      gen: editedGen,
      style: legacy.style,
      doc: legacy.doc,
      docKey: legacySettingsKey(legacy.gen, legacy.style.clueMode),
    })

    const state = useStore.getState()
    expect(state.doc?.grid).toBe(legacy.doc.grid)
    expect(state.gen.words.map((w) => w.token)).toEqual([...legacy.entered.map((w) => w.token), edited.token])
    expect(state.gen.words.some((w) => w.token === legacy.pool[0].token)).toBe(false)
    expect(state.gen).not.toHaveProperty('autoFill')
    expect(state.gen).not.toHaveProperty('themes')
    expect(state.gen).not.toHaveProperty('maxWords')
    expect(state.docKey).toBeNull()
  })

  it('keeps edited settings when a current-format saved puzzle is stale', async () => {
    const legacy = makeLegacyAutoFillState()
    const { autoFill: _a, themes: _t, maxWords: _m, ...gen } = legacy.gen
    const docGen = { ...gen, words: [...legacy.entered, ...legacy.pool] }
    const doc = { ...legacy.doc, settings: docGen, placements: legacy.doc.placements.map((p) => ({ ...p, fromPool: false })) }
    const edited: WordEntry = { id: 'w-edited', display: 'Satellite', token: 'SATELLITE', source: 'custom' }
    await rehydrateLegacy({ gen: { ...docGen, words: [...docGen.words, edited] }, style: legacy.style, doc, docKey: null })

    const state = useStore.getState()
    expect(state.gen.words.map((w) => w.token)).toContain('SATELLITE')
    expect(state.docKey).toBeNull()
  })

  it('applies presets and reports custom when tweaked', async () => {
    const { currentPreset } = await import('./store')
    useStore.getState().applyPreset('hard')
    expect(currentPreset(useStore.getState().gen)).toBe('hard')
    useStore.getState().setGen({ overlap: 'none' })
    expect(currentPreset(useStore.getState().gen)).toBe('custom')
  })

  it('retitles for a theme unless the teacher typed their own title', () => {
    const title = () => useStore.getState().style.title
    const autoTitle = () => useStore.getState().style.autoTitle
    useStore.getState().retitleForTheme('Ocean Life')
    expect(title()).toBe('Ocean Life Word Search')
    expect(autoTitle()).toBe('Ocean Life Word Search')
    useStore.getState().retitleForTheme('Farm Animals')
    expect(title()).toBe('Farm Animals Word Search')
    expect(autoTitle()).toBe('Farm Animals Word Search')
    useStore.getState().setStyle({ title: '' })
    expect(autoTitle()).toBeUndefined()
    useStore.getState().retitleForTheme('Birds')
    expect(title()).toBe('Birds Word Search')
    useStore.getState().setStyle({ title: 'Mrs. Lee’s Spelling Words' })
    expect(autoTitle()).toBeUndefined()
    useStore.getState().retitleForTheme('Weather')
    expect(title()).toBe('Mrs. Lee’s Spelling Words')
  })

  it('does not replace a manually typed title that matches another theme title', () => {
    useStore.getState().setStyle({ title: 'Birds Word Search' })
    useStore.getState().retitleForTheme('Ocean Life')
    expect(useStore.getState().style.title).toBe('Birds Word Search')
    expect(useStore.getState().style.autoTitle).toBeUndefined()
  })

  it('replaces a title generated by the previous theme selection', () => {
    useStore.getState().retitleForTheme('Birds')
    useStore.getState().retitleForTheme('Ocean Life')
    expect(useStore.getState().style.title).toBe('Ocean Life Word Search')
    expect(useStore.getState().style.autoTitle).toBe('Ocean Life Word Search')
  })

  it('title-cases dictionary list names', () => {
    expect(themeTitle('Dog breeds')).toBe('Dog Breeds Word Search')
    expect(themeTitle('Crustaceans & shellfish')).toBe('Crustaceans & Shellfish Word Search')
  })
})
