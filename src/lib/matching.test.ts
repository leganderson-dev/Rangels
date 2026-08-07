import { describe, expect, it } from 'vitest'
import {
  classifyConfidence,
  normalizeDescription,
  suggestCategories,
} from './matching'

describe('classifyConfidence', () => {
  it('uses the agreed confidence boundaries', () => {
    expect(classifyConfidence(1)).toBe('confident')
    expect(classifyConfidence(0.7)).toBe('confident')
    expect(classifyConfidence(0.699)).toBe('likely')
    expect(classifyConfidence(0.5)).toBe('likely')
    expect(classifyConfidence(0.499)).toBe('analysis')
    expect(classifyConfidence(0)).toBe('analysis')
  })
})

describe('normalizeDescription', () => {
  it('removes changing references and common bank noise', () => {
    expect(normalizeDescription('VISA PURCHASE WOOLWORTHS #432 QLD')).toBe(
      'woolworths',
    )
  })
})

describe('suggestCategories', () => {
  const history = [
    { description: 'WOOLWORTHS #432', category: 'Groceries' },
    { description: 'WOOLWORTHS FUEL 839', category: 'Fuel' },
    { description: 'CITY COUNCIL RATES', category: 'Rates' },
  ]

  it('ranks prior merchant decisions and returns no more than three categories', () => {
    const suggestions = suggestCategories('VISA WOOLWORTHS 932 QLD', history)

    expect(suggestions[0]?.category).toBe('Groceries')
    expect(suggestions[0]?.confidence).toBe(1)
    expect(suggestions).toHaveLength(2)
  })

  it('does not suggest unrelated low-confidence history', () => {
    expect(suggestCategories('AIRLINE TICKET', history)).toEqual([])
  })

  it('can rank the highest non-zero score for manual analysis', () => {
    const suggestions = suggestCategories('CITY AIRLINE TICKET', history, Number.EPSILON)
    expect(suggestions[0]?.confidence).toBeGreaterThan(0)
    expect(suggestions).toEqual(
      [...suggestions].sort((left, right) => right.confidence - left.confidence),
    )
  })
})
