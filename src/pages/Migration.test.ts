import { describe, expect, it } from 'vitest'
import { suggestedDraftFor } from './Migration'
import type { ClassificationOptions, LegacyCategoryMapping } from '../types/finance'

const names = [
  ['school-supplies', 'School supplies', 'Children'],
  ['clothing-child', 'Clothing', 'Children'],
  ['books', 'Books and learning', 'Children'],
  ['gifts', 'Gifts', 'Lifestyle'],
  ['fuel', 'Fuel', 'Transport'],
  ['insurance', 'Insurance', 'Property'],
] as const

const options: ClassificationOptions = {
  contexts: [{ id: 'household', name: 'Household' }, { id: 'everton', name: 'Property — Everton Park' }],
  buckets: [{ id: 'daily', name: 'Daily Expenses' }, { id: 'splurge', name: 'Splurge' }, { id: 'smile', name: 'Smile' }],
  categories: names.map(([id, name, family]) => ({ id, name, family, type: 'expense' })),
}

function mapping(categoryPath: string): LegacyCategoryMapping {
  return { categoryId: categoryPath, categoryPath, canonicalCategoryId: null, canonicalCategoryName: null, contextId: null, contextName: null, bucketId: null, bucketName: null, taxTreatment: 'none', status: 'review', notes: '', transactionCount: 1, legacyCategoryType: 'expense' }
}

describe('migration suggestions', () => {
  it.each([
    ['Kids:SchoolStuff', 'school-supplies', 'daily'],
    ['Kids:Clothes', 'clothing-child', 'daily'],
    ['Kids:Books', 'books', 'daily'],
    ['Kids:Birthday', 'gifts', 'smile'],
    ['Transportation:Gasolina', 'fuel', 'daily'],
  ])('maps %s to an obvious purpose and bucket', (path, purposeId, bucketId) => {
    expect(suggestedDraftFor(mapping(path), options)).toMatchObject({ canonicalCategoryId: purposeId, contextId: 'household', bucketId })
  })

  it('uses a property context without a household bucket', () => {
    expect(suggestedDraftFor(mapping('House - EvertonPark:CUR-Insurance'), options)).toMatchObject({ canonicalCategoryId: 'insurance', contextId: 'everton', bucketId: '' })
  })
})
