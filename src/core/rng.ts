/** Deterministic PRNG: cyrb128 string hash → sfc32 generator. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number
  int(maxExclusive: number): number
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: T[]): T[]
  /** Pick an index with probability proportional to its weight. */
  weighted(weights: readonly number[]): number
}

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

export function createRng(seed: string): Rng {
  let [a, b, c, d] = cyrb128(seed)
  const next = () => {
    a >>>= 0
    b >>>= 0
    c >>>= 0
    d >>>= 0
    let t = (a + b) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    d = (d + 1) | 0
    t = (t + d) | 0
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
  for (let i = 0; i < 12; i++) next()

  return {
    next,
    int: (max) => Math.floor(next() * max),
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[items[i], items[j]] = [items[j], items[i]]
      }
      return items
    },
    weighted(weights) {
      let total = 0
      for (const w of weights) total += w
      if (total <= 0) return Math.floor(next() * weights.length)
      let r = next() * total
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i]
        if (r < 0) return i
      }
      return weights.length - 1
    },
  }
}

const SEED_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Short, human-friendly random seed (not deterministic; for new puzzles). */
export function randomSeed(length = 6): string {
  let s = ''
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  for (const b of bytes) s += SEED_ALPHABET[b % SEED_ALPHABET.length]
  return s
}
