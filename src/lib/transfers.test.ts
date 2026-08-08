import { describe, expect, it } from 'vitest'
import { transferReasonLabel, transferReasonNeedsContext } from './transfers'

describe('transfer classification', () => {
  it('requires a funding context for property and business funding', () => {
    expect(transferReasonNeedsContext('property_funding')).toBe(true)
    expect(transferReasonNeedsContext('business_funding')).toBe(true)
  })

  it('keeps ordinary account movements context-optional', () => {
    expect(transferReasonNeedsContext('account_movement')).toBe(false)
    expect(transferReasonLabel('account_movement')).toBe('Account movement')
  })
})
