import { describe, expect, it } from 'vitest'
import { nextScheduledDate } from './schedule'

describe('nextScheduledDate', () => {
  it('supports daily intervals', () => expect(nextScheduledDate('2026-08-01', { frequency: 'daily', interval: 3, weekdays: [], months: [], monthDay: 1 })).toBe('2026-08-04'))
  it('supports selected weekly days', () => expect(nextScheduledDate('2026-08-03', { frequency: 'weekly', interval: 1, weekdays: [1, 5], months: [], monthDay: 1 })).toBe('2026-08-07'))
  it('supports selected months and clamps month days', () => expect(nextScheduledDate('2026-01-31', { frequency: 'monthly', interval: 1, weekdays: [], months: [2, 8], monthDay: 31 })).toBe('2026-02-28'))
})
