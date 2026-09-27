import { DIRECTIONS } from '../core/directions'
import type { DirectionId, Placement } from '../core/types'
import type { ListOrder, StyleSettings } from '../state/settings'
import { BODY_BOLD_FACE, BODY_FACE, FACES, GRID_FONTS, TITLE_FONTS, type FaceId } from './fonts'
import type { Measure, Page, PathCmd, Prim } from './types'

export const PAGE_SIZES = { letter: [612, 792], a4: [595.28, 841.89] } as const
const MARGIN = 40
const INK = '#1d1d1f'
const MUTED = '#6b6b70'
const RULE = '#9a9aa2'
export const ANSWER_COLORS = ['#e8553d', '#1f9e89', '#2f6fdb', '#f29f05', '#8e44ad', '#d6336c', '#3a7d44', '#0e7490']
const TITLE_SIZES = { sm: 22, md: 30, lg: 40 } as const
const MAX_CELL = 40
const MIN_CELL = 15
const COMFORT_CELL = 22
const LIST_SIZES = [13, 12, 11, 10, 9]

export interface SheetDoc {
  rows: number
  cols: number
  grid: string
  placements: Placement[]
  seed: string
  directions: DirectionId[]
}

export interface SheetOptions {
  answerKey?: boolean
}

export interface SheetLayout {
  pages: Page[]
  /** Grid geometry on page 1 (for overlays). */
  grid: { x: number; y: number; cell: number }
  /** List didn't fit on the first page and continues on the next. */
  overflowed: boolean
}

// ---------- text helpers ----------

export function applyCase(text: string, letterCase: StyleSettings['letterCase']): string {
  return letterCase === 'lower' ? text.toLowerCase() : text.toUpperCase()
}

/** Letter-count hint in crossword style: "Black Hole" → "(5, 4)". */
export function letterHint(display: string): string {
  const parts = display
    .split(/[\s-]+/)
    .map((p) => p.replace(/[^\p{L}]/gu, '').length)
    .filter((n) => n > 0)
  return `(${parts.join(', ')})`
}

export function directionsSentence(dirs: readonly DirectionId[]): string {
  const has = (...ids: DirectionId[]) => ids.some((d) => dirs.includes(d))
  const parts: string[] = []
  if (has('E', 'W')) parts.push('across')
  if (has('S', 'N')) parts.push(has('S') ? 'down' : 'up')
  if (has('SE', 'NE', 'NW', 'SW')) parts.push('diagonally')
  if (parts.length === 0) return ''
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')}${parts.length > 2 ? ',' : ''} and ${parts.at(-1)}`
  const back = dirs.filter((d) => DIRECTIONS[d].backwards).length
  const suffix = back === 0 ? '' : back === dirs.length ? ', backwards only' : ', forwards and backwards'
  return `Words go ${list}${suffix}.`
}

export function instructionsText(count: number, dirs: readonly DirectionId[], style: StyleSettings): string {
  const how = directionsSentence(dirs)
  if (style.listOrder === 'hidden') return `There are ${count} words hidden in this puzzle. ${how}`
  if (style.clueMode) return `Solve each clue, then find the answer in the puzzle. ${how}`
  return `Find the ${count} words hidden in the puzzle. ${how}`
}

export function wrapText(text: string, face: FaceId, size: number, width: number, measure: Measure): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (!line || measure(next, face, size) <= width) line = next
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines
}

export function sortedWords(placements: readonly Placement[], order: ListOrder): Placement[] {
  const list = [...placements]
  const byName = (a: Placement, b: Placement) => a.display.localeCompare(b.display, 'en', { sensitivity: 'base' })
  if (order === 'alpha') list.sort(byName)
  else if (order === 'length') list.sort((a, b) => a.token.length - b.token.length || byName(a, b))
  return list
}

// ---------- shapes ----------

/** Rounded "pill" around the segment p1→p2 (answer-key highlight). */
export function capsule(x1: number, y1: number, x2: number, y2: number, r: number): PathCmd[] {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const nx = -uy
  const ny = ux
  const k = 0.5523 * r
  return [
    ['M', x1 + nx * r, y1 + ny * r],
    ['L', x2 + nx * r, y2 + ny * r],
    ['C', x2 + nx * r + ux * k, y2 + ny * r + uy * k, x2 + ux * r + nx * k, y2 + uy * r + ny * k, x2 + ux * r, y2 + uy * r],
    ['C', x2 + ux * r - nx * k, y2 + uy * r - ny * k, x2 - nx * r + ux * k, y2 - ny * r + uy * k, x2 - nx * r, y2 - ny * r],
    ['L', x1 - nx * r, y1 - ny * r],
    ['C', x1 - nx * r - ux * k, y1 - ny * r - uy * k, x1 - ux * r - nx * k, y1 - uy * r - ny * k, x1 - ux * r, y1 - uy * r],
    ['C', x1 - ux * r + nx * k, y1 - uy * r + ny * k, x1 + nx * r - ux * k, y1 + ny * r - uy * k, x1 + nx * r, y1 + ny * r],
    ['Z'],
  ]
}

// ---------- word list ----------

interface ListBlock {
  height: number
  draw(x: number, y: number, out: Prim[]): void
}

function wordListBlock(items: string[], width: number, size: number, measure: Measure, checkboxes: boolean): ListBlock {
  const face = BODY_BOLD_FACE
  const box = checkboxes ? size * 0.72 : 0
  const boxGap = checkboxes ? size * 0.55 : 0
  const gutter = 18
  const maxW = Math.max(0, ...items.map((t) => measure(t, face, size)))
  const colW = maxW + box + boxGap + gutter
  const ncols = Math.max(1, Math.min(5, Math.floor((width + gutter) / colW), items.length))
  const nrows = Math.ceil(items.length / ncols)
  const rowH = size * 1.75
  const blockW = ncols * colW - gutter
  return {
    height: nrows * rowH,
    draw(x, y, out) {
      const x0 = x + Math.max(0, (width - blockW) / 2)
      items.forEach((text, i) => {
        const col = Math.floor(i / nrows)
        const row = i % nrows
        const cx = x0 + col * colW
        const baseline = y + row * rowH + size
        if (checkboxes)
          out.push({ k: 'rect', x: cx, y: baseline - box, w: box, h: box, r: 2, stroke: RULE, width: 0.9 })
        out.push({ k: 'text', x: cx + box + boxGap, y: baseline, text, face, size, color: INK, anchor: 'start' })
      })
    },
  }
}

function clueListBlock(items: string[], width: number, size: number, measure: Measure): ListBlock {
  const face = BODY_FACE
  const gutter = 22
  const twoCols = width >= 440 && items.length > 3
  const colW = twoCols ? (width - gutter) / 2 : width
  const lineH = size * 1.35
  const itemGap = size * 0.55
  const indent = measure('00. ', face, size)
  const wrapped = items.map((t) => {
    const m = t.match(/^(\d+\.)\s(.*)$/)
    const num = m ? m[1] : ''
    const lines = wrapText(m ? m[2] : t, face, size, colW - indent, measure)
    return { num, lines, h: lines.length * lineH + itemGap }
  })
  const total = wrapped.reduce((n, w) => n + w.h, 0)
  let split = wrapped.length
  if (twoCols) {
    let acc = 0
    let best = Infinity
    for (let i = 0; i <= wrapped.length; i++) {
      const h = Math.max(acc, total - acc)
      if (h < best) {
        best = h
        split = i
      }
      if (i < wrapped.length) acc += wrapped[i].h
    }
  }
  const colHeight = (from: number, to: number) => wrapped.slice(from, to).reduce((n, w) => n + w.h, 0)
  return {
    height: Math.max(colHeight(0, split), colHeight(split, wrapped.length)) - itemGap,
    draw(x, y, out) {
      let cy = y
      wrapped.forEach((w, i) => {
        if (i === split) cy = y
        const cx = x + (i >= split ? colW + gutter : 0)
        out.push({ k: 'text', x: cx + indent - measure(' ', face, size), y: cy + size, text: w.num, face: BODY_BOLD_FACE, size, color: INK, anchor: 'end' })
        w.lines.forEach((line, li) =>
          out.push({ k: 'text', x: cx + indent, y: cy + size + li * lineH, text: line, face, size, color: INK, anchor: 'start' }),
        )
        cy += w.h
      })
    },
  }
}

function listBlock(doc: SheetDoc, style: StyleSettings, answerKey: boolean, width: number, size: number, measure: Measure): ListBlock | null {
  if (style.listOrder === 'hidden' && !answerKey) return null
  const words = sortedWords(doc.placements, style.listOrder === 'hidden' ? 'alpha' : style.listOrder)
  if (words.length === 0) return null
  if (style.clueMode) {
    const items = words.map((p, i) =>
      answerKey ? `${i + 1}. ${applyCase(p.display, style.letterCase)}` : `${i + 1}. ${p.clue?.trim() || '(clue needed)'} ${letterHint(p.display)}`,
    )
    return answerKey ? wordListBlock(items, width, size, measure, false) : clueListBlock(items, width, size, measure)
  }
  return wordListBlock(
    words.map((p) => applyCase(p.display, style.letterCase)),
    width,
    size,
    measure,
    !answerKey,
  )
}

// ---------- page ----------

function titleLines(text: string, face: FaceId, base: number, width: number, measure: Measure): { lines: string[]; size: number } {
  if (!text.trim()) return { lines: [], size: base }
  const w = measure(text, face, base)
  if (w <= width) return { lines: [text], size: base }
  const shrunk = (base * width) / w
  if (shrunk >= base * 0.72) return { lines: [text], size: shrunk }
  for (let size = base * 0.8; size >= 14; size -= 1) {
    const lines = wrapText(text, face, size, width, measure)
    if (lines.length <= 2 && lines.every((l) => measure(l, face, size) <= width)) return { lines, size }
  }
  return { lines: wrapText(text, face, 14, width, measure).slice(0, 2), size: 14 }
}

export function layoutSheet(doc: SheetDoc, style: StyleSettings, measure: Measure, opts: SheetOptions = {}): SheetLayout {
  const answerKey = !!opts.answerKey
  const [pw0, ph0] = PAGE_SIZES[style.pageSize]
  const landscape = style.orientation === 'landscape'
  const pw = landscape ? ph0 : pw0
  const ph = landscape ? pw0 : ph0
  const W = pw - MARGIN * 2
  const prims: Prim[] = []
  let y = MARGIN

  if (style.nameDate && !answerKey) {
    const size = 10
    const ly = y + size
    const nameW = measure('Name:', BODY_BOLD_FACE, size)
    const dateX = MARGIN + W * 0.66
    const dateW = measure('Date:', BODY_BOLD_FACE, size)
    prims.push(
      { k: 'text', x: MARGIN, y: ly, text: 'Name:', face: BODY_BOLD_FACE, size, color: MUTED, anchor: 'start' },
      { k: 'line', x1: MARGIN + nameW + 6, y1: ly + 2, x2: dateX - 18, y2: ly + 2, color: RULE, width: 0.8 },
      { k: 'text', x: dateX, y: ly, text: 'Date:', face: BODY_BOLD_FACE, size, color: MUTED, anchor: 'start' },
      { k: 'line', x1: dateX + dateW + 6, y1: ly + 2, x2: MARGIN + W, y2: ly + 2, color: RULE, width: 0.8 },
    )
    y += 30
  }

  const tFace = TITLE_FONTS[style.titleFont].face
  const title = titleLines(style.title, tFace, TITLE_SIZES[style.titleSize], W, measure)
  title.lines.forEach((line, i) => {
    prims.push({ k: 'text', x: pw / 2, y: y + title.size * (0.85 + i * 1.1), text: line, face: tFace, size: title.size, color: style.titleColor, anchor: 'middle' })
  })
  if (title.lines.length) y += title.size * (0.85 + (title.lines.length - 1) * 1.1) + title.size * 0.35

  if (answerKey) {
    prims.push({ k: 'text', x: pw / 2, y: y + 12, text: 'ANSWER KEY', face: BODY_BOLD_FACE, size: 11, color: style.titleColor, anchor: 'middle' })
    y += 24
  } else if (style.showInstructions) {
    const size = 10.5
    const lines = wrapText(instructionsText(doc.placements.length, doc.directions, style), BODY_FACE, size, W * 0.9, measure)
    lines.forEach((line, i) => prims.push({ k: 'text', x: pw / 2, y: y + size + i * size * 1.4, text: line, face: BODY_FACE, size, color: MUTED, anchor: 'middle' }))
    y += lines.length * size * 1.4 + 8
  } else {
    y += 6
  }

  const footerH = 14
  const bottom = ph - MARGIN - footerH
  const gap = 18
  const side = landscape
  const gridAreaW = side ? W * 0.6 : W
  const listW = side ? W - gridAreaW - 24 : W
  const padFactor = 0.3
  const cellFor = (availH: number) =>
    Math.min(MAX_CELL, gridAreaW / (doc.cols + padFactor * 2), availH / (doc.rows + padFactor * 2))

  let list: ListBlock | null = null
  let cell = cellFor(bottom - y)
  let overflow: ListBlock | null = null
  const minCell = Math.min(MIN_CELL, gridAreaW / (doc.cols + padFactor * 2))
  // Prefer a comfortably sized grid with a readable list; then accept smaller type; else overflow.
  const comfortable = Math.min(COMFORT_CELL, cellFor(bottom - y))
  const blockFor = new Map(LIST_SIZES.map((size) => [size, listBlock(doc, style, answerKey, listW, size, measure)]))
  const passes: [number, number[]][] = [
    [comfortable, [13, 12, 11, 10]],
    [minCell, [10, 9]],
  ]
  outer: for (const [threshold, sizes] of passes) {
    for (const size of sizes) {
      const block = blockFor.get(size)
      if (!block) break outer
      const c = side ? cellFor(bottom - y) : cellFor(bottom - y - gap - block.height)
      const fits = side ? block.height <= bottom - y : c >= threshold
      if (fits) {
        list = block
        cell = c
        break outer
      }
    }
  }
  if (!list) {
    const page2H = ph - MARGIN * 2 - 40 - footerH
    for (const size of LIST_SIZES) {
      overflow = listBlock(doc, style, answerKey, W, size, measure)
      if (!overflow || overflow.height <= page2H) break
    }
    cell = cellFor(bottom - y)
  }

  const pad = cell * padFactor
  const gridW = cell * doc.cols
  const gridH = cell * doc.rows
  const gx = MARGIN + (gridAreaW - gridW) / 2
  const gy = y + pad
  prims.push({ k: 'rect', x: gx - pad, y: gy - pad, w: gridW + pad * 2, h: gridH + pad * 2, r: Math.min(12, pad * 1.4), stroke: INK, width: 1.4 })

  if (answerKey) {
    doc.placements.forEach((p, i) => {
      const d = DIRECTIONS[p.dir]
      const x1 = gx + (p.c + 0.5) * cell
      const y1 = gy + (p.r + 0.5) * cell
      const x2 = gx + (p.c + d.dc * (p.token.length - 1) + 0.5) * cell
      const y2 = gy + (p.r + d.dr * (p.token.length - 1) + 0.5) * cell
      const color = ANSWER_COLORS[i % ANSWER_COLORS.length]
      prims.push({ k: 'path', d: capsule(x1, y1, x2, y2, cell * (p.nestedIn ? 0.27 : 0.4)), stroke: color, fill: color, fillOpacity: 0.16, width: Math.max(0.8, cell * 0.06) })
    })
  }

  const gFace = GRID_FONTS[style.gridFont].face
  const letterSize = cell * 0.58
  const cap = FACES[gFace].cap * letterSize
  for (let r = 0; r < doc.rows; r++)
    for (let c = 0; c < doc.cols; c++) {
      const ch = doc.grid[r * doc.cols + c]
      if (!ch || ch === '.') continue
      prims.push({
        k: 'text',
        x: gx + (c + 0.5) * cell,
        y: gy + (r + 0.5) * cell + cap / 2,
        text: style.letterCase === 'lower' ? ch.toLowerCase() : ch,
        face: gFace,
        size: letterSize,
        color: INK,
        anchor: 'middle',
      })
    }

  if (list) {
    if (side) list.draw(MARGIN + gridAreaW + 24, y, prims)
    else list.draw(MARGIN, gy + gridH + pad + gap, prims)
  }

  const footer = (out: Prim[], label: string) =>
    out.push({ k: 'text', x: MARGIN + W, y: ph - MARGIN + 4, text: label, face: BODY_FACE, size: 7, color: RULE, anchor: 'end' })
  footer(prims, `Puzzle ${doc.seed}${answerKey ? ' · answer key' : ''}`)

  const pages: Page[] = [{ width: pw, height: ph, prims }]
  if (overflow) {
    const p2: Prim[] = []
    const heading = titleLines(style.title.trim() ? `${style.title} (continued)` : 'Words to find (continued)', tFace, 18, W, measure)
    heading.lines.forEach((line, i) =>
      p2.push({ k: 'text', x: pw / 2, y: MARGIN + heading.size * (0.9 + i * 1.1), text: line, face: tFace, size: heading.size, color: style.titleColor, anchor: 'middle' }),
    )
    overflow.draw(MARGIN, MARGIN + 22 + heading.lines.length * heading.size * 1.1, p2)
    footer(p2, `Puzzle ${doc.seed} · page 2`)
    pages.push({ width: pw, height: ph, prims: p2 })
  }
  return { pages, grid: { x: gx, y: gy, cell }, overflowed: !!overflow }
}

/** Crude metrics for environments without canvas (tests). */
export const approxMeasure: Measure = (text, _face, size) => text.length * size * 0.56
