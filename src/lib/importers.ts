import { parseDelimited } from './csv'
import type { HistoricalTransaction, ImportedTransaction } from '../types/import'

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
