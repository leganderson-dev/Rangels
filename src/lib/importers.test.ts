import { describe, expect, it } from 'vitest'
import { parseBankExport, parseFourColumnBankExport, parseHistoricalExport } from './importers'

describe('parseBankExport', () => {
  it('parses American Express activity exports and reverses the card sign convention', () => {
    const text = [
      'Date,Date Processed,Description,Amount,Foreign Spend Amount,Commission,Exchange Rate,Additional Information,Appears On Your Statement As,Address,Town/City,Postcode,Country,Reference',
      "12/10/2026,14/10/2026,BUNNINGS WAREHOUSE,52.50,,,,,BUNNINGS WAREHOUSE,481 SETTLEMENT ROAD,KEPERRA,4054,AUSTRALIA,'AT262870004000010365656'",
      "12/10/2026,14/10/2026,BUNNINGS REFUND,-226.90,,,,,BUNNINGS REFUND,481 SETTLEMENT ROAD,KEPERRA,4054,AUSTRALIA,'AT262870004000010365658'",
    ].join('\n')

    expect(parseBankExport(text)).toEqual({
      format: 'American Express',
      rows: [
        { date: '2026-10-12', amount: -52.5, description: 'BUNNINGS WAREHOUSE', externalId: 'amex:AT262870004000010365656' },
        { date: '2026-10-12', amount: 226.9, description: 'BUNNINGS REFUND', externalId: 'amex:AT262870004000010365658' },
      ],
    })
  })

  it('keeps identical American Express charges distinct when their references differ', () => {
    const header = 'Date,Date Processed,Description,Amount,Foreign Spend Amount,Commission,Exchange Rate,Additional Information,Appears On Your Statement As,Address,Town/City,Postcode,Country,Reference'
    const parsed = parseBankExport([
      header,
      "10/10/2026,12/10/2026,QANTAS MASCOT,312.25,,,,,QANTAS MASCOT,,,,,'REF-1'",
      "10/10/2026,12/10/2026,QANTAS MASCOT,312.25,,,,,QANTAS MASCOT,,,,,'REF-2'",
    ].join('\n'))

    expect(parsed.rows.map(row => row.externalId)).toEqual(['amex:REF-1', 'amex:REF-2'])
  })
})

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
