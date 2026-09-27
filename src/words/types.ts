import type { Level } from '../core/types'

/** Hand-curated theme pack (src/words/curated/packs/<id>.json). */
export interface CuratedPack {
  id: string
  name: string
  emoji: string
  category: string
  description: string
  words: CuratedWord[]
}

export interface CuratedWord {
  /** Display text; may contain a space or hyphen (e.g. "Polar Bear"). */
  w: string
  /** 1 = early readers (K–2), 2 = grades 3–5, 3 = grades 6+. */
  level: Level
  /** Kid-friendly clue that never contains the answer. */
  clue: string
}

/** public/dict/index.json */
export interface DictIndex {
  version: string
  generatedAt: string
  sources: { name: string; version: string; license: string; url: string }[]
  categories: DictCategoryMeta[]
}

export interface DictCategoryMeta {
  id: string
  /** Shown as "Kinds of …", e.g. "Dog breeds". */
  name: string
  emoji: string
  group: string
  keywords: string[]
  count: number
  /** Path relative to public/dict/, e.g. "cat/dog-breeds.json". */
  file: string
}

/** public/dict/cat/<id>.json */
export interface DictCategory {
  id: string
  name: string
  words: DictWord[]
}

export interface DictWord {
  w: string
  /** Commonness band from SCOWL size: 1 = very common, 2 = common, 3 = less common. */
  l: Level
  /** Filtered WordNet gloss; omitted when no safe, non-revealing clue exists. */
  c?: string
}
