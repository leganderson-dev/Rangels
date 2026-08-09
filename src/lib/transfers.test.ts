import { describe, expect, it } from 'vitest'
import { inferTransferClassification } from './transfers'

describe('inferTransferClassification', () => {
  it('recognises Julia contributions before destination-account rules', () => {
    expect(inferTransferClassification('Leg CW', 'Julia CW', 'Te Amo')).toEqual({ reason: 'joint_contribution', contextName: null })
  })

  it('recognises credit-card debt reduction', () => {
    expect(inferTransferClassification('Leg CW', 'CartaodeCredito', 'Card payment')).toEqual({ reason: 'debt_reduction', contextName: null })
  })

  it('recognises property destinations', () => {
    expect(inferTransferClassification('Leg CW', 'ING Currumundi', 'Mortgage transfer')).toEqual({ reason: 'property_funding', contextName: 'Property — Currumundi' })
    expect(inferTransferClassification('Leg CW', 'NAB Savings', 'Mortgage transfer')).toEqual({ reason: 'property_funding', contextName: 'Property — Everton Park' })
  })

  it('recognises the fire extinguisher savings movement', () => {
    expect(inferTransferClassification('ING Currumundi', 'ING FireExtingusher', 'Transfer')).toEqual({ reason: 'savings', contextName: null })
  })
})
