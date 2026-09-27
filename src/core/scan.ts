import { ALL_DIRECTIONS, DIRECTIONS } from './directions'
import type { DirectionId } from './types'

interface TrieNode {
  next: Map<string, TrieNode>
  /** Indices of tokens ending here. */
  ends: number[]
}

export interface Match {
  tokenIndex: number
  r: number
  c: number
  dir: DirectionId
  length: number
}

export class Trie {
  root: TrieNode = { next: new Map(), ends: [] }
  readonly tokens: string[] = []

  add(token: string): number {
    const index = this.tokens.length
    this.tokens.push(token)
    let node = this.root
    for (const ch of token) {
      let n = node.next.get(ch)
      if (!n) {
        n = { next: new Map(), ends: [] }
        node.next.set(ch, n)
      }
      node = n
    }
    node.ends.push(index)
    return index
  }
}

/**
 * Finds every occurrence of every trie token in the grid, reading in the given directions.
 * `grid` is row-major letters ('' = empty/masked, which breaks a line).
 */
export function scanGrid(
  grid: readonly string[],
  rows: number,
  cols: number,
  trie: Trie,
  dirs: readonly DirectionId[] = ALL_DIRECTIONS,
): Match[] {
  const matches: Match[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const first = grid[r * cols + c]
      if (!first) continue
      const start = trie.root.next.get(first)
      if (!start) continue
      for (const dir of dirs) {
        const d = DIRECTIONS[dir]
        let node: TrieNode | undefined = start
        let rr = r
        let cc = c
        let len = 1
        while (node) {
          for (const tokenIndex of node.ends) matches.push({ tokenIndex, r, c, dir, length: len })
          rr += d.dr
          cc += d.dc
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) break
          const ch = grid[rr * cols + cc]
          if (!ch) break
          node = node.next.get(ch)
          len++
        }
      }
    }
  }
  return matches
}

export function matchCells(m: { r: number; c: number; dir: DirectionId; length: number }, cols: number): number[] {
  const d = DIRECTIONS[m.dir]
  const cells: number[] = []
  for (let i = 0; i < m.length; i++) cells.push((m.r + d.dr * i) * cols + (m.c + d.dc * i))
  return cells
}

/** Order-independent key for a set of cells, so a palindrome read both ways counts once. */
export function cellKey(cells: readonly number[]): string {
  return [...cells].sort((a, b) => a - b).join(',')
}
