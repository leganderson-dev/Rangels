import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types/finance'
import { transactionReportingMemberId, transactionReportingMemberName } from './reportingOwnership'

const transaction = {
  memberId: 'anderson-id', memberName: 'Anderson', reportingMemberId: 'julia-id', reportingMemberName: 'Julia',
} as Transaction

describe('reporting ownership', () => {
  it('uses the source-account owner by default', () => {
    expect(transactionReportingMemberName(transaction, false)).toBe('Anderson')
    expect(transactionReportingMemberId(transaction, false)).toBe('anderson-id')
  })

  it('uses the transaction override only when enabled', () => {
    expect(transactionReportingMemberName(transaction, true)).toBe('Julia')
    expect(transactionReportingMemberId(transaction, true)).toBe('julia-id')
  })

  it('falls back to the account owner when no override exists', () => {
    const withoutOverride = { ...transaction, reportingMemberId: null, reportingMemberName: null }
    expect(transactionReportingMemberName(withoutOverride, true)).toBe('Anderson')
  })
})
