import { describe, expect, it } from 'vitest'
import { filterCategoryGroups, groupCategoryPaths } from './categories'

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

describe('filterCategoryGroups', () => {
  const groups = groupCategoryPaths([
    'Bank:Interest',
    'Entertainment & Recreation:Alcohol',
    'Food:Cafe',
  ])

  it('searches roots, children, and complete paths', () => {
    expect(filterCategoryGroups(groups, 'entertainment')).toEqual([
      {
        root: 'Entertainment & Recreation',
        categories: [
          {
            value: 'Entertainment & Recreation:Alcohol',
            label: 'Alcohol',
            depth: 1,
          },
        ],
      },
    ])
    expect(filterCategoryGroups(groups, 'cafe')[0]?.root).toBe('Food')
  })

  it('returns all groups for an empty search', () => {
    expect(filterCategoryGroups(groups, '  ')).toEqual(groups)
  })
})
