import type { DirectionId } from './types'

export interface Direction {
  id: DirectionId
  dr: number
  dc: number
  label: string
  arrow: string
  opposite: DirectionId
  /** Reads right-to-left or bottom-to-top. */
  backwards: boolean
}

export const DIRECTIONS: Record<DirectionId, Direction> = {
  E: { id: 'E', dr: 0, dc: 1, label: 'Right', arrow: '→', opposite: 'W', backwards: false },
  S: { id: 'S', dr: 1, dc: 0, label: 'Down', arrow: '↓', opposite: 'N', backwards: false },
  SE: { id: 'SE', dr: 1, dc: 1, label: 'Down-right', arrow: '↘', opposite: 'NW', backwards: false },
  NE: { id: 'NE', dr: -1, dc: 1, label: 'Up-right', arrow: '↗', opposite: 'SW', backwards: false },
  W: { id: 'W', dr: 0, dc: -1, label: 'Left', arrow: '←', opposite: 'E', backwards: true },
  N: { id: 'N', dr: -1, dc: 0, label: 'Up', arrow: '↑', opposite: 'S', backwards: true },
  NW: { id: 'NW', dr: -1, dc: -1, label: 'Up-left', arrow: '↖', opposite: 'SE', backwards: true },
  SW: { id: 'SW', dr: 1, dc: -1, label: 'Down-left', arrow: '↙', opposite: 'NE', backwards: true },
}

export const ALL_DIRECTIONS: DirectionId[] = ['E', 'S', 'SE', 'NE', 'W', 'N', 'NW', 'SW']

/** Longest word that fits the grid in at least one of the given directions. */
export function maxWordLength(rows: number, cols: number, dirs: readonly DirectionId[]): number {
  let max = 0
  for (const id of dirs) {
    const d = DIRECTIONS[id]
    const len = d.dr === 0 ? cols : d.dc === 0 ? rows : Math.min(rows, cols)
    if (len > max) max = len
  }
  return max
}

/** Directions whose opposite is also enabled (a word placed that way can be read backwards). */
export function hasOpposite(dir: DirectionId, enabled: readonly DirectionId[]): boolean {
  return enabled.includes(DIRECTIONS[dir].opposite)
}

export function pathCells(r: number, c: number, dir: DirectionId, length: number): [number, number][] {
  const d = DIRECTIONS[dir]
  const cells: [number, number][] = []
  for (let i = 0; i < length; i++) cells.push([r + d.dr * i, c + d.dc * i])
  return cells
}

/** Short summary like "→ ↓ ↘ ↗" for instructions and UI. */
export function describeDirections(dirs: readonly DirectionId[]): string {
  return ALL_DIRECTIONS.filter((d) => dirs.includes(d))
    .map((d) => DIRECTIONS[d].arrow)
    .join(' ')
}
