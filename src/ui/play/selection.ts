import { DIRECTIONS, pathCells } from '../../core/directions'
import type { DirectionId, Placement } from '../../core/types'

export interface Cell {
  r: number
  c: number
}

const OCTANTS: DirectionId[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']

/** Snaps a drag from `start` toward `to` onto the nearest of the 8 directions, clamped to the grid. */
export function snapSelection(start: Cell, to: Cell, rows: number, cols: number): Cell[] {
  const dr = to.r - start.r
  const dc = to.c - start.c
  if (dr === 0 && dc === 0) return [start]
  const octant = ((Math.round(Math.atan2(dr, dc) / (Math.PI / 4)) % 8) + 8) % 8
  const d = DIRECTIONS[OCTANTS[octant]]
  let len = d.dr !== 0 && d.dc !== 0 ? Math.round((Math.abs(dr) + Math.abs(dc)) / 2) : Math.max(Math.abs(dr), Math.abs(dc))
  while (len > 0) {
    const er = start.r + d.dr * len
    const ec = start.c + d.dc * len
    if (er >= 0 && er < rows && ec >= 0 && ec < cols) break
    len--
  }
  return pathCells(start.r, start.c, d.id, len + 1).map(([r, c]) => ({ r, c }))
}

const key = (cells: Cell[]) => cells.map((x) => `${x.r},${x.c}`).join('|')

/** Index of the unfound placement matching the selection (either direction), or -1. */
export function matchSelection(cells: Cell[], placements: readonly Placement[], found: ReadonlySet<number>): number {
  if (cells.length < 2) return -1
  const fwd = key(cells)
  const rev = key([...cells].reverse())
  return placements.findIndex((p, i) => {
    if (found.has(i) || p.token.length !== cells.length) return false
    const k = key(pathCells(p.r, p.c, p.dir, p.token.length).map(([r, c]) => ({ r, c })))
    return k === fwd || k === rev
  })
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}
