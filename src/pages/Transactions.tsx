import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Upload, Search, ChevronDown, ChevronRight, Trash2, Edit2, ArrowUp, ArrowDown, ArrowUpDown, ChevronsUpDown, ChevronsDownUp, TrendingUp, TrendingDown, ArrowLeftRight, Sparkles, SlidersHorizontal, X, Calendar, Scissors } from 'lucide-react'
import { api } from '../api'
import { fmt, formatDate, FREQUENCIES } from '../utils'
import { CategoryPill } from '../components/CategoryPill'
import { TransactionFormModal } from '../components/TransactionFormModal'
import { BulkTransactionEditModal } from '../components/BulkTransactionEditModal'
import { ImportBankModal } from '../components/ImportBankModal'
import { ImportAlzexButton } from '../components/ImportAlzexButton'
import type { Transaction, Account, Category, ScheduledTransaction, AccountLedgerSummary, ClassificationOptions } from '../types/finance'
import { transferReasonLabel } from '../lib/transfers'
import { canUseHouseholdBucket, emptyBucketLabel } from '../lib/classification'

interface Props {
  accounts: Account[]
  categories: Category[]
  selectedAccountId: string | null
  month: number
  year: number
  dateMode: 'month' | 'custom'
  customFrom: string
  customTo: string
  onRefreshAccounts: () => void
  onRefreshCategories: () => void
}

const TYPE_CONFIG = {
  income: { label: 'Income', Icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', dot: '#10b981' },
  expense: { label: 'Expenses', Icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', dot: '#f43f5e' },
  transfer: { label: 'Transfers', Icon: ArrowLeftRight, color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100', dot: '#0ea5e9' },
} as const

function needsCategory(transaction: Transaction): boolean {
  return transaction.categoryId === null || /^\?+$/.test(transaction.categoryFullName?.trim() ?? '')
}

function transactionDisplayAmount(transaction: Transaction, selectedAccountId: string | null): number {
  if (!transaction.isTransfer || !selectedAccountId) return transaction.amount
  if (transaction.targetAccountId === selectedAccountId) return Math.abs(transaction.amount)
  if (transaction.accountId === selectedAccountId) return -Math.abs(transaction.amount)
  return transaction.amount
}

function transactionBucketDisplay(transaction: Transaction): { label: string; muted: boolean } {
  if (transaction.isTransfer) return { label: 'Not applicable', muted: true }
  const purposeType = transaction.amount > 0 ? 'income' : 'expense'
  if (!canUseHouseholdBucket(transaction.contextName, purposeType)) {
    return { label: emptyBucketLabel(transaction.contextName, purposeType), muted: true }
  }
  return transaction.bucketName
    ? { label: transaction.bucketName, muted: false }
    : { label: '—', muted: true }
}

export function TransactionsPage({ accounts, categories, selectedAccountId, month, year, dateMode, customFrom, customTo, onRefreshAccounts, onRefreshCategories }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [ledgerSummary, setLedgerSummary] = useState<AccountLedgerSummary | null>(null)
  const [scheduledTxns, setScheduledTxns] = useState<ScheduledTransaction[]>([])
  const [processingScheduledId, setProcessingScheduledId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [groupBy, setGroupBy] = useState<'category' | 'context' | 'bucket' | 'date' | 'none'>('category')
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all')
  const [filterCatIds, setFilterCatIds] = useState<Set<string>>(new Set())
  const [needsCategoryOnly, setNeedsCategoryOnly] = useState(false)

  // Collapse state: 3 levels
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set())
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set())
  const [collapsedSubs, setCollapsedSubs] = useState<Set<string>>(new Set())
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())
  const [allParentsCollapsed, setAllParentsCollapsed] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const lastClickedIdx = useRef<number | null>(null)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [splitTx, setSplitTx] = useState<Transaction | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; tx: Transaction } | null>(null)
  const dragTxId = useRef<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [catHistory, setCatHistory] = useState<Array<{ description: string; categoryId: string }>>([])
  const [classificationOptions, setClassificationOptions] = useState<ClassificationOptions>({ contexts: [], buckets: [], categories: [] })

  useEffect(() => {
    api.classification.options().then(setClassificationOptions).catch(console.error)
  }, [])

  // ─── Undo / Redo ─────────────────────────────────────────────────────────────
  type HistoryEntry = { undo: () => Promise<void>; redo: () => Promise<void> }
  const undoStack = useRef<HistoryEntry[]>([])
  const redoStack = useRef<HistoryEntry[]>([])

  function pushHistory(entry: HistoryEntry) {
    undoStack.current = [...undoStack.current.slice(-49), entry]
    redoStack.current = []
  }

  async function doUndo() {
    const entry = undoStack.current.at(-1)
    if (!entry) return
    undoStack.current = undoStack.current.slice(0, -1)
    redoStack.current = [...redoStack.current, entry]
    await entry.undo()
    setRefreshKey(k => k + 1)
    onRefreshAccounts()
  }

  async function doRedo() {
    const entry = redoStack.current.at(-1)
    if (!entry) return
    redoStack.current = redoStack.current.slice(0, -1)
    undoStack.current = [...undoStack.current, entry]
    await entry.redo()
    setRefreshKey(k => k + 1)
    onRefreshAccounts()
  }

  const undoFnRef = useRef(doUndo)
  const redoFnRef = useRef(doRedo)
  useEffect(() => { undoFnRef.current = doUndo; redoFnRef.current = doRedo })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoFnRef.current() }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redoFnRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])


  const [sortCol, setSortCol] = useState<string>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [colWidths, setColWidths] = useState({ amount: 112, context: 132, purpose: 176, bucket: 120, date: 80, account: 132 })

  function startResize(col: keyof typeof colWidths, e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX, startW = colWidths[col]
    const onMove = (ev: MouseEvent) => setColWidths(w => ({ ...w, [col]: Math.max(60, startW + ev.clientX - startX) }))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'date' ? 'desc' : 'asc') }
  }

  function refresh() { setRefreshKey(k => k + 1) }

  async function processScheduled(item: ScheduledTransaction) {
    if (processingScheduledId) return
    const dateLabel = formatDate(item.nextDate)
    if (!confirm(`Process “${item.description}” for ${dateLabel}?\n\nThis creates the real transaction using its scheduled run date and advances the schedule.`)) return
    setProcessingScheduledId(item.id)
    try {
      await api.scheduled.process(item.id)
      refresh()
      onRefreshAccounts()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not process this scheduled transaction.')
    } finally {
      setProcessingScheduledId(null)
    }
  }

  useEffect(() => {
    const onTransactionsChanged = () => setRefreshKey(key => key + 1)
    window.addEventListener('rangels:transactions-changed', onTransactionsChanged)
    return () => window.removeEventListener('rangels:transactions-changed', onTransactionsChanged)
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      try {
        const dateFilter = dateMode === 'custom'
          ? { dateFrom: customFrom || undefined, dateTo: customTo || undefined }
          : { month, year }
        const data = await api.transactions.list({ ...dateFilter, accountId: selectedAccountId ?? undefined, search: debouncedSearch || undefined })
        if (!cancelled) { setTransactions(data); setSelected(new Set()); lastClickedIdx.current = null }
        if (dateMode === 'month' && !debouncedSearch) {
          const previous = month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year }
          const next = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year }
          void api.transactions.list({ ...previous, accountId: selectedAccountId ?? undefined }).catch(() => {})
          void api.transactions.list({ ...next, accountId: selectedAccountId ?? undefined }).catch(() => {})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [month, year, dateMode, customFrom, customTo, selectedAccountId, debouncedSearch, refreshKey])

  useEffect(() => {
    let cancelled = false
    if (!selectedAccountId) {
      setLedgerSummary(null)
      return
    }
    const period = dateMode === 'custom'
      ? { dateFrom: customFrom || undefined, dateTo: customTo || undefined }
      : { month, year }
    api.transactions.accountLedgerSummary(selectedAccountId, period)
      .then(summary => { if (!cancelled) setLedgerSummary(summary) })
      .catch(() => { if (!cancelled) setLedgerSummary(null) })
    return () => { cancelled = true }
  }, [month, year, dateMode, customFrom, customTo, selectedAccountId, refreshKey])

  useEffect(() => {
    api.transactions.categorizedDescriptions().then(setCatHistory).catch(() => {})
  }, [refreshKey])

  useEffect(() => {
    api.scheduled.list().then(all => {
      const periodFrom = dateMode === 'custom'
        ? (customFrom || '')
        : `${year}-${String(month).padStart(2, '0')}-01`
      const periodTo = dateMode === 'custom'
        ? (customTo || '')
        : `${year}-${String(month).padStart(2, '0')}-31`
      setScheduledTxns(all.filter(s =>
        s.isActive &&
        s.nextDate >= periodFrom && s.nextDate <= periodTo &&
        (!selectedAccountId || s.accountId === selectedAccountId)
      ))
    }).catch(() => {})
  }, [month, year, dateMode, customFrom, customTo, selectedAccountId, refreshKey])

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', onKey) }
  }, [ctxMenu])

  const income = transactions.filter(t => t.amount > 0 && !t.isTransfer && t.status === 'C').reduce((s, t) => s + t.amount, 0)
  const expenses = transactions.filter(t => t.amount < 0 && !t.isTransfer && t.status === 'C').reduce((s, t) => s + t.amount, 0)
  const transfers = transactions.filter(t => t.isTransfer && t.status === 'C').reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)

  const sorted = useMemo(() => {
    const getVal = (t: Transaction) => {
      if (sortCol === 'amount') return t.amount
      if (sortCol === 'date') return t.date
      if (sortCol === 'context') return t.contextName ?? ''
      if (sortCol === 'purpose') return t.isTransfer ? transferReasonLabel(t.transferReason) : (t.canonicalCategoryName ?? t.categoryName ?? '')
      if (sortCol === 'bucket') return t.bucketName ?? ''
      if (sortCol === 'account') return t.accountName ?? ''
      return t.description
    }
    return [...transactions].sort((a, b) => {
      const cmp = getVal(a) < getVal(b) ? -1 : getVal(a) > getVal(b) ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [transactions, sortCol, sortDir])

  const filtered = useMemo(() => {
    let result = sorted
    if (filterType === 'income') result = result.filter(t => t.amount > 0 && !t.isTransfer)
    else if (filterType === 'expense') result = result.filter(t => t.amount < 0 && !t.isTransfer)
    else if (filterType === 'transfer') result = result.filter(t => t.isTransfer)
    if (filterCatIds.size > 0) result = result.filter(t => t.categoryId != null && filterCatIds.has(t.categoryId))
    if (needsCategoryOnly) result = result.filter(needsCategory)
    return result
  }, [sorted, filterType, filterCatIds, needsCategoryOnly])

  const needsCategoryCount = transactions.filter(t => needsCategory(t) && !t.isTransfer).length

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  const typeSections = useMemo(() => {
    if (!['category', 'context', 'bucket'].includes(groupBy)) return []
    const sections = groupBy === 'category'
      ? buildHierarchyGroups(filtered, catMap, selectedAccountId)
      : buildDimensionGroups(filtered, groupBy as 'context' | 'bucket', selectedAccountId)
    if (sortCol === 'amount') {
      for (const ts of sections) {
        ts.groups.sort((a, b) => {
          const diff = Math.abs(b.total) - Math.abs(a.total)
          return sortDir === 'asc' ? -diff : diff
        })
      }
    }
    return sections
  }, [filtered, catMap, groupBy, sortCol, sortDir, selectedAccountId])

  const dateGroups = useMemo(() => {
    if (groupBy !== 'date') return []
    const map = new Map<string, { key: string; label: string; total: number; rows: Transaction[] }>()
    for (const t of filtered) {
      if (!map.has(t.date)) map.set(t.date, { key: t.date, label: formatDate(t.date), total: 0, rows: [] })
      const g = map.get(t.date)!; g.total += transactionDisplayAmount(t, selectedAccountId); g.rows.push(t)
    }
    return [...map.values()].sort((a, b) => b.key.localeCompare(a.key))
  }, [filtered, groupBy, selectedAccountId])

  // ─── Collapse helpers ────────────────────────────────────────────────────────

  function toggleCollapseAll() {
    if (allParentsCollapsed) {
      setCollapsedParents(new Set()); setAllParentsCollapsed(false)
    } else {
      const allKeys = new Set(typeSections.flatMap(ts => ts.groups.map(g => g.key)))
      setCollapsedParents(allKeys); setAllParentsCollapsed(true)
    }
  }

  const toggleType = (key: string) =>
    setCollapsedTypes(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n })
  const toggleParent = (key: string) =>
    setCollapsedParents(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); if (!n.has(key)) setAllParentsCollapsed(false); return n })
  const toggleSub = (pk: string, ck: string) => {
    const k = `${pk}__${ck}`
    setCollapsedSubs(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })
  }
  const toggleDate = (key: string) =>
    setCollapsedDates(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n })

  // ─── Selection ────────────────────────────────────────────────────────────

  function toggleSelect(id: string, shiftKey: boolean, _metaKey?: boolean) {
    void _metaKey
    const idx = sorted.findIndex(t => t.id === id)
    if (shiftKey && lastClickedIdx.current !== null) {
      const from = Math.min(lastClickedIdx.current, idx), to = Math.max(lastClickedIdx.current, idx)
      setSelected(s => { const n = new Set(s); sorted.slice(from, to + 1).forEach(t => n.add(t.id)); return n })
    } else {
      setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
      lastClickedIdx.current = idx
    }
  }

  function toggleSectionSelection(ids: string[]) {
    setSelected(current => {
      const next = new Set(current)
      const sectionSelected = ids.length > 0 && ids.every(id => next.has(id))
      ids.forEach(id => sectionSelected ? next.delete(id) : next.add(id))
      return next
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this transaction?')) return
    await api.transactions.delete(id); refresh(); onRefreshAccounts()
  }
  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} transaction(s)?`)) return
    await Promise.all([...selected].map(id => api.transactions.delete(id))); refresh(); onRefreshAccounts()
  }
  async function handleBulkCategory(categoryId: string | null) {
    const purposeIds = [...selected].filter(id => !transactions.find(t => t.id === id)?.isTransfer)
    if (purposeIds.length === 0) return
    const prevCats = purposeIds.map(id => ({ id, prev: transactions.find(t => t.id === id)?.categoryId ?? null }))
    await api.transactions.bulkCategory(purposeIds, categoryId)
    pushHistory({
      undo: async () => { await Promise.all(prevCats.map(({ id, prev }) => api.transactions.update(id, { categoryId: prev }))) },
      redo: async () => { await api.transactions.bulkCategory(prevCats.map(p => p.id), categoryId) }
    })
    setSelected(new Set()); refresh()
  }
  async function handleInlineCategory(txId: string, categoryId: string | null) {
    if (selected.has(txId) && selected.size > 1) {
      const prevCats = [...selected].map(id => ({ id, prev: transactions.find(t => t.id === id)?.categoryId ?? null }))
      await api.transactions.bulkCategory([...selected], categoryId)
      pushHistory({
        undo: async () => { await Promise.all(prevCats.map(({ id, prev }) => api.transactions.update(id, { categoryId: prev }))) },
        redo: async () => { await api.transactions.bulkCategory(prevCats.map(p => p.id), categoryId) }
      })
      setSelected(new Set())
    } else {
      const prevCategoryId = transactions.find(t => t.id === txId)?.categoryId ?? null
      await api.transactions.update(txId, { categoryId })
      pushHistory({
        undo: async () => { await api.transactions.update(txId, { categoryId: prevCategoryId }) },
        redo: async () => { await api.transactions.update(txId, { categoryId }) }
      })
    }
    refresh()
  }

  async function handleInlineContext(tx: Transaction, contextId: string | null) {
    const previous = { contextId: tx.contextId ?? null, bucketId: tx.bucketId ?? null }
    const contextName = classificationOptions.contexts.find(option => option.id === contextId)?.name
    const purposeType = tx.amount > 0 ? 'income' : 'expense'
    const bucketId = tx.isTransfer || !canUseHouseholdBucket(contextName, purposeType) ? null : tx.bucketId ?? null
    await api.transactions.update(tx.id, { contextId, bucketId })
    pushHistory({
      undo: async () => { await api.transactions.update(tx.id, previous) },
      redo: async () => { await api.transactions.update(tx.id, { contextId, bucketId }) },
    })
    refresh()
  }

  async function handleInlineBucket(tx: Transaction, bucketId: string | null) {
    const previousBucketId = tx.bucketId ?? null
    await api.transactions.update(tx.id, { bucketId })
    pushHistory({
      undo: async () => { await api.transactions.update(tx.id, { bucketId: previousBucketId }) },
      redo: async () => { await api.transactions.update(tx.id, { bucketId }) },
    })
    refresh()
  }

  const allSelected = filtered.length > 0 && filtered.every(transaction => selected.has(transaction.id))
  const someSelected = selected.size > 0
  const selectedPurposeCount = [...selected].filter(id => !transactions.find(transaction => transaction.id === id)?.isTransfer).length
  const selectedTotal = transactions
    .filter(transaction => selected.has(transaction.id))
    .reduce((total, transaction) => total + transactionDisplayAmount(transaction, selectedAccountId), 0)

  const TYPE_FILTERS = [
    { key: 'all', label: 'All' }, { key: 'income', label: 'Income' },
    { key: 'expense', label: 'Expenses' }, { key: 'transfer', label: 'Transfers' },
  ] as const

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions…"
            className="w-full pl-8 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              aria-label="Clear transaction search"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-600 bg-gray-50 focus:outline-none">
          <option value="category">Group by Purpose</option>
          <option value="context">Group by Context</option>
          <option value="bucket">Group by Bucket</option>
          <option value="date">Group by Date</option>
          <option value="none">No grouping</option>
        </select>
        <CategoryFilterButton
          categories={categories}
          selected={filterCatIds}
          onChange={value => { setFilterCatIds(value); setNeedsCategoryOnly(false) }}
        />
        {needsCategoryCount > 0 && (
          <button
            onClick={() => { setNeedsCategoryOnly(value => !value); setFilterCatIds(new Set()) }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${needsCategoryOnly ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Needs purpose <span className="text-amber-500">{needsCategoryCount}</span>
          </button>
        )}
        {['category', 'context', 'bucket'].includes(groupBy) && (
          <button onClick={toggleCollapseAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
            {allParentsCollapsed ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
            {allParentsCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        <div className="flex-1" />
        {someSelected && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{selected.size} selected</span>
            {selectedPurposeCount > 0 && <CategoryQuickPick categories={categories} onPick={handleBulkCategory} />}
            {selected.size > 1 && <button onClick={() => setShowBulkEdit(true)} className="px-2 py-1 text-xs border border-blue-300 text-blue-700 rounded hover:bg-blue-50">Bulk Edit</button>}
            <button onClick={handleBulkDelete} className="text-red-500 px-2 py-1 text-xs rounded hover:bg-red-50">Delete</button>
          </div>
        )}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs bg-gray-50">
          {TYPE_FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilterType(f.key)}
              className={`px-3 py-1.5 transition-colors ${filterType === f.key
                ? f.key === 'income' ? 'bg-emerald-500 text-white font-semibold'
                  : f.key === 'expense' ? 'bg-rose-500 text-white font-semibold'
                  : f.key === 'transfer' ? 'bg-sky-500 text-white font-semibold'
                  : 'bg-white text-gray-800 font-medium shadow-sm'
                : 'text-gray-500 hover:bg-gray-50'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-gray-200 mx-1" />
        <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
          <ImportAlzexButton joined onDone={() => { refresh(); onRefreshAccounts(); onRefreshCategories() }} />
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border-l border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            <Upload size={14} /> Import CSV
          </button>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          <Plus size={14} /> Add
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex items-center px-4 bg-slate-50/70 border-y border-gray-200 shrink-0">
        {selectedAccountId && ledgerSummary ? (
          <>
            <SummaryMetric label="Income" value={ledgerSummary.income} tone="income" />
            <SummaryMetric label="Expenses" value={ledgerSummary.expenses} tone="expense" absolute />
            <SummaryMetric label="Transfers" value={ledgerSummary.transfersIn - ledgerSummary.transfersOut} tone="transfer" signed />
            <SummaryMetric label="Net" value={ledgerSummary.closingBalance} signed info="Includes the balance brought into this period. For the full date range, this matches the selected account balance." />
          </>
        ) : (
          <>
            <SummaryMetric label="Income" value={income} tone="income" />
            <SummaryMetric label="Expenses" value={expenses} tone="expense" absolute />
            <SummaryMetric label="Transfers" value={transfers} tone="transfer" />
            <SummaryMetric label="Net" value={income + expenses} signed />
          </>
        )}
        <div className="flex-1" />
        {someSelected && (
          <div className="mr-4 flex items-baseline gap-2 border-l border-slate-200 pl-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Selected total</span>
            <span className={`text-sm font-bold tabular-nums ${selectedTotal > 0 ? 'text-emerald-600' : selectedTotal < 0 ? 'text-slate-700' : 'text-slate-400'}`}>{fmt(selectedTotal, true)}</span>
          </div>
        )}
        <span className="text-xs text-gray-300">{filtered.length} transactions</span>
      </div>

      {/* Transaction list */}
      <div className="flex-1 overflow-auto">
        {loading && <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>}
        {!loading && transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <p className="text-sm">No transactions this period</p>
            <button onClick={() => setShowAdd(true)} className="mt-3 text-blue-600 text-sm hover:underline">Add one</button>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-1.5 bg-white border-b-2 border-gray-200 sticky top-0 select-none z-20">
            <input type="checkbox" checked={allSelected}
              onChange={() => allSelected ? setSelected(current => { const next = new Set(current); filtered.forEach(transaction => next.delete(transaction.id)); return next }) : setSelected(current => { const next = new Set(current); filtered.forEach(transaction => next.add(transaction.id)); return next })}
              className="rounded shrink-0" />
            <ColHeader label="Description" col="description" flex sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
            <ColHeader label="Amount" col="amount" width={colWidths.amount} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} onResize={e => startResize('amount', e)} />
            <ColHeader label="Context" col="context" width={colWidths.context} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} onResize={e => startResize('context', e)} />
            <ColHeader label="Purpose" col="purpose" width={colWidths.purpose} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} onResize={e => startResize('purpose', e)} />
            <ColHeader label="Bucket" col="bucket" width={colWidths.bucket} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} onResize={e => startResize('bucket', e)} />
            <ColHeader label="Date" col="date" width={colWidths.date} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} onResize={e => startResize('date', e)} />
            <ColHeader label="Account" col="account" width={colWidths.account} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} onResize={e => startResize('account', e)} />
            <div className="w-16 shrink-0" />
          </div>
        )}

        {/* ── 3-level category hierarchy ── */}
        {!loading && ['category', 'context', 'bucket'].includes(groupBy) && typeSections.map(ts => {
          const cfg = TYPE_CONFIG[ts.type]
          const typeCollapsed = collapsedTypes.has(ts.type)
          const sectionIds = ts.groups.flatMap(group => group.children.flatMap(child => child.rows.map(row => row.id)))
          const sectionSelectedCount = sectionIds.filter(id => selected.has(id)).length
          const sectionAllSelected = sectionIds.length > 0 && sectionSelectedCount === sectionIds.length

          return (
            <div key={ts.type}>
              {/* Level 1: Type section header */}
              <div
                className={`w-full flex items-center gap-2 px-4 py-1.5 border-b border-t transition-colors sticky top-[37px] z-[15] ${cfg.bg} ${cfg.border}`}
              >
                <input
                  type="checkbox"
                  checked={sectionAllSelected}
                  ref={element => { if (element) element.indeterminate = sectionSelectedCount > 0 && !sectionAllSelected }}
                  onChange={() => toggleSectionSelection(sectionIds)}
                  className="rounded shrink-0 cursor-pointer"
                  aria-label={`Select all ${cfg.label.toLowerCase()}`}
                />
                <button onClick={() => toggleType(ts.type)} className="flex min-w-0 items-center gap-2 text-left">
                  {typeCollapsed ? <ChevronRight size={12} className={`${cfg.color} shrink-0`} /> : <ChevronDown size={12} className={`${cfg.color} shrink-0`} />}
                  <cfg.Icon size={12} className={`${cfg.color} shrink-0`} />
                  <span className={`text-xs font-bold uppercase tracking-widest ${cfg.color}`}>{cfg.label}</span>
                  <span className={`text-xs ${cfg.color} opacity-60`}>{ts.groups.length} groups · {sectionIds.length} transactions</span>
                </button>
                <span className="flex-1" />
                {sectionSelectedCount > 0 && <span className={`text-[10px] font-medium ${cfg.color}`}>{sectionSelectedCount} selected</span>}
                <span className={`text-sm font-bold ${cfg.color}`}>{fmt(ts.total, ts.type === 'transfer')}</span>
              </div>

              {!typeCollapsed && ts.groups.map(group => {
                const parentCollapsed = collapsedParents.has(group.key)
                const groupIds = group.children.flatMap(child => child.rows.map(row => row.id))
                const groupSelectedCount = groupIds.filter(id => selected.has(id)).length
                const groupAllSelected = groupIds.length > 0 && groupSelectedCount === groupIds.length

                return (
                  <div key={group.key}>
                    {/* Level 2: Parent category header */}
                    <div
                      onDragOver={e => { if (groupBy === 'category') { e.preventDefault(); setDragOverKey(group.key) } }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null) }}
                      onDrop={e => { if (groupBy === 'category') { e.preventDefault(); setDragOverKey(null); if (dragTxId.current !== null && group.catId !== null) { handleInlineCategory(dragTxId.current, group.catId); dragTxId.current = null } } }}
                      className={`w-full flex items-center gap-2 pl-8 pr-4 py-2.5 transition-colors border-y shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ${group.key === '__none' ? 'border-amber-200/70 bg-amber-50/80 hover:bg-amber-100/70' : 'border-slate-200/80 bg-slate-100/80 hover:bg-slate-200/70'} ${dragOverKey === group.key ? 'ring-2 ring-inset ring-blue-400' : ''}`}
                      style={{ borderLeft: group.color ? `3px solid ${group.color}` : '3px solid #e5e7eb' }}
                    >
                      <input
                        type="checkbox"
                        checked={groupAllSelected}
                        ref={element => { if (element) element.indeterminate = groupSelectedCount > 0 && !groupAllSelected }}
                        onChange={() => toggleSectionSelection(groupIds)}
                        className="rounded shrink-0 cursor-pointer"
                        aria-label={`Select all ${group.label} transactions`}
                      />
                      <button onClick={() => toggleParent(group.key)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        {parentCollapsed ? <ChevronRight size={12} className="text-gray-400 shrink-0" /> : <ChevronDown size={12} className="text-gray-400 shrink-0" />}
                        {group.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />}
                        <span className="flex-1 text-xs font-semibold text-slate-700 text-left tracking-wide">{group.label}</span>
                      </button>
                      {!parentCollapsed && <span className="text-xs text-gray-300 mr-2">{group.txCount} txns</span>}
                      {groupSelectedCount > 0 && <span className="text-[10px] font-medium text-blue-600">{groupSelectedCount} selected</span>}
                      <span className={`text-sm font-bold ${group.total > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                        {fmt(group.total, ts.type === 'transfer')}
                      </span>
                    </div>

                    {!parentCollapsed && group.children.map(child => {
                      const subKey = `${group.key}__${child.key}`
                      const subCollapsed = collapsedSubs.has(subKey)
                      const childIds = child.rows.map(row => row.id)
                      const childSelectedCount = childIds.filter(id => selected.has(id)).length
                      const childAllSelected = childIds.length > 0 && childSelectedCount === childIds.length

                      return (
                        <div key={child.key}>
                          {/* Level 3: Child category header (only when multiple children exist) */}
                          {!group.isSingleLevel && (
                            <div
                              className="w-full flex items-center gap-2 pl-14 pr-4 py-2 bg-slate-50/80 hover:bg-slate-100 transition-colors border-b border-slate-200/70"
                            >
                              <input
                                type="checkbox"
                                checked={childAllSelected}
                                ref={element => { if (element) element.indeterminate = childSelectedCount > 0 && !childAllSelected }}
                                onChange={() => toggleSectionSelection(childIds)}
                                className="rounded shrink-0 cursor-pointer"
                                aria-label={`Select all ${child.label} transactions`}
                              />
                              <button onClick={() => toggleSub(group.key, child.key)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                {subCollapsed ? <ChevronRight size={11} className="text-gray-300 shrink-0" /> : <ChevronDown size={11} className="text-gray-300 shrink-0" />}
                                {child.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: child.color }} />}
                                <span className="flex-1 text-xs font-medium text-gray-500 text-left">{child.label}</span>
                              </button>
                              <span className="text-xs text-gray-300 mr-2">{child.rows.length}</span>
                              {childSelectedCount > 0 && <span className="text-[10px] font-medium text-blue-600">{childSelectedCount} selected</span>}
                              <span className={`text-xs font-semibold ${child.total > 0 ? 'text-emerald-500' : 'text-gray-500'}`}>
                                {fmt(child.total, ts.type === 'transfer')}
                              </span>
                            </div>
                          )}

                          {!subCollapsed && child.rows.map(tx => (
                            <TransactionRow key={tx.id} tx={tx} selected={selected.has(tx.id)} selectedCount={selected.size} selectedAccountId={selectedAccountId}
                              categories={categories} classificationOptions={classificationOptions} colWidths={colWidths}
                              indent={group.isSingleLevel ? 'single' : 'double'}
                              onSelect={(shiftKey, metaKey) => toggleSelect(tx.id, shiftKey, metaKey)}
                              onEdit={() => setEditTx(tx)}
                              onDelete={() => handleDelete(tx.id)}
                              onCategoryChange={catId => handleInlineCategory(tx.id, catId)}
                              onContextChange={contextId => handleInlineContext(tx, contextId)}
                              onBucketChange={bucketId => handleInlineBucket(tx, bucketId)}
                              onRightClick={e => setCtxMenu({ x: e.clientX, y: e.clientY, tx })}
                              onDragStart={() => { dragTxId.current = tx.id }}
                              onDragEnd={() => { dragTxId.current = null }}
                            />
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* ── Date grouping ── */}
        {!loading && groupBy === 'date' && dateGroups.map(group => {
          const isCollapsed = collapsedDates.has(group.key)
          return (
            <div key={group.key}>
              <button onClick={() => toggleDate(group.key)}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-100/80 border-b border-gray-100"
                style={{ borderLeft: '3px solid #e5e7eb', background: 'rgba(249,250,251,0.9)' }}>
                {isCollapsed ? <ChevronRight size={12} className="text-gray-400 shrink-0" /> : <ChevronDown size={12} className="text-gray-400 shrink-0" />}
                <span className="flex-1 text-xs font-bold text-gray-700 text-left tracking-wide">{group.label}</span>
                <span className={`text-sm font-bold ${group.total > 0 ? 'text-emerald-600' : group.total < 0 ? 'text-gray-800' : 'text-sky-600'}`}>
                  {fmt(group.total)}
                </span>
              </button>
              {!isCollapsed && group.rows.map(tx => (
                <TransactionRow key={tx.id} tx={tx} selected={selected.has(tx.id)} selectedCount={selected.size} selectedAccountId={selectedAccountId}
                  categories={categories} classificationOptions={classificationOptions} colWidths={colWidths} indent="none"
                  onSelect={(shiftKey, metaKey) => toggleSelect(tx.id, shiftKey, metaKey)}
                  onEdit={() => setEditTx(tx)}
                  onDelete={() => handleDelete(tx.id)}
                  onCategoryChange={catId => handleInlineCategory(tx.id, catId)}
                  onContextChange={contextId => handleInlineContext(tx, contextId)}
                  onBucketChange={bucketId => handleInlineBucket(tx, bucketId)}
                  onRightClick={e => setCtxMenu({ x: e.clientX, y: e.clientY, tx })}
                  onDragStart={() => { dragTxId.current = tx.id }}
                  onDragEnd={() => { dragTxId.current = null }}
                />
              ))}
            </div>
          )
        })}
        {/* ── No grouping ── */}
        {!loading && groupBy === 'none' && filtered.map(tx => (
          <TransactionRow key={tx.id} tx={tx} selected={selected.has(tx.id)} selectedCount={selected.size} selectedAccountId={selectedAccountId}
            categories={categories} classificationOptions={classificationOptions} colWidths={colWidths} indent="none"
            onSelect={(shiftKey, metaKey) => toggleSelect(tx.id, shiftKey, metaKey)}
            onEdit={() => setEditTx(tx)}
            onDelete={() => handleDelete(tx.id)}
            onCategoryChange={catId => handleInlineCategory(tx.id, catId)}
            onContextChange={contextId => handleInlineContext(tx, contextId)}
            onBucketChange={bucketId => handleInlineBucket(tx, bucketId)}
            onRightClick={e => setCtxMenu({ x: e.clientX, y: e.clientY, tx })}
            onDragStart={() => { dragTxId.current = tx.id }}
            onDragEnd={() => { dragTxId.current = null }}
          />
        ))}

        {/* ── Upcoming scheduled (ghost rows) ── */}
        {!loading && scheduledTxns.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-4 py-2 border-y border-dashed border-gray-200 bg-gray-50/80 text-gray-400 text-[10px] font-semibold uppercase tracking-widest sticky top-[37px] z-[14]">
              <Calendar size={11} className="shrink-0" />
              Upcoming scheduled
              <span className="ml-auto font-normal normal-case tracking-normal text-gray-300">Not counted in totals</span>
            </div>
            {scheduledTxns.sort((a, b) => a.nextDate.localeCompare(b.nextDate)).map(s => (
              <ScheduledGhostRow key={s.id} s={s} colWidths={colWidths} processing={processingScheduledId === s.id} onProcess={() => void processScheduled(s)} />
            ))}
          </div>
        )}
      </div>

      {ctxMenu && (
        <TxContextMenu
          tx={ctxMenu.tx} x={ctxMenu.x} y={ctxMenu.y}
          categories={categories} catHistory={catHistory}
          onClose={() => setCtxMenu(null)}
          onCategoryPick={catId => { handleInlineCategory(ctxMenu.tx.id, catId); setCtxMenu(null) }}
          onEdit={() => { setEditTx(ctxMenu.tx); setCtxMenu(null) }}
          onSplit={() => { setSplitTx(ctxMenu.tx); setCtxMenu(null) }}
          onDelete={() => { handleDelete(ctxMenu.tx.id); setCtxMenu(null) }}
        />
      )}
      {splitTx && (
        <SplitTransactionModal
          transaction={splitTx}
          onClose={() => setSplitTx(null)}
          onSplit={async parts => {
            await api.transactions.split(splitTx.id, parts)
            setSplitTx(null)
            refresh()
            onRefreshAccounts()
          }}
        />
      )}
      {(showAdd || editTx) && (
        <TransactionFormModal transaction={editTx ?? undefined} accounts={accounts} categories={categories} defaultAccountId={selectedAccountId}
          onClose={() => { setShowAdd(false); setEditTx(null) }}
          onSave={async data => {
            if (editTx) {
              const txId = editTx.id
              const prev = { description: editTx.description, amount: editTx.amount, date: editTx.date, categoryId: editTx.categoryId, accountId: editTx.accountId, targetAccountId: editTx.targetAccountId ?? null, isTransfer: editTx.isTransfer ?? false, comment: editTx.comment, status: editTx.status }
              await api.transactions.update(txId, data)
              pushHistory({
                undo: async () => { await api.transactions.update(txId, prev) },
                redo: async () => { await api.transactions.update(txId, data) }
              })
            } else {
              await api.transactions.add(data)
            }
            refresh(); onRefreshAccounts(); setShowAdd(false); setEditTx(null)
          }}
        />
      )}
      {showBulkEdit && selected.size > 1 && (
        <BulkTransactionEditModal
          transactions={transactions.filter(transaction => selected.has(transaction.id))}
          accounts={accounts}
          onClose={() => setShowBulkEdit(false)}
          onSave={async changes => {
            const ids = [...selected]
            const changed = await api.transactions.bulkEdit(ids, changes)
            if (changed !== ids.length) throw new Error(`Only ${changed} of ${ids.length} transactions could be updated. Check transfer source and target accounts.`)
            setShowBulkEdit(false)
            setSelected(new Set())
            refresh()
            onRefreshAccounts()
          }}
        />
      )}
      {showImport && (
        <ImportBankModal accounts={accounts} categories={categories}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); refresh(); onRefreshAccounts() }}
        />
      )}
    </div>
  )
}

// ─── Hierarchy builder (3 levels: type → parent category → child category) ───

interface HierarchyChild {
  key: string; label: string; color: string | null; catId: string | null; total: number; rows: Transaction[]
}
interface HierarchyGroup {
  key: string; label: string; color: string | null; catId: string | null
  total: number; txCount: number; isSingleLevel: boolean; children: HierarchyChild[]
}
interface TypeSection {
  type: 'income' | 'expense' | 'transfer'; total: number; groups: HierarchyGroup[]
}

function buildHierarchyGroups(transactions: Transaction[], catMap: Map<string, Category>, selectedAccountId: string | null): TypeSection[] {
  const typeSections = new Map<string, TypeSection>()

  function getTxType(tx: Transaction): 'income' | 'expense' | 'transfer' {
    if (tx.isTransfer) return 'transfer'
    return tx.amount > 0 ? 'income' : 'expense'
  }

  function getParentChild(tx: Transaction): { parentKey: string; parentLabel: string; parentColor: string | null; parentCatId: string | null; childKey: string; childLabel: string; childColor: string | null; childCatId: string | null; isSingleLevel: boolean } {
    if (tx.isTransfer) {
      const reason = tx.transferReason ?? 'account_movement'
      const label = transferReasonLabel(reason)
      return { parentKey: `transfer_${reason}`, parentLabel: label, parentColor: '#0ea5e9', parentCatId: null, childKey: `transfer_${reason}`, childLabel: label, childColor: '#0ea5e9', childCatId: null, isSingleLevel: true }
    }
    if (!tx.categoryId || needsCategory(tx)) return { parentKey: '__none', parentLabel: 'Needs purpose', parentColor: '#f59e0b', parentCatId: null, childKey: '__none', childLabel: 'Needs purpose', childColor: '#f59e0b', childCatId: null, isSingleLevel: true }

    const cat = catMap.get(tx.categoryId)
    if (!cat) return { parentKey: '__none', parentLabel: 'Needs purpose', parentColor: '#f59e0b', parentCatId: null, childKey: '__none', childLabel: 'Needs purpose', childColor: '#f59e0b', childCatId: null, isSingleLevel: true }

    // Proper DB hierarchy
    if (cat.parentId) {
      const parent = catMap.get(cat.parentId)
      return { parentKey: `p_${cat.parentId}`, parentLabel: parent?.name ?? cat.parentName ?? 'Unknown', parentColor: parent?.color ?? null, parentCatId: cat.parentId, childKey: `c_${cat.id}`, childLabel: cat.name, childColor: cat.color, childCatId: cat.id, isSingleLevel: false }
    }

    // Canonical purposes use their family as the visible top-level group.
    if (cat.parentName) {
      return { parentKey: `family_${cat.parentName}`, parentLabel: cat.parentName, parentColor: cat.color, parentCatId: null, childKey: `c_${cat.id}`, childLabel: cat.name, childColor: cat.color, childCatId: cat.id, isSingleLevel: false }
    }

    // Colon-named flat category (pre-migration): "Parent:Child"
    const colonIdx = cat.name.indexOf(':')
    if (colonIdx > 0) {
      return { parentKey: `colon_${cat.name.slice(0, colonIdx).trim()}`, parentLabel: cat.name.slice(0, colonIdx).trim(), parentColor: cat.color, parentCatId: null, childKey: `c_${cat.id}`, childLabel: cat.name.slice(colonIdx + 1).trim(), childColor: cat.color, childCatId: cat.id, isSingleLevel: false }
    }

    // Root-level, no children
    return { parentKey: `p_${cat.id}`, parentLabel: cat.name, parentColor: cat.color, parentCatId: cat.id, childKey: `p_${cat.id}`, childLabel: cat.name, childColor: cat.color, childCatId: cat.id, isSingleLevel: true }
  }

  for (const tx of transactions) {
    const txType = getTxType(tx)
    const e = getParentChild(tx)

    if (!typeSections.has(txType)) typeSections.set(txType, { type: txType, total: 0, groups: [] })
    const section = typeSections.get(txType)!
    const displayAmount = transactionDisplayAmount(tx, selectedAccountId)
    section.total += displayAmount

    let pg = section.groups.find(g => g.key === e.parentKey)
    if (!pg) { pg = { key: e.parentKey, label: e.parentLabel, color: e.parentColor, catId: e.parentCatId, total: 0, txCount: 0, isSingleLevel: e.isSingleLevel, children: [] }; section.groups.push(pg) }
    if (!e.isSingleLevel) pg.isSingleLevel = false
    pg.total += displayAmount; pg.txCount++

    let child = pg.children.find(c => c.key === e.childKey)
    if (!child) { child = { key: e.childKey, label: e.childLabel, color: e.childColor, catId: e.childCatId, total: 0, rows: [] }; pg.children.push(child) }
    child.total += displayAmount; child.rows.push(tx)
  }

  // Sort groups within each section alphabetically
  for (const section of typeSections.values()) {
    section.groups.sort((a, b) => {
      if (a.key === '__none') return 1; if (b.key === '__none') return -1
      return a.label.localeCompare(b.label)
    })
  }

  // Return in order: income, expense, transfer
  return (['income', 'expense', 'transfer'] as const)
    .map(t => typeSections.get(t))
    .filter(Boolean) as TypeSection[]
}

function buildDimensionGroups(transactions: Transaction[], dimension: 'context' | 'bucket', selectedAccountId: string | null): TypeSection[] {
  const sections = new Map<TypeSection['type'], TypeSection>()
  for (const transaction of transactions) {
    const type: TypeSection['type'] = transaction.isTransfer ? 'transfer' : transaction.amount > 0 ? 'income' : 'expense'
    const displayAmount = transactionDisplayAmount(transaction, selectedAccountId)
    const bucket = transactionBucketDisplay(transaction)
    const label = dimension === 'context'
      ? transaction.contextName ?? 'Not classified'
      : bucket.label === '—' ? 'Not classified' : bucket.label
    const key = `${dimension}_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
    if (!sections.has(type)) sections.set(type, { type, total: 0, groups: [] })
    const section = sections.get(type)!
    section.total += displayAmount
    let group = section.groups.find(item => item.key === key)
    if (!group) {
      group = { key, label, color: TYPE_CONFIG[type].dot, catId: null, total: 0, txCount: 0, isSingleLevel: true, children: [{ key, label, color: TYPE_CONFIG[type].dot, catId: null, total: 0, rows: [] }] }
      section.groups.push(group)
    }
    group.total += displayAmount
    group.txCount += 1
    group.children[0].total += displayAmount
    group.children[0].rows.push(transaction)
  }
  for (const section of sections.values()) section.groups.sort((left, right) => left.label.localeCompare(right.label))
  return (['income', 'expense', 'transfer'] as const).map(type => sections.get(type)).filter(Boolean) as TypeSection[]
}

// ─── Transaction row ─────────────────────────────────────────────────────────

type ColWidths = { amount: number; context: number; purpose: number; bucket: number; date: number; account: number }

function TransactionRow({ tx, selected, selectedCount, selectedAccountId, categories, classificationOptions, colWidths, indent = 'single', onSelect, onEdit, onDelete, onCategoryChange, onContextChange, onBucketChange, onRightClick, onDragStart, onDragEnd }: {
  tx: Transaction; selected: boolean; selectedCount: number; categories: Category[]; classificationOptions: ClassificationOptions
  selectedAccountId: string | null
  colWidths: ColWidths; indent?: 'none' | 'single' | 'double'
  onSelect: (shiftKey: boolean, metaKey?: boolean) => void; onEdit: () => void; onDelete: () => void
  onCategoryChange: (catId: string | null) => void
  onContextChange: (contextId: string | null) => void
  onBucketChange: (bucketId: string | null) => void
  onRightClick: (e: React.MouseEvent) => void
  onDragStart?: () => void; onDragEnd?: () => void
}) {
  const [catOpen, setCatOpen] = useState(false)
  const [q, setQ] = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)
  const cellRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [dropPos, setDropPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const applyingToMany = selected && selectedCount > 1
  const displayAmount = transactionDisplayAmount(tx, selectedAccountId)
  const bucketDisplay = transactionBucketDisplay(tx)
  // No slice limit — show all categories; filter as user types
  const filteredCats = categories.filter(c => !q || c.fullName.toLowerCase().includes(q.toLowerCase()))

  function openCat() {
    if (cellRef.current) {
      const r = cellRef.current.getBoundingClientRect()
      const DROPDOWN_H = 260
      const flipUp = r.bottom + 2 + DROPDOWN_H > window.innerHeight
      setDropPos({ top: flipUp ? r.top - DROPDOWN_H - 2 : r.bottom + 2, left: r.left })
    }
    setQ('')
    setActiveIdx(-1)
    setCatOpen(true)
  }

  function pickCat(catId: string | null) {
    onCategoryChange(catId)
    setCatOpen(false)
    setQ('')
    setActiveIdx(-1)
  }

  function handleInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setCatOpen(false); setQ(''); setActiveIdx(-1); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => {
        const next = Math.min(i + 1, filteredCats.length - 1)
        setTimeout(() => {
          dropRef.current?.querySelectorAll('[data-cat-item]')[next]?.scrollIntoView({ block: 'nearest' })
        }, 0)
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && filteredCats[activeIdx]) {
        pickCat(filteredCats[activeIdx].id)
      } else if (filteredCats.length === 1) {
        pickCat(filteredCats[0].id)
      }
    }
  }

  const pl = indent === 'double' ? 'pl-20' : indent === 'single' ? 'pl-12' : 'px-4'
  const pr = indent !== 'none' ? 'pr-4' : ''

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 py-1.5 border-b border-gray-100/70 hover:bg-blue-50 group transition-colors cursor-grab active:cursor-grabbing ${selected ? 'bg-indigo-50/60' : ''} ${pl} ${pr}`}
      onContextMenu={e => { e.preventDefault(); onRightClick(e) }}
      onClick={e => { if (e.shiftKey || e.metaKey) { e.preventDefault(); onSelect(e.shiftKey, e.metaKey) } }}
      onDoubleClick={onEdit}
    >
      <input type="checkbox" checked={selected} onChange={() => {}}
        onClick={e => { e.stopPropagation(); onSelect(e.shiftKey, e.metaKey) }}
        className="rounded shrink-0 cursor-pointer" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-700 truncate" title={tx.description}>{tx.description}</p>
      </div>
      <span className={`text-sm font-bold text-right shrink-0 ${displayAmount > 0 ? 'text-emerald-600' : tx.isTransfer ? 'text-sky-600' : 'text-slate-700'}`}
        style={{ width: colWidths.amount }}>
        {tx.isTransfer ? fmt(displayAmount, true) : fmt(displayAmount)}
      </span>

      <div className="shrink-0" style={{ width: colWidths.context }}>
        <InlineDimensionSelect
          value={tx.contextId ?? null}
          label={tx.contextName ?? '—'}
          emptyLabel="Not classified"
          options={classificationOptions.contexts}
          onChange={onContextChange}
        />
      </div>

      {/* Purpose for income/expenses; transfer reason for transfers. */}
      <div ref={cellRef} className="shrink-0 relative" style={{ width: colWidths.purpose }}>
        {tx.isTransfer ? (
          <div className="truncate text-xs font-medium text-sky-700" title={[transferReasonLabel(tx.transferReason), tx.contextName].filter(Boolean).join(' · ')}>
            <span className="inline-flex max-w-full items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5">
              <span className="truncate">{transferReasonLabel(tx.transferReason)}</span>
            </span>
          </div>
        ) : catOpen ? (
          <>
            <input autoFocus value={q} onChange={e => { setQ(e.target.value); setActiveIdx(-1) }} placeholder="Search categories…"
              className="w-full border border-blue-400 rounded px-2 py-0.5 text-xs focus:outline-none ring-1 ring-blue-300"
              onBlur={() => setTimeout(() => { setCatOpen(false); setQ(''); setActiveIdx(-1) }, 150)}
              onKeyDown={handleInputKey} />
            <div ref={dropRef}
              className="bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto"
              style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: Math.max(224, colWidths.purpose), zIndex: 9999 }}
            >
              {applyingToMany && <div className="px-3 py-1.5 text-xs text-blue-600 bg-blue-50 border-b border-blue-100 font-medium">Applying to {selectedCount} selected</div>}
              <button onMouseDown={() => pickCat(null)} className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50">Remove purpose</button>
              {filteredCats.map((c, i) => (
                <button key={c.id} data-cat-item onMouseDown={() => pickCat(c.id)}
                  className={`w-full text-left px-3 py-1.5 text-xs text-gray-700 flex items-center gap-2 ${i === activeIdx ? 'bg-blue-100' : 'hover:bg-blue-50'}`}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  {c.fullName}
                </button>
              ))}
              {filteredCats.length === 0 && <p className="px-3 py-2 text-xs text-gray-400 italic">No match</p>}
            </div>
          </>
        ) : (
          <button onClick={openCat} className="w-full text-left rounded px-1 -mx-1 hover:bg-white/80 overflow-hidden"
            title={applyingToMany ? `Set purpose for ${selectedCount} selected` : 'Click to set purpose'}>
            <CategoryPill name={tx.canonicalCategoryName ?? tx.categoryName ?? tx.categoryFullName} color={tx.categoryColor} />
            {applyingToMany && <span className="ml-1 text-[10px] text-blue-500 font-medium">×{selectedCount}</span>}
          </button>
        )}
      </div>

      <div className="shrink-0" style={{ width: colWidths.bucket }}>
        {!tx.isTransfer && canUseHouseholdBucket(tx.contextName, tx.amount > 0 ? 'income' : 'expense') ? (
          <InlineDimensionSelect
            value={tx.bucketId ?? null}
            label={bucketDisplay.label}
            emptyLabel="No bucket"
            options={classificationOptions.buckets}
            onChange={onBucketChange}
            muted={bucketDisplay.muted}
          />
        ) : (
          <span className="block truncate text-xs text-slate-300" title={bucketDisplay.label}>{bucketDisplay.label}</span>
        )}
      </div>

      <span className="text-xs text-gray-400 shrink-0" style={{ width: colWidths.date }}>{formatDate(tx.date)}</span>
      <span className="text-xs text-gray-400 truncate shrink-0" style={{ width: colWidths.account }} title={`${tx.accountName}${tx.isTransfer && tx.targetAccountName ? ` → ${tx.targetAccountName}` : ''} · ${tx.memberName}`}>
        {tx.isTransfer && tx.targetAccountName ? `${tx.accountName} → ${tx.targetAccountName}` : tx.accountName}
      </span>
      <div className="w-16 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onEdit} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700"><Edit2 size={12} /></button>
        <button onClick={onDelete} className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

function InlineDimensionSelect({ value, label, emptyLabel, options, onChange, muted = false }: {
  value: string | null
  label: string
  emptyLabel: string
  options: Array<{ id: string; name: string }>
  onChange: (value: string | null) => void
  muted?: boolean
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 180 })

  function openPicker() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      const height = Math.min(240, (options.length + 1) * 32)
      const top = rect.bottom + height > window.innerHeight ? Math.max(8, rect.top - height - 2) : rect.bottom + 2
      setPosition({ top, left: rect.left, width: Math.max(180, rect.width) })
    }
    setOpen(true)
  }

  return (
    <div>
      <button ref={buttonRef} type="button" onClick={event => { event.stopPropagation(); open ? setOpen(false) : openPicker() }} title={`Click to change ${emptyLabel.toLowerCase()}`} className={`block w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-white hover:ring-1 hover:ring-slate-200 ${muted ? 'text-slate-300' : 'text-slate-500'}`}>
        {label}
      </button>
      {open && (
        <div tabIndex={-1} onBlur={() => setTimeout(() => setOpen(false), 120)} className="fixed z-[9999] max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl" style={position}>
          <button type="button" autoFocus onClick={() => { onChange(null); setOpen(false) }} className={`w-full px-3 py-2 text-left text-xs hover:bg-blue-50 ${value === null ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-400'}`}>{emptyLabel}</button>
          {options.map(option => (
            <button key={option.id} type="button" onMouseDown={event => event.preventDefault()} onClick={() => { onChange(option.id); setOpen(false) }} className={`w-full px-3 py-2 text-left text-xs hover:bg-blue-50 ${option.id === value ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700'}`}>
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Scheduled ghost row ─────────────────────────────────────────────────────

function ScheduledGhostRow({ s, colWidths, processing, onProcess }: { s: ScheduledTransaction; colWidths: ColWidths; processing: boolean; onProcess: () => void }) {
  const freqLabel = FREQUENCIES.find(f => f.value === s.frequency)?.label ?? s.frequency
  const bucketLabel = s.isTransfer ? 'Not applicable' : s.amount > 0 ? 'Allocation source' : (s.bucketName ?? '—')
  return (
    <div onDoubleClick={onProcess} title="Double-click to process this scheduled occurrence" className={`flex cursor-pointer items-center gap-3 border-b border-dashed border-gray-100 px-4 py-1.5 pr-4 transition-opacity ${processing ? 'pointer-events-none opacity-30' : 'opacity-50 hover:opacity-80'}`}>
      <div className="w-4 shrink-0" />
      <Calendar size={12} className="text-gray-400 shrink-0" />
      <span className="flex-1 text-sm text-gray-500 truncate min-w-0 italic">{s.description}</span>
      <span className={`text-sm font-bold text-right shrink-0 ${s.amount > 0 ? 'text-emerald-600' : 'text-slate-700'}`}
        style={{ width: colWidths.amount }}>
        {fmt(s.amount)}
      </span>
      <div className="shrink-0 text-xs text-gray-400 truncate" style={{ width: colWidths.context }}>
        {s.contextName ?? <span className="text-gray-300">—</span>}
      </div>
      <div className="shrink-0 text-xs text-gray-400 truncate" style={{ width: colWidths.purpose }}>
        {s.isTransfer ? transferReasonLabel(s.transferReason) : (s.categoryName ?? s.categoryFullName ?? <span className="text-gray-300">—</span>)}
      </div>
      <div className="shrink-0 text-xs text-gray-400 truncate" style={{ width: colWidths.bucket }}>
        {bucketLabel}
      </div>
      <span className="text-xs text-gray-400 shrink-0" style={{ width: colWidths.date }}>{formatDate(s.nextDate)}</span>
      <span className="text-xs text-gray-400 truncate shrink-0" style={{ width: colWidths.account }}>{s.accountName}</span>
      <div className="w-16 shrink-0 flex items-center">
        <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 whitespace-nowrap">{freqLabel}</span>
      </div>
    </div>
  )
}

// ─── Column header ────────────────────────────────────────────────────────────

function ColHeader({ label, col, flex, width, sortCol, sortDir, onSort, onResize }: {
  label: string; col: string; flex?: boolean; width?: number
  sortCol: string; sortDir: 'asc' | 'desc'; onSort: (col: string) => void; onResize?: (e: React.MouseEvent) => void
}) {
  const active = sortCol === col
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <div className={`relative flex items-center gap-1 cursor-pointer group/hdr text-xs text-gray-400 font-medium uppercase tracking-wide ${flex ? 'flex-1 min-w-0' : 'shrink-0'}`}
      style={!flex && width !== undefined ? { width } : undefined} onClick={() => onSort(col)}>
      <span className="truncate">{label}</span>
      <Icon size={11} className={`shrink-0 ${active ? 'text-blue-500' : 'opacity-0 group-hover/hdr:opacity-60'}`} />
      {onResize && (
        <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize flex items-center justify-center"
          onClick={e => e.stopPropagation()} onMouseDown={onResize}>
          <div className="w-0.5 h-3 bg-gray-300 rounded opacity-0 group-hover/hdr:opacity-100" />
        </div>
      )}
    </div>
  )
}

// ─── Category suggestion engine ──────────────────────────────────────────────

function normalizeDesc(raw: string): string {
  return raw
    .replace(/card\s+xx?\d+/gi, '')
    .replace(/value\s+date:\s*\d{2}\/\d{2}\/\d{4}/gi, '')
    .replace(/\bref\s*[\w-]+/gi, '')
    .replace(/\d{8,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function suggestCategories(
  tx: Transaction,
  categories: Category[],
  catHistory: Array<{ description: string; categoryId: string }>,
  limit = 5
): Array<{ category: Category; score: number; reason: string }> {
  const desc = normalizeDesc(tx.description)
  const descWords = desc.split(/\W+/).filter(w => w.length > 2)
  const scores = new Map<string, { score: number; reason: string }>()

  function addScore(catId: string, delta: number, reason: string) {
    const prev = scores.get(catId)
    scores.set(catId, { score: (prev?.score ?? 0) + delta, reason: prev?.reason ?? reason })
  }

  // 1. Keyword matching — highest single-hit value
  for (const cat of categories) {
    if (!cat.keywords?.length) continue
    for (const kw of cat.keywords) {
      if (kw && desc.includes(kw.toLowerCase())) {
        addScore(cat.id, 150, `keyword: "${kw}"`)
      }
    }
  }

  // 2. All-time history matching — normalized descriptions
  for (const h of catHistory) {
    const hDesc = normalizeDesc(h.description)
    if (hDesc === desc && desc.length > 4) {
      // Exact normalized match — very strong signal
      addScore(h.categoryId, 300, 'exact past match')
      continue
    }
    if (descWords.length > 0) {
      const hWords = hDesc.split(/\W+/).filter(w => w.length > 2)
      const overlap = descWords.filter(w => hWords.includes(w)).length
      if (overlap > 0) {
        // Score as fraction of words matched, scaled to 0-80
        const fraction = overlap / Math.max(descWords.length, hWords.length, 1)
        const pts = Math.round(fraction * 80)
        if (pts > 0) addScore(h.categoryId, pts, 'past transactions')
      }
    }
  }

  // 3. Category name word overlap — lowest priority tie-breaker
  for (const cat of categories) {
    const catWords = cat.name.toLowerCase().split(/\W+/).filter(w => w.length > 2)
    const overlap = descWords.filter(w => catWords.some(cw => w.includes(cw) || cw.includes(w))).length
    if (overlap > 0) addScore(cat.id, overlap * 2, 'name match')
  }

  return [...scores.entries()]
    .map(([catId, { score, reason }]) => ({ category: categories.find(c => c.id === catId)!, score, reason }))
    .filter(s => s.category && s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// ─── Transaction right-click context menu ─────────────────────────────────────

function TxContextMenu({ tx, x, y, categories, catHistory, onClose, onCategoryPick, onEdit, onSplit, onDelete }: {
  tx: Transaction; x: number; y: number
  categories: Category[]; catHistory: Array<{ description: string; categoryId: string }>
  onClose: () => void
  onCategoryPick: (catId: string) => void
  onEdit: () => void; onSplit: () => void; onDelete: () => void
}) {
  const suggestions = useMemo(() => suggestCategories(tx, categories, catHistory), [tx, categories, catHistory])

  const W = 320
  const H = 380
  const left = Math.min(x, window.innerWidth - W - 8)
  const top = Math.min(y, window.innerHeight - H - 8)

  return (
    <div
      className="fixed z-[9998] bg-white border border-gray-200 rounded-xl shadow-2xl py-1"
      style={{ left, top, width: W }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Transaction summary */}
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-800 leading-snug">{tx.description}</p>
        <div className="flex items-center gap-2 mt-1">
          <p className={`text-sm font-bold ${tx.amount > 0 && !tx.isTransfer ? 'text-emerald-600' : tx.isTransfer ? 'text-sky-500' : 'text-slate-700'}`}>
            {tx.isTransfer ? 'Transfer' : fmt(tx.amount)}
          </p>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400">{tx.date}</span>
        </div>
      </div>

      {/* Category suggestions */}
      <div className="px-4 pt-2.5 pb-1 flex items-center gap-1.5">
        <Sparkles size={10} className="text-violet-400 shrink-0" />
        <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">
          {suggestions.length > 0 ? 'Suggested categories' : 'No suggestions yet'}
        </p>
      </div>
      {suggestions.map(s => (
        <button
          key={s.category.id}
          onClick={() => { onCategoryPick(s.category.id); onClose() }}
          className="w-full text-left flex items-center gap-2.5 px-4 py-2 hover:bg-violet-50 group transition-colors"
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.category.color ?? '#94a3b8' }} />
          <span className="flex-1 text-sm text-gray-700">{s.category.fullName}</span>
          <span className="text-xs text-gray-300 group-hover:text-violet-400 font-mono shrink-0 tabular-nums">{s.score}</span>
        </button>
      ))}
      {suggestions.length === 0 && (
        <p className="px-4 pb-2 text-xs text-gray-400 italic">Categorise similar transactions to get AI suggestions</p>
      )}

      <div className="my-1 border-t border-gray-100" />

      <button onClick={() => { onEdit(); onClose() }}
        className="w-full text-left flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 text-sm text-gray-600 transition-colors">
        <Edit2 size={13} className="shrink-0 text-gray-400" /> Edit transaction
      </button>
      <button onClick={() => { onSplit(); onClose() }}
        className="w-full text-left flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 text-sm text-gray-600 transition-colors">
        <Scissors size={13} className="shrink-0 text-gray-400" /> Split transaction…
      </button>
      <button onClick={() => { onDelete(); onClose() }}
        className="w-full text-left flex items-center gap-2.5 px-4 py-2 hover:bg-red-50 text-sm text-red-500 transition-colors">
        <Trash2 size={13} className="shrink-0" /> Delete transaction
      </button>
    </div>
  )
}

// ─── Category filter button ───────────────────────────────────────────────────

function splitAmounts(amount: number, parts: number): number[] {
  const totalCents = Math.round(amount * 100)
  const baseCents = Math.trunc(totalCents / parts)
  const remainder = totalCents - baseCents * parts
  return Array.from({ length: parts }, (_, index) => (baseCents + (index < Math.abs(remainder) ? Math.sign(remainder) : 0)) / 100)
}

function SplitTransactionModal({ transaction, onClose, onSplit }: {
  transaction: Transaction; onClose: () => void; onSplit: (parts: number) => Promise<void>
}) {
  const [parts, setParts] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const amounts = splitAmounts(transaction.amount, parts)
  const uniform = amounts.every(amount => amount === amounts[0])
  async function submit() {
    setBusy(true); setError('')
    try { await onSplit(parts) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The transaction could not be split.'); setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2"><Scissors size={17} className="text-blue-600" /><h2 className="font-semibold text-slate-900">Split transaction</h2></div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={17} /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div><p className="truncate text-sm font-medium text-slate-800" title={transaction.description}>{transaction.description}</p><p className="mt-1 text-sm font-bold text-slate-700">{fmt(transaction.amount)}</p></div>
          <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-600">Number of transactions</span>
            <input type="number" min={2} max={100} step={1} value={parts} onChange={event => setParts(Math.max(2, Math.min(100, Math.trunc(Number(event.target.value) || 2))))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
          </label>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-600">
            <p><strong className="text-slate-800">{parts} transactions</strong> will replace the original.</p>
            <p className="mt-1">{uniform ? `${fmt(amounts[0])} each` : `Amounts: ${amounts.map(amount => fmt(amount)).join(', ')}`}</p>
            <p className="mt-2 text-xs text-slate-500">All classifications, accounts, dates, tags and notes will be copied. Any rounding remainder is applied by one cent so the total remains exact.</p>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? 'Splitting…' : `Split into ${parts}`}</button>
        </div>
      </div>
    </div>
  )
}

function CategoryFilterButton({ categories, selected, onChange }: {
  categories: Category[]
  selected: Set<string>
  onChange: (ids: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const purposeFamilies = useMemo(() => {
    const groups = new Map<string, Category[]>()
    for (const purpose of categories) {
      const family = purpose.parentName?.trim() || 'Other'
      groups.set(family, [...(groups.get(family) ?? []), purpose])
    }
    return [...groups.entries()]
      .map(([family, children]) => ({
        id: `family:${family}`,
        name: family,
        color: children[0]?.color ?? '#94a3b8',
        children: children.sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [categories])

  const q = search.trim().toLowerCase()
  const visibleGroups = purposeFamilies
    .map(group => {
      const familyMatches = !q || group.name.toLowerCase().includes(q)
      return {
        ...group,
        children: familyMatches
          ? group.children
          : group.children.filter(purpose => purpose.name.toLowerCase().includes(q) || purpose.fullName.toLowerCase().includes(q)),
      }
    })
    .filter(group => group.children.length > 0)

  // When searching, auto-expand matching groups
  const effectiveExpanded = q
    ? new Set(visibleGroups.map(group => group.id))
    : expandedGroups

  function toggleExpand(id: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleId(id: string) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange(next)
  }

  function toggleGroup(g: { children: Category[] }) {
    const allIds = g.children.map(purpose => purpose.id)
    const allChecked = allIds.every(id => selected.has(id))
    const next = new Set(selected)
    if (allChecked) allIds.forEach(id => next.delete(id))
    else allIds.forEach(id => next.add(id))
    onChange(next)
  }

  const activeCount = selected.size

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm transition-colors ${
          activeCount > 0
            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
            : 'border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <SlidersHorizontal size={13} />
        Purpose
        {activeCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{activeCount}</span>
            <X size={11} className="text-blue-500 hover:text-blue-700" onClick={e => { e.stopPropagation(); onChange(new Set()) }} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search families or purposes…"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="overflow-y-auto max-h-72 py-1">
            {visibleGroups.map(g => {
              const allIds = g.children.map(purpose => purpose.id)
              const allChecked = allIds.every(id => selected.has(id))
              const someChecked = !allChecked && allIds.some(id => selected.has(id))
              const expanded = effectiveExpanded.has(g.id)
              return (
                <div key={g.id}>
                  {/* Parent row */}
                  <div className="flex items-center gap-1 px-2 py-1 hover:bg-gray-50 group">
                    {/* Expand/collapse chevron */}
                    <button
                      onClick={() => toggleExpand(g.id)}
                      className="p-0.5 rounded text-gray-300 hover:text-gray-500 shrink-0"
                    >
                      <ChevronRight size={13} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                    <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={el => { if (el) el.indeterminate = someChecked }}
                        onChange={() => toggleGroup(g)}
                        className="rounded shrink-0"
                      />
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                      <span className="text-sm text-gray-700 font-medium truncate">{g.name}</span>
                      {g.children.length > 0 && (
                        <span className="text-[10px] text-gray-300 shrink-0">{g.children.length}</span>
                      )}
                    </label>
                  </div>
                  {/* Child rows — shown when expanded */}
                  {expanded && g.children.map(c => (
                    <label key={c.id} className="flex items-center gap-2 pl-9 pr-3 py-1 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleId(c.id)}
                        className="rounded shrink-0"
                      />
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="text-sm text-gray-600 truncate">{c.name}</span>
                    </label>
                  ))}
                </div>
              )
            })}
            {visibleGroups.length === 0 && (
              <p className="px-3 py-3 text-sm text-gray-400 text-center">No categories found</p>
            )}
          </div>
          {activeCount > 0 && (
            <div className="border-t border-gray-100 p-2">
              <button
                onClick={() => onChange(new Set())}
                className="w-full text-xs text-gray-500 hover:text-gray-700 py-1 rounded hover:bg-gray-50"
              >
                Clear filter ({activeCount} selected)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Bulk category quick pick ─────────────────────────────────────────────────

function SummaryMetric({ label, value, tone, absolute = false, signed = false, info }: {
  label: string
  value: number
  tone?: 'income' | 'expense' | 'transfer'
  absolute?: boolean
  signed?: boolean
  info?: string
}) {
  const color = tone === 'income'
    ? 'text-emerald-600'
    : tone === 'expense'
      ? 'text-slate-700'
      : tone === 'transfer'
        ? 'text-sky-600'
        : value < 0
          ? 'text-red-500'
          : 'text-emerald-600'
  return (
    <div className="flex flex-col py-2.5 px-3 border-r border-gray-100">
      <span className="whitespace-nowrap text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
        {label}{info && <span title={info} aria-label={info} className="ml-1 cursor-help normal-case text-blue-500">ⓘ</span>}
      </span>
      <span className={`whitespace-nowrap text-sm font-bold mt-0.5 ${color}`}>
        {fmt(absolute ? Math.abs(value) : value, signed)}
      </span>
    </div>
  )
}

function CategoryQuickPick({ categories, onPick }: { categories: Category[]; onPick: (id: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const filtered = categories.filter(c => !q || c.fullName.toLowerCase().includes(q.toLowerCase())).slice(0, 30)

  if (!open) return <button onClick={() => setOpen(true)} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">Set Purpose</button>

  return (
    <div className="relative">
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Filter categories…"
        className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        onBlur={() => setTimeout(() => setOpen(false), 200)} />
      {filtered.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-48 overflow-y-auto">
          <button onClick={() => { onPick(null); setOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50">Remove purpose</button>
          {filtered.map(c => (
            <button key={c.id} onMouseDown={() => { onPick(c.id); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
              {c.fullName}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
