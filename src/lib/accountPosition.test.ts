import { describe, expect, it } from 'vitest'
import { summarizeAccountPosition } from './accountPosition'

describe('account position', () => {
  it('treats a negative credit-card balance as a liability, not negative cash', () => {
    expect(summarizeAccountPosition([
      { balance: 5_000 },
      { balance: -1_500 },
    ])).toEqual({ assets: 5_000, liabilities: 1_500, net: 3_500 })
  })

  it('handles missing and positive card balances without inventing debt', () => {
    expect(summarizeAccountPosition([
      {},
      { balance: 125 },
    ])).toEqual({ assets: 125, liabilities: 0, net: 125 })
  })
})
