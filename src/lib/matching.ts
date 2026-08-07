import type {
  CategorySuggestion,
  ConfidenceGroup,
  HistoricalTransaction,
} from '../types/import'

const BANK_NOISE = new Set([
  'australia',
  'au',
  'bpay',
  'card',
  'debit',
  'eftpos',
  'netbank',
  'payment',
  'purchase',
  'qld',
  'transfer',
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

function bigrams(value: string): string[] {
  const compact = value.replace(/\s+/g, ' ')
  if (compact.length < 2) return compact ? [compact] : []

  return Array.from(
    { length: compact.length - 1 },
    (_, index) => compact.slice(index, index + 2),
  )
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.92

  const leftPairs = bigrams(left)
  const availableRightPairs = bigrams(right)
  let matches = 0

  for (const pair of leftPairs) {
    const index = availableRightPairs.indexOf(pair)
    if (index !== -1) {
      matches += 1
      availableRightPairs.splice(index, 1)
    }
  }

  return (2 * matches) / (leftPairs.length + bigrams(right).length)
}

export function suggestCategories(
  description: string,
  history: HistoricalTransaction[],
): CategorySuggestion[] {
  const normalized = normalizeDescription(description)
  const bestByCategory = new Map<string, CategorySuggestion>()

  for (const transaction of history) {
    const confidence = similarity(
      normalized,
      normalizeDescription(transaction.description),
    )

    if (confidence < 0.35) continue

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
