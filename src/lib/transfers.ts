import type { TransferReason } from '../types/finance'

export const transferReasons: Array<{ value: TransferReason; label: string; needsContext: boolean }> = [
  { value: 'account_movement', label: 'Account movement', needsContext: false },
  { value: 'joint_contribution', label: 'Joint-account contribution', needsContext: false },
  { value: 'property_funding', label: 'Property funding', needsContext: true },
  { value: 'business_funding', label: 'Business funding', needsContext: true },
  { value: 'savings', label: 'Savings movement', needsContext: false },
  { value: 'debt_reduction', label: 'Debt reduction', needsContext: false },
  { value: 'investment_contribution', label: 'Investment contribution', needsContext: false },
  { value: 'other', label: 'Other', needsContext: false },
]

export function transferReasonLabel(reason: TransferReason | null | undefined): string {
  return transferReasons.find(item => item.value === reason)?.label ?? 'Requires review'
}

export function transferReasonNeedsContext(reason: TransferReason | null | undefined): boolean {
  return transferReasons.find(item => item.value === reason)?.needsContext ?? false
}
