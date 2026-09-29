// @vitest-environment jsdom
import '../test/dom'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { DIRECTIONS } from '../core/directions'
import { generate } from '../core/generator'
import { normalizeWord } from '../core/normalize'
import type { GenerateInput } from '../core/types'
import { createDoc } from '../doc/puzzleDoc'
import { encodeDoc } from '../doc/share'
import { DEFAULT_STYLE, defaultGenSettings } from '../state/settings'
import { usePlayStore } from '../state/playStore'
import { useStore } from '../state/store'

// jsdom has no Web Workers; run the generator in-process instead.
vi.mock('../state/generatorClient', async () => {
  const { generate, generateAutoSize } = await import('../core/generator')
  return {
    CancelledError: class CancelledError extends Error {},
    runGenerate: async (input: GenerateInput, autoSize: boolean) => (autoSize ? generateAutoSize(input) : generate(input)),
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
