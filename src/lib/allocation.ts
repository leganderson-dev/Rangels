import type { Transaction } from '../types/finance'
import { isActualTransaction } from './transactionTiming'

export type FundedBucketName = 'Smile' | 'Fire Extinguisher'

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() ?? ''
}

export function isBucketFundingTransfer(row: Transaction, bucketName: FundedBucketName): boolean {
  const normalizedPurpose = normalize(row.canonicalCategoryName)
  const normalizedDestination = normalize(row.targetAccountName)
  const destinationMatches = bucketName === 'Smile'
    ? normalizedDestination === 'joint smile'
    : normalizedDestination === 'ing joint savings' || normalizedDestination.includes('fire extinguisher')
  const purposeMatches = bucketName === 'Smile'
    ? normalizedPurpose === 'joint account contribution'
    : normalizedPurpose === 'joint account contribution' || normalizedPurpose === 'savings movement'

  return isActualTransaction(row)
    && row.isTransfer
    && destinationMatches
    && purposeMatches
}

export function bucketFundingContribution(rows: Transaction[], bucketName: FundedBucketName): number {
  return rows.filter(row => isBucketFundingTransfer(row, bucketName)).reduce((sum, row) => sum + Math.abs(row.amount), 0)
}

export function isSmileFundingTransfer(row: Transaction): boolean {
  return isBucketFundingTransfer(row, 'Smile')
}

export function smileFundingContribution(rows: Transaction[]): number {
  return bucketFundingContribution(rows, 'Smile')
}
