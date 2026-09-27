import blocklistData from './data/blocklist.json'

function rot13(s: string): string {
  return s.replace(/[A-Z]/g, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 65 + 13) % 26) + 65))
}

let cached: string[] | null = null

/**
 * Tokens that filler letters must never spell (in any direction).
 * Source: LDNOOBW English list (CC BY 4.0) plus supplemental entries; see scripts/build-blocklist.ts.
 */
export function getBlocklist(): string[] {
  if (!cached) cached = blocklistData.tokens.map(rot13)
  return cached
}

/** True if the token is on the blocklist. For flagging app-supplied content; custom words aren't blocked. */
export function isBlocked(token: string): boolean {
  return getBlocklist().includes(token)
}

/** True if the token contains a blocklisted string (used to screen app-supplied dictionary words). */
export function containsBlocked(token: string): boolean {
  return getBlocklist().some((b) => b.length >= 4 && token.includes(b))
}
