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
  transferReason: TransferReason | null
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

export interface BulkTransactionChanges {
  transactionType?: 'income' | 'expense' | 'transfer'
  date?: string
  accountId?: string
  targetAccountId?: string | null
  canonicalCategoryId?: string | null
  contextId?: string | null
  bucketId?: string | null
  reimbursementStatus?: 'none' | 'to_be_reimbursed' | 'reimbursed'
  taxTreatment?: 'none' | 'deductible' | 'review'
  transferReason?: TransferReason | null
  status?: string
  tags?: string[]
  comment?: string
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
  transactionCount: number
  legacyCategoryType: 'income' | 'expense' | 'transfer'
  transferReason: TransferReason | null
}

export type TransferReason = 'account_movement' | 'joint_contribution' | 'household_funding' | 'property_funding' | 'business_funding' | 'savings' | 'debt_reduction' | 'investment_contribution' | 'other'

export interface LegacyTransactionSample {
  id: string
  date: string
  description: string
  amount: number
}

export interface AwaitingMappingTransaction extends LegacyTransactionSample {
  accountName: string
  categoryId: string
  categoryPath: string
  isTransfer: boolean
  canonicalCategoryId: string | null
  canonicalCategoryType: 'income' | 'expense' | null
  contextId: string | null
  contextName: string | null
  bucketId: string | null
  taxTreatment: 'none' | 'deductible' | 'review'
  transferReason: TransferReason | null
  reimbursementStatus: 'none' | 'to_be_reimbursed' | 'reimbursed'
  classificationReviewedAt: string | null
  suggestion: {
    canonicalCategoryId: string | null
    contextId: string | null
    bucketId: string | null
    taxTreatment: 'none' | 'deductible' | 'review'
    transferReason: TransferReason | null
    confidence: number
    evidenceCount: number
    source: string
  } | null
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
  contextId: string | null
  contextName: string | null
  bucketId: string | null
  bucketName: string | null
  taxTreatment: 'none' | 'deductible' | 'review'
  transferReason: TransferReason | null
  isTransfer: boolean
  frequency: 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly'
  interval: number
  weekdays: number[]
  months: number[]
  monthDay: number
  startDate: string
  nextDate: string
  endDate: string | null
  isActive: boolean
  isVirtual: boolean
}

export interface ScheduledSuggestion {
  key: string
  merchant: string
  description: string
  amount: number
  minAmount: number
  maxAmount: number
  accountId: string
  accountName: string
  categoryId: string | null
  categoryFullName: string | null
  contextId: string | null
  contextName: string | null
  bucketId: string | null
  bucketName: string | null
  taxTreatment: 'none' | 'deductible' | 'review'
  frequency: ScheduledTransaction['frequency']
  nextDate: string
  confidence: number
  occurrenceCount: number
  evidence: Array<{ date: string; amount: number; description: string }>
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

export interface AccountLedgerSummary {
  openingBalance: number
  income: number
  expenses: number
  transfersIn: number
  transfersOut: number
  netMovement: number
  closingBalance: number
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
  uncategorized?: Transaction[]
}

export interface TransactionFilter {
  transactionId?: string
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
