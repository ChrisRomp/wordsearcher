// @vitest-environment jsdom
import '../../test/dom'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FitSuggestion, ValidationIssue, WordEntry } from '../../core/types'
import { settingsKey, useStore } from '../../state/store'
import { IssuesPanel } from './IssuesPanel'

const words: WordEntry[] = ['Apple', 'Banana', 'Cherry', 'Grape'].map((w) => ({ id: w, display: w, token: w.toUpperCase(), source: 'custom' }))

function fail(wordIds: string[], failure: 'invalid-input' | 'budget-exhausted', fit: FitSuggestion | null = null, code: ValidationIssue['code'] = 'over-capacity') {
  const issue: ValidationIssue = { code, severity: 'error', message: 'Couldn’t fit these words.', wordIds }
  act(() => useStore.setState((s) => ({ status: 'error', issues: [issue], failure, fit, fitKey: fit ? settingsKey(s.gen) : null })))
}

beforeEach(() => {
  localStorage.clear()
  useStore.getState().reset()
  useStore.getState().setGen({ words, rows: 10, cols: 10, overlap: 'allow' })
})

afterEach(cleanup)

describe('issues panel', () => {
  it('offers Try again only when a reshuffle could help', () => {
    render(<IssuesPanel />)
    fail(['Apple'], 'budget-exhausted')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()

    fail([], 'budget-exhausted')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()

    fail(['Apple', 'Banana', 'Cherry'], 'budget-exhausted')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()

    fail([], 'invalid-input')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('only suggests a grid size that was verified to fit', async () => {
    const user = userEvent.setup()
    render(<IssuesPanel />)
    fail(['Apple', 'Banana', 'Cherry'], 'budget-exhausted')
    expect(screen.queryByRole('button', { name: /^Grid/ })).not.toBeInTheDocument()

    fail(['Apple', 'Banana', 'Cherry'], 'budget-exhausted', { kind: 'grow', rows: 17, cols: 21 })
    await user.click(screen.getByRole('button', { name: 'Grid 17 × 21' }))
    expect(useStore.getState().gen).toMatchObject({ rows: 17, cols: 21, autoSize: false })
  })

  it('keeps auto-size on and the grid alone when removing words in auto-size mode', async () => {
    const user = userEvent.setup()
    useStore.getState().setGen({ autoSize: true })
    render(<IssuesPanel />)
    fail(['Apple'], 'budget-exhausted', { kind: 'trim', rows: 35, cols: 35, removeIds: ['Grape'] })
    expect(screen.getByText(/^We couldn’t fit all/)).toHaveTextContent(
      'We couldn’t fit all 4 words, even in the largest grid (35 × 35). We checked that removing 1 of them lets the rest fit.',
    )

    await user.click(screen.getByRole('button', { name: 'Remove 1 word…' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('We couldn’t fit all 4 words, even in the largest grid (35 × 35). We checked that the other 3 words fit without this one.')
    expect(dialog).toHaveTextContent('Grape')
    expect(dialog).not.toHaveTextContent('The grid will change')
    await user.click(screen.getByRole('button', { name: 'Remove 1 word' }))

    expect(useStore.getState().gen.words.map((w) => w.id)).toEqual(['Apple', 'Banana', 'Cherry'])
    expect(useStore.getState().gen).toMatchObject({ rows: 10, cols: 10, autoSize: true })
  })

  it('closes the removal dialog when a newer run replaces the suggestion', async () => {
    const user = userEvent.setup()
    render(<IssuesPanel />)
    const trim: FitSuggestion = { kind: 'trim', rows: 35, cols: 35, removeIds: ['Grape'] }
    fail(['Apple'], 'budget-exhausted', trim)
    await user.click(screen.getByRole('button', { name: 'Remove 1 word…' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => useStore.setState({ status: 'idle', issues: [], failure: null, fit: null }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fail(['Apple'], 'budget-exhausted', { ...trim })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove 1 word…' })).toBeInTheDocument()
  })

  it('hides and refuses a suggestion once the settings it was verified for have changed', async () => {
    const user = userEvent.setup()
    render(<IssuesPanel />)
    fail(['Apple'], 'budget-exhausted', { kind: 'trim', rows: 35, cols: 35, removeIds: ['Grape'] })
    await user.click(screen.getByRole('button', { name: 'Remove 1 word…' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // An edit before the next run finishes leaves the old issue on screen, but not its suggestion.
    act(() => useStore.getState().setGen({ overlap: 'none' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove 1 word…' })).not.toBeInTheDocument()
    expect(screen.getByText('Couldn’t fit these words.')).toBeInTheDocument()

    act(() => useStore.getState().applyFit())
    expect(useStore.getState().gen.words).toHaveLength(4)
    expect(useStore.getState().gen).toMatchObject({ rows: 10, cols: 10 })
  })

  it('offers no grid size for a too-long word unless one was verified', () => {
    render(<IssuesPanel />)
    fail(['Banana'], 'invalid-input', null, 'too-long')
    expect(screen.queryByRole('button', { name: /^Grid/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Banana' })).toBeInTheDocument()

    fail(['Banana'], 'invalid-input', { kind: 'grow', rows: 12, cols: 12 }, 'too-long')
    expect(screen.getByRole('button', { name: 'Grid 12 × 12' })).toBeInTheDocument()
  })
})
