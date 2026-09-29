import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { normalizeWord, splitWordInput } from '../core/normalize'
import { PRESETS, matchPreset, type PresetId } from '../core/presets'
import { randomSeed } from '../core/rng'
import type { GenerateInput, ValidationIssue, WordEntry } from '../core/types'
import { MAX_WORDS } from '../core/validate'
import { createDoc, parseDoc, sanitizeSettings, sanitizeStyle, type PuzzleDoc } from '../doc/puzzleDoc'
import { loadDictIndex, loadThemeWords, newWordId, shouldRetitle, themeTitle, toEntry } from '../words/themes'
import { CancelledError, runGenerate } from './generatorClient'
import { DEFAULT_STYLE, defaultGenSettings, type GenSettings, type StyleSettings, type ThemeRef } from './settings'

export type Status = 'idle' | 'generating' | 'error'
export type View = 'edit' | 'play'

export interface InputError {
  text: string
  error: string
}

interface AppState {
  gen: GenSettings
  style: StyleSettings
  /** Last successfully generated puzzle (kept visible while edits are invalid). */
  doc: PuzzleDoc | null
  /** JSON of the GenSettings that produced `doc`. */
  docKey: string | null
  status: Status
  issues: ValidationIssue[]
  warnings: ValidationIssue[]
  failure: 'invalid-input' | 'budget-exhausted' | null
  view: View
  showSolution: boolean
  inputErrors: InputError[]

  setGen(patch: Partial<GenSettings>): void
  setStyle(patch: Partial<StyleSettings>): void
  applyPreset(id: PresetId): void
  addWordsFromText(text: string): number
  addEntries(entries: WordEntry[]): number
  updateWord(id: string, patch: Partial<Pick<WordEntry, 'display' | 'clue'>>): void
  removeWords(ids: string[]): void
  clearWords(): void
  pinPoolWords(): void
  toggleTheme(ref: ThemeRef, on?: boolean): void
  /** Sets the title to "[Theme] Word Search" unless the teacher typed their own title. */
  retitleForTheme(themeName: string): void
  allowNested(token: string): void
  regenerate(): void
  generateNow(): Promise<void>
  loadDoc(doc: PuzzleDoc): void
  setView(view: View): void
  setShowSolution(on: boolean): void
  dismissInputErrors(): void
  reset(): void
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(v)
}

const usesPool = (gen: GenSettings) => gen.autoFill && gen.themes.length > 0

/**
 * Identity of everything that feeds the generator (property-order independent). Clue mode only
 * matters when auto-filling, because then only words with clues are drawn from themes.
 */
export function settingsKey(gen: GenSettings, clueMode: boolean): string {
  return stableStringify(gen) + (usesPool(gen) ? `|clues:${clueMode ? 1 : 0}` : '')
}

async function buildPool(gen: GenSettings, clueMode: boolean): Promise<{ pool: WordEntry[]; data?: string }> {
  if (!usesPool(gen)) return { pool: [] }
  const levels = new Set(gen.levels)
  const pool: WordEntry[] = []
  let usesDict = false
  for (const ref of gen.themes) {
    try {
      const words = await loadThemeWords(ref)
      if (ref.kind === 'dict') usesDict = true
      for (const w of words)
        if (levels.has(w.level) && w.token.length >= gen.minLen && w.token.length <= gen.maxLen && (!clueMode || w.clue))
          pool.push(toEntry(w, ref))
    } catch {
      // A missing word list shouldn't block the rest of the pool.
    }
  }
  const data = usesDict ? (await loadDictIndex())?.version : undefined
  return { pool, data }
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      gen: defaultGenSettings(),
      style: DEFAULT_STYLE,
      doc: null,
      docKey: null,
      status: 'idle',
      issues: [],
      warnings: [],
      failure: null,
      view: 'edit',
      showSolution: false,
      inputErrors: [],

      setGen: (patch) => set((s) => ({ gen: { ...s.gen, ...patch } })),
      setStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),

      applyPreset(id) {
        const p = PRESETS[id]
        get().setGen({
          directions: [...p.directions],
          overlap: p.overlap,
          filler: p.filler,
          rows: p.rows,
          cols: p.cols,
          minLen: p.minLen,
          maxLen: p.maxLen,
          levels: [...p.levels],
        })
      },

      addWordsFromText(text) {
        const errors: InputError[] = []
        const entries: WordEntry[] = []
        const room = Math.max(0, MAX_WORDS - get().gen.words.length)
        // Parse a bit beyond the room left so duplicates/invalid entries don't hide valid words.
        for (const raw of splitWordInput(text).slice(0, room + 100)) {
          const n = normalizeWord(raw)
          if (n.error) errors.push({ text: raw.slice(0, 40), error: n.error })
          else entries.push({ id: newWordId(), display: n.display.slice(0, 60), token: n.token, source: 'custom' })
        }
        const added = get().addEntries(entries)
        if (added >= room && entries.length > added)
          errors.unshift({ text: `${entries.length - added} more`, error: `not added, since a puzzle can have at most ${MAX_WORDS} words` })
        set({ inputErrors: errors.slice(0, 12) })
        return added
      },

      addEntries(entries) {
        const current = get().gen.words
        const existing = new Set(current.map((w) => w.token))
        const fresh = entries.filter((e) => {
          if (existing.has(e.token)) return false
          existing.add(e.token)
          return true
        }).slice(0, Math.max(0, MAX_WORDS - current.length))
        if (fresh.length) set((s) => ({ gen: { ...s.gen, words: [...s.gen.words, ...fresh] } }))
        return fresh.length
      },

      updateWord(id, patch) {
        const wasCurrent = !!get().doc && get().docKey === settingsKey(get().gen, get().style.clueMode)
        set((s) => ({
          gen: {
            ...s.gen,
            words: s.gen.words.map((w) => {
              if (w.id !== id) return w
              const next = { ...w }
              if (patch.display !== undefined) {
                const n = normalizeWord(patch.display)
                if (n.error) return w
                next.display = n.display
                next.token = n.token
              }
              if (patch.clue !== undefined) {
                const clue = patch.clue.trim()
                if (clue) next.clue = clue
                else delete next.clue
              }
              return next
            }),
          },
        }))
        // Clue-only edits don't change the grid; patch the current doc so the sheet updates without
        // regenerating. Only safe when the doc was generated from the settings being edited.
        if (patch.display === undefined && wasCurrent) {
          const { doc, gen, style } = get()
          const word = gen.words.find((w) => w.id === id)
          set({
            doc: {
              ...doc!,
              settings: gen,
              placements: doc!.placements.map((p) => {
                if (p.wordId !== id) return p
                const next = { ...p }
                if (word?.clue) next.clue = word.clue
                else delete next.clue
                return next
              }),
            },
            docKey: settingsKey(gen, style.clueMode),
          })
        }
      },

      removeWords(ids) {
        const drop = new Set(ids)
        set((s) => ({ gen: { ...s.gen, words: s.gen.words.filter((w) => !drop.has(w.id)) } }))
      },

      clearWords: () => set((s) => ({ gen: { ...s.gen, words: [], allowNested: [] } })),

      pinPoolWords() {
        const { doc } = get()
        if (!doc) return
        const wasCurrent = get().docKey === settingsKey(get().gen, get().style.clueMode)
        const pooled = doc.placements.filter((p) => p.fromPool)
        const entries: WordEntry[] = pooled.map((p) => ({
          id: p.wordId,
          display: p.display,
          token: p.token,
          source: p.source,
          ...(p.clue ? { clue: p.clue } : {}),
        }))
        get().addEntries(entries)
        get().setGen({ autoFill: false })
        // Keep the current layout: the pinned words are exactly the ones already in the grid.
        const { gen, style } = get()
        if (wasCurrent && gen.words.length === doc.placements.length) {
          set({
            doc: { ...doc, settings: gen, placements: doc.placements.map((p) => ({ ...p, fromPool: false })) },
            docKey: settingsKey(gen, style.clueMode),
          })
        }
      },

      toggleTheme(ref, on) {
        set((s) => {
          const has = s.gen.themes.some((t) => t.kind === ref.kind && t.id === ref.id)
          const want = on ?? !has
          const themes = want
            ? has
              ? s.gen.themes
              : [...s.gen.themes, ref]
            : s.gen.themes.filter((t) => !(t.kind === ref.kind && t.id === ref.id))
          return { gen: { ...s.gen, themes, autoFill: themes.length > 0 ? s.gen.autoFill || want : false } }
        })
      },

      allowNested: (token) =>
        set((s) => ({ gen: { ...s.gen, allowNested: [...new Set([...s.gen.allowNested, token])] } })),

      retitleForTheme(themeName) {
        if (shouldRetitle(get().style.title)) get().setStyle({ title: themeTitle(themeName) })
      },

      regenerate: () => get().setGen({ seed: randomSeed() }),

      async generateNow() {
        const { gen, style } = get()
        const key = settingsKey(gen, style.clueMode)
        const stale = () => settingsKey(get().gen, get().style.clueMode) !== key
        if (key === get().docKey) {
          if (get().status !== 'idle') set({ status: 'idle', issues: [], failure: null })
          return
        }
        set({ status: 'generating' })
        const { pool, data } = await buildPool(gen, style.clueMode)
        // Settings changed while loading word lists; a newer run owns the worker now.
        if (stale()) return
        const input: GenerateInput = {
          rows: gen.rows,
          cols: gen.cols,
          words: gen.words,
          pool,
          directions: gen.directions,
          overlap: gen.overlap,
          filler: gen.filler,
          density: gen.density,
          maxWords: gen.autoFill ? Math.max(gen.maxWords, gen.words.length) : undefined,
          allowNested: gen.allowNested,
          seed: gen.seed,
        }
        let result
        try {
          result = await runGenerate(input, gen.autoSize && gen.words.length > 0)
        } catch (e) {
          if (e instanceof CancelledError) return
          set({ status: 'error', failure: 'budget-exhausted', issues: [{ code: 'over-capacity', severity: 'error', message: String((e as Error).message), wordIds: [] }] })
          return
        }
        if (stale()) return
        if (result.ok) {
          set({
            doc: createDoc({ grid: result.grid, placements: result.placements, style: get().style, settings: gen, data }),
            docKey: key,
            status: 'idle',
            issues: [],
            warnings: result.warnings,
            failure: null,
          })
        } else {
          set({ status: 'error', issues: result.issues, failure: result.reason, warnings: [] })
        }
      },

      loadDoc(doc) {
        set({
          doc,
          gen: doc.settings,
          style: doc.style,
          docKey: settingsKey(doc.settings, doc.style.clueMode),
          status: 'idle',
          issues: [],
          warnings: [],
          failure: null,
          showSolution: false,
        })
      },

      setView: (view) => set({ view }),
      setShowSolution: (showSolution) => set({ showSolution }),
      dismissInputErrors: () => set({ inputErrors: [] }),
      reset: () =>
        set({ gen: defaultGenSettings(), style: DEFAULT_STYLE, doc: null, docKey: null, issues: [], warnings: [], failure: null, status: 'idle' }),
    }),
    {
      name: 'wordsearcher:v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ gen: s.gen, style: s.style, doc: s.doc, docKey: s.docKey }),
      merge(persisted, current) {
        const p = (persisted ?? {}) as Record<string, unknown>
        let doc: PuzzleDoc | null = null
        try {
          doc = p.doc ? parseDoc(p.doc) : null
        } catch {
          doc = null
        }
        const gen = sanitizeSettings(p.gen)
        const style = sanitizeStyle(p.style)
        const key = settingsKey(gen, style.clueMode)
        return {
          ...current,
          gen,
          style,
          doc,
          docKey: doc && p.docKey === key ? key : null,
        }
      },
    },
  ),
)

export function currentPreset(gen: GenSettings): PresetId | 'custom' {
  return matchPreset(gen)
}

/** The doc as it should be shared/exported: grid from the last generation, current presentation. */
export function exportDoc(): PuzzleDoc | null {
  const { doc, style } = useStore.getState()
  return doc ? { ...doc, style } : null
}
