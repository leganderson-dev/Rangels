import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types/finance'
import { discoverScheduledSuggestions } from './recurrence'

function transaction(date: string, amount = -20): Transaction {
  return {
    id: date, date, amount, description: 'NETFLIX.COM Receipt 12345', comment: '', accountId: 'account-1', accountName: 'Leg CW',
    memberId: '', memberName: '', targetAccountId: null, targetAccountName: null, categoryId: null, categoryName: null,
    categoryFullName: null, categoryColor: null, isTransfer: false, transferReason: null, status: 'C', payee: '', tags: '', externalId: '',
    canonicalCategoryId: 'subscriptions', canonicalCategoryName: 'Subscriptions', canonicalCategoryFamily: 'Lifestyle', contextId: 'household',
    contextName: 'Household', bucketId: 'daily', bucketName: 'Daily Expenses', reimbursementStatus: 'none', taxTreatment: 'none',
  }
}

describe('discoverScheduledSuggestions', () => {
  it('recognises a stable monthly merchant pattern and proposes its next date', () => {
    const result = discoverScheduledSuggestions([
      transaction('2026-05-05'), transaction('2026-06-05'), transaction('2026-07-05'), transaction('2026-08-05'),
    ], [], '2026-08-12')
    expect(result[0]).toMatchObject({ frequency: 'monthly', amount: -20, occurrenceCount: 4, nextDate: '2026-09-05' })
    expect(result[0].confidence).toBeGreaterThanOrEqual(80)
  })

  it('does not suggest irregular history or an already scheduled merchant', () => {
    const history = [transaction('2026-01-01'), transaction('2026-01-04'), transaction('2026-03-19')]
    expect(discoverScheduledSuggestions(history, [], '2026-08-12')).toEqual([])
    const regular = [transaction('2026-05-05'), transaction('2026-06-05'), transaction('2026-07-05')]
    expect(discoverScheduledSuggestions(regular, [{ description: 'NETFLIX.COM', accountId: 'account-1', amount: -20 } as any], '2026-08-12')).toEqual([])
  })
})
