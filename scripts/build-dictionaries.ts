/**
 * Build-time WordNet + SCOWL dictionary pipeline.
 *
 * Usage: node scripts/build-dictionaries.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { unzipSync } from 'fflate'
import {
  CATEGORY_CONFIGS,
  DICT_VERSION,
  GLOBAL_DENY_TOKENS,
  GLOBAL_EXCLUDE_ROOTS,
  type DictCategoryConfig,
} from './dict-categories.ts'
import {
  canonicalLemma,
  foldAscii,
  hasBlocklistedToken,
  makeClue,
  rot13,
  scowlSizeToLevel,
  splitDisplayParts,
  titleCaseDisplay,
  toToken,
  type DictLevel,
} from './dict-lib.ts'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(rootDir, '.cache')
const publicDictDir = join(rootDir, 'public', 'dict')
const publicCatDir = join(publicDictDir, 'cat')
const blocklistPath = join(rootDir, 'src', 'core', 'data', 'blocklist.json')
const reviewPath = join(
  dirname(dirname(rootDir)),
  '.copilot',
  'session-state',
  'dd8f4c28-7bf5-40ac-844b-d4a6fdc8f6b5',
  'files',
  'dict-review.md',
)

const OEWN_ZIP = 'english-wordnet-2025-json.zip'
const OEWN_URL =
  'https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025-json.zip'
const SCOWL_TAR = 'scowl-2020.12.07.tar.gz'
const SCOWL_URL = 'https://sourceforge.net/projects/wordlist/files/SCOWL/2020.12.07/scowl-2020.12.07.tar.gz/download'
const SCOWL_VERSION_DIR = 'scowl-2020.12.07'
const SCOWL_SIZES = [10, 20, 35, 40, 50, 55, 60]
const MAX_CATEGORY_WORDS = 300
const DEFAULT_MIN_WORDS = 15

const BAD_USAGE_SYNSETS = new Set([
  '07139048-n',
  '07139804-n',
  '07143235-n',
  '07171981-n',
  '07174118-n',
  '06730109-n',
  '06731706-n',
  '01157531-n',
])

const SENSITIVE_DEFINITION_RE =
  /\b(offensive|vulgar|slang|derogator\w*|obscene|sexual|indecent|profane|genital\w*|sperm\w*|testicl\w*|breast|buttock\w*|rump|udder|teat|mammary|reproduct\w*|narcotic|drugs?|alcohol|alcoholic|intoxicant|liquor|wine|cognac|ferment\w*|tobacco|smoking|weapon|firearm|explosive|gun|murder|suicide|execution|torture|prostitut\w*|poison\w*|gambl\w*|bet|lottery|poker|casino|military|armed forces|armed services|army|warship|duel|racial slur|ethnic slur)\b/i

type DictWord = { w: string; l: DictLevel; c?: string }
type DictCategory = { id: string; name: string; words: DictWord[] }
type DictCategoryMeta = {
  id: string
  name: string
  emoji: string
  group: string
  keywords: string[]
  count: number
  file: string
}

interface Synset {
  id: string
  file: string
  definition?: string[]
  members?: string[]
  hypernym?: string[]
  exemplifies?: string[]
}

interface CandidateWord {
  w: string
  token: string
  l: DictLevel
  depth: number
  synsetId: string
  memberIndex: number
  senseRank: number
  clue?: string
}

interface BuildContext {
  synsets: Map<string, Synset>
  childrenByParent: Map<string, string[]>
  nounSenseIdsByLemma: Map<string, string[]>
  scowlSizes: Map<string, number>
  blocklistTokens: Set<string>
  globalExcludedSynsets: Set<string>
  dropCounts: Map<string, number>
  clueDropCounts: Map<string, number>
  primarySenseDrops: Map<string, number>
  manualDenyDrops: Map<string, number>
}

interface RootRow {
  category: string
  kind: string
  id: string
  lemmas: string
  definition: string
}

async function main() {
  mkdirSync(cacheDir, { recursive: true })
  mkdirSync(dirname(reviewPath), { recursive: true })

  await downloadIfMissing(OEWN_URL, join(cacheDir, OEWN_ZIP))
  await downloadIfMissing(SCOWL_URL, join(cacheDir, SCOWL_TAR))
  ensureScowlExtracted()

  const { synsets, childrenByParent, nounSenseIdsByLemma } = loadOewn()
  const scowlSizes = loadScowlSizes()
  const blocklistTokens = loadBlocklistTokens()
  const dropCounts = new Map<string, number>()
  const clueDropCounts = new Map<string, number>()
  const primarySenseDrops = new Map<string, number>()
  const manualDenyDrops = new Map<string, number>()
  const globalExcludedSynsets = collectClosure(GLOBAL_EXCLUDE_ROOTS, childrenByParent, Number.POSITIVE_INFINITY)

  const ctx: BuildContext = {
    synsets,
    childrenByParent,
    nounSenseIdsByLemma,
    scowlSizes,
    blocklistTokens,
    globalExcludedSynsets,
    dropCounts,
    clueDropCounts,
    primarySenseDrops,
    manualDenyDrops,
  }

  const rootRows = buildRootRows(ctx)
  printRootCheckTable(rootRows)

  rmSync(publicCatDir, { recursive: true, force: true })
  mkdirSync(publicCatDir, { recursive: true })

  const metas: DictCategoryMeta[] = []
  const categories: DictCategory[] = []
  const droppedCategories: string[] = []

  for (const config of CATEGORY_CONFIGS) {
    const category = buildCategory(config, ctx)
    const minWords = Math.max(config.minWords ?? DEFAULT_MIN_WORDS, DEFAULT_MIN_WORDS)
    if (category.words.length < minWords) {
      droppedCategories.push(`${config.id} (${category.words.length}/${minWords})`)
      inc(dropCounts, 'category-below-minimum', minWords - category.words.length)
      continue
    }
    categories.push(category)
    const file = `cat/${config.id}.json`
    writeFileSync(join(publicDictDir, file), JSON.stringify(category))
    metas.push({
      id: config.id,
      name: config.name,
      emoji: config.emoji,
      group: config.group,
      keywords: config.keywords,
      count: category.words.length,
      file,
    })
  }

  const index = {
    version: DICT_VERSION,
    generatedAt: new Date().toISOString(),
    sources: [
      {
        name: 'Open English WordNet',
        version: '2025 core edition',
        license: 'CC BY 4.0',
        url: 'https://github.com/globalwordnet/english-wordnet/releases/tag/2025-edition',
      },
      {
        name: 'SCOWL',
        version: '2020.12.07',
        license: 'Permissive/MIT-like',
        url: 'https://sourceforge.net/projects/wordlist/files/SCOWL/2020.12.07/',
      },
      {
        name: 'LDNOOBW blocklist',
        version: 'encoded list stored in src/core/data/blocklist.json',
        license: 'CC BY 4.0',
        url: 'https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words',
      },
    ],
    categories: metas,
  }
  writeFileSync(join(publicDictDir, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  writeFileSync(join(publicDictDir, 'ATTRIBUTION.md'), buildAttribution())
  writeFileSync(
    reviewPath,
    buildReviewReport(
      rootRows,
      categories,
      droppedCategories,
      ctx.dropCounts,
      ctx.clueDropCounts,
      ctx.primarySenseDrops,
      publicDictDir,
    ),
  )

  console.log(`Wrote ${categories.length} categories and ${metas.reduce((sum, c) => sum + c.count, 0)} words.`)
  console.log(`Review report: ${reviewPath}`)
}

async function downloadIfMissing(url: string, outPath: string) {
  if (existsSync(outPath)) return
  console.log(`Downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`)
  const data = Buffer.from(await res.arrayBuffer())
  writeFileSync(outPath, data)
}

function ensureScowlExtracted() {
  const finalDir = join(cacheDir, SCOWL_VERSION_DIR, 'final')
  const copyrightPath = join(cacheDir, SCOWL_VERSION_DIR, 'Copyright')
  const needed = [
    copyrightPath,
    ...SCOWL_SIZES.flatMap((size) => [
      join(finalDir, `english-words.${size}`),
      join(finalDir, `american-words.${size}`),
    ]),
  ]
  if (needed.every((path) => existsSync(path))) return

  const archive = gunzipSync(readFileSync(join(cacheDir, SCOWL_TAR)))
  const entries = readTarEntries(archive)
  mkdirSync(finalDir, { recursive: true })
  mkdirSync(dirname(copyrightPath), { recursive: true })

  for (const [name, bytes] of entries) {
    if (name === `${SCOWL_VERSION_DIR}/Copyright`) {
      writeFileSync(copyrightPath, bytes)
      continue
    }
    const finalPrefix = `${SCOWL_VERSION_DIR}/final/`
    if (!name.startsWith(finalPrefix)) continue
    const shortName = name.slice(finalPrefix.length)
    if (!/^(english|american)-words\.(10|20|35|40|50|55|60)$/.test(shortName)) continue
    writeFileSync(join(finalDir, shortName), bytes)
  }
}

function readTarEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>()
  let offset = 0
  while (offset + 512 <= buffer.length) {
    const name = readNullTerminated(buffer.subarray(offset, offset + 100))
    if (!name) break
    const sizeText = readNullTerminated(buffer.subarray(offset + 124, offset + 136)).trim()
    const size = Number.parseInt(sizeText || '0', 8)
    const typeflag = String.fromCharCode(buffer[offset + 156] || 0)
    const dataStart = offset + 512
    const dataEnd = dataStart + size
    if (typeflag === '0' || typeflag === '\0') {
      entries.set(name, Buffer.from(buffer.subarray(dataStart, dataEnd)))
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  return entries
}

function readNullTerminated(bytes: Buffer): string {
  const end = bytes.indexOf(0)
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString('utf8')
}

function loadOewn() {
  const zip = unzipSync(readFileSync(join(cacheDir, OEWN_ZIP)))
  const synsets = new Map<string, Synset>()
  const childrenByParent = new Map<string, string[]>()
  const nounSenseIdsByLemma = new Map<string, string[]>()

  for (const name of Object.keys(zip).filter((entry) => entry.startsWith('noun.') && entry.endsWith('.json'))) {
    const data = JSON.parse(Buffer.from(zip[name]).toString('utf8')) as Record<string, Omit<Synset, 'id' | 'file'>>
    for (const [id, raw] of Object.entries(data)) {
      const synset: Synset = { ...raw, id, file: name }
      synsets.set(id, synset)
      for (const parent of synset.hypernym ?? []) {
        const children = childrenByParent.get(parent) ?? []
        children.push(id)
        childrenByParent.set(parent, children)
      }
    }
  }

  for (const name of Object.keys(zip).filter((entry) => entry.startsWith('entries-') && entry.endsWith('.json'))) {
    const entries = JSON.parse(Buffer.from(zip[name]).toString('utf8')) as Record<
      string,
      { n?: { sense?: { synset?: string }[] } }
    >
    for (const [lemma, entry] of Object.entries(entries)) {
      const synsetIds = entry.n?.sense?.map((sense) => sense.synset).filter((id): id is string => Boolean(id)) ?? []
      if (!synsetIds.length) continue
      const key = lemmaKey(lemma)
      const existing = nounSenseIdsByLemma.get(key) ?? []
      nounSenseIdsByLemma.set(key, dedupe([...existing, ...synsetIds]))
    }
  }

  for (const synset of synsets.values()) {
    for (const member of synset.members ?? []) {
      const key = lemmaKey(member)
      const existing = nounSenseIdsByLemma.get(key) ?? []
      nounSenseIdsByLemma.set(key, dedupe([...existing, synset.id]))
    }
  }

  return { synsets, childrenByParent, nounSenseIdsByLemma }
}

function loadScowlSizes(): Map<string, number> {
  const sizes = new Map<string, number>()
  const finalDir = join(cacheDir, SCOWL_VERSION_DIR, 'final')
  for (const size of SCOWL_SIZES) {
    for (const prefix of ['english', 'american']) {
      const path = join(finalDir, `${prefix}-words.${size}`)
      const lines = readFileSync(path).toString('latin1').split(/\r?\n/)
      for (const line of lines) {
        const word = foldAscii(line.trim()).toLowerCase()
        if (!/^[a-z]+$/.test(word)) continue
        if (!sizes.has(word) || size < (sizes.get(word) ?? Number.POSITIVE_INFINITY)) sizes.set(word, size)
      }
    }
  }
  return sizes
}

function loadBlocklistTokens(): Set<string> {
  const raw = JSON.parse(readFileSync(blocklistPath, 'utf8')) as { tokens: string[] }
  return new Set(raw.tokens.map(rot13))
}

function buildCategory(config: DictCategoryConfig, ctx: BuildContext): DictCategory {
  const depths = collectDepths(config.roots, ctx.childrenByParent, config.maxDepth ?? Number.POSITIVE_INFINITY)
  const categoryExcluded = collectClosure(
    [...(config.excludeRoots ?? []), ...GLOBAL_EXCLUDE_ROOTS],
    ctx.childrenByParent,
    Number.POSITIVE_INFINITY,
  )
  const denyTokens = new Set([...GLOBAL_DENY_TOKENS, ...(config.denyTokens ?? [])])
  for (const entry of config.manualDeny ?? []) denyTokens.add(entry.token)
  const rootLemmaTokens = collectRootLemmaTokens(config.roots, ctx.synsets)
  const categoryNameTokens = collectCategoryNameTokens(config.name)
  const genericTailTokens = collectGenericTailTokens(rootLemmaTokens, categoryNameTokens)
  const bySynset = new Map<string, CandidateWord>()
  const byToken = new Map<string, CandidateWord>()

  for (const [synsetId, depth] of depths) {
    const synset = ctx.synsets.get(synsetId)
    if (!synset) continue
    if (categoryExcluded.has(synsetId)) {
      inc(ctx.dropCounts, 'sensitive-or-excluded-subtree', synset.members?.length ?? 1)
      continue
    }
    for (const [memberIndex, member] of (synset.members ?? []).entries()) {
      const candidate = candidateFromMember(
        member,
        synset,
        depth,
        memberIndex,
        depths,
        rootLemmaTokens,
        categoryNameTokens,
        config,
        denyTokens,
        ctx,
      )
      if (!candidate) continue
      const synsetPrevious = bySynset.get(candidate.synsetId)
      if (!synsetPrevious || compareSynsetLemma(candidate, synsetPrevious) < 0) {
        if (synsetPrevious) inc(ctx.dropCounts, 'synset-lemma-alias')
        bySynset.set(candidate.synsetId, candidate)
      } else {
        inc(ctx.dropCounts, 'synset-lemma-alias')
      }
    }
  }

  for (const candidate of bySynset.values()) {
    const previous = byToken.get(candidate.token)
    if (!previous || compareCandidate(candidate, previous) < 0) {
      if (previous) inc(ctx.dropCounts, 'duplicate-token')
      byToken.set(candidate.token, candidate)
    } else {
      inc(ctx.dropCounts, 'duplicate-token')
    }
  }

  const filtered = dropMultiwordVariants([...byToken.values()], genericTailTokens, ctx.dropCounts)
  const candidates = filtered.sort(compareCandidate)
  if (candidates.length > MAX_CATEGORY_WORDS) inc(ctx.dropCounts, 'category-cap-trim', candidates.length - MAX_CATEGORY_WORDS)
  return {
    id: config.id,
    name: config.name,
    words: candidates.slice(0, MAX_CATEGORY_WORDS).map((candidate) => {
      const word: DictWord = { w: candidate.w, l: candidate.l }
      if (candidate.clue) word.c = candidate.clue
      return word
    }),
  }
}

function candidateFromMember(
  member: string,
  synset: Synset,
  depth: number,
  memberIndex: number,
  categoryClosure: ReadonlyMap<string, number>,
  rootLemmaTokens: ReadonlySet<string>,
  categoryNameTokens: ReadonlySet<string>,
  config: DictCategoryConfig,
  denyTokens: ReadonlySet<string>,
  ctx: BuildContext,
): CandidateWord | null {
  const displayBase = canonicalLemma(member)
  if (!displayBase) return dropNull(ctx.dropCounts, 'empty-lemma')

  const firstLetter = displayBase.match(/[A-Za-z]/)?.[0]
  if (firstLetter && firstLetter !== firstLetter.toLowerCase() && !config.allowCapitalized) {
    return dropNull(ctx.dropCounts, 'capitalized-lemma')
  }
  if (!/^[A-Za-z]/.test(displayBase)) return dropNull(ctx.dropCounts, 'bad-format')
  if (!/^[A-Za-z]+(?:[ \-'][A-Za-z]+)*$/.test(displayBase)) return dropNull(ctx.dropCounts, 'bad-format')

  const token = toToken(displayBase)
  if (token.length < 3 || token.length > 15) return dropNull(ctx.dropCounts, 'length')
  if (rootLemmaTokens.has(token)) return dropNull(ctx.dropCounts, 'root-lemma')
  if (categoryNameTokens.has(token)) return dropNull(ctx.dropCounts, 'category-name-lemma')
  if (hasBlocklistedToken(token, ctx.blocklistTokens)) return dropNull(ctx.dropCounts, 'blocklist-token')
  if (hasManualDeniedToken(token, denyTokens)) {
    inc(ctx.manualDenyDrops, config.id)
    return dropNull(ctx.dropCounts, 'manual-deny-token')
  }

  const lemmaSenseIds = ctx.nounSenseIdsByLemma.get(lemmaKey(displayBase)) ?? [synset.id]
  const senseRank = lemmaSenseIds.indexOf(synset.id)
  if (!passesPrimarySenseRule(synset.id, lemmaSenseIds, categoryClosure)) {
    inc(ctx.primarySenseDrops, config.id)
    return dropNull(ctx.dropCounts, 'non-primary-sense')
  }
  if (lemmaSenseIds.some((id) => ctx.globalExcludedSynsets.has(id))) {
    return dropNull(ctx.dropCounts, 'sensitive-sense-subtree')
  }
  if (hasBadUsage(lemmaSenseIds, ctx.synsets)) return dropNull(ctx.dropCounts, 'bad-usage-register')
  if (hasSensitiveDefinition(lemmaSenseIds, ctx.synsets)) return dropNull(ctx.dropCounts, 'sensitive-definition')

  const level = levelForDisplay(displayBase, config, ctx.scowlSizes)
  if (typeof level === 'string') return dropNull(ctx.dropCounts, level)

  const clueSynset = clueSynsetForLemma(synset.id, lemmaSenseIds, categoryClosure, ctx.synsets)
  const clueResult: { clue?: string; reason?: string } = clueSynset
    ? makeClue(clueSynset.definition?.[0], titleCaseDisplay(displayBase), ctx.blocklistTokens, ctx.scowlSizes)
    : { reason: 'non-primary-clue-sense' }
  if (clueResult.reason) inc(ctx.clueDropCounts, clueResult.reason)

  return {
    w: titleCaseDisplay(displayBase),
    token,
    l: level,
    depth,
    synsetId: synset.id,
    memberIndex,
    senseRank: senseRank === -1 ? Number.POSITIVE_INFINITY : senseRank,
    clue: clueResult.clue,
  }
}

function levelForDisplay(
  display: string,
  _config: DictCategoryConfig,
  scowlSizes: ReadonlyMap<string, number>,
): DictLevel | string {
  const parts = splitDisplayParts(display)
  if (parts.length > 2) return 'multiword-too-long'
  if (parts.length > 1) {
    for (const part of parts) {
      const size = scowlSizes.get(part)
      if (!size || size > 35) return 'multiword-rare-part'
    }
    return 3
  }
  const key = foldAscii(display).toLowerCase()
  const size = scowlSizes.get(key)
  if (!size) return 'missing-scowl'
  const level = scowlSizeToLevel(size)
  if (!level) return 'rare-scowl'
  return level
}

function passesPrimarySenseRule(
  synsetId: string,
  lemmaSenseIds: readonly string[],
  categoryClosure: ReadonlyMap<string, number>,
): boolean {
  const rank = lemmaSenseIds.indexOf(synsetId)
  if (rank === 0) return true
  return rank === 1 && lemmaSenseIds.length >= 4 && categoryClosure.has(lemmaSenseIds[0])
}

function clueSynsetForLemma(
  synsetId: string,
  lemmaSenseIds: readonly string[],
  categoryClosure: ReadonlyMap<string, number>,
  synsets: ReadonlyMap<string, Synset>,
): Synset | null {
  const earliestInCategory = lemmaSenseIds.find((id) => categoryClosure.has(id))
  if (!earliestInCategory || earliestInCategory !== lemmaSenseIds[0]) return null
  return synsets.get(earliestInCategory) ?? synsets.get(synsetId) ?? null
}

function compareSynsetLemma(a: CandidateWord, b: CandidateWord): number {
  const aParts = splitDisplayParts(a.w).length
  const bParts = splitDisplayParts(b.w).length
  return aParts - bParts || a.l - b.l || a.memberIndex - b.memberIndex || compareCandidate(a, b)
}

function dropMultiwordVariants(
  candidates: CandidateWord[],
  genericTailTokens: ReadonlySet<string>,
  dropCounts: Map<string, number>,
): CandidateWord[] {
  const singleTokens = new Set(candidates.filter((candidate) => splitDisplayParts(candidate.w).length === 1).map((candidate) => candidate.token))
  const kept: CandidateWord[] = []
  for (const candidate of candidates) {
    const parts = splitDisplayParts(candidate.w)
    const lastPartToken = parts.length > 1 ? toToken(parts[parts.length - 1]) : ''
    if (candidate.w.includes('-') && parts.length > 1) {
      inc(dropCounts, 'hyphenated-multiword')
      continue
    }
    if (lastPartToken && genericTailTokens.has(lastPartToken)) {
      inc(dropCounts, 'generic-multiword-compound')
      continue
    }
    if (parts.length > 1 && parts.some((part) => part.length >= 3 && singleTokens.has(toToken(part)))) {
      inc(dropCounts, 'multiword-variant')
      continue
    }
    kept.push(candidate)
  }
  return kept
}

function collectRootLemmaTokens(rootIds: readonly string[], synsets: ReadonlyMap<string, Synset>): Set<string> {
  const tokens = new Set<string>()
  for (const id of rootIds) {
    const synset = synsets.get(id)
    for (const member of synset?.members ?? []) {
      const token = toToken(member)
      if (token) tokens.add(token)
    }
  }
  return tokens
}

function collectCategoryNameTokens(name: string): Set<string> {
  const tokens = new Set<string>()
  for (const word of foldAscii(name).match(/[A-Za-z]+/g) ?? []) {
    if (word.length < 3) continue
    const singular = singularize(word.toLowerCase())
    tokens.add(toToken(singular))
  }
  return tokens
}

function collectGenericTailTokens(rootLemmaTokens: ReadonlySet<string>, categoryNameTokens: ReadonlySet<string>): Set<string> {
  const tokens = new Set<string>(categoryNameTokens)
  for (const token of rootLemmaTokens) tokens.add(token)
  return tokens
}

function singularize(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('ches') || word.endsWith('shes')) {
    return word.slice(0, -2)
  }
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

function hasManualDeniedToken(token: string, denyTokens: ReadonlySet<string>): boolean {
  for (const denied of denyTokens) {
    if (denied.length === 3) {
      if (token === denied) return true
    } else if (token === denied || token.includes(denied)) {
      return true
    }
  }
  return false
}

function hasBadUsage(synsetIds: string[], synsets: ReadonlyMap<string, Synset>): boolean {
  for (const id of synsetIds) {
    const synset = synsets.get(id)
    for (const usage of synset?.exemplifies ?? []) {
      if (BAD_USAGE_SYNSETS.has(usage)) return true
    }
  }
  return false
}

function hasSensitiveDefinition(synsetIds: string[], synsets: ReadonlyMap<string, Synset>): boolean {
  for (const id of synsetIds) {
    const synset = synsets.get(id)
    for (const definition of synset?.definition ?? []) {
      if (SENSITIVE_DEFINITION_RE.test(definition)) return true
    }
  }
  return false
}

function collectClosure(rootIds: string[], childrenByParent: ReadonlyMap<string, string[]>, maxDepth: number): Set<string> {
  return new Set(collectDepths(rootIds, childrenByParent, maxDepth).keys())
}

function collectDepths(
  rootIds: string[],
  childrenByParent: ReadonlyMap<string, string[]>,
  maxDepth: number,
): Map<string, number> {
  const depths = new Map<string, number>()
  const queue: { id: string; depth: number }[] = rootIds.map((id) => ({ id, depth: 0 }))
  for (let i = 0; i < queue.length; i += 1) {
    const { id, depth } = queue[i]
    const previous = depths.get(id)
    if (previous !== undefined && previous <= depth) continue
    depths.set(id, depth)
    if (depth >= maxDepth) continue
    for (const child of childrenByParent.get(id) ?? []) queue.push({ id: child, depth: depth + 1 })
  }
  return depths
}

function compareCandidate(a: CandidateWord, b: CandidateWord): number {
  return (
    a.l - b.l ||
    a.senseRank - b.senseRank ||
    a.depth - b.depth ||
    (b.clue ? 1 : 0) - (a.clue ? 1 : 0) ||
    a.w.localeCompare(b.w, 'en')
  )
}

function buildRootRows(ctx: BuildContext): RootRow[] {
  const rows: RootRow[] = []
  for (const config of CATEGORY_CONFIGS) {
    for (const id of config.roots) rows.push(rootRow(config, 'root', id, ctx.synsets))
    for (const id of config.excludeRoots ?? []) rows.push(rootRow(config, 'exclude', id, ctx.synsets))
  }
  return rows
}

function rootRow(config: DictCategoryConfig, kind: string, id: string, synsets: ReadonlyMap<string, Synset>): RootRow {
  const synset = synsets.get(id)
  if (id === '05521732-n') {
    return {
      category: config.id,
      kind,
      id,
      lemmas: '(sensitive subtree redacted)',
      definition: '(sensitive subtree redacted)',
    }
  }
  return {
    category: config.id,
    kind,
    id,
    lemmas: synset?.members?.join(', ') ?? '(missing)',
    definition: synset?.definition?.[0] ?? '(missing)',
  }
}

function printRootCheckTable(rows: RootRow[]) {
  console.log('Root check table:')
  console.log('category\tkind\tsynset\tlemmas\tdefinition')
  for (const row of rows) {
    console.log(`${row.category}\t${row.kind}\t${row.id}\t${row.lemmas}\t${row.definition}`)
  }
}

function buildAttribution(): string {
  const scowlCopyright = readFileSync(join(cacheDir, SCOWL_VERSION_DIR, 'Copyright'), 'utf8').trimEnd()
  return `# Dictionary attribution

This build-time dictionary uses filtered noun lemmas and glosses. Source data was modified by selecting kid-safe noun hyponyms, removing unsafe or obscure entries, folding accents, title-casing display text, deriving SCOWL commonness bands, and omitting some clues.

## Open English WordNet 2025

- Title: Open English WordNet 2025, core edition
- Author: Open English WordNet contributors / Global WordNet Association
- Source: https://github.com/globalwordnet/english-wordnet/releases/tag/2025-edition
- License: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/
- Changes: Data was modified and filtered for classroom-appropriate word-search use.

## SCOWL 2020.12.07

- Source: https://sourceforge.net/projects/wordlist/files/SCOWL/2020.12.07/
- License: permissive notice reproduced below.

${scowlCopyright}

## LDNOOBW blocklist

- Title: List of Dirty, Naughty, Obscene, and Otherwise Bad Words
- Source: https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
- License: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/
- Use: Used only as an encoded filtering blocklist; decoded terms are not redistributed in these dictionary outputs.
`
}

function buildReviewReport(
  rootRows: RootRow[],
  categories: DictCategory[],
  droppedCategories: string[],
  dropCounts: ReadonlyMap<string, number>,
  clueDropCounts: ReadonlyMap<string, number>,
  primarySenseDrops: ReadonlyMap<string, number>,
  dictDir: string,
): string {
  const categoryLines = categories.map((category) => {
    const levels = { 1: 0, 2: 0, 3: 0 }
    for (const word of category.words) levels[word.l] += 1
    const clueCount = category.words.filter((word) => Boolean(word.c)).length
    const clueCoverage = category.words.length ? `${Math.round((clueCount / category.words.length) * 100)}%` : '0%'
    return `| ${category.id} | ${category.words.length} | ${levels[1]} | ${levels[2]} | ${levels[3]} | ${clueCount} | ${clueCoverage} |`
  })

  const sampleIds = ['dog-breeds', 'trees', 'tools', 'occupations', 'desserts-sweets', 'mammals', 'vehicles', 'body-parts']
  const samples = sampleIds
    .map((id) => categories.find((category) => category.id === id))
    .filter((category): category is DictCategory => Boolean(category))
    .map((category) => {
      const rows = category.words
        .slice(0, 30)
        .map((word) => `| ${word.w} | ${word.l} | ${word.c ? escapeMd(word.c) : ''} |`)
        .join('\n')
      return `### ${category.name} (${category.id})

| Word | Level | Clue |
| --- | ---: | --- |
${rows}`
    })
    .join('\n\n')

  const concerns: string[] = []
  if (droppedCategories.length) concerns.push(`Dropped below-minimum categories: ${droppedCategories.join(', ')}.`)
  const clueLess = categories.reduce((sum, category) => sum + category.words.filter((word) => !word.c).length, 0)
  concerns.push(`${clueLess} accepted words have no clue because the gloss was missing, revealing, too long, or unsafe.`)
  concerns.push('Global sensitive subtrees, usage/register flags, decoded blocklist tokens, and manual deny tokens were applied conservatively.')

  return `# Dictionary review

Generated: ${new Date().toISOString()}

## Source/root check table

| Category | Kind | Synset | Lemmas | Definition |
| --- | --- | --- | --- | --- |
${rootRows.map((row) => `| ${row.category} | ${row.kind} | ${row.id} | ${escapeMd(row.lemmas)} | ${escapeMd(row.definition)} |`).join('\n')}

## Per-category counts

| Category | Count | Level 1 | Level 2 | Level 3 | Clues | Clue coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${categoryLines.join('\n')}

## Samples

${samples}

## Word drop counts

| Reason | Count |
| --- | ---: |
${[...dropCounts.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => `| ${reason} | ${count} |`).join('\n')}

## Primary-sense drops by category

| Category | Dropped |
| --- | ---: |
${[...primarySenseDrops.entries()].sort((a, b) => b[1] - a[1]).map(([category, count]) => `| ${category} | ${count} |`).join('\n')}

## Manual review

Manual deny counts by category after the exhaustive category word review.

| Category | Denied |
| --- | ---: |
${CATEGORY_CONFIGS.filter((config) => (config.manualDeny?.length ?? 0) > 0)
  .map((config) => [config.id, config.manualDeny?.length ?? 0] as const)
  .sort((a, b) => b[1] - a[1])
  .map(([category, count]) => `| ${category} | ${count} |`)
  .join('\n')}

## Clue omission counts

| Reason | Count |
| --- | ---: |
${[...clueDropCounts.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => `| ${reason} | ${count} |`).join('\n')}

## Concerns and follow-up

${concerns.map((concern) => `- ${concern}`).join('\n')}

## Output size

public/dict total: ${formatBytes(directorySize(dictDir))}
`
}

function escapeMd(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function directorySize(path: string): number {
  let total = 0
  for (const entry of readdirSync(path)) {
    const fullPath = join(path, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) total += directorySize(fullPath)
    else total += stat.size
  }
  return total
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

function inc(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function dropNull(map: Map<string, number>, reason: string): null {
  inc(map, reason)
  return null
}

function lemmaKey(input: string): string {
  return canonicalLemma(input).toLowerCase()
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)]
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
