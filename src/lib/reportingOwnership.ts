import type { Transaction } from '../types/finance'

export function transactionReportingMemberName(transaction: Transaction, applyOverride: boolean): string {
  return applyOverride && transaction.reportingMemberName
    ? transaction.reportingMemberName
    : transaction.memberName
}

export function transactionReportingMemberId(transaction: Transaction, applyOverride: boolean): string {
  return applyOverride && transaction.reportingMemberId
    ? transaction.reportingMemberId
    : transaction.memberId
}
