import { describe, expect, it } from 'vitest'
import { merchantDisplayName, merchantKey } from './merchants'

describe('merchant intelligence', () => {
  it('keeps the merchant visible while removing bank metadata', () => {
    expect(merchantDisplayName('TARGET 5434 MITCHELTON AU')).toBe('TARGET MITCHELTON')
    expect(merchantDisplayName('Tank Stream Social Enoggera QL AUS Card xx8237 Value Date: 29/06/2026')).toBe('Tank Stream Social Enoggera QL')
  })

  it('creates a stable normalized key for matching imports', () => {
    expect(merchantKey('NETFLIX.COM Melbourne AU AUS Card xx8237 Value Date: 20/07/2026')).toBe('netflix com melbourne')
  })
})
