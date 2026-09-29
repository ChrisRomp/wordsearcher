import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { normalizeWord, splitWordInput } from '../core/normalize'
import { PRESETS, matchPreset, type PresetId } from '../core/presets'
import { randomSeed } from '../core/rng'
import type { GenerateInput, ValidationIssue, WordEntry } from '../core/types'
import { MAX_WORDS } from '../core/validate'
import { createDoc, parseDoc, sanitizeSettings, sanitizeStyle, type PuzzleDoc } from '../doc/puzzleDoc'
import { loadDictIndex, newWordId, shouldRetitle, themeTitle } from '../words/themes'
import { CancelledError, runGenerate } from './generatorClient'
import { DEFAULT_STYLE, defaultGenSettings, type GenSettings, type StyleSettings } from './settings'

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
  /** settingsKey of the GenSettings that produced `doc`. */
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

/** Identity of everything that feeds the generator (property-order independent). */
export function settingsKey(gen: GenSettings): string {
  return stableStringify(gen)
}

function legacyAutoFillSettingsKey(rawGen: unknown, rawStyle: unknown): string | null {
  if (!rawGen || typeof rawGen !== 'object' || (rawGen as { autoFill?: unknown }).autoFill !== true) return null
  const themes = (rawGen as { themes?: unknown }).themes
  const clueMode = !!(rawStyle && typeof rawStyle === 'object' && (rawStyle as { clueMode?: unknown }).clueMode === true)
  return `${stableStringify(rawGen)}${Array.isArray(themes) && themes.length > 0 ? `|clues:${clueMode ? 1 : 0}` : ''}`
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
      setStyle: (patch) =>
        set((s) => {
          const style = { ...s.style, ...patch }
          if ('title' in patch && !('autoTitle' in patch)) delete style.autoTitle
          if (!style.autoTitle?.trim()) delete style.autoTitle
          return { style }
        }),

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
        const wasCurrent = !!get().doc && get().docKey === settingsKey(get().gen)
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
          const { doc, gen } = get()
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
            docKey: settingsKey(gen),
          })
        }
      },

      removeWords(ids) {
        const drop = new Set(ids)
        set((s) => ({ gen: { ...s.gen, words: s.gen.words.filter((w) => !drop.has(w.id)) } }))
      },

      clearWords: () => set((s) => ({ gen: { ...s.gen, words: [], allowNested: [] } })),

      allowNested: (token) =>
        set((s) => ({ gen: { ...s.gen, allowNested: [...new Set([...s.gen.allowNested, token])] } })),

      retitleForTheme(themeName) {
        const { title, autoTitle } = get().style
        if (shouldRetitle(title, autoTitle)) {
          const nextTitle = themeTitle(themeName)
          get().setStyle({ title: nextTitle, autoTitle: nextTitle })
        }
      },

      regenerate: () => get().setGen({ seed: randomSeed() }),

      async generateNow() {
        const { gen } = get()
        const key = settingsKey(gen)
        const stale = () => settingsKey(get().gen) !== key
        if (key === get().docKey) {
          if (get().status !== 'idle') set({ status: 'idle', issues: [], failure: null })
          return
        }
        set({ status: 'generating' })
        // Record which dictionary data the words came from, for reproducibility.
        const data = gen.words.some((w) => w.source === 'dict') ? (await loadDictIndex())?.version : undefined
        // Settings changed while waiting; a newer run owns the worker now.
        if (stale()) return
        const input: GenerateInput = {
          rows: gen.rows,
          cols: gen.cols,
          words: gen.words,
          directions: gen.directions,
          overlap: gen.overlap,
          filler: gen.filler,
          density: gen.density,
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
          docKey: settingsKey(doc.settings),
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
        const rawGen = p.gen
        let gen = sanitizeSettings(rawGen)
        // Theme auto-fill was removed; only adopt the doc's folded-in pool words when the legacy key
        // proves that the saved puzzle was generated from the persisted settings.
        const legacyKey = legacyAutoFillSettingsKey(rawGen, p.style)
        if (doc && legacyKey !== null && p.docKey === legacyKey) gen = doc.settings
        // The saved puzzle is current if it was generated from exactly these settings.
        const key = settingsKey(gen)
        return {
          ...current,
          gen,
          style: sanitizeStyle(p.style),
          doc,
          docKey: doc && settingsKey(doc.settings) === key ? key : null,
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
