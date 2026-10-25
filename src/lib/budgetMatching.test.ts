import { describe, expect, it } from 'vitest'
import { matchesAnyBudgetExclusion, matchesBudgetInclusions, type BudgetRuleSets } from './budgetMatching'

function rules(values: Partial<Record<keyof BudgetRuleSets, string[]>>): BudgetRuleSets {
  return {
    purposeIds: new Set(values.purposeIds ?? []),
    families: new Set(values.families ?? []),
    bucketIds: new Set(values.bucketIds ?? []),
    contextIds: new Set(values.contextIds ?? []),
  }
}

describe('budget group matching', () => {
  const householdDaily = { categoryId: 'groceries', bucketId: 'daily', contextId: 'household' }
  const householdSplurge = { categoryId: 'restaurants', bucketId: 'splurge', contextId: 'household' }
  const propertyDaily = { categoryId: 'insurance', bucketId: 'daily', contextId: 'currumundi' }

  it('intersects selections across Bucket and Context', () => {
    const selection = rules({ bucketIds: ['daily'], contextIds: ['household'] })
    expect(matchesBudgetInclusions(householdDaily, 'Food and dining', selection)).toBe(true)
    expect(matchesBudgetInclusions(householdSplurge, 'Food and dining', selection)).toBe(false)
    expect(matchesBudgetInclusions(propertyDaily, 'Housing and utilities', selection)).toBe(false)
  })

  it('matches alternatives within the same dimension', () => {
    const selection = rules({ bucketIds: ['daily', 'splurge'], contextIds: ['household'] })
    expect(matchesBudgetInclusions(householdDaily, 'Food and dining', selection)).toBe(true)
    expect(matchesBudgetInclusions(householdSplurge, 'Food and dining', selection)).toBe(true)
  })

  it('intersects Purpose with Bucket while treating Purpose and family as alternatives', () => {
    const selection = rules({ purposeIds: ['insurance'], families: ['Food and dining'], bucketIds: ['daily'] })
    expect(matchesBudgetInclusions(householdDaily, 'Food and dining', selection)).toBe(true)
    expect(matchesBudgetInclusions(propertyDaily, 'Housing and utilities', selection)).toBe(true)
    expect(matchesBudgetInclusions(householdSplurge, 'Food and dining', selection)).toBe(false)
  })

  it('subtracts any matching exclusion after inclusion matching', () => {
    const exclusions = rules({ purposeIds: ['groceries'], contextIds: ['currumundi'] })
    expect(matchesAnyBudgetExclusion(householdDaily, 'Food and dining', exclusions)).toBe(true)
    expect(matchesAnyBudgetExclusion(propertyDaily, 'Housing and utilities', exclusions)).toBe(true)
    expect(matchesAnyBudgetExclusion(householdSplurge, 'Food and dining', exclusions)).toBe(false)
  })
})
