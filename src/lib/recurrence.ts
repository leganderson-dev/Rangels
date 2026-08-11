import type { ScheduledSuggestion, ScheduledTransaction, Transaction } from '../types/finance'
import { merchantDisplayName, merchantKey } from './merchants'

const DAY = 86_400_000

function median(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

function dominant<T>(values: T[]): T | null {
  const counts = new Map<T, number>()
  values.filter(value => value !== null && value !== undefined).forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1))
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
}

function daysBetween(left: string, right: string): number {
  return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / DAY)
}

function frequencyFor(intervals: number[]): { frequency: ScheduledTransaction['frequency']; days: number; score: number } | null {
  const observed = median(intervals)
  const candidates: Array<{ frequency: ScheduledTransaction['frequency']; days: number; tolerance: number }> = [
    { frequency: 'daily', days: 1, tolerance: 1 },
    { frequency: 'weekly', days: 7, tolerance: 2 },
    { frequency: 'fortnightly', days: 14, tolerance: 3 },
    { frequency: 'monthly', days: 30.4375, tolerance: 6 },
    { frequency: 'yearly', days: 365.25, tolerance: 40 },
  ]
  const candidate = candidates
    .map(item => ({ ...item, distance: Math.abs(observed - item.days) }))
    .filter(item => item.distance <= item.tolerance)
    .sort((left, right) => left.distance - right.distance)[0]
  if (!candidate) return null
  const averageError = intervals.reduce((sum, interval) => sum + Math.abs(interval - candidate.days) / candidate.days, 0) / intervals.length
  return { frequency: candidate.frequency, days: candidate.days, score: Math.max(0, 1 - averageError) }
}

function advance(dateValue: string, frequency: ScheduledTransaction['frequency']): string {
  const date = new Date(`${dateValue}T00:00:00Z`)
  if (frequency === 'daily') date.setUTCDate(date.getUTCDate() + 1)
  if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7)
  if (frequency === 'fortnightly') date.setUTCDate(date.getUTCDate() + 14)
  if (frequency === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1)
  if (frequency === 'yearly') date.setUTCFullYear(date.getUTCFullYear() + 1)
  return date.toISOString().slice(0, 10)
}

export function discoverScheduledSuggestions(
  transactions: Transaction[],
  existing: ScheduledTransaction[],
  asOf = new Date().toISOString().slice(0, 10),
): ScheduledSuggestion[] {
  const existingKeys = new Set(existing.map(item => `${merchantKey(item.description)}|${item.accountId}|${Math.sign(item.amount)}`))
  const groups = new Map<string, Transaction[]>()

  transactions.filter(transaction => !transaction.isTransfer).forEach(transaction => {
    const merchant = merchantKey(transaction.description)
    if (!merchant) return
    const key = `${merchant}|${transaction.accountId}|${Math.sign(transaction.amount)}`
    const rows = groups.get(key) ?? []
    rows.push(transaction)
    groups.set(key, rows)
  })

  const suggestions: ScheduledSuggestion[] = []
  groups.forEach((unsorted, key) => {
    if (unsorted.length < 3 || existingKeys.has(key)) return
    const rows = [...unsorted].sort((left, right) => left.date.localeCompare(right.date))
    const intervals = rows.slice(1).map((row, index) => daysBetween(rows[index].date, row.date)).filter(days => days > 0)
    if (intervals.length < 2) return
    const pattern = frequencyFor(intervals)
    if (!pattern || pattern.score < 0.68) return

    const typicalAmount = median(rows.map(row => row.amount))
    const amountScale = Math.max(Math.abs(typicalAmount), 1)
    const amountError = median(rows.map(row => Math.abs(row.amount - typicalAmount))) / amountScale
    const amountScore = Math.max(0, 1 - amountError)
    const evidenceScore = Math.min(1, rows.length / 6)
    const confidence = Math.round((pattern.score * 0.55 + amountScore * 0.25 + evidenceScore * 0.2) * 100)
    if (confidence < 55) return

    const latest = rows.at(-1)!
    const categoryId = dominant(rows.map(row => row.canonicalCategoryId))
    const categoryEvidence = rows.find(row => row.canonicalCategoryId === categoryId)
    const contextId = dominant(rows.map(row => row.contextId))
    const contextEvidence = rows.find(row => row.contextId === contextId)
    const bucketId = dominant(rows.map(row => row.bucketId))
    const bucketEvidence = rows.find(row => row.bucketId === bucketId)
    const taxTreatment = dominant(rows.map(row => row.taxTreatment)) ?? 'none'
    let nextDate = advance(latest.date, pattern.frequency)
    while (nextDate < asOf) nextDate = advance(nextDate, pattern.frequency)
    const amounts = rows.map(row => row.amount)
    suggestions.push({
      key,
      merchant: merchantDisplayName(latest.description),
      description: merchantDisplayName(latest.description),
      amount: Math.round(typicalAmount * 100) / 100,
      minAmount: Math.min(...amounts),
      maxAmount: Math.max(...amounts),
      accountId: latest.accountId,
      accountName: latest.accountName,
      categoryId,
      categoryFullName: categoryEvidence?.canonicalCategoryName ?? null,
      contextId,
      contextName: contextEvidence?.contextName ?? null,
      bucketId,
      bucketName: bucketEvidence?.bucketName ?? null,
      taxTreatment,
      frequency: pattern.frequency,
      nextDate,
      confidence,
      occurrenceCount: rows.length,
      evidence: rows.slice(-5).reverse().map(row => ({ date: row.date, amount: row.amount, description: row.description })),
    })
  })

  return suggestions.sort((left, right) => right.confidence - left.confidence || right.occurrenceCount - left.occurrenceCount)
}
