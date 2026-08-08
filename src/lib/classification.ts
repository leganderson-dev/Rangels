export function canUseHouseholdBucket(contextName: string | null | undefined, purposeType: 'income' | 'expense' | undefined): boolean {
  return purposeType === 'expense' && (contextName === 'Household' || contextName?.startsWith('Property — ') === true)
}

export function emptyBucketLabel(contextName: string | null | undefined, purposeType: 'income' | 'expense' | undefined): string {
  if (purposeType === 'income') return 'Allocation source'
  if (contextName?.startsWith('Property — ')) return 'Property-funded (no bucket)'
  if (contextName === 'Household') return 'Choose bucket…'
  return 'Not applicable'
}
