export interface BudgetRuleSets {
  purposeIds: Set<string>
  families: Set<string>
  bucketIds: Set<string>
  contextIds: Set<string>
}

interface BudgetMatchTransaction {
  categoryId: string | null
  bucketId: string | null
  contextId: string | null
}

/**
 * Inclusion selections are OR within a dimension and AND across dimensions.
 * For example, two Buckets + one Context means (Bucket A OR Bucket B) AND Context.
 */
export function matchesBudgetInclusions(
  transaction: BudgetMatchTransaction,
  purposeFamily: string | null | undefined,
  rules: BudgetRuleSets,
): boolean {
  const purposeDimensionActive = rules.purposeIds.size > 0 || rules.families.size > 0
  const bucketDimensionActive = rules.bucketIds.size > 0
  const contextDimensionActive = rules.contextIds.size > 0

  if (!purposeDimensionActive && !bucketDimensionActive && !contextDimensionActive) return false

  const purposeMatches = !purposeDimensionActive || Boolean(
    (transaction.categoryId && rules.purposeIds.has(transaction.categoryId)) ||
    (purposeFamily && rules.families.has(purposeFamily))
  )
  const bucketMatches = !bucketDimensionActive || Boolean(
    transaction.bucketId && rules.bucketIds.has(transaction.bucketId)
  )
  const contextMatches = !contextDimensionActive || Boolean(
    transaction.contextId && rules.contextIds.has(transaction.contextId)
  )

  return purposeMatches && bucketMatches && contextMatches
}

/** Exclusions subtract a transaction when any configured exclusion matches. */
export function matchesAnyBudgetExclusion(
  transaction: BudgetMatchTransaction,
  purposeFamily: string | null | undefined,
  rules: BudgetRuleSets,
): boolean {
  return Boolean(
    (transaction.categoryId && rules.purposeIds.has(transaction.categoryId)) ||
    (purposeFamily && rules.families.has(purposeFamily)) ||
    (transaction.bucketId && rules.bucketIds.has(transaction.bucketId)) ||
    (transaction.contextId && rules.contextIds.has(transaction.contextId))
  )
}
