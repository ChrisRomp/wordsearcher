import type { PathCmd } from './types'

export function pathData(d: PathCmd[]): string {
  return d.map((c) => `${c[0]}${c.slice(1).map((n) => (n as number).toFixed(2)).join(' ')}`).join('')
}
