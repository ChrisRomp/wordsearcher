// @vitest-environment jsdom
import '../test/dom'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { DIRECTIONS } from '../core/directions'
import { generate } from '../core/generator'
import { normalizeWord } from '../core/normalize'
import type { GenerateInput, WordEntry } from '../core/types'
import { MAX_WORDS, tokensConflict } from '../core/validate'
import { createDoc, puzzleId } from '../doc/puzzleDoc'
import { encodeDoc } from '../doc/share'
import { DEFAULT_STYLE, GRID_MAX, defaultGenSettings } from '../state/settings'
import { usePlayStore } from '../state/playStore'
import { useStore } from '../state/store'
import { CURATED_PACKS } from '../words/themes'

// jsdom has no Web Workers; run the generator in-process instead.
vi.mock('../state/generatorClient', async () => {
  const { generateWithFit } = await import('../core/fit')
  return {
    CancelledError: class CancelledError extends Error {},
    runGenerate: async (input: GenerateInput, autoSize: boolean) => generateWithFit(input, autoSize),
  }
})

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
  useStore.getState().reset()
  useStore.setState({ view: 'edit', showSolution: false, inputErrors: [] })
  usePlayStore.setState({ progress: {} })
})

afterEach(cleanup)

async function addWords(user: UserEvent, text: string) {
  await user.type(screen.getByLabelText('Add words'), text)
  await user.click(screen.getByRole('button', { name: 'Add' }))
}

function customWords(count: number): WordEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const suffix = `${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`
    return { id: `existing-${i}`, display: `Word ${suffix}`, token: `WORD${suffix}`, source: 'custom' }
  })
}

/** Real theme words, skipping any that would conflict with an earlier one. */
function packEntries(count: number): WordEntry[] {
  const out: WordEntry[] = []
  for (const pack of CURATED_PACKS)
    for (const w of pack.words) {
      const n = normalizeWord(w.w)
      if (out.length < count && !out.some((o) => tokensConflict(o.token, n.token, true)))
        out.push({ id: `${pack.id}:${n.token}`, display: n.display, token: n.token, source: 'curated' })
    }
  return out
}

describe('editor', () => {
  it('builds a worksheet from typed words', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addWords(user, 'Apple, Banana, Cherry, Black Hole')

    const list = screen.getByRole('list', { name: 'Words in your list' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    const sheet = await screen.findByRole('img', { name: 'Worksheet page 1' })
    for (const word of ['APPLE', 'BANANA', 'CHERRY', 'BLACK HOLE']) expect(within(sheet).getByText(word)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeEnabled()
  })

  it('reports words it cannot use', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addWords(user, 'R2D2, Robot')
    expect(screen.getByRole('alert')).toHaveTextContent('“R2D2”')
    expect(useStore.getState().gen.words.map((w) => w.token)).toEqual(['ROBOT'])
  })

  it('offers a one-click fix when one word hides inside another', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addWords(user, 'Cat, Catalog, Dog')

    expect(await screen.findByText('CAT is hidden inside CATALOG, so it would appear twice.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide CAT inside CATALOG' }))

    await waitFor(() => expect(useStore.getState().doc?.placements.some((p) => p.token === 'CAT')).toBe(true))
    expect(screen.queryByText(/hidden inside/)).not.toBeInTheDocument()
    const doc = useStore.getState().doc!
    expect(doc.placements.find((p) => p.token === 'CAT')?.nestedIn).toBe(doc.placements.find((p) => p.token === 'CATALOG')?.wordId)
  })

  it('applies a difficulty preset and switches to custom when tweaked', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Hard' }))
    const pad = screen.getByRole('group', { name: 'Word directions' })
    expect(within(pad).getAllByRole('button', { pressed: true })).toHaveLength(8)

    await user.click(within(pad).getByRole('button', { name: 'Up-left' }))
    expect(within(pad).getAllByRole('button', { pressed: true })).toHaveLength(7)
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('starts from a theme pack', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Outer Space/ }))

    await waitFor(() => expect(useStore.getState().gen.words).toHaveLength(15))
    expect(screen.getByLabelText('Title')).toHaveValue('Outer Space Word Search')
    expect(await screen.findByRole('img', { name: 'Worksheet page 1' })).toBeInTheDocument()
  })

  it('switching theme packs replaces the list, retitles, and gives a new puzzle ID', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Outer Space/ }))
    await waitFor(() => expect(useStore.getState().doc?.placements).toHaveLength(15))
    const firstId = puzzleId(useStore.getState().doc!)
    expect(within(screen.getByRole('img', { name: 'Worksheet page 1' })).getByText(`Puzzle ${firstId}`)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Themes' }))
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: /Ocean Life/ }))
    expect(screen.getByRole('checkbox', { name: 'Replace my current list (15 words)' })).toBeChecked()
    await user.click(await screen.findByRole('button', { name: /^Replace list with [1-9]\d* words$/ }))

    expect(useStore.getState().gen.words.every((w) => w.themeId === 'ocean-life')).toBe(true)
    expect(screen.getByLabelText('Title')).toHaveValue('Ocean Life Word Search')
    await waitFor(() => expect(puzzleId(useStore.getState().doc!)).not.toBe(firstId))
    const newId = puzzleId(useStore.getState().doc!)
    expect(await within(screen.getByRole('img', { name: 'Worksheet page 1' })).findByText(`Puzzle ${newId}`)).toBeInTheDocument()
  })

  it('can add theme words to the list instead of replacing it, keeping a custom title', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Week 5 Words')
    await addWords(user, 'Apple, Banana')
    await screen.findByRole('img', { name: 'Worksheet page 1' })

    await user.click(screen.getByRole('button', { name: 'Themes' }))
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: /Ocean Life/ }))
    await user.click(screen.getByRole('checkbox', { name: /Replace my current list/ }))
    await user.click(await screen.findByRole('button', { name: /^Add [1-9]\d* words to my list$/ }))

    const tokens = useStore.getState().gen.words.map((w) => w.token)
    expect(tokens.slice(0, 2)).toEqual(['APPLE', 'BANANA'])
    expect(tokens.length).toBeGreaterThan(2)
    expect(screen.getByLabelText('Title')).toHaveValue('Week 5 Words')
  })

  it('caps added theme selections to the remaining word capacity', async () => {
    const user = userEvent.setup()
    act(() => {
      useStore.getState().addEntries(customWords(MAX_WORDS - 5))
    })
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Themes' }))
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: /Ocean Life/ }))
    await screen.findByRole('button', { name: /^Replace list with [1-9]\d* words$/ })
    await user.click(screen.getByRole('checkbox', { name: `Replace my current list (${MAX_WORDS - 5} words)` }))

    expect(await screen.findByRole('alert')).toHaveTextContent(`you can add 5 more`)
    expect(screen.getByRole('button', { name: /^Add \d+ words to my list$/ })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'First 5' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add 5 words to my list' }))

    expect(useStore.getState().gen.words).toHaveLength(MAX_WORDS)
  })

  it('has a footer link to the source repo', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute('href', 'https://github.com/ChrisRomp/wordsearcher')
  })

  it('hides clue mode unless a puzzle already uses it', () => {
    render(<App />)
    expect(screen.queryByRole('switch', { name: /Clue mode/ })).not.toBeInTheDocument()
    act(() => useStore.getState().setStyle({ clueMode: true }))
    expect(screen.getByRole('switch', { name: /Clue mode/ })).toBeChecked()
  })

  it('links to the source code (AGPL)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'About' }))
    expect(await screen.findByRole('link', { name: 'source code is on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/ChrisRomp/wordsearcher',
    )
  })
})

describe('words that do not fit', () => {
  it('suggests a grid size that is known to fit', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    act(() => {
      useStore.getState().setGen({ rows: 10, cols: 10, seed: 'fit' })
      useStore.getState().addEntries(packEntries(40))
    })
    render(<App />)

    const grow = await screen.findByRole('button', { name: /^Grid \d+ × \d+$/ }, { timeout: 8000 })
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    const size = Number(grow.textContent!.match(/\d+/)![0])
    expect(size).toBeGreaterThan(10)
    await user.click(grow)

    await waitFor(() => expect(useStore.getState().doc?.rows).toBe(size), { timeout: 8000 })
    expect(useStore.getState().issues).toEqual([])
    expect(screen.queryByText(/to fix/)).not.toBeInTheDocument()
  })

  it('asks before removing the words that do not fit even the largest grid', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    act(() => {
      useStore.getState().setGen({ rows: 20, cols: 20, overlap: 'none', seed: 'fit' })
      useStore.getState().addEntries(packEntries(MAX_WORDS))
    })
    render(<App />)

    const openTrim = () => screen.findByRole('button', { name: /^Remove \d+ words…$/ }, { timeout: 8000 })
    const count = Number((await openTrim()).textContent!.match(/\d+/)![0])
    expect(screen.getByText(new RegExp(`Even the largest grid \\(${GRID_MAX} × ${GRID_MAX}\\) can’t fit all ${MAX_WORDS} words`))).toBeInTheDocument()

    await user.click(await openTrim())
    let dialog = await screen.findByRole('dialog')
    expect(within(within(dialog).getByRole('list', { name: 'Words to remove' })).getAllByRole('listitem')).toHaveLength(count)
    expect(dialog).toHaveTextContent(`The grid will change to ${GRID_MAX} × ${GRID_MAX}.`)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(useStore.getState().gen.words).toHaveLength(MAX_WORDS)

    await user.click(await openTrim())
    dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: `Remove ${count} words` }))
    expect(useStore.getState().gen.words).toHaveLength(MAX_WORDS - count)
    expect(useStore.getState().gen).toMatchObject({ rows: GRID_MAX, cols: GRID_MAX })

    await waitFor(() => expect(useStore.getState().doc?.placements).toHaveLength(MAX_WORDS - count), { timeout: 8000 })
    expect(useStore.getState().issues).toEqual([])
  })
})

describe('play mode', () => {
  it('finds a word with the keyboard', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addWords(user, 'Apple, Banana, Cherry')
    await screen.findByRole('img', { name: 'Worksheet page 1' })
    const doc = useStore.getState().doc!

    await user.click(screen.getAllByRole('button', { name: 'Play' })[0])
    const grid = await screen.findByRole('application')
    const press = (key: string, times = 1) => {
      for (let i = 0; i < times; i++) fireEvent.keyDown(grid, { key })
    }
    const moveBy = (dr: number, dc: number) => {
      press(dr > 0 ? 'ArrowDown' : 'ArrowUp', Math.abs(dr))
      press(dc > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(dc))
    }

    const p = doc.placements[0]
    const d = DIRECTIONS[p.dir]
    const len = p.token.length - 1
    moveBy(p.r, p.c)
    press('Enter')
    moveBy(d.dr * len, d.dc * len)
    press('Enter')

    expect(screen.getByRole('progressbar', { name: 'Words found' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText(`Found ${p.display}! 1 of 3.`)).toBeInTheDocument()
  })

  it('opens a shared link straight into play mode', async () => {
    const words = ['Moon', 'Star', 'Comet'].map((w, i) => ({ id: `w${i}`, display: w, token: normalizeWord(w).token, source: 'custom' as const }))
    const settings = { ...defaultGenSettings(), words, rows: 8, cols: 8, seed: 'link' }
    const res = generate(settings)
    if (!res.ok) throw new Error('generation failed')
    const doc = createDoc({ grid: res.grid, placements: res.placements, style: { ...DEFAULT_STYLE, title: 'Shared!' }, settings })
    window.location.hash = `#p=${encodeDoc(doc)}`

    render(<App />)
    expect(await screen.findByRole('application')).toBeInTheDocument()
    expect(screen.getByText('Opened a shared puzzle')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Shared!' })).toBeInTheDocument()
    expect(useStore.getState().doc?.grid).toBe(doc.grid)
    expect(window.location.hash).toBe('')
  })
})
