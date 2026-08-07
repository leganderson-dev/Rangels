import { describe, expect, it } from 'vitest'
import { groupCategoryPaths } from './categories'

describe('groupCategoryPaths', () => {
  it('preserves values while exposing category levels', () => {
    expect(
      groupCategoryPaths([
        'Food:Restaurant:Dinner',
        'Bank:Interest',
        'Food:Cafe',
        'Transfers',
      ]),
    ).toEqual([
      {
        root: 'Bank',
        categories: [
          { value: 'Bank:Interest', label: 'Interest', depth: 1 },
        ],
      },
      {
        root: 'Food',
        categories: [
          { value: 'Food:Cafe', label: 'Cafe', depth: 1 },
          {
            value: 'Food:Restaurant:Dinner',
            label: 'Restaurant › Dinner',
            depth: 2,
          },
        ],
      },
      {
        root: 'Transfers',
        categories: [
          { value: 'Transfers', label: 'Transfers', depth: 0 },
        ],
      },
    ])
  })
})
