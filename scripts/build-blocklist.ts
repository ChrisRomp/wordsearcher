/**
 * Builds src/core/data/blocklist.json from the LDNOOBW English list (CC BY 4.0).
 * Tokens are normalized to A–Z (spaces/punctuation removed, since grid lines have no spaces)
 * and stored ROT13-encoded so the source tree doesn't contain the words in plain text.
 *
 * Usage: node scripts/build-blocklist.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, '.cache')
const sourcePath = join(cacheDir, 'ldnoobw-en.txt')
const outPath = join(root, 'src/core/data/blocklist.json')
const SOURCE_URL =
  'https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en'
const MIN_LENGTH = 3

/**
 * Extra entries not in LDNOOBW that a kid-safe filler should never spell.
 * Stored ROT13-encoded (same as the output).
 */
const SUPPLEMENTAL_ROT13 = ['XVYY', 'FRKL', 'CBEA', 'ARENQ', 'FGHCVQ', 'VQVBG', 'ZBEBA', 'QHZO', 'HTYL', 'SNG']

export function rot13(s: string): string {
  return s.replace(/[A-Z]/g, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 65 + 13) % 26) + 65))
}

export function toToken(entry: string): string | null {
  const t = entry
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[\s\-'’.]/g, '')
  if (!/^[A-Z]+$/.test(t) || t.length < MIN_LENGTH) return null
  return t
}

async function main() {
  if (!existsSync(sourcePath)) {
    mkdirSync(cacheDir, { recursive: true })
    const res = await fetch(SOURCE_URL)
    if (!res.ok) throw new Error(`Download failed: ${res.status}`)
    writeFileSync(sourcePath, await res.text())
  }
  const tokens = new Set<string>()
  for (const line of readFileSync(sourcePath, 'utf8').split('\n')) {
    const t = toToken(line.trim())
    if (t) tokens.add(t)
  }
  for (const s of SUPPLEMENTAL_ROT13) tokens.add(rot13(s))
  const encoded = [...tokens].sort().map(rot13)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify({
      source: 'LDNOOBW English list (CC BY 4.0) + supplemental entries',
      url: 'https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words',
      encoding: 'rot13',
      tokens: encoded,
    }) + '\n',
  )
  console.log(`Wrote ${encoded.length} tokens to ${outPath}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
