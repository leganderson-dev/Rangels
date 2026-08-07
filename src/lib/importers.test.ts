import { describe, expect, it } from 'vitest'
import { parseFourColumnBankExport, parseHistoricalExport } from './importers'

describe('parseHistoricalExport', () => {
  it('extracts categorized descriptions from a tab-separated export', () => {
    const text = [
      'Description\tDate\tAmount\tCategory',
      'WOOLWORTHS #432\t01/01/2026\t-42.50\tGroceries',
      'UNKNOWN\t02/01/2026\t-5.00\t',
    ].join('\n')

    expect(parseHistoricalExport(text)).toEqual([
      { description: 'WOOLWORTHS #432', category: 'Groceries' },
    ])
  })
})

describe('parseFourColumnBankExport', () => {
  it('normalizes the supported bank row', () => {
    expect(
      parseFourColumnBankExport(
        '23/07/2026,"-42.50","WOOLWORTHS 432","+27160.57"\r\n',
      ),
    ).toEqual([
      {
        date: '23/07/2026',
        amount: -42.5,
        description: 'WOOLWORTHS 432',
        balance: 27160.57,
      },
    ])
  })

  it('rejects an unknown bank layout', () => {
    expect(() => parseFourColumnBankExport('Date,Description,Amount')).toThrow(
      'not supported yet',
    )
  })
})
