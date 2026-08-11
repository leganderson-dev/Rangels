import { describe, expect, it } from 'vitest'
import { merchantDisplayName, merchantKey, normalizeMerchantRulePhrase } from './merchants'

describe('merchant intelligence', () => {
  it('keeps the merchant visible while removing bank metadata', () => {
    expect(merchantDisplayName('TARGET 5434 MITCHELTON AU')).toBe('TARGET MITCHELTON')
    expect(merchantDisplayName('Tank Stream Social Enoggera QL AUS Card xx8237 Value Date: 29/06/2026')).toBe('Tank Stream Social Enoggera QL')
  })

  it('creates a stable normalized key for matching imports', () => {
    expect(merchantKey('NETFLIX.COM Melbourne AU AUS Card xx8237 Value Date: 20/07/2026')).toBe('netflix com melbourne')
  })

  it('retains identifiers that distinguish recurring merchant rules', () => {
    expect(normalizeMerchantRulePhrase('Direct Debit 181547 ALLIANZ INSURE 154874011012126176'))
      .toBe('direct debit 181547 allianz insure 154874011012126176')
    expect(normalizeMerchantRulePhrase('Direct Debit 377946 ALLIANZ INSURE 60107HCHK019326180'))
      .toBe('direct debit 377946 allianz insure 60107hchk019326180')
  })
})
