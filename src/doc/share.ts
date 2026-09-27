import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { DocError, parseDoc, type PuzzleDoc } from './puzzleDoc'

/** Links above this length are awkward to paste into emails/LMSes; offer a file download instead. */
export const SHARE_URL_SOFT_LIMIT = 2000
export const SHARE_URL_HARD_LIMIT = 8000
const MAX_DECODED_BYTES = 200_000

export const SHARE_PARAM = 'p'

export function encodeDoc(doc: PuzzleDoc): string {
  return compressToEncodedURIComponent(JSON.stringify(doc))
}

export function decodeDoc(encoded: string): PuzzleDoc {
  if (encoded.length > SHARE_URL_HARD_LIMIT * 4) throw new DocError('Link is too long')
  const json = decompressFromEncodedURIComponent(encoded)
  if (!json) throw new DocError('Link is damaged')
  if (json.length > MAX_DECODED_BYTES) throw new DocError('Puzzle is too large')
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new DocError('Link is damaged')
  }
  return parseDoc(raw)
}

export function shareUrl(doc: PuzzleDoc, base: string): string {
  return `${base}#${SHARE_PARAM}=${encodeDoc(doc)}`
}

/** Reads a shared doc from a location hash like "#p=…". Returns null when there's no puzzle in the hash. */
export function docFromHash(hash: string): PuzzleDoc | null {
  const m = hash.match(new RegExp(`[#&]${SHARE_PARAM}=([^&]+)`))
  return m ? decodeDoc(m[1]) : null
}

export const FILE_EXTENSION = '.wordsearch.json'

export function docToFile(doc: PuzzleDoc): Blob {
  return new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' })
}

export async function docFromFile(file: File): Promise<PuzzleDoc> {
  if (file.size > MAX_DECODED_BYTES) throw new DocError('File is too large')
  let raw: unknown
  try {
    raw = JSON.parse(await file.text())
  } catch {
    throw new DocError('Not a puzzle file')
  }
  return parseDoc(raw)
}
