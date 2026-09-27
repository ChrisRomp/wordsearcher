import { normalizeWord } from '../core/normalize'
import type { Level, WordEntry, WordSource } from '../core/types'
import type { ThemeRef } from '../state/settings'
import type { CuratedPack, DictCategory, DictIndex } from './types'

const packModules = import.meta.glob<CuratedPack>('./curated/packs/*.json', { eager: true, import: 'default' })

export const CURATED_PACKS: CuratedPack[] = Object.values(packModules).sort((a, b) =>
  a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category),
)

export const CURATED_CATEGORIES = [...new Set(CURATED_PACKS.map((p) => p.category))]

export interface ThemeWord {
  display: string
  token: string
  level: Level
  clue?: string
}

export interface ThemeInfo {
  ref: ThemeRef
  name: string
  emoji: string
  group: string
  count: number
  description?: string
  keywords?: string[]
}

export function curatedThemes(): ThemeInfo[] {
  return CURATED_PACKS.map((p) => ({
    ref: { kind: 'curated', id: p.id },
    name: p.name,
    emoji: p.emoji,
    group: p.category,
    count: p.words.length,
    description: p.description,
  }))
}

let indexPromise: Promise<DictIndex | null> | null = null
const categoryCache = new Map<string, Promise<DictCategory>>()

const dictUrl = (path: string) => `${import.meta.env.BASE_URL}dict/${path}`

/** Dictionary index (null if the data hasn't been built/deployed). */
export function loadDictIndex(): Promise<DictIndex | null> {
  indexPromise ??= fetch(dictUrl('index.json'))
    .then((r) => (r.ok ? (r.json() as Promise<DictIndex>) : null))
    .catch(() => null)
  return indexPromise
}

export async function dictThemes(): Promise<ThemeInfo[]> {
  const index = await loadDictIndex()
  return (
    index?.categories.map((c) => ({
      ref: { kind: 'dict', id: c.id },
      name: c.name,
      emoji: c.emoji,
      group: c.group,
      count: c.count,
      keywords: c.keywords,
    })) ?? []
  )
}

async function loadCategory(id: string): Promise<DictCategory> {
  let p = categoryCache.get(id)
  if (!p) {
    p = (async () => {
      const index = await loadDictIndex()
      const meta = index?.categories.find((c) => c.id === id)
      if (!meta) throw new Error(`Unknown word list “${id}”`)
      const res = await fetch(dictUrl(meta.file))
      if (!res.ok) throw new Error(`Couldn't load “${meta.name}”`)
      return (await res.json()) as DictCategory
    })()
    p.catch(() => categoryCache.delete(id))
    categoryCache.set(id, p)
  }
  return p
}

export async function loadThemeWords(ref: ThemeRef): Promise<ThemeWord[]> {
  const raw =
    ref.kind === 'curated'
      ? (CURATED_PACKS.find((p) => p.id === ref.id)?.words ?? []).map((w) => ({ display: w.w, level: w.level, clue: w.clue }))
      : (await loadCategory(ref.id)).words.map((w) => ({ display: w.w, level: w.l, clue: w.c }))
  return raw.flatMap((w) => {
    const n = normalizeWord(w.display)
    return n.error ? [] : [{ display: n.display, token: n.token, level: w.level, clue: w.clue || undefined }]
  })
}

export function themeName(ref: ThemeRef, themes: readonly ThemeInfo[]): string {
  return themes.find((t) => t.ref.kind === ref.kind && t.ref.id === ref.id)?.name ?? ref.id
}

let uid = 0
export function newWordId(): string {
  return `${Date.now().toString(36)}${(uid++).toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

export function toEntry(w: ThemeWord, ref: ThemeRef): WordEntry {
  const source: WordSource = ref.kind === 'curated' ? 'curated' : 'dict'
  const e: WordEntry = { id: newWordId(), display: w.display, token: w.token, source, level: w.level, themeId: ref.id }
  if (w.clue) e.clue = w.clue
  return e
}
