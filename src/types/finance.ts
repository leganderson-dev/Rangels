export interface Account {
  id: string
  name: string
  type: 'checking' | 'savings' | 'credit' | 'cash' | 'investment'
  initialBalance: number
  color: string
  isActive: boolean
  displayOrder: number
  groupName: string | null
  lastUpdatedOn: string | null
  memberId: string
  memberName: string
  balance?: number
}

export interface HouseholdMember {
  id: string
  name: string
}

export interface Category {
  id: string
  name: string
  parentId: string | null
  parentName: string | null
  type: 'income' | 'expense' | 'transfer'
  color: string
  fullName: string
  txCount: number
  keywords?: string[]
  children?: Category[]
}

export interface Transaction {
  id: string
  description: string
  comment: string
  date: string
  amount: number
  accountId: string
  accountName: string
  memberId: string
  memberName: string
  targetAccountId: string | null
  targetAccountName: string | null
  categoryId: string | null
  categoryName: string | null
  categoryFullName: string | null
  categoryColor: string | null
  isTransfer: boolean
  status: string
  payee: string
  tags: string
  externalId: string
  canonicalCategoryId: string | null
  canonicalCategoryName: string | null
  canonicalCategoryFamily: string | null
  contextId: string | null
  contextName: string | null
  bucketId: string | null
  bucketName: string | null
  reimbursementStatus: 'none' | 'to_be_reimbursed' | 'reimbursed'
  taxTreatment: 'none' | 'deductible' | 'review'
}

export interface ClassificationOption {
  id: string
  name: string
}

export interface CanonicalCategory extends ClassificationOption {
  family: string
  type: 'income' | 'expense'
}

export interface ClassificationOptions {
  contexts: ClassificationOption[]
  buckets: ClassificationOption[]
  categories: CanonicalCategory[]
}

export interface AllocationTargetSummary {
  id: string
  bucketId: string
  name: string
  targetPercentage: number
}

export interface AllocationPlanSummary {
  id: string
  name: string
  contextName: string
  targets: AllocationTargetSummary[]
}

export interface LegacyCategoryMapping {
  categoryId: string
  categoryPath: string
  canonicalCategoryId: string | null
  canonicalCategoryName: string | null
  contextId: string | null
  contextName: string | null
  bucketId: string | null
  bucketName: string | null
  taxTreatment: 'none' | 'deductible' | 'review'
  status: 'mapped' | 'review' | 'preserved'
  notes: string
}

export interface ScheduledTransaction {
  id: string
  description: string
  amount: number
  accountId: string
  accountName: string
  targetAccountId: string | null
  categoryId: string | null
  categoryName: string | null
  categoryFullName: string | null
  isTransfer: boolean
  frequency: 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly'
  startDate: string
  nextDate: string
  endDate: string | null
  isActive: boolean
}

export interface Budget {
  id: string
  categoryId: string
  categoryName: string
  categoryFullName: string
  categoryColor: string
  month: number
  year: number
  amount: number
  spent: number
}

export interface ImportRule {
  id: string
  pattern: string
  categoryId: string
  matchType: 'contains' | 'starts_with' | 'exact' | 'regex'
  priority: number
}

export interface MonthSummary {
  income: number
  expenses: number
  balance: number
  byCategory: { categoryId: string; categoryFullName: string; categoryColor: string; total: number }[]
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
  uncategorized?: Transaction[]
}

export interface TransactionFilter {
  month?: number
  year?: number
  dateFrom?: string
  dateTo?: string
  accountId?: string | null
  categoryId?: string | null
  search?: string
  groupBy?: 'category' | 'date' | 'account'
}

export interface MerchantCategoryCandidate {
  categoryId: string
  categoryName: string
  categoryColor: string
  count: number
  percentage: number
}

export interface MerchantInsight {
  merchantId: string | null
  key: string
  name: string
  aliases: string[]
  transactionIds: string[]
  transactionCount: number
  totalAmount: number
  firstSeen: string
  lastSeen: string
  confidence: number
  categoryId: string | null
  remembered: boolean
  rulePhrases: string[]
  candidates: MerchantCategoryCandidate[]
  canonicalCategoryId: string | null
  contextId: string | null
  bucketId: string | null
  taxTreatment: 'none' | 'deductible' | 'review'
}
