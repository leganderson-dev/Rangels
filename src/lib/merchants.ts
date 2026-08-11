import { normalizeDescription } from './matching'

export function normalizeMerchantRulePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1)
    .join(' ')
    .trim()
}

export function merchantDisplayName(description: string): string {
  const cleaned = description
    .replace(/\bvalue\s+date:\s*\d{1,2}\/\d{1,2}\/\d{2,4}.*$/i, '')
    .replace(/\b(?:aus\s+)?card\s+x{1,2}\d+.*$/i, '')
    .replace(/\bnetbank\s+(?:bpay|transfer).*$/i, '')
    .replace(/\b(?:ref|reference)[:\s-]*[a-z0-9-]{6,}.*$/i, '')
    .replace(/\b\d{8,}\b/g, '')
    .replace(/^([a-z][a-z&'*.-]+)\s+\d{3,6}\s+/i, '$1 ')
    .replace(/\s+(?:AU|AUS)$/i, '')
    .replace(/^\s*(?:EFTPOS|DEBIT CARD PURCHASE|CARD PURCHASE)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || description.trim()
}

export function merchantKey(description: string): string {
  return normalizeDescription(merchantDisplayName(description)) || description.toLocaleLowerCase().trim()
}
