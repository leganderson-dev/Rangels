import { parseDelimited } from './csv'
import type { HistoricalTransaction, ImportedTransaction } from '../types/import'

export type ParsedBankRow = {
  date: string
  amount: number
  description: string
  balance?: number
  externalId?: string
}

function amount(value = ''): number {
  const negative = /^\s*\(.*\)\s*$/.test(value)
  const parsed = Number(value.replace(/[$,"()\s]/g, ''))
  return negative ? -Math.abs(parsed) : parsed
}

function isoDate(value = ''): string {
  const clean = value.replace(/"/g, '').trim()
  const au = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (au) return `${au[3]}-${au[2].padStart(2, '0')}-${au[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
  return clean
}

export function parseBankExport(text: string): { format: string; rows: ParsedBankRow[] } {
  const parsed = parseDelimited(text.replace(/^\uFEFF/, ''), ',').filter(row => row.some(Boolean))
  if (!parsed.length) throw new Error('This CSV is empty.')
  const header = parsed[0].map(value => value.toLowerCase())
  const hasHeader = !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(parsed[0][0]?.trim() ?? '')
  const data = hasHeader ? parsed.slice(1) : parsed
  let format = 'CommBank'
  if (header.includes('date processed') && header.includes('foreign spend amount') && header.includes('appears on your statement as')) format = 'American Express'
  else if (header.some(value => value.includes('credit')) && header.some(value => value.includes('debit'))) format = 'ING'
  else if (header.some(value => value.includes('reference')) || header.some(value => value.includes('nab'))) format = 'NAB'
  else if (!data.every(row => row.length >= 4)) format = 'Generic'

  const rows = data.map((row): ParsedBankRow | null => {
    let value: ParsedBankRow
    if (format === 'American Express') {
      const dateIndex = header.indexOf('date')
      const descriptionIndex = header.indexOf('description')
      const statementDescriptionIndex = header.indexOf('appears on your statement as')
      const amountIndex = header.indexOf('amount')
      const referenceIndex = header.indexOf('reference')
      const reference = row[referenceIndex]?.trim().replace(/^'+|'+$/g, '')
      value = {
        date: isoDate(row[dateIndex]),
        description: row[descriptionIndex]?.trim() || row[statementDescriptionIndex]?.trim(),
        // American Express exports charges as positive and credits/refunds as
        // negative. Rangels stores expenses as negative and credits as positive.
        amount: -amount(row[amountIndex]),
        externalId: reference ? `amex:${reference}` : undefined,
      }
    } else if (format === 'ING') {
      const credit = amount(row[2])
      const debit = amount(row[3])
      value = { date: isoDate(row[0]), description: row[1]?.trim(), amount: credit || -Math.abs(debit), balance: amount(row[4]) }
    } else if (format === 'NAB') {
      value = { date: isoDate(row[0]), amount: amount(row[1]), description: row[4]?.trim() || row[2]?.trim(), balance: amount(row[3]) }
    } else {
      value = { date: isoDate(row[0]), amount: amount(row[1]), description: row[2]?.trim(), balance: amount(row[3]) }
    }
    return value.date && value.description && Number.isFinite(value.amount) ? value : null
  }).filter((row): row is ParsedBankRow => row !== null)

  if (!rows.length) throw new Error('This bank CSV format is not supported yet.')
  return { format, rows }
}

export function parseHistoricalExport(text: string): HistoricalTransaction[] {
  const rows = parseDelimited(text.replace(/^\uFEFF/, ''), '\t')
  const headers = rows[0]
  const descriptionIndex = headers?.indexOf('Description') ?? -1
  const categoryIndex = headers?.indexOf('Category') ?? -1

  if (descriptionIndex === -1 || categoryIndex === -1) {
    throw new Error('This is not a supported historical finance export.')
  }

  return rows
    .slice(1)
    .map((row) => ({
      description: row[descriptionIndex]?.trim() ?? '',
      category: row[categoryIndex]?.trim() ?? '',
    }))
    .filter(({ description, category }) => description && category)
}

export function parseFourColumnBankExport(
  text: string,
): Omit<ImportedTransaction, 'suggestions'>[] {
  const rows = parseDelimited(text.replace(/^\uFEFF/, ''), ',')

  if (
    rows.length === 0 ||
    rows.some((row) => row.length !== 4) ||
    rows.some((row) => !/^\d{2}\/\d{2}\/\d{4}$/.test(row[0]?.trim()))
  ) {
    throw new Error('This bank CSV format is not supported yet.')
  }

  return rows.map(([date, amount, description, balance]) => {
    const parsedAmount = Number(amount)
    const parsedBalance = Number(balance)

    if (!Number.isFinite(parsedAmount) || !Number.isFinite(parsedBalance)) {
      throw new Error('The bank CSV contains an invalid amount or balance.')
    }

    return {
      date: date.trim(),
      amount: parsedAmount,
      description: description.trim(),
      balance: parsedBalance,
    }
  })
}
