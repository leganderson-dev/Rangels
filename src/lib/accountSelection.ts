import type { Transaction } from '../types/finance'

export function selectedAccountsTransactionAmount(transaction: Transaction, selectedAccountIds: string[]): number {
  if (!transaction.isTransfer || selectedAccountIds.length === 0) return transaction.amount
  const selected = new Set(selectedAccountIds)
  const sourceSelected = selected.has(transaction.accountId)
  const targetSelected = Boolean(transaction.targetAccountId && selected.has(transaction.targetAccountId))
  if (sourceSelected && targetSelected) return 0
  if (targetSelected) return Math.abs(transaction.amount)
  if (sourceSelected) return -Math.abs(transaction.amount)
  return transaction.amount
}

