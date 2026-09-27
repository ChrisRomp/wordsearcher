import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generate } from '../core/generator'
import { ALL_DIRECTIONS } from '../core/directions'
import { normalizeWord } from '../core/normalize'
import { DEFAULT_STYLE, type StyleSettings } from '../state/settings'
import type { FaceId } from './fonts'
import { FACES } from './fonts'
import { pagesToPdf } from './renderPdf'
import { approxMeasure, capsule, directionsSentence, layoutSheet, letterHint, sortedWords, type SheetDoc } from './sheet'

const fontDir = join(__dirname, '../../public/fonts')
const loadFont = async (face: FaceId) => {
  const buf = readFileSync(join(fontDir, `${FACES[face].file}.ttf`))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const WORDS: [string, string][] = [
  ['Planet', 'A large round world that travels around a star'],
  ['Comet', 'An icy visitor with a glowing tail that grows as it nears the Sun'],
  ['Asteroid', 'A rocky chunk orbiting the Sun, many live in a belt between Mars and Jupiter'],
  ['Black Hole', 'A region where gravity is so strong that not even light can escape'],
  ['Galaxy', 'A huge family of billions of stars, like our Milky Way'],
  ['Nebula', 'A giant cloud of gas and dust where new stars are born'],
  ['Orbit', 'The curved path one object takes around another'],
  ['Meteor', 'A streak of light made when space rock burns up in our sky'],
  ['Telescope', 'A tool that makes faraway things look closer'],
  ['Astronaut', 'A person trained to travel and work in space'],
  ['Rocket', 'A vehicle that blasts off by pushing hot gas downward'],
  ['Eclipse', 'When one object in space blocks the light from another'],
  ['Gravity', 'The pull that keeps your feet on the ground'],
  ['Crater', 'A bowl-shaped hole made by a crash on a moon or planet'],
  ['Satellite', 'Something that circles a planet, such as the Moon or a weather probe'],
  ['Saturn', 'The sixth planet, famous for its bright rings'],
  ['Jupiter', 'The largest planet in our solar system'],
  ['Mercury', 'The smallest planet and the closest to the Sun'],
  ['Neptune', 'A windy blue planet, farthest from the Sun'],
  ['Venus', 'The hottest planet, wrapped in thick clouds'],
  ['Solar Flare', 'A sudden burst of energy from the surface of the Sun'],
  ['Supernova', 'The gigantic explosion of a dying star'],
  ['Constellation', 'A group of stars that forms a picture in the night sky'],
  ['Lunar', 'Having to do with the Moon'],
  ['Cosmos', 'Another name for the whole universe'],
  ['Pulsar', 'A spinning dead star that sends out beams like a lighthouse'],
  ['Quasar', 'A super-bright center of a faraway galaxy'],
  ['Aurora', 'Colorful lights that dance in the sky near the poles'],
  ['Zodiac', 'A band of twelve star patterns along the path of the Sun'],
  ['Spacesuit', 'Protective clothing worn outside a spacecraft'],
]

function sampleDoc(rows = 20, cols = 20): SheetDoc {
  const res = generate({
    rows,
    cols,
    words: WORDS.map(([w, clue], i) => ({ id: `w${i}`, display: w, token: normalizeWord(w).token, source: 'custom', clue })),
    directions: [...ALL_DIRECTIONS],
    overlap: 'prefer',
    filler: 'decoy',
    density: 0.5,
    seed: 'spike',
  })
  if (!res.ok) throw new Error(JSON.stringify(res.issues))
  return {
    rows,
    cols,
    grid: res.grid.map((r) => r.join('')).join(''),
    placements: res.placements,
    seed: 'spike',
    directions: [...ALL_DIRECTIONS],
  }
}

const style = (s: Partial<StyleSettings> = {}): StyleSettings => ({ ...DEFAULT_STYLE, ...s })

describe('layout helpers', () => {
  it('letter hints', () => {
    expect(letterHint('Black Hole')).toBe('(5, 4)')
    expect(letterHint('T-Rex')).toBe('(1, 3)')
    expect(letterHint('Comet')).toBe('(5)')
  })

  it('describes directions in words', () => {
    expect(directionsSentence(['E', 'S'])).toBe('Words go across and down.')
    expect(directionsSentence(['E', 'S', 'SE', 'NE'])).toBe('Words go across, down, and diagonally.')
    expect(directionsSentence([...ALL_DIRECTIONS])).toBe('Words go across, down, and diagonally, forwards and backwards.')
    expect(directionsSentence(['W'])).toBe('Words go across, backwards only.')
  })

  it('sorts word lists', () => {
    const doc = sampleDoc()
    const alpha = sortedWords(doc.placements, 'alpha').map((p) => p.display)
    expect(alpha).toEqual([...alpha].sort((a, b) => a.localeCompare(b)))
    const byLen = sortedWords(doc.placements, 'length').map((p) => p.token.length)
    expect(byLen).toEqual([...byLen].sort((a, b) => a - b))
  })

  it('capsule is a closed path', () => {
    const d = capsule(0, 0, 100, 0, 10)
    expect(d[0][0]).toBe('M')
    expect(d.at(-1)).toEqual(['Z'])
  })
})

describe('layoutSheet', () => {
  it('keeps everything inside the page margins', () => {
    const doc = sampleDoc()
    for (const s of [style(), style({ clueMode: true }), style({ orientation: 'landscape' }), style({ pageSize: 'a4', titleSize: 'lg' })]) {
      for (const answerKey of [false, true]) {
        const { pages } = layoutSheet(doc, s, approxMeasure, { answerKey })
        for (const page of pages)
          for (const p of page.prims) {
            if (p.k === 'text') {
              expect(p.y).toBeGreaterThan(0)
              expect(p.y).toBeLessThan(page.height)
            }
            if (p.k === 'rect') {
              expect(p.x).toBeGreaterThanOrEqual(39)
              expect(p.x + p.w).toBeLessThanOrEqual(page.width - 39)
            }
          }
      }
    }
  })

  it('draws one capsule per answer on the key only', () => {
    const doc = sampleDoc()
    const puzzle = layoutSheet(doc, style(), approxMeasure)
    const key = layoutSheet(doc, style(), approxMeasure, { answerKey: true })
    expect(puzzle.pages[0].prims.filter((p) => p.k === 'path')).toHaveLength(0)
    expect(key.pages[0].prims.filter((p) => p.k === 'path')).toHaveLength(doc.placements.length)
  })

  it('hides the list but still shows it on the key', () => {
    const doc = sampleDoc(17, 17)
    const texts = (answerKey: boolean) =>
      layoutSheet(doc, style({ listOrder: 'hidden' }), approxMeasure, { answerKey }).pages[0].prims.filter(
        (p) => p.k === 'text' && p.text === doc.placements[0].display.toUpperCase(),
      )
    expect(texts(false)).toHaveLength(0)
    expect(texts(true)).toHaveLength(1)
  })

  it('paginates very long clue lists and keeps every line on the page', () => {
    const doc = sampleDoc(25, 25)
    const many = Array.from({ length: 120 }, (_, i) => ({ ...doc.placements[i % doc.placements.length], wordId: `x${i}`, clue: `${WORDS[i % WORDS.length][1]} and more words to make this clue long` }))
    for (const s of [style({ clueMode: true }), style({ clueMode: true, orientation: 'landscape' })]) {
      const { pages } = layoutSheet({ ...doc, placements: many }, s, approxMeasure)
      expect(pages.length).toBeGreaterThan(2)
      const texts = pages.flatMap((p) => p.prims.filter((x) => x.k === 'text').map((x) => ({ y: (x as { y: number }).y, h: p.height })))
      for (const t of texts) expect(t.y).toBeLessThanOrEqual(t.h - 36 + 4)
      const numbers = pages.slice(1).flatMap((p) => p.prims.filter((x) => x.k === 'text' && /^\d+\.$/.test(x.text)).map((x) => (x as { text: string }).text))
      expect(numbers).toHaveLength(120)
      expect(numbers.at(-1)).toBe('120.')
    }
  })

  it('overflows a huge clue list onto a second page instead of shrinking the grid to nothing', () => {
    const doc = sampleDoc(30, 30)
    const long = { ...doc, placements: doc.placements.map((p) => ({ ...p, clue: `${p.clue} ${p.clue} ${p.clue}` })) }
    const { pages, grid, overflowed } = layoutSheet(long, style({ clueMode: true }), approxMeasure)
    expect(grid.cell).toBeGreaterThanOrEqual(14)
    expect(overflowed).toBe(true)
    expect(pages.length).toBeGreaterThanOrEqual(2)
  })
})

describe('pdf spike', () => {
  it('renders a font-heavy worksheet + answer key to PDF', async () => {
    const doc = sampleDoc()
    const s = style({
      title: 'Astronomy Word Search: Exploring the Planets, Stars and Beyond',
      titleFont: 'fredoka',
      clueMode: true,
    })
    const pages = [
      ...layoutSheet(doc, s, approxMeasure).pages,
      ...layoutSheet(doc, s, approxMeasure, { answerKey: true }).pages,
      ...layoutSheet(doc, style({ titleFont: 'patrick', gridFont: 'fredoka', letterCase: 'lower' }), approxMeasure).pages,
    ]
    const blob = await pagesToPdf(pages, loadFont)
    const buf = Buffer.from(await blob.arrayBuffer())
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(20_000)
    if (process.env.SPIKE_OUT) writeFileSync(process.env.SPIKE_OUT, buf)
  })
})
