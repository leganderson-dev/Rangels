import { describe, expect, it } from 'vitest'
import { selectedAccountsTransactionAmount } from './accountSelection'
import type { Transaction } from '../types/finance'

const transfer = { isTransfer: true, amount: -500, accountId: 'source', targetAccountId: 'target' } as Transaction

describe('multi-account transaction amounts', () => {
  it('shows money leaving a selected source', () => expect(selectedAccountsTransactionAmount(transfer, ['source'])).toBe(-500))
  it('shows money entering a selected target', () => expect(selectedAccountsTransactionAmount(transfer, ['target'])).toBe(500))
  it('nets transfers between selected accounts to zero', () => expect(selectedAccountsTransactionAmount(transfer, ['source', 'target'])).toBe(0))
  it('does not alter ordinary transactions', () => expect(selectedAccountsTransactionAmount({ ...transfer, isTransfer: false, amount: -25 }, ['source', 'target'])).toBe(-25))
})

