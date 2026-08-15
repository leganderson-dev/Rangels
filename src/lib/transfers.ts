import type { TransferReason } from '../types/finance'

export const transferReasons: Array<{ value: TransferReason; label: string; needsContext: boolean }> = [
  { value: 'account_movement', label: 'Account movement', needsContext: false },
  { value: 'joint_contribution', label: 'Joint-account contribution', needsContext: false },
  { value: 'household_funding', label: 'Household funding', needsContext: false },
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

export function isJuliaTransferDescription(description: string): boolean {
  return description
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .includes('transfer to julia meyer pflug')
}

export function isTransferFromAndersonDescription(description: string): boolean {
  return description
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .includes('fast transfer from legnar rangel')
}

export function inferTransferClassification(sourceAccount: string, targetAccount: string, description: string): { reason: TransferReason; contextName: string | null } {
  const compact = (value: string) => value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '')
  const source = compact(sourceAccount)
  const target = compact(targetAccount)
  const detail = compact(description)

  if (detail.includes('teamo') || detail.includes('julia') || target.includes('juliacw')) return { reason: 'joint_contribution', contextName: null }
  if (target.includes('cartaodecredito') || target.includes('creditcard') || detail.includes('cartaodecredito')) return { reason: 'debt_reduction', contextName: null }
  if ((source.includes('ingcurrumundi') && target.includes('ingfireexting')) || target.includes('ingfireexting') || detail.includes('fireextinguisher')) return { reason: 'savings', contextName: null }
  if (target.includes('ingcurrumundi')) return { reason: 'property_funding', contextName: 'Property — Currumundi' }
  if (target.startsWith('nab')) return { reason: 'property_funding', contextName: 'Property — Everton Park' }
  if (detail.includes('toogoom')) return { reason: 'property_funding', contextName: 'Property — Toogoom' }
  if (detail.includes('currumundi') || detail.includes('orangeed')) return { reason: 'property_funding', contextName: 'Property — Currumundi' }
  return { reason: 'account_movement', contextName: null }
}
