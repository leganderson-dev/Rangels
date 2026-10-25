export function canUseHouseholdBucket(contextName: string | null | undefined, purposeType: 'income' | 'expense' | undefined): boolean {
  return purposeType === 'expense'
}

export function emptyBucketLabel(contextName: string | null | undefined, purposeType: 'income' | 'expense' | undefined): string {
  if (purposeType === 'income') return 'Allocation source'
  if (purposeType === 'expense') return 'Choose bucket…'
  return 'Not applicable'
}
