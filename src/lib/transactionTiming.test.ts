import { describe, expect, it } from 'vitest'
import { isActualTransaction, isFutureDatedTransaction } from './transactionTiming'

describe('transaction timing', () => {
  it('treats completed transactions through today as actual', () => {
    expect(isActualTransaction({ date: '2026-09-07', status: 'C' }, '2026-09-07')).toBe(true)
    expect(isActualTransaction({ date: '2026-09-06', status: 'C' }, '2026-09-07')).toBe(true)
  })

  it('keeps a completed future-dated transaction out of actuals', () => {
    expect(isFutureDatedTransaction({ date: '2026-09-08' }, '2026-09-07')).toBe(true)
    expect(isActualTransaction({ date: '2026-09-08', status: 'C' }, '2026-09-07')).toBe(false)
  })

  it('does not treat pending transactions as actual', () => {
    expect(isActualTransaction({ date: '2026-09-07', status: 'P' }, '2026-09-07')).toBe(false)
  })
})
