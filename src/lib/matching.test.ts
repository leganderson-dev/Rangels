import { describe, expect, it } from 'vitest'
import {
  classifyConfidence,
  normalizeDescription,
  relevantCategorySuggestions,
  suggestCategories,
  transactionDuplicateKey,
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

describe('transactionDuplicateKey', () => {
  it('ignores changing bank references but keeps account, date and amount', () => {
    expect(transactionDuplicateKey('account-1', '2026-08-08', -12.3, 'VISA WOOLWORTHS #123 QLD'))
      .toBe(transactionDuplicateKey('account-1', '2026-08-08', -12.30, 'WOOLWORTHS #999'))
    expect(transactionDuplicateKey('account-1', '2026-08-09', -12.3, 'WOOLWORTHS'))
      .not.toBe(transactionDuplicateKey('account-1', '2026-08-08', -12.3, 'WOOLWORTHS'))
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

  it('does not score unrelated categories from accidental character overlap', () => {
    const bccHistory = [
      { description: 'BCC RATES & DONATION', category: 'Council rates' },
      { description: 'WOOLWORTHS SUPERMARKET', category: 'Supermarket' },
      { description: 'FIGURINE SHOP', category: 'Figurines' },
    ]
    expect(suggestCategories('BCC RATES & DONATION NetBank BPAY 319186', bccHistory))
      .toEqual([{ category: 'Council rates', confidence: 1, matchedDescription: 'BCC RATES & DONATION' }])
  })

  it('shows only one option for a very strong match', () => {
    const suggestions = suggestCategories('VISA WOOLWORTHS 932 QLD', history)
    expect(relevantCategorySuggestions(suggestions)).toEqual([suggestions[0]])
  })

  it('keeps only close, relevant alternatives for uncertain matches', () => {
    const suggestions = [
      { category: 'First', confidence: 0.7, matchedDescription: 'one' },
      { category: 'Second', confidence: 0.62, matchedDescription: 'two' },
      { category: 'Noise', confidence: 0.2, matchedDescription: 'three' },
    ]
    expect(relevantCategorySuggestions(suggestions).map(item => item.category))
      .toEqual(['First', 'Second'])
  })
})
