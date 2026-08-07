export type CategoryGroup = {
  root: string
  categories: {
    value: string
    label: string
    depth: number
  }[]
}

export function groupCategoryPaths(categories: string[]): CategoryGroup[] {
  const grouped = new Map<string, CategoryGroup['categories']>()

  for (const category of [...new Set(categories)].sort()) {
    const [root, ...children] = category.split(':')
    const existing = grouped.get(root) ?? []

    existing.push({
      value: category,
      label: children.length > 0 ? children.join(' › ') : root,
      depth: children.length,
    })
    grouped.set(root, existing)
  }

  return [...grouped.entries()].map(([root, groupedCategories]) => ({
    root,
    categories: groupedCategories,
  }))
}
