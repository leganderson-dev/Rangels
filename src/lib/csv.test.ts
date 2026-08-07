import { describe, expect, it } from 'vitest'
import { parseDelimited } from './csv'

describe('parseDelimited', () => {
  it('parses commas, quoted fields, and Windows line endings', () => {
    expect(
      parseDelimited('01/01/2026,"-12.50","SHOP, CITY","100.00"\r\n', ','),
    ).toEqual([['01/01/2026', '-12.50', 'SHOP, CITY', '100.00']])
  })

  it('parses tab-separated exports', () => {
    expect(parseDelimited('Description\tCategory\nWOOLWORTHS\tGroceries', '\t')).toEqual([
      ['Description', 'Category'],
      ['WOOLWORTHS', 'Groceries'],
    ])
  })
})
