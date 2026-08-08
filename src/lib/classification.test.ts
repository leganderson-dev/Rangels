import { describe, expect, it } from 'vitest'
import { canUseHouseholdBucket, emptyBucketLabel } from './classification'

describe('household bucket eligibility', () => {
  it('allows expense buckets for household and property contexts', () => {
    expect(canUseHouseholdBucket('Household', 'expense')).toBe(true)
    expect(canUseHouseholdBucket('Property — Everton Park', 'expense')).toBe(true)
  })

  it('does not allow them for business expenses or income', () => {
    expect(canUseHouseholdBucket('Business — ASA', 'expense')).toBe(false)
    expect(canUseHouseholdBucket('Property — Everton Park', 'income')).toBe(false)
  })

  it('explains that an unbucketed property expense is property-funded', () => {
    expect(emptyBucketLabel('Property — Everton Park', 'expense')).toBe('Property-funded (no bucket)')
  })
})
