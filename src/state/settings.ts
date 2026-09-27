import { PRESETS } from '../core/presets'
import { randomSeed } from '../core/rng'
import type { DirectionId, FillerMode, Level, OverlapPolicy, WordEntry } from '../core/types'

export type TitleFontId = 'fredoka' | 'nunito' | 'patrick' | 'atkinson' | 'bree'
export type GridFontId = 'atkinson' | 'nunito' | 'fredoka'
export type ListOrder = 'entered' | 'alpha' | 'length' | 'hidden'
export type TitleSize = 'sm' | 'md' | 'lg'
export type PageSize = 'letter' | 'a4'
export type Orientation = 'portrait' | 'landscape'

/** Presentation only: changing these never regenerates the grid. */
export interface StyleSettings {
  title: string
  titleFont: TitleFontId
  titleColor: string
  titleSize: TitleSize
  gridFont: GridFontId
  letterCase: 'upper' | 'lower'
  listOrder: ListOrder
  clueMode: boolean
  showInstructions: boolean
  nameDate: boolean
  pageSize: PageSize
  orientation: Orientation
  answerKey: boolean
}

export interface ThemeRef {
  kind: 'curated' | 'dict'
  id: string
}

/** Inputs to the generator. Changing any of these produces a new grid. */
export interface GenSettings {
  words: WordEntry[]
  rows: number
  cols: number
  autoSize: boolean
  directions: DirectionId[]
  overlap: OverlapPolicy
  filler: FillerMode
  /** Target fraction of squares covered by words (drives auto-size and auto-fill). */
  density: number
  minLen: number
  maxLen: number
  levels: Level[]
  /** Themes used to auto-fill empty space. */
  themes: ThemeRef[]
  autoFill: boolean
  maxWords: number
  /** Tokens allowed to nest inside a longer word (e.g. CAT inside CATALOG). */
  allowNested: string[]
  seed: string
}

export const GRID_MIN = 5
export const GRID_MAX = 30

export const DEFAULT_STYLE: StyleSettings = {
  title: 'My Word Search',
  titleFont: 'fredoka',
  titleColor: '#e8553d',
  titleSize: 'md',
  gridFont: 'atkinson',
  letterCase: 'upper',
  listOrder: 'alpha',
  clueMode: false,
  showInstructions: true,
  nameDate: true,
  pageSize: 'letter',
  orientation: 'portrait',
  answerKey: true,
}

export function defaultGenSettings(): GenSettings {
  const p = PRESETS.medium
  return {
    words: [],
    rows: p.rows,
    cols: p.cols,
    autoSize: false,
    directions: [...p.directions],
    overlap: p.overlap,
    filler: p.filler,
    density: 0.55,
    minLen: p.minLen,
    maxLen: p.maxLen,
    levels: [...p.levels],
    themes: [],
    autoFill: false,
    maxWords: 40,
    allowNested: [],
    seed: randomSeed(),
  }
}

export const TITLE_COLORS = ['#e8553d', '#f29f05', '#1f9e89', '#2f6fdb', '#8e44ad', '#d6336c', '#2b2d42', '#3a7d44']
