import type {
  CategorySuggestion,
  ConfidenceGroup,
  HistoricalTransaction,
} from '../types/import'

const BANK_NOISE = new Set([
  'australia',
  'aus',
  'au',
  'bpay',
  'card',
  'debit',
  'date',
  'eftpos',
  'netbank',
  'ns',
  'nsw',
  'payment',
  'purchase',
  'qld',
  'transfer',
  'value',
  'visa',
])

export function classifyConfidence(confidence: number): ConfidenceGroup {
  if (confidence >= 0.7) return 'confident'
  if (confidence >= 0.5) return 'likely'
  return 'analysis'
}

export function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !BANK_NOISE.has(word))
    .join(' ')
    .trim()
}

export function transactionDuplicateKey(
  accountId: string,
  date: string,
  amount: number,
  description: string,
  balance?: number | null,
): string {
  return [
    accountId,
    date,
    amount.toFixed(2),
    normalizeDescription(description),
    balance == null ? '' : balance.toFixed(2),
  ].join('|')
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  const leftWords = new Set(left.split(' ').filter(Boolean))
  const rightWords = new Set(right.split(' ').filter(Boolean))
  const common = [...leftWords].filter(word => rightWords.has(word)).length
  if (common === 0) return 0

  const smallerSize = Math.min(leftWords.size, rightWords.size)
  if (common === smallerSize) {
    // The stable merchant phrase is wholly present; extra bank text should not
    // weaken what is effectively the same historical merchant.
    return smallerSize >= 2 ? 1 : 0.85
  }

  return common / Math.max(leftWords.size, rightWords.size)
}

export function relevantCategorySuggestions(
  suggestions: CategorySuggestion[],
): CategorySuggestion[] {
  const best = suggestions[0]
  if (!best) return []
  if (best.confidence >= 0.9) return [best]

  const relevanceFloor = Math.max(0.35, best.confidence - 0.2)
  return suggestions
    .filter(suggestion => suggestion.confidence >= relevanceFloor)
    .slice(0, 3)
}

export function suggestCategories(
  description: string,
  history: HistoricalTransaction[],
  minimumConfidence = 0.35,
): CategorySuggestion[] {
  const normalized = normalizeDescription(description)
  const bestByCategory = new Map<string, CategorySuggestion>()

  for (const transaction of history) {
    const confidence = similarity(
      normalized,
      normalizeDescription(transaction.description),
    )

    if (confidence < minimumConfidence) continue

    const existing = bestByCategory.get(transaction.category)
    if (!existing || confidence > existing.confidence) {
      bestByCategory.set(transaction.category, {
        category: transaction.category,
        confidence,
        matchedDescription: transaction.description,
      })
    }
  }

  return [...bestByCategory.values()]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3)
}

export function createCategoryMatcher(history: HistoricalTransaction[]) {
  const normalizedHistory = history.map(transaction => ({
    ...transaction,
    normalized: normalizeDescription(transaction.description),
  })).filter(transaction => transaction.normalized)
  const exact = new Map<string, typeof normalizedHistory>()
  const byToken = new Map<string, Set<number>>()

  normalizedHistory.forEach((transaction, index) => {
    exact.set(transaction.normalized, [...(exact.get(transaction.normalized) ?? []), transaction])
    new Set(transaction.normalized.split(' ')).forEach(token => {
      const matches = byToken.get(token) ?? new Set<number>()
      matches.add(index)
      byToken.set(token, matches)
    })
  })

  return (description: string, minimumConfidence = 0.35): CategorySuggestion[] => {
    const normalized = normalizeDescription(description)
    const exactMatches = exact.get(normalized)
    if (exactMatches?.length) {
      const counts = new Map<string, { count: number; description: string }>()
      exactMatches.forEach(transaction => {
        const current = counts.get(transaction.category) ?? { count: 0, description: transaction.description }
        current.count += 1
        counts.set(transaction.category, current)
      })
      return [...counts.entries()]
        .sort((left, right) => right[1].count - left[1].count)
        .slice(0, 3)
        .map(([category, match]) => ({ category, confidence: 1, matchedDescription: match.description }))
    }

    const candidateIndexes = new Set<number>()
    const usefulTokens = [...new Set(normalized.split(' '))]
      .map(token => ({ token, size: byToken.get(token)?.size ?? 0 }))
      .filter(item => item.size > 0)
      .sort((left, right) => left.size - right.size)
      .slice(0, 3)
    usefulTokens.forEach(({ token }) => byToken.get(token)?.forEach(index => candidateIndexes.add(index)))
    return suggestCategories(
      description,
      [...candidateIndexes].map(index => normalizedHistory[index]),
      minimumConfidence,
    )
  }
}
