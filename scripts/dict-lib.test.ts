import { describe, expect, it } from 'vitest'
import { makeClue, scowlSizeToLevel, titleCaseDisplay, toToken } from './dict-lib.ts'

const noBlocklist = new Set<string>()
const commonWords = new Map(
  [
    'a',
    'an',
    'any',
    'animal',
    'brown',
    'candy',
    'child',
    'color',
    'curly',
    'friendly',
    'garden',
    'heavy',
    'large',
    'leaves',
    'plant',
    'round',
    'small',
    'sweet',
    'treat',
    'with',
  ].map((word) => [word, 10] as const),
)

describe('dictionary helper normalization', () => {
  it('normalizes tokens to folded A-Z letters', () => {
    expect(toToken("crème brûlée")).toBe('CREMEBRULEE')
    expect(toToken("kid-friendly_word")).toBe('KIDFRIENDLYWORD')
  })

  it('title-cases display words while preserving small joiners', () => {
    expect(titleCaseDisplay('body_of_water')).toBe('Body of Water')
  })

  it('maps SCOWL sizes to levels', () => {
    expect(scowlSizeToLevel(20)).toBe(1)
    expect(scowlSizeToLevel(35)).toBe(2)
    expect(scowlSizeToLevel(50)).toBe(3)
    expect(scowlSizeToLevel(55)).toBeNull()
  })
})

describe('dictionary clue filtering', () => {
  it('keeps readable, non-revealing clues', () => {
    expect(makeClue('a small friendly animal with brown fur', 'Rabbit', noBlocklist, commonWords)).toEqual({
      clue: 'A small friendly animal with brown fur',
    })
  })

  it('drops clues that reveal the answer or answer parts', () => {
    expect(makeClue('a round sweet candy treat', 'Candy', noBlocklist, commonWords)).toEqual({
      reason: 'answer-in-clue',
    })
    expect(makeClue('a small garden plant with curly leaves', 'Curly Plant', noBlocklist, commonWords)).toEqual({
      reason: 'answer-part-in-clue',
    })
  })

  it('drops clues with rare or technical words', () => {
    expect(makeClue('a plant with betulaceous leaves', 'Birch', noBlocklist, commonWords)).toEqual({
      reason: 'technical-clue-word',
    })
    expect(makeClue('a garden plant with xylophagous larvae', 'Shrub', noBlocklist, commonWords)).toEqual({
      reason: 'rare-clue-word',
    })
  })

  it('drops short, punctuated, and dated gendered clues', () => {
    expect(makeClue('small animal', 'Mole', noBlocklist, commonWords)).toEqual({ reason: 'short-clue' })
    expect(makeClue('trees : important timber', 'Elm', noBlocklist, commonWords)).toEqual({
      reason: 'punctuation-artifact',
    })
    expect(makeClue('a woman who works in a garden', 'Gardener', noBlocklist, commonWords)).toEqual({
      reason: 'dated-gendered-clue',
    })
  })
})
