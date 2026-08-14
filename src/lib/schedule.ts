import type { ScheduledTransaction } from '../types/finance'

export type ScheduleRule = Pick<ScheduledTransaction, 'frequency' | 'interval' | 'weekdays' | 'months' | 'monthDay'>

function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function utc(value: string): Date {
  return new Date(`${value}T00:00:00Z`)
}

export function nextScheduledDate(current: string, rule: ScheduleRule): string {
  const interval = Math.max(1, rule.interval || 1)
  const date = utc(current)
  if (rule.frequency === 'daily') {
    date.setUTCDate(date.getUTCDate() + interval)
    return iso(date)
  }
  if (rule.frequency === 'weekly' || rule.frequency === 'fortnightly') {
    const weekdays = rule.weekdays.length ? [...rule.weekdays].sort((a, b) => a - b) : [date.getUTCDay()]
    const weekInterval = rule.frequency === 'fortnightly' ? interval * 2 : interval
    for (let days = 1; days <= weekInterval * 7; days += 1) {
      const candidate = utc(current)
      candidate.setUTCDate(candidate.getUTCDate() + days)
      if (!weekdays.includes(candidate.getUTCDay())) continue
      const weekOffset = Math.floor((days - 1) / 7)
      if (weekOffset === 0 || weekOffset % weekInterval === 0) return iso(candidate)
    }
    date.setUTCDate(date.getUTCDate() + weekInterval * 7)
    return iso(date)
  }
  if (rule.frequency === 'monthly') {
    const allowedMonths = rule.months.length ? new Set(rule.months) : new Set(Array.from({ length: 12 }, (_, index) => index + 1))
    let candidate = utc(current)
    candidate.setUTCDate(1)
    for (let step = 1; step <= 120; step += 1) {
      candidate = utc(current)
      candidate.setUTCDate(1)
      candidate.setUTCMonth(candidate.getUTCMonth() + step * interval)
      if (!allowedMonths.has(candidate.getUTCMonth() + 1)) continue
      const lastDay = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0)).getUTCDate()
      candidate.setUTCDate(Math.min(Math.max(1, rule.monthDay || 1), lastDay))
      if (iso(candidate) > current) return iso(candidate)
    }
  }
  date.setUTCFullYear(date.getUTCFullYear() + interval)
  return iso(date)
}

export function scheduledDatesBetween(
  item: Pick<ScheduledTransaction, 'isActive' | 'nextDate' | 'endDate'> & ScheduleRule,
  from: string,
  to: string,
): string[] {
  if (!item.isActive || item.nextDate > to || (item.endDate && item.nextDate > item.endDate)) return []
  const dates: string[] = []
  let date = item.nextDate
  for (let occurrence = 0; occurrence < 1000 && date <= to; occurrence += 1) {
    if ((!item.endDate || date <= item.endDate) && date >= from) dates.push(date)
    const next = nextScheduledDate(date, item)
    if (next <= date) break
    date = next
    if (item.endDate && date > item.endDate) break
  }
  return dates
}
