export type RepaymentType = 'interest_only' | 'principal_and_interest'

export interface LoanProjection {
  monthlyRepayment: number
  firstMonthInterest: number
  firstMonthPrincipal: number
}

export function calculateMonthlyLoanProjection(
  balance: number,
  annualRatePercent: number,
  remainingTermYears: number,
  repaymentType: RepaymentType,
): LoanProjection {
  if (balance < 0 || annualRatePercent < 0 || remainingTermYears <= 0) {
    throw new Error('Loan balance and rate cannot be negative, and remaining term must be greater than zero.')
  }

  const monthlyRate = annualRatePercent / 100 / 12
  const firstMonthInterest = balance * monthlyRate
  let monthlyRepayment: number

  if (repaymentType === 'interest_only') {
    monthlyRepayment = firstMonthInterest
  } else if (monthlyRate === 0) {
    monthlyRepayment = balance / (remainingTermYears * 12)
  } else {
    const payments = remainingTermYears * 12
    monthlyRepayment = balance * monthlyRate * Math.pow(1 + monthlyRate, payments) / (Math.pow(1 + monthlyRate, payments) - 1)
  }

  return {
    monthlyRepayment,
    firstMonthInterest,
    firstMonthPrincipal: Math.max(0, monthlyRepayment - firstMonthInterest),
  }
}

export function projectedLoanBalance(
  balance: number,
  annualRatePercent: number,
  remainingTermYears: number,
  repaymentType: RepaymentType,
  elapsedMonths: number,
): number {
  if (repaymentType === 'interest_only') return balance
  const totalMonths = remainingTermYears * 12
  const paidMonths = Math.min(Math.max(0, elapsedMonths), totalMonths)
  if (paidMonths >= totalMonths) return 0
  const monthlyPayment = calculateMonthlyLoanProjection(balance, annualRatePercent, remainingTermYears, repaymentType).monthlyRepayment
  const monthlyRate = annualRatePercent / 100 / 12
  if (monthlyRate === 0) return Math.max(0, balance - monthlyPayment * paidMonths)
  const growth = Math.pow(1 + monthlyRate, paidMonths)
  return Math.max(0, balance * growth - monthlyPayment * (growth - 1) / monthlyRate)
}
