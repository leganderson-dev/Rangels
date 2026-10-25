import { describe, expect, it } from 'vitest'
import { bucketFundingContribution, isBucketFundingTransfer, isSmileFundingTransfer, smileFundingContribution } from './allocation'
import type { Transaction } from '../types/finance'

function transfer(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1', description: '', comment: '', date: '2026-08-01', amount: -1000,
    accountId: 'leg', accountName: 'Leg CW', memberId: 'anderson', memberName: 'Anderson',
    targetAccountId: 'smile', targetAccountName: 'Joint Smile', categoryId: null, categoryName: null,
    categoryFullName: null, categoryColor: null, isTransfer: true, transferReason: 'joint_contribution',
    status: 'C', payee: '', tags: '', externalId: '', canonicalCategoryId: 'purpose',
    canonicalCategoryName: 'Joint Account Contribution', canonicalCategoryFamily: 'Transfers',
    contextId: null, contextName: null, bucketId: null, bucketName: null,
    reimbursementStatus: 'none', taxTreatment: 'none', ...overrides,
  }
}

describe('Smile funding', () => {
  it('counts a qualifying transfer once using its absolute amount', () => {
    const row = transfer()
    expect(isSmileFundingTransfer(row)).toBe(true)
    expect(smileFundingContribution([row])).toBe(1000)
  })

  it('accepts the hyphenated Joint-account contribution Purpose', () => {
    expect(isSmileFundingTransfer(transfer({ canonicalCategoryName: 'Joint-account contribution' }))).toBe(true)
  })

  it('does not count transfers with the wrong destination or Purpose', () => {
    expect(smileFundingContribution([
      transfer({ id: 'wrong-account', targetAccountName: 'ING Joint Savings' }),
      transfer({ id: 'wrong-purpose', canonicalCategoryName: 'Account Movement' }),
    ])).toBe(0)
  })

  it('does not count unposted or non-transfer transactions', () => {
    expect(smileFundingContribution([
      transfer({ id: 'pending', status: 'P' }),
      transfer({ id: 'expense', isTransfer: false }),
    ])).toBe(0)
  })
})

describe('Fire Extinguisher funding', () => {
  it('counts posted savings movements into ING Joint Savings', () => {
    const row = transfer({ targetAccountName: 'ING Joint Savings', canonicalCategoryName: 'Savings movement' })
    expect(isBucketFundingTransfer(row, 'Fire Extinguisher')).toBe(true)
    expect(bucketFundingContribution([row], 'Fire Extinguisher')).toBe(1000)
  })

  it('also accepts a dedicated Fire Extinguisher destination', () => {
    const row = transfer({ targetAccountName: 'ING Fire Extinguisher', canonicalCategoryName: 'Joint-account contribution' })
    expect(isBucketFundingTransfer(row, 'Fire Extinguisher')).toBe(true)
  })

  it('does not count unrelated transfers into the savings account', () => {
    expect(bucketFundingContribution([
      transfer({ targetAccountName: 'ING Joint Savings', canonicalCategoryName: 'Debt reduction' }),
      transfer({ targetAccountName: 'Joint Smile', canonicalCategoryName: 'Savings movement' }),
    ], 'Fire Extinguisher')).toBe(0)
  })
})
