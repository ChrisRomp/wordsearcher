import { ALL_DIRECTIONS } from './directions'
import type { DirectionId, FillerMode, Level, OverlapPolicy } from './types'

export type PresetId = 'easy' | 'medium' | 'hard'

export interface DifficultySettings {
  directions: DirectionId[]
  overlap: OverlapPolicy
  filler: FillerMode
  rows: number
  cols: number
  /** Word-length range for words picked from theme packs. */
  minLen: number
  maxLen: number
  /** Commonness levels allowed for theme words (1 = most common). */
  levels: Level[]
}

export const PRESETS: Record<PresetId, DifficultySettings & { label: string; blurb: string }> = {
  easy: {
    label: 'Easy',
    blurb: 'Right and down only, no overlaps, random letters',
    directions: ['E', 'S'],
    overlap: 'none',
    filler: 'random',
    rows: 10,
    cols: 10,
    minLen: 3,
    maxLen: 8,
    levels: [1],
  },
  medium: {
    label: 'Medium',
    blurb: 'Adds diagonals and some overlap',
    directions: ['E', 'S', 'SE', 'NE'],
    overlap: 'allow',
    filler: 'frequency',
    rows: 15,
    cols: 15,
    minLen: 3,
    maxLen: 12,
    levels: [1, 2],
  },
  hard: {
    label: 'Hard',
    blurb: 'All 8 directions incl. backwards, heavy overlap, decoy letters',
    directions: [...ALL_DIRECTIONS],
    overlap: 'prefer',
    filler: 'decoy',
    rows: 20,
    cols: 20,
    minLen: 4,
    maxLen: 30,
    levels: [1, 2, 3],
  },
}

const PRESET_KEYS: (keyof DifficultySettings)[] = ['directions', 'overlap', 'filler', 'rows', 'cols', 'minLen', 'maxLen', 'levels']

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && [...a].sort().join() === [...b].sort().join()
  return a === b
}

/** Which preset (if any) the current settings exactly match; otherwise the difficulty is "custom". */
export function matchPreset(s: DifficultySettings): PresetId | 'custom' {
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    if (PRESET_KEYS.every((k) => sameValue(s[k], PRESETS[id][k]))) return id
  }
  return 'custom'
}
