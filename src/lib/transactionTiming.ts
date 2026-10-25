import type { Transaction } from '../types/finance'
import { today } from '../utils'

export function isFutureDatedTransaction(transaction: Pick<Transaction, 'date'>, asOf = today()): boolean {
  return transaction.date > asOf
}

export function isActualTransaction(transaction: Pick<Transaction, 'date' | 'status'>, asOf = today()): boolean {
  return transaction.status === 'C' && transaction.date <= asOf
}
