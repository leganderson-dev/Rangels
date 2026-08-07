export function fmt(amount: number, showSign = false): string {
  const abs = Math.abs(amount)
  const str = abs.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (showSign && amount > 0) return `+AUD${str}`
  if (amount < 0) return `-AUD${str}`
  return `AUD${str}`
}

export function fmtShort(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(0)}`
}

export function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString('default', { month: 'long' })
}

export function monthShort(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString('default', { month: 'short' })
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function today(): string {
  return new Date().toISOString().split('T')[0]
}

export const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' },
]

export const ACCOUNT_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#ec4899','#14b8a6','#f97316','#6366f1','#64748b',
]

export const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

