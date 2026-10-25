import { describe, expect, it } from 'vitest'
import { calculateMonthlyLoanProjection, projectedLoanBalance } from './loans'

describe('calculateMonthlyLoanProjection', () => {
  it('calculates interest-only repayments', () => {
    expect(calculateMonthlyLoanProjection(747452.91, 4, 30, 'interest_only')).toEqual({
      monthlyRepayment: 2491.5097,
      firstMonthInterest: 2491.5097,
      firstMonthPrincipal: 0,
    })
  })

  it('calculates principal-and-interest repayments using amortisation', () => {
    const result = calculateMonthlyLoanProjection(500000, 6, 30, 'principal_and_interest')
    expect(result.monthlyRepayment).toBeCloseTo(2997.75, 2)
    expect(result.firstMonthInterest).toBeCloseTo(2500, 2)
    expect(result.firstMonthPrincipal).toBeCloseTo(497.75, 2)
  })

  it('handles a zero-rate principal-and-interest loan', () => {
    expect(calculateMonthlyLoanProjection(120000, 0, 10, 'principal_and_interest').monthlyRepayment).toBe(1000)
  })

  it('projects the remaining principal-and-interest balance', () => {
    expect(projectedLoanBalance(500000, 6, 30, 'principal_and_interest', 120)).toBeCloseTo(418428.62, 2)
    expect(projectedLoanBalance(500000, 6, 30, 'principal_and_interest', 360)).toBe(0)
  })

  it('holds an interest-only balance flat', () => {
    expect(projectedLoanBalance(500000, 6, 5, 'interest_only', 60)).toBe(500000)
  })
})
