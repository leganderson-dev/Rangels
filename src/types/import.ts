export type HistoricalTransaction = {
  description: string
  category: string
}

export type CategorySuggestion = {
  category: string
  confidence: number
  matchedDescription: string
}

export type ImportedTransaction = {
  date: string
  amount: number
  description: string
  balance: number
  suggestions: CategorySuggestion[]
  selectedCategory?: string
}
