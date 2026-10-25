import { describe, expect, it } from 'vitest'
import { canUseHouseholdBucket, emptyBucketLabel } from './classification'

describe('household bucket eligibility', () => {
  it('allows a bucket for every expense context', () => {
    expect(canUseHouseholdBucket('Household', 'expense')).toBe(true)
    expect(canUseHouseholdBucket('Property — Everton Park', 'expense')).toBe(true)
    expect(canUseHouseholdBucket('Property — Currumundi', 'expense')).toBe(true)
    expect(canUseHouseholdBucket('Business — ASA', 'expense')).toBe(true)
  })

  it('does not use a spending bucket for income', () => {
    expect(canUseHouseholdBucket('Property — Everton Park', 'income')).toBe(false)
  })

  it('requires a bucket for property expenses', () => {
    expect(emptyBucketLabel('Property — Everton Park', 'expense')).toBe('Choose bucket…')
  })
})
