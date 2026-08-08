import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Tag, Search, ChevronsUpDown, ChevronsDownUp, Wand2, TrendingUp, TrendingDown, ArrowLeftRight, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react'
import { Modal } from '../components/Modal'
import { api } from '../api'
import type { Category } from '../types/finance'

interface Props {
  categories: Category[]
  onRefreshCategories: () => void
  accounts?: any
  selectedAccountId?: any
  month?: any
  year?: any
  onRefreshAccounts?: any
  onMonthChange?: any
  onYearChange?: any
}

const PRESET_COLORS = [
  '#f97316', '#3b82f6', '#8b5cf6', '#22c55e', '#ec4899',
  '#14b8a6', '#f59e0b', '#eab308', '#ef4444', '#06b6d4',
  '#10b981', '#a855f7', '#84cc16', '#f43f5e', '#6366f1',
  '#78716c', '#64748b', '#94a3b8',
]

const SECTION_CONFIG = {
  expense: {
    label: 'Expenses',
    icon: TrendingDown,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-100',
    dot: 'bg-rose-400',
  },
  income: {
    label: 'Income',
    icon: TrendingUp,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    dot: 'bg-emerald-400',
  },
  transfer: {
    label: 'Transfers',
    icon: ArrowLeftRight,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    border: 'border-sky-100',
    dot: 'bg-sky-400',
  },
} as const

export function CategoriesPage({ categories, onRefreshCategories: onRefresh }: Props) {
  const [editing, setEditing] = useState<Category | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [parentId, setParentId] = useState<string | null>(null)
  const [defaultType, setDefaultType] = useState<'expense' | 'income' | 'transfer'>('expense')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [allCollapsed, setAllCollapsed] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'count'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const parents = useMemo(() => categories.filter(c => !c.parentId), [categories])
  const childrenOf = (id: string) => categories.filter(c => c.parentId === id)

  // For each parent: sum of its own txCount + all children's txCount
  const parentTxCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of parents) {
      const childTotal = categories
        .filter(c => c.parentId === p.id)
        .reduce((s, c) => s + (c.txCount ?? 0), 0)
      map.set(p.id, (p.txCount ?? 0) + childTotal)
    }
    return map
  }, [parents, categories])

  // Detect flat colon-named categories that need migration
  const colonCount = useMemo(
    () => parents.filter(p => p.name.includes(':')).length,
    [parents]
  )

  // Group parents by type
  const parentsByType = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? parents.filter(p =>
          p.name.toLowerCase().includes(q) ||
          childrenOf(p.id).some(c => c.name.toLowerCase().includes(q))
        )
      : parents

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'count') {
        cmp = (parentTxCount.get(a.id) ?? 0) - (parentTxCount.get(b.id) ?? 0)
      } else {
        cmp = a.name.localeCompare(b.name)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return {
      expense: sorted.filter(p => !p.type || p.type === 'expense'),
      income: sorted.filter(p => p.type === 'income'),
      transfer: sorted.filter(p => p.type === 'transfer'),
    }
  }, [parents, search, categories, sortBy, sortDir, parentTxCount])

  async function handleMigrate() {
    if (!confirm(`Auto-organize ${colonCount} flat categories into parent/child hierarchy using the colon as separator?\n\nExample: "Contas diversas:Energy Bill" → parent "Contas diversas" with child "Energy Bill"\n\nThis cannot be undone.`)) return
    setMigrating(true)
    try {
      const result = await api.categories.migrateColon()
      onRefresh()
      alert(`Done! Created ${result.created} parent categories, reorganized ${result.updated} sub-categories.`)
    } finally {
      setMigrating(false)
    }
  }

  async function handleDelete(cat: Category) {
    const hasChildren = childrenOf(cat.id).length > 0
    const msg = hasChildren
      ? `Delete "${cat.fullName}" and all its sub-categories?`
      : `Delete "${cat.fullName}"?`
    if (!confirm(msg)) return
    await api.categories.delete(cat.id)
    onRefresh()
  }

  function openAdd(pid: string | null = null, type: 'expense' | 'income' | 'transfer' = 'expense') {
    setEditing(null)
    setParentId(pid)
    setDefaultType(type)
    setShowForm(true)
  }

  function openEdit(cat: Category) {
    setEditing(cat)
    setParentId(cat.parentId ?? null)
    setDefaultType((cat.type as any) ?? 'expense')
    setShowForm(true)
  }

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allCollapsed) {
      setCollapsed(new Set())
      setAllCollapsed(false)
    } else {
      setCollapsed(new Set(parents.filter(p => childrenOf(p.id).length > 0).map(p => p.id)))
      setAllCollapsed(true)
    }
  }

  function exportHierarchy() {
    const byId = new Map(categories.map(category => [category.id, category]))
    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
    const rows = [...categories]
      .sort((left, right) => left.fullName.localeCompare(right.fullName))
      .map(category => {
        const parent = category.parentId ? byId.get(category.parentId) : null
        return [
          category.type,
          parent ? 'Category' : 'Group',
          parent?.name ?? '',
          category.name,
          category.fullName,
          category.txCount ?? 0,
          category.color,
        ].map(escapeCsv).join(',')
      })
    const csv = [
      ['Type', 'Level', 'Parent', 'Category', 'Full path', 'Transaction count', 'Color'].map(escapeCsv).join(','),
      ...rows,
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `rangels-categories-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const totalSubcats = categories.length - parents.length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-white shrink-0">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Categories</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {parents.length} groups · {totalSubcats} sub-categories
          </p>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 w-48"
          />
        </div>
        <button
          onClick={() => {
            if (sortBy === 'name' && sortDir === 'asc') { setSortBy('name'); setSortDir('desc') }
            else if (sortBy === 'name' && sortDir === 'desc') { setSortBy('count'); setSortDir('desc') }
            else if (sortBy === 'count' && sortDir === 'desc') { setSortBy('count'); setSortDir('asc') }
            else { setSortBy('name'); setSortDir('asc') }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 whitespace-nowrap"
          title="Cycle sort order"
        >
          {sortBy === 'name' && sortDir === 'asc' && <><ArrowUpDown size={12} /> Name A–Z</>}
          {sortBy === 'name' && sortDir === 'desc' && <><ArrowDown size={12} /> Name Z–A</>}
          {sortBy === 'count' && sortDir === 'desc' && <><ArrowDown size={12} /> Most used</>}
          {sortBy === 'count' && sortDir === 'asc' && <><ArrowUp size={12} /> Least used</>}
        </button>
        <button
          onClick={toggleAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
        >
          {allCollapsed ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
          {allCollapsed ? 'Expand all' : 'Collapse all'}
        </button>
        <button
          onClick={exportHierarchy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
          title="Export the complete category hierarchy as CSV"
        >
          <Download size={13} /> Export CSV
        </button>
        <button
          onClick={() => openAdd(null, 'expense')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={14} /> Add Category
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Migration banner */}
        {colonCount > 0 && (
          <div className="mx-4 mt-4 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <Wand2 size={15} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700 flex-1">
              <span className="font-semibold">{colonCount} categories</span> use "Parent:Child" format. Auto-organize them into a proper hierarchy?
            </p>
            <button
              onClick={handleMigrate}
              disabled={migrating}
              className="shrink-0 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 disabled:opacity-50"
            >
              {migrating ? 'Organising…' : 'Auto-organise'}
            </button>
          </div>
        )}

        <div className="p-4 space-y-5">
          {(['expense', 'income', 'transfer'] as const).map(type => {
            const sectionParents = parentsByType[type]
            const cfg = SECTION_CONFIG[type]
            if (sectionParents.length === 0 && !search) return null

            return (
              <div key={type}>
                {/* Section header */}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl mb-2 ${cfg.bg} ${cfg.border} border`}>
                  <cfg.icon size={13} className={cfg.color} />
                  <span className={`text-xs font-bold uppercase tracking-widest ${cfg.color}`}>{cfg.label}</span>
                  <span className={`ml-1 text-xs ${cfg.color} opacity-60`}>
                    {sectionParents.length} groups
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => openAdd(null, type)}
                    className={`flex items-center gap-1 text-xs ${cfg.color} hover:opacity-80 font-medium`}
                  >
                    <Plus size={11} /> Add
                  </button>
                </div>

                {sectionParents.length === 0 && search && (
                  <p className="text-xs text-gray-400 px-3 py-2">No {cfg.label.toLowerCase()} matching "{search}"</p>
                )}

                <div className="space-y-1">
                  {sectionParents.map(parent => {
                    const children = search
                      ? childrenOf(parent.id).filter(c =>
                          c.name.toLowerCase().includes(search.toLowerCase()) ||
                          parent.name.toLowerCase().includes(search.toLowerCase())
                        )
                      : childrenOf(parent.id)
                    const isOpen = !collapsed.has(parent.id) && !allCollapsed

                    return (
                      <div key={parent.id} className="bg-white rounded-xl border border-gray-200/80 overflow-hidden shadow-sm">
                        {/* Parent row */}
                        <div
                          className="flex items-center gap-2.5 px-4 py-3 hover:bg-gray-50/80 group cursor-pointer"
                          onClick={() => children.length > 0 && toggleCollapse(parent.id)}
                        >
                          <div className="w-4 h-4 flex items-center justify-center text-gray-400 shrink-0">
                            {children.length > 0
                              ? (isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
                              : <span className="w-3" />
                            }
                          </div>
                          <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: parent.color }} />
                          <span className="flex-1 text-sm font-semibold text-gray-800">{parent.name}</span>
                          {(() => {
                            const total = parentTxCount.get(parent.id) ?? 0
                            return total > 0 ? (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium tabular-nums">{total}</span>
                            ) : null
                          })()}
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => openAdd(parent.id, type)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                              title="Add sub-category"
                            >
                              <Plus size={12} />
                            </button>
                            <button
                              onClick={() => openEdit(parent)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleDelete(parent)}
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Children */}
                        {isOpen && children.map((child, i) => (
                          <div
                            key={child.id}
                            className={`flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50/80 group ${i === 0 ? 'border-t border-gray-100' : 'border-t border-gray-50'}`}
                          >
                            {/* Tree connector */}
                            <div className="w-4 flex items-center justify-center shrink-0 self-stretch">
                              <div className="w-px bg-gray-200 h-full" />
                            </div>
                            <div className="w-2 h-px bg-gray-200 shrink-0" />
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: child.color }} />
                            <span className="flex-1 text-sm text-gray-600">{child.name}</span>
                            {(child.txCount ?? 0) > 0 && (
                              <span className="text-xs text-gray-400 tabular-nums">{child.txCount}</span>
                            )}
                            {child.keywords && child.keywords.length > 0 && (
                              <div className="flex items-center gap-1 text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Tag size={9} />
                                <span>
                                  {child.keywords.slice(0, 3).join(', ')}
                                  {child.keywords.length > 3 ? ` +${child.keywords.length - 3}` : ''}
                                </span>
                              </div>
                            )}
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEdit(child)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50">
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => handleDelete(child)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {parents.length === 0 && !search && (
            <div className="text-center py-14 text-gray-400 text-sm">
              No categories yet.
            </div>
          )}
          {search && parentsByType.expense.length === 0 && parentsByType.income.length === 0 && parentsByType.transfer.length === 0 && (
            <div className="text-center py-14 text-gray-400 text-sm">
              No categories matching "{search}"
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <CategoryFormModal
          category={editing ?? undefined}
          parentId={parentId}
          defaultType={defaultType}
          categories={categories}
          onClose={() => setShowForm(false)}
          onSave={async data => {
            if (editing) {
              await api.categories.update(editing.id, data)
            } else {
              await api.categories.add(data)
            }
            onRefresh()
            setShowForm(false)
          }}
        />
      )}
    </div>
  )
}

function CategoryFormModal({ category, parentId, defaultType, categories, onClose, onSave }: {
  category?: Category
  parentId: string | null
  defaultType: 'expense' | 'income' | 'transfer'
  categories: Category[]
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(category?.color ?? PRESET_COLORS[0])
  const [pid, setPid] = useState<string | null>(category?.parentId ?? parentId)
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>((category?.type as any) ?? defaultType)
  const [saving, setSaving] = useState(false)

  const parents = categories.filter(c => !c.parentId)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), color, parentId: pid, type })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={category ? 'Edit Category' : 'New Category'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Groceries"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(['expense', 'income', 'transfer'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 py-1.5 text-xs font-medium capitalize transition-colors ${
                    type === t
                      ? t === 'expense' ? 'bg-rose-500 text-white' : t === 'income' ? 'bg-emerald-500 text-white' : 'bg-sky-500 text-white'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Parent</label>
            <select
              value={pid ?? ''}
              onChange={e => setPid(e.target.value || null)}
              className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None (top-level)</option>
              {parents.filter(p => p.id !== category?.id).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Color</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-gray-400">Custom:</span>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-8 h-6 rounded cursor-pointer border border-gray-200"
            />
            <span className="text-xs text-gray-400 font-mono">{color}</span>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : (category ? 'Update' : 'Add')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
