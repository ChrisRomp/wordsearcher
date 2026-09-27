import { describe, expect, it } from 'vitest'
import type { Placement } from '../../core/types'
import { formatTime, matchSelection, snapSelection } from './selection'

const p = (token: string, r: number, c: number, dir: Placement['dir']): Placement => ({
  wordId: token,
  token,
  display: token,
  source: 'custom',
  r,
  c,
  dir,
  fromPool: false,
})

describe('snapSelection', () => {
  it('snaps to the nearest of 8 directions', () => {
    expect(snapSelection({ r: 2, c: 2 }, { r: 2, c: 6 }, 10, 10)).toHaveLength(5)
    expect(snapSelection({ r: 2, c: 2 }, { r: 3, c: 6 }, 10, 10).every((x) => x.r === 2)).toBe(true)
    const diag = snapSelection({ r: 0, c: 0 }, { r: 4, c: 3 }, 10, 10)
    expect(diag.at(-1)).toEqual({ r: 4, c: 4 })
    expect(snapSelection({ r: 5, c: 5 }, { r: 1, c: 5 }, 10, 10).at(-1)).toEqual({ r: 1, c: 5 })
  })

  it('clamps to the grid', () => {
    const cells = snapSelection({ r: 1, c: 1 }, { r: 9, c: 9 }, 5, 5)
    expect(cells.at(-1)).toEqual({ r: 4, c: 4 })
  })
})

describe('matchSelection', () => {
  const placements = [p('CAT', 0, 0, 'E'), p('DOG', 2, 2, 'S')]
  it('matches forwards and backwards, skipping found words', () => {
    expect(matchSelection([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }], placements, new Set())).toBe(0)
    expect(matchSelection([{ r: 4, c: 2 }, { r: 3, c: 2 }, { r: 2, c: 2 }], placements, new Set())).toBe(1)
    expect(matchSelection([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }], placements, new Set([0]))).toBe(-1)
    expect(matchSelection([{ r: 0, c: 0 }, { r: 0, c: 1 }], placements, new Set())).toBe(-1)
  })
})

it('formats time', () => {
  expect(formatTime(65_000)).toBe('1:05')
  expect(formatTime(3_725_000)).toBe('1:02:05')
})
