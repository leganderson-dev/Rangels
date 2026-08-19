import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Line, ReferenceLine
} from 'recharts'
import { api } from '../api'
import { fmt, fmtShort, monthShort, monthName } from '../utils'
import type { Account, Category, ClassificationOptions, Transaction } from '../types/finance'
import { TrendingUp, TrendingDown, DollarSign, ChevronDown, ChevronRight, ArrowLeft, ArrowLeftRight, ArrowUpDown, ArrowUp, ArrowDown, BarChart2, PieChart as PieIcon, TrendingUp as TrendIcon, Layers } from 'lucide-react'
import { transferReasonLabel } from '../lib/transfers'
import { TransactionFormModal } from '../components/TransactionFormModal'

interface Props {
  accounts: Account[]
  categories: Category[]
  month: number
  year: number
  selectedAccountId?: any
  onRefreshAccounts?: any
  onRefreshCategories?: any
  onMonthChange?: any
  onYearChange?: any
  dateMode?: 'month' | 'custom'
  customFrom?: string
  customTo?: string
}

type View = 'cashflow' | 'spending' | 'trends' | 'funding'
type TrendDimension = 'bucket' | 'context' | 'purpose'
type DrillSortKey = 'description' | 'account' | 'date' | 'amount'
type SortDirection = 'asc' | 'desc'

interface DrillState {
  type: 'month' | 'category'
  month?: number
  categoryId?: string | null
  categoryName?: string
  color?: string
}

export function ReportsPage({ accounts, categories, month, year, selectedAccountId, dateMode = 'month', customFrom, customTo, onRefreshAccounts }: Props) {
  const [yearly, setYearly] = useState<any[]>([])
  const [catBreakdown, setCatBreakdown] = useState<any[]>([])
  const [view, setView] = useState<View>('cashflow')
  const [drill, setDrill] = useState<DrillState | null>(null)
  const [drillTxns, setDrillTxns] = useState<Transaction[]>([])
  const [drillSort, setDrillSort] = useState<{ key: DrillSortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' })
  const [trendDimension, setTrendDimension] = useState<TrendDimension>('bucket')
  const [trendSelections, setTrendSelections] = useState<string[]>([])
  const [trendData, setTrendData] = useState<any[]>([])
  const [trendTransactions, setTrendTransactions] = useState<Transaction[]>([])
  const [classificationOptions, setClassificationOptions] = useState<ClassificationOptions | null>(null)
  const [spendingBucketFilter, setSpendingBucketFilter] = useState('')
  const [spendingContextFilter, setSpendingContextFilter] = useState('')
  const [spendingOwnerFilters, setSpendingOwnerFilters] = useState({ anderson: true, julia: true })
  const [expandedExpenseFamilies, setExpandedExpenseFamilies] = useState<string[]>([])
  const [selectedExpenseFamily, setSelectedExpenseFamily] = useState<string | null>(null)
  const [fundingTransfers, setFundingTransfers] = useState<Transaction[]>([])
  const [periodTransactions, setPeriodTransactions] = useState<Transaction[]>([])
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const isCustom = dateMode === 'custom' && !!customFrom && !!customTo

  const sortedDrillTxns = useMemo(() => [...drillTxns].sort((left, right) => {
    let comparison = 0
    if (drillSort.key === 'amount') {
      comparison = left.amount - right.amount
    } else if (drillSort.key === 'date') {
      comparison = left.date.localeCompare(right.date)
    } else if (drillSort.key === 'account') {
      comparison = (left.accountName ?? '').localeCompare(right.accountName ?? '', undefined, { sensitivity: 'base' })
    } else {
      comparison = left.description.localeCompare(right.description, undefined, { sensitivity: 'base' })
    }
    return drillSort.direction === 'asc' ? comparison : -comparison
  }), [drillTxns, drillSort])

  function changeDrillSort(key: DrillSortKey) {
    setDrillSort(previous => ({
      key,
      direction: previous.key === key && previous.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function DrillSortIcon({ column }: { column: DrillSortKey }) {
    if (drillSort.key !== column) return <ArrowUpDown size={12} className="text-gray-300" />
    return drillSort.direction === 'asc'
      ? <ArrowUp size={12} className="text-blue-500" />
      : <ArrowDown size={12} className="text-blue-500" />
  }

  useEffect(() => {
    api.transactions.yearlySummary(year, selectedAccountId).then(setYearly)
    api.transactions.list(isCustom
      ? { dateFrom: customFrom!, dateTo: customTo!, accountId: selectedAccountId ?? undefined }
      : { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31`, accountId: selectedAccountId ?? undefined })
      .then(rows => setFundingTransfers(rows.filter(row => row.isTransfer && Boolean(row.transferReason) && row.transferReason !== 'account_movement')))
    api.transactions.list(isCustom
      ? { dateFrom: customFrom!, dateTo: customTo!, accountId: selectedAccountId ?? undefined }
      : { month, year, accountId: selectedAccountId ?? undefined })
      .then(setPeriodTransactions)
    if (isCustom) {
      api.transactions.list({ dateFrom: customFrom!, dateTo: customTo!, accountId: selectedAccountId ?? undefined }).then(txs => {
        const byCat = new Map<string, any>()
        for (const t of txs) {
          if (t.isTransfer || t.status !== 'C') continue
          const key = t.categoryId ?? '__none'
          const existing = byCat.get(key)
          if (existing) existing.total += t.amount
          else byCat.set(key, { categoryId: t.categoryId, categoryFullName: t.categoryFullName ?? 'Uncategorised', categoryColor: t.categoryColor ?? '#94a3b8', total: t.amount })
        }
        setCatBreakdown([...byCat.values()])
      })
    } else {
      api.transactions.monthSummary(month, year, selectedAccountId).then(s => {
        if (s) setCatBreakdown(s.byCategory)
      })
    }
  }, [year, month, isCustom, customFrom, customTo, selectedAccountId, refreshKey])

  async function drillMonth(m: number) {
    const [s, transactions] = await Promise.all([
      api.transactions.monthSummary(m, year, selectedAccountId),
      api.transactions.list({ month: m, year, accountId: selectedAccountId ?? undefined }),
    ])
    if (s) setCatBreakdown(s.byCategory)
    setPeriodTransactions(transactions)
    setDrill({ type: 'month', month: m })
    setView('spending')
  }

  async function drillCategory(catId: string | null, catName: string, color: string) {
    let txns: Transaction[]
    if (isCustom) {
      txns = await api.transactions.list({ dateFrom: customFrom!, dateTo: customTo!, categoryId: catId ?? undefined, accountId: selectedAccountId ?? undefined })
    } else {
      const activeMonth = drill?.month ?? month
      txns = await api.transactions.list({ month: activeMonth, year, categoryId: catId ?? undefined, accountId: selectedAccountId ?? undefined })
    }
    setDrillTxns(txns.filter(transaction =>
      (!spendingBucketFilter || transaction.bucketId === spendingBucketFilter)
      && (!spendingContextFilter || transaction.contextId === spendingContextFilter)
      && (juliaAccountIds.has(transaction.accountId) ? spendingOwnerFilters.julia : spendingOwnerFilters.anderson),
    ))
    setDrill(d => ({ ...d!, type: 'category', categoryId: catId, categoryName: catName, color }))
  }

  function backToSpending() {
    setDrill(d => d ? { type: 'month', month: d.month } : null)
    setDrillTxns([])
  }

  function backToCashflow() {
    setDrill(null)
    setDrillTxns([])
    setView('cashflow')
    if (isCustom) {
      api.transactions.list({ dateFrom: customFrom!, dateTo: customTo!, accountId: selectedAccountId ?? undefined }).then(txs => {
        setPeriodTransactions(txs)
        const byCat = new Map<string, any>()
        for (const t of txs) {
          if (t.isTransfer || t.status !== 'C') continue
          const key = t.categoryId ?? '__none'
          const existing = byCat.get(key)
          if (existing) existing.total += t.amount
          else byCat.set(key, { categoryId: t.categoryId, categoryFullName: t.categoryFullName ?? 'Uncategorised', categoryColor: t.categoryColor ?? '#94a3b8', total: t.amount })
        }
        setCatBreakdown([...byCat.values()])
      })
    } else {
      api.transactions.monthSummary(month, year, selectedAccountId).then(s => {
        if (s) setCatBreakdown(s.byCategory)
      })
      api.transactions.list({ month, year, accountId: selectedAccountId ?? undefined }).then(setPeriodTransactions)
    }
  }

  useEffect(() => {
    if (view !== 'trends' && view !== 'spending') return
    api.classification.options().then(setClassificationOptions)
  }, [view, refreshKey])

  useEffect(() => {
    if (view !== 'trends') return
    api.transactions.list({ dateFrom: `${year}-01-01`, dateTo: `${year}-12-31`, accountId: selectedAccountId ?? undefined }).then(setTrendTransactions)
  }, [view, year, selectedAccountId, refreshKey])

  useEffect(() => {
    if (view !== 'trends' || trendSelections.length === 0) { setTrendData([]); return }
    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth() + 1
    const lastCompletedMonth = year < currentYear ? 12 : year === currentYear ? currentMonth - 1 : 0
    const juliaAccounts = new Set(accounts
      .filter(account => /julia/i.test(account.memberName) || /^julia\b/i.test(account.name))
      .map(account => account.id))
    const data = Array.from({ length: 12 }, (_, index) => {
      const entry: Record<string, string | number | null> = { name: monthShort(index + 1) }
      for (const id of trendSelections) {
        entry[`trend_${id}_total`] = 0
        entry[`trend_${id}_anderson`] = 0
        entry[`trend_${id}_julia`] = 0
        entry[`trend_${id}_projection`] = null
      }
      for (const transaction of trendTransactions) {
        if (transaction.isTransfer || transaction.status !== 'C' || transaction.amount >= 0 || Number(transaction.date.slice(5, 7)) !== index + 1) continue
        const dimensionId = trendDimension === 'bucket'
          ? transaction.bucketId
          : trendDimension === 'context'
            ? transaction.contextId
            : transaction.canonicalCategoryId
        if (dimensionId && trendSelections.includes(dimensionId)) {
          const amount = Math.abs(transaction.amount)
          entry[`trend_${dimensionId}_total`] = Number(entry[`trend_${dimensionId}_total`]) + amount
          const member = juliaAccounts.has(transaction.accountId) ? 'julia' : 'anderson'
          entry[`trend_${dimensionId}_${member}`] = Number(entry[`trend_${dimensionId}_${member}`]) + amount
        }
      }
      return entry
    })

    if (year === currentYear && lastCompletedMonth > 0) {
      for (const id of trendSelections) {
        const completedValues = data
          .slice(0, lastCompletedMonth)
          .map(entry => Number(entry[`trend_${id}_total`] ?? 0))
          .sort((left, right) => left - right)
        const middle = Math.floor(completedValues.length / 2)
        const median = completedValues.length % 2
          ? completedValues[middle]
          : (completedValues[middle - 1] + completedValues[middle]) / 2

        // Anchor the forecast to this month's actual value, then carry the historical
        // median through future months. Actual series stop at the current month.
        data[currentMonth - 1][`trend_${id}_projection`] = data[currentMonth - 1][`trend_${id}_total`]
        for (let monthIndex = currentMonth; monthIndex < 12; monthIndex += 1) {
          data[monthIndex][`trend_${id}_projection`] = median
          data[monthIndex][`trend_${id}_total`] = null
          data[monthIndex][`trend_${id}_anderson`] = null
          data[monthIndex][`trend_${id}_julia`] = null
        }
      }
    }
    setTrendData(data)
  }, [view, trendDimension, trendSelections, trendTransactions, accounts, year])

  const netData = yearly.map(m => ({
    name: monthShort(m.month),
    month: m.month,
    net: m.income + m.expenses,
    income: m.income,
    expenses: Math.abs(m.expenses),
  }))

  const juliaAccountIds = useMemo(() => new Set(accounts
    .filter(account => /julia/i.test(account.memberName) || /^julia\b/i.test(account.name))
    .map(account => account.id)), [accounts])

  const allSpendingOwnersSelected = spendingOwnerFilters.anderson && spendingOwnerFilters.julia

  function toggleSpendingOwner(owner: 'anderson' | 'julia') {
    setSpendingOwnerFilters(previous => {
      const otherOwner = owner === 'anderson' ? 'julia' : 'anderson'
      if (previous[owner] && !previous[otherOwner]) {
        return { anderson: true, julia: true }
      }
      return {
        anderson: owner === 'anderson',
        julia: owner === 'julia',
      }
    })
    setSelectedExpenseFamily(null)
    setDrill(null)
    setDrillTxns([])
  }

  const filteredPeriodTransactions = useMemo(() => periodTransactions.filter(transaction =>
    (!spendingBucketFilter || transaction.bucketId === spendingBucketFilter)
    && (!spendingContextFilter || transaction.contextId === spendingContextFilter)
    && (juliaAccountIds.has(transaction.accountId) ? spendingOwnerFilters.julia : spendingOwnerFilters.anderson),
  ), [periodTransactions, spendingBucketFilter, spendingContextFilter, spendingOwnerFilters, juliaAccountIds])

  const spendingBreakdown = useMemo(() => {
    if (!spendingBucketFilter && !spendingContextFilter && allSpendingOwnersSelected) return catBreakdown
    const byCategory = new Map<string, any>()
    for (const transaction of filteredPeriodTransactions) {
      if (transaction.isTransfer || transaction.status !== 'C') continue
      const key = transaction.categoryId ?? '__none'
      const existing = byCategory.get(key)
      if (existing) existing.total += transaction.amount
      else byCategory.set(key, {
        categoryId: transaction.categoryId,
        categoryFullName: transaction.categoryFullName ?? 'Uncategorised',
        categoryColor: transaction.categoryColor ?? '#94a3b8',
        total: transaction.amount,
      })
    }
    return [...byCategory.values()].sort((left, right) => Math.abs(right.total) - Math.abs(left.total))
  }, [allSpendingOwnersSelected, catBreakdown, filteredPeriodTransactions, spendingBucketFilter, spendingContextFilter])

  const expenseBreakdown = spendingBreakdown.filter(c => c.total < 0)
  const incomeBreakdown = spendingBreakdown.filter(c => c.total > 0)
  const totalExpenses = yearly.reduce((s, m) => s + Math.abs(m.expenses), 0)
  const totalIncome = yearly.reduce((s, m) => s + m.income, 0)
  const avgMonthlyExpenses = yearly.filter(m => m.expenses !== 0).length
    ? totalExpenses / yearly.filter(m => m.expenses !== 0).length : 0
  const netSavings = totalIncome - totalExpenses
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0

  const periodLabel = isCustom ? `${customFrom!.slice(5)} – ${customTo!.slice(5)}` : `${monthName(month)} ${year}`
  const drillMonthName = drill?.month ? `${monthName(drill.month)} ${year}` : periodLabel
  const contributionByCategory = useMemo(() => {
    const juliaAccounts = new Set(accounts
      .filter(account => /julia/i.test(account.memberName) || /^julia\b/i.test(account.name))
      .map(account => account.id))
    const totals = new Map<string, { anderson: number; julia: number }>()

    for (const transaction of filteredPeriodTransactions) {
      if (transaction.isTransfer || transaction.status !== 'C' || transaction.amount >= 0) continue
      const key = transaction.categoryId ?? '__none'
      const current = totals.get(key) ?? { anderson: 0, julia: 0 }
      const amount = Math.abs(transaction.amount)
      if (juliaAccounts.has(transaction.accountId)) current.julia += amount
      else current.anderson += amount
      totals.set(key, current)
    }

    return totals
  }, [accounts, filteredPeriodTransactions])

  const expenseFamilies = useMemo(() => {
    const categoryById = new Map(categories.map(category => [category.id, category]))
    const families = new Map<string, {
      name: string
      total: number
      color: string
      anderson: number
      julia: number
      children: any[]
    }>()

    for (const expense of expenseBreakdown) {
      const category = expense.categoryId ? categoryById.get(expense.categoryId) : undefined
      const fullName = expense.categoryFullName ?? 'Uncategorised'
      const separatorIndex = fullName.indexOf(':')
      const fallbackFamily = separatorIndex > 0 ? fullName.slice(0, separatorIndex).trim() : fullName
      const familyName = category?.parentName?.trim() || fallbackFamily || 'Other'
      const contribution = contributionByCategory.get(expense.categoryId ?? '__none') ?? { anderson: 0, julia: 0 }
      const existing = families.get(familyName) ?? {
        name: familyName,
        total: 0,
        color: expense.categoryColor ?? '#94a3b8',
        anderson: 0,
        julia: 0,
        children: [] as any[],
      }
      existing.total += expense.total
      existing.anderson += contribution.anderson
      existing.julia += contribution.julia
      existing.children.push(expense)
      families.set(familyName, existing)
    }

    return [...families.values()]
      .map(family => ({
        ...family,
        children: family.children.sort((left, right) => Math.abs(right.total) - Math.abs(left.total)),
      }))
      .sort((left, right) => Math.abs(right.total) - Math.abs(left.total))
      .slice(0, 8)
  }, [categories, contributionByCategory, expenseBreakdown])

  const allSpendingSummary = useMemo(() => {
    const juliaAccounts = new Set(accounts
      .filter(account => /julia/i.test(account.memberName) || /^julia\b/i.test(account.name))
      .map(account => account.id))
    const expenses = filteredPeriodTransactions.filter(transaction =>
      !transaction.isTransfer && transaction.status === 'C' && transaction.amount < 0,
    )
    let anderson = 0
    let julia = 0
    for (const transaction of expenses) {
      const amount = Math.abs(transaction.amount)
      if (juliaAccounts.has(transaction.accountId)) julia += amount
      else anderson += amount
    }
    const total = anderson + julia
    return {
      total,
      count: expenses.length,
      average: expenses.length ? total / expenses.length : 0,
      anderson,
      julia,
      andersonPercentage: total ? (anderson / total) * 100 : 0,
      juliaPercentage: total ? (julia / total) * 100 : 0,
    }
  }, [accounts, filteredPeriodTransactions])

  const spendingSummary = useMemo(() => {
    const juliaAccounts = new Set(accounts
      .filter(account => /julia/i.test(account.memberName) || /^julia\b/i.test(account.name))
      .map(account => account.id))
    const categoryById = new Map(categories.map(category => [category.id, category]))
    const expenses = filteredPeriodTransactions.filter(transaction =>
      !transaction.isTransfer && transaction.status === 'C' && transaction.amount < 0
      && (!selectedExpenseFamily || (() => {
        const category = transaction.categoryId ? categoryById.get(transaction.categoryId) : undefined
        const fullName = transaction.categoryFullName ?? 'Uncategorised'
        const separatorIndex = fullName.indexOf(':')
        const fallbackFamily = separatorIndex > 0 ? fullName.slice(0, separatorIndex).trim() : fullName
        return (category?.parentName?.trim() || fallbackFamily || 'Other') === selectedExpenseFamily
      })()),
    )
    let anderson = 0
    let julia = 0
    for (const transaction of expenses) {
      const amount = Math.abs(transaction.amount)
      if (juliaAccounts.has(transaction.accountId)) julia += amount
      else anderson += amount
    }
    const total = anderson + julia
    return {
      total,
      count: expenses.length,
      average: expenses.length ? total / expenses.length : 0,
      anderson,
      julia,
      andersonPercentage: total ? (anderson / total) * 100 : 0,
      juliaPercentage: total ? (julia / total) * 100 : 0,
    }
  }, [accounts, categories, filteredPeriodTransactions, selectedExpenseFamily])

  function changeTrendDimension(dimension: TrendDimension) {
    setTrendDimension(dimension)
    setTrendSelections([])
  }

  function toggleTrendSelection(id: string) {
    setTrendSelections(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id])
  }

  const trendOptions = useMemo(() => {
    if (!classificationOptions) return []
    if (trendDimension === 'bucket') return classificationOptions.buckets.map(option => ({ ...option, group: 'Household Buckets' }))
    if (trendDimension === 'context') return classificationOptions.contexts.map(option => ({ ...option, group: 'Contexts' }))
    return classificationOptions.categories
      .filter(option => option.type === 'expense')
      .map(option => ({ ...option, group: option.family }))
  }, [classificationOptions, trendDimension])

  const groupedTrendOptions = useMemo(() => Object.entries(
    trendOptions.reduce<Record<string, typeof trendOptions>>((groups, option) => {
      (groups[option.group] ??= []).push(option)
      return groups
    }, {}),
  ), [trendOptions])

  const trendMedians = useMemo(() => {
    const today = new Date()
    const completedMonths = year < today.getFullYear() ? 12 : year === today.getFullYear() ? today.getMonth() : 0
    if (completedMonths === 0) return new Map<string, number>()
    return new Map(trendSelections.map(selectionId => {
      const values = trendData
        .slice(0, completedMonths)
        .map(entry => Number(entry[`trend_${selectionId}_total`] ?? 0))
        .sort((left, right) => left - right)
      const middle = Math.floor(values.length / 2)
      const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
      return [selectionId, median]
    }))
  }, [trendData, trendSelections, year])

  const TREND_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#3b82f6','#84cc16']

  const isDrillCategory = drill?.type === 'category'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-white shrink-0">
        {isDrillCategory ? (
          <button onClick={backToSpending} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft size={14} /> Back
          </button>
        ) : drill ? (
          <button onClick={backToCashflow} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft size={14} /> Back
          </button>
        ) : null}
        <div>
          <h2 className="text-base font-semibold text-gray-800">
            {isDrillCategory ? drill!.categoryName : isCustom ? `Reports — ${periodLabel}` : `Reports — ${year}`}
          </h2>
          {drill?.type === 'month' && !isDrillCategory && (
            <p className="text-xs text-gray-400">{drillMonthName} spending breakdown</p>
          )}
        </div>
        <div className="flex-1" />
        {!isDrillCategory && (
          <nav className="flex gap-0.5 p-1 bg-gray-100/80 rounded-xl">
            {[
              { key: 'cashflow' as View, icon: BarChart2, label: 'Cash Flow' },
              { key: 'spending' as View, icon: PieIcon, label: 'Spending' },
              { key: 'trends' as View, icon: TrendIcon, label: 'Trends' },
              { key: 'funding' as View, icon: ArrowLeftRight, label: 'Funding' },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => {
                  setView(v.key)
                  if (v.key === 'cashflow') backToCashflow()
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${view === v.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <v.icon size={12} /> {v.label}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* KPI row */}
        {view === 'cashflow' && !drill && (
          <div className="grid grid-cols-4 gap-3">
            <KpiCard label={`Total Income ${year}`} value={fmt(totalIncome)} color="emerald" icon={TrendingUp} />
            <KpiCard label={`Total Expenses ${year}`} value={fmt(totalExpenses)} color="rose" icon={TrendingDown} />
            <KpiCard label="Avg Monthly Spend" value={fmt(avgMonthlyExpenses)} color="amber" icon={DollarSign} />
            <KpiCard
              label="Savings Rate"
              value={`${savingsRate.toFixed(1)}%`}
              color={savingsRate >= 20 ? 'emerald' : savingsRate >= 10 ? 'amber' : 'rose'}
              icon={Layers}
            />
          </div>
        )}

        {/* CASH FLOW VIEW */}
        {view === 'cashflow' && (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">Monthly Income vs Expenses</h3>
                <span className="text-xs text-gray-400">Click a bar to drill in</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={netData}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  barGap={4}
                  barCategoryGap="35%"
                  onClick={(data: any) => {
                    if (data?.activePayload) drillMonth(data.activePayload[0]?.payload?.month)
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip
              formatter={v => fmt(Number(v ?? 0))}
                    contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                    cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                  />
                  <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name="Income" />
                  <Bar dataKey="expenses" fill="#f87171" radius={[4, 4, 0, 0]} name="Expenses" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Net Cash Flow</h3>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={netData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip
              formatter={v => fmt(Number(v ?? 0))}
                    contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                  />
                  <ReferenceLine y={0} stroke="#e5e7eb" />
                  <Area dataKey="net" stroke="#6366f1" strokeWidth={2} fill="url(#netGrad)" name="Net" dot={{ fill: '#6366f1', r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 text-[10px] text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="text-left px-5 py-3 font-semibold">Month</th>
                    <th className="text-right px-5 py-3 font-semibold">Income</th>
                    <th className="text-right px-5 py-3 font-semibold">Expenses</th>
                    <th className="text-right px-5 py-3 font-semibold">Net</th>
                    <th className="w-8 px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {yearly.map(m => {
                    const net = m.income + m.expenses
                    return (
                      <tr
                        key={m.month}
                        className="hover:bg-indigo-50/40 cursor-pointer group transition-colors"
                        onClick={() => drillMonth(m.month)}
                      >
                        <td className="px-5 py-3 text-gray-700 font-medium">{monthShort(m.month)} {year}</td>
                        <td className="px-5 py-3 text-right text-emerald-600 font-medium">{fmt(m.income)}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{fmt(Math.abs(m.expenses))}</td>
                        <td className={`px-5 py-3 text-right font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {fmt(net, true)}
                        </td>
                        <td className="px-2 py-3 text-gray-300 group-hover:text-gray-500">
                          <ChevronRight size={14} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* SPENDING VIEW */}
        {view === 'spending' && !isDrillCategory && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">Top Expenses — {drillMonthName}</h3>
                  <p className="text-xs text-gray-400 mt-1">Each bar shows who paid, based on the source account. Filters apply to totals and drill-downs.</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs" aria-label="Filter spending by account owner">
                  <button
                    type="button"
                    aria-pressed={spendingOwnerFilters.anderson}
                    onClick={() => toggleSpendingOwner('anderson')}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-medium transition-colors ${spendingOwnerFilters.anderson ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'}`}
                    title={spendingOwnerFilters.anderson && !spendingOwnerFilters.julia ? 'Show both' : 'Show Anderson only'}
                  >
                    <span className={`h-2.5 w-2.5 rounded-sm ${spendingOwnerFilters.anderson ? 'bg-blue-600' : 'bg-gray-300'}`} />
                    Anderson
                  </button>
                  <button
                    type="button"
                    aria-pressed={spendingOwnerFilters.julia}
                    onClick={() => toggleSpendingOwner('julia')}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-medium transition-colors ${spendingOwnerFilters.julia ? 'border-pink-200 bg-pink-50 text-pink-600' : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'}`}
                    title={spendingOwnerFilters.julia && !spendingOwnerFilters.anderson ? 'Show both' : 'Show Julia only'}
                  >
                    <span className={`h-2.5 w-2.5 rounded-sm ${spendingOwnerFilters.julia ? 'bg-pink-500' : 'bg-gray-300'}`} />
                    Julia
                  </button>
                </div>
              </div>
              <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/70 p-2.5">
                <label className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Bucket</span>
                  <select
                    value={spendingBucketFilter}
                    onChange={event => { setSpendingBucketFilter(event.target.value); setSelectedExpenseFamily(null); setDrill(null); setDrillTxns([]) }}
                    className="min-w-44 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">All buckets</option>
                    {(classificationOptions?.buckets ?? []).map(bucket => <option key={bucket.id} value={bucket.id}>{bucket.name}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Context</span>
                  <select
                    value={spendingContextFilter}
                    onChange={event => { setSpendingContextFilter(event.target.value); setSelectedExpenseFamily(null); setDrill(null); setDrillTxns([]) }}
                    className="min-w-52 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">All contexts</option>
                    {(classificationOptions?.contexts ?? []).map(context => <option key={context.id} value={context.id}>{context.name}</option>)}
                  </select>
                </label>
                {(spendingBucketFilter || spendingContextFilter || !allSpendingOwnersSelected) && <button type="button" onClick={() => { setSpendingBucketFilter(''); setSpendingContextFilter(''); setSpendingOwnerFilters({ anderson: true, julia: true }); setSelectedExpenseFamily(null); setDrill(null); setDrillTxns([]) }} className="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50">Clear filters</button>}
                <span className="ml-auto text-[11px] text-gray-400">{expenseFamilies.length} purpose {expenseFamilies.length === 1 ? 'family' : 'families'} · {expenseBreakdown.length} purposes</span>
              </div>
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-3 lg:col-span-2">
                  <button
                    type="button"
                    onClick={() => setSelectedExpenseFamily(null)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${selectedExpenseFamily === null ? 'border-blue-300 bg-blue-50/70 ring-1 ring-blue-100' : 'border-gray-100 bg-gray-50/40 hover:bg-gray-50'}`}
                    aria-pressed={selectedExpenseFamily === null}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-4 font-mono text-[10px] font-semibold text-blue-500">0</span>
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gray-700" />
                        <span className="truncate text-xs font-semibold text-gray-800">Total</span>
                        <span className="shrink-0 text-[10px] text-gray-400">all {expenseBreakdown.length} purposes</span>
                      </div>
                      <div className="ml-3 flex shrink-0 items-center gap-2">
                        <span className="hidden text-[10px] font-semibold text-blue-600 xl:inline">Anderson {fmt(allSpendingSummary.anderson)}</span>
                        <span className="hidden text-[10px] font-semibold text-pink-500 xl:inline">Julia {fmt(allSpendingSummary.julia)}</span>
                        <span className="text-xs font-bold text-gray-800">{fmt(allSpendingSummary.total)}</span>
                      </div>
                    </div>
                    <div className="ml-6 flex h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full bg-blue-600 transition-all" style={{ width: `${allSpendingSummary.andersonPercentage}%` }} />
                      <div className="h-full bg-pink-500 transition-all" style={{ width: `${allSpendingSummary.juliaPercentage}%` }} />
                    </div>
                  </button>
                  {expenseFamilies.map((family, index) => {
                    const maxValue = Math.abs(expenseFamilies[0]?.total ?? 1)
                    const isExpanded = expandedExpenseFamilies.includes(family.name)
                    const andersonPercentage = (family.anderson / maxValue) * 100
                    const juliaPercentage = (family.julia / maxValue) * 100
                    return (
                      <div key={family.name} className={`overflow-hidden rounded-xl border transition-colors ${selectedExpenseFamily === family.name ? 'border-blue-300 bg-blue-50/70 ring-1 ring-blue-100' : 'border-gray-100 bg-gray-50/40'}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedExpenseFamily(family.name)
                            setExpandedExpenseFamilies(previous => previous.includes(family.name)
                              ? previous.filter(name => name !== family.name)
                              : [...previous, family.name])
                          }}
                          className="group w-full px-3 py-2.5 text-left hover:bg-gray-50"
                          aria-expanded={isExpanded}
                          aria-pressed={selectedExpenseFamily === family.name}
                        >
                          <div className="mb-1.5 flex items-center justify-between">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="w-4 font-mono text-[10px] text-gray-300">{index + 1}</span>
                              {isExpanded ? <ChevronDown size={13} className="shrink-0 text-gray-400" /> : <ChevronRight size={13} className="shrink-0 text-gray-400" />}
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: family.color }} />
                              <span className="truncate text-xs font-semibold text-gray-700 group-hover:text-gray-900">{family.name}</span>
                              <span className="shrink-0 text-[10px] text-gray-400">{family.children.length} {family.children.length === 1 ? 'purpose' : 'purposes'}</span>
                            </div>
                            <div className="ml-3 flex shrink-0 items-center gap-2">
                              <span className="hidden text-[10px] font-semibold text-blue-600 xl:inline">Anderson {fmt(family.anderson)}</span>
                              <span className="hidden text-[10px] font-semibold text-pink-500 xl:inline">Julia {fmt(family.julia)}</span>
                              <span className="text-xs font-bold text-gray-800">{fmt(Math.abs(family.total))}</span>
                            </div>
                          </div>
                          <div className="ml-11 flex h-2 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full bg-blue-600 transition-all" style={{ width: `${andersonPercentage}%` }} title={`Anderson: ${fmt(family.anderson)}`} />
                            <div className="h-full bg-pink-500 transition-all" style={{ width: `${juliaPercentage}%` }} title={`Julia: ${fmt(family.julia)}`} />
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-gray-100 bg-white px-3 py-1.5">
                            {family.children.map(child => {
                              const contribution = contributionByCategory.get(child.categoryId ?? '__none') ?? { anderson: 0, julia: 0 }
                              const familyValue = Math.abs(family.total) || 1
                              const childName = categories.find(category => category.id === child.categoryId)?.name
                                ?? (child.categoryFullName?.includes(':') ? child.categoryFullName.split(':').slice(1).join(':').trim() : child.categoryFullName)
                                ?? 'Uncategorised'
                              return (
                                <button
                                  key={child.categoryId ?? child.categoryFullName}
                                  type="button"
                                  onClick={() => drillCategory(child.categoryId, child.categoryFullName ?? 'Uncategorised', child.categoryColor ?? '#94a3b8')}
                                  className="group/child w-full border-b border-gray-50 py-2 pl-8 text-left last:border-0"
                                >
                                  <div className="mb-1 flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: child.categoryColor }} />
                                      <span className="truncate text-[11px] text-gray-600 group-hover/child:text-blue-600">{childName}</span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <span className="hidden text-[9px] font-medium text-blue-600 xl:inline">A {fmt(contribution.anderson)}</span>
                                      <span className="hidden text-[9px] font-medium text-pink-500 xl:inline">J {fmt(contribution.julia)}</span>
                                      <span className="text-[11px] font-semibold text-gray-700">{fmt(Math.abs(child.total))}</span>
                                      <ChevronRight size={11} className="text-gray-300 group-hover/child:text-blue-500" />
                                    </div>
                                  </div>
                                  <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-100">
                                    <div className="bg-blue-600" style={{ width: `${(contribution.anderson / familyValue) * 100}%` }} />
                                    <div className="bg-pink-500" style={{ width: `${(contribution.julia / familyValue) * 100}%` }} />
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {expenseFamilies.length === 0 && <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">No expenses match these filters.</div>}
                  {incomeBreakdown.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Income</p>
                  <div className="space-y-1.5">
                    {incomeBreakdown.map(c => (
                      <button
                        key={c.categoryId}
                        onClick={() => drillCategory(c.categoryId, c.categoryFullName ?? 'Uncategorised', c.categoryColor ?? '#94a3b8')}
                        className="w-full flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.categoryColor }} />
                          <span className="text-xs text-gray-600 group-hover:text-gray-900">{c.categoryFullName ?? 'Uncategorised'}</span>
                        </div>
                        <span className="text-xs font-bold text-emerald-600">{fmt(c.total)}</span>
                      </button>
                    ))}
                  </div>
                    </div>
                  )}
                </div>

                <aside className="h-fit overflow-hidden rounded-xl border border-gray-200 bg-gray-50/60 lg:sticky lg:top-4">
                  <div className="border-b border-gray-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold text-gray-800">{selectedExpenseFamily ? `${selectedExpenseFamily} expense summary` : 'Filtered expense summary'}</p>
                    <p className="mt-0.5 text-[10px] text-gray-400">{spendingSummary.count} transaction{spendingSummary.count === 1 ? '' : 's'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-gray-200">
                    <div className="bg-white px-4 py-3">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Total</p>
                      <p className="mt-1 text-sm font-bold text-gray-800">{fmt(spendingSummary.total)}</p>
                    </div>
                    <div className="bg-white px-4 py-3">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Average transaction</p>
                      <p className="mt-1 text-sm font-bold text-gray-800">{fmt(spendingSummary.average)}</p>
                    </div>
                  </div>
                  <div className="space-y-4 px-4 py-4">
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-blue-600">Anderson</span>
                        <span className="text-right text-xs font-bold text-gray-700">{fmt(spendingSummary.anderson)} <span className="font-medium text-gray-400">· {spendingSummary.andersonPercentage.toFixed(1)}%</span></span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${spendingSummary.andersonPercentage}%` }} /></div>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-pink-500">Julia</span>
                        <span className="text-right text-xs font-bold text-gray-700">{fmt(spendingSummary.julia)} <span className="font-medium text-gray-400">· {spendingSummary.juliaPercentage.toFixed(1)}%</span></span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-pink-500" style={{ width: `${spendingSummary.juliaPercentage}%` }} /></div>
                    </div>
                    <p className="text-[10px] leading-4 text-gray-400">Attribution follows the owner of the account that paid each expense.</p>
                  </div>
                </aside>
              </div>
          </div>
        )}

        {/* DRILL: category transactions */}
        {isDrillCategory && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/80">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: drill!.color }} />
              <span className="text-sm font-semibold text-gray-700">{drill!.categoryName}</span>
              <span className="text-xs text-gray-400 ml-1">— {drillMonthName}</span>
              <span className="ml-auto text-sm font-bold text-gray-700">
                {fmt(drillTxns.reduce((s, t) => s + t.amount, 0))}
              </span>
            </div>
            {drillTxns.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-12">No transactions found</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="text-left px-5 py-2.5 font-semibold">
                      <button type="button" onClick={() => changeDrillSort('description')} className="inline-flex items-center gap-1.5 hover:text-gray-700">Description <DrillSortIcon column="description" /></button>
                    </th>
                    <th className="text-left px-5 py-2.5 font-semibold">
                      <button type="button" onClick={() => changeDrillSort('account')} className="inline-flex items-center gap-1.5 hover:text-gray-700">Account <DrillSortIcon column="account" /></button>
                    </th>
                    <th className="px-5 py-2.5 text-right font-semibold">
                      <button type="button" onClick={() => changeDrillSort('date')} className="ml-auto inline-flex items-center gap-1.5 hover:text-gray-700">Date <DrillSortIcon column="date" /></button>
                    </th>
                    <th className="px-5 py-2.5 text-right font-semibold">
                      <button type="button" onClick={() => changeDrillSort('amount')} className="ml-auto inline-flex items-center gap-1.5 hover:text-gray-700">Amount <DrillSortIcon column="amount" /></button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedDrillTxns.map(t => (
                    <tr key={t.id} onClick={() => setEditTransaction(t)} className="cursor-pointer hover:bg-blue-50/60" title="Click to edit transaction">
                      <td className="px-5 py-2.5 text-gray-700 max-w-xs truncate">{t.description}</td>
                      <td className="px-5 py-2.5 text-gray-400 text-xs">{t.accountName}</td>
                      <td className="px-5 py-2.5 text-right text-gray-400 text-xs">{t.date}</td>
                      <td className={`px-5 py-2.5 text-right font-semibold ${t.amount > 0 ? 'text-emerald-600' : 'text-gray-700'}`}>
                        {fmt(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TRENDS VIEW */}
        {view === 'trends' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="mb-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                <h3 className="text-sm font-semibold text-gray-700">Spending Trends</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Choose a reporting dimension, then select its values to compare.</p>
                </div>
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                  {([
                    ['bucket', 'Buckets'],
                    ['context', 'Contexts'],
                    ['purpose', 'Purposes'],
                  ] as [TrendDimension, string][]).map(([dimension, label]) => (
                    <button
                      key={dimension}
                      onClick={() => changeTrendDimension(dimension)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                        trendDimension === dimension ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                {groupedTrendOptions.map(([group, options]) => (
                  <div key={group} className="flex items-start gap-3">
                    <span className="w-32 shrink-0 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{group}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {options.map(option => {
                        const active = trendSelections.includes(option.id)
                        const selectedIndex = trendSelections.indexOf(option.id)
                        return (
                          <button
                            key={option.id}
                            onClick={() => toggleTrendSelection(option.id)}
                            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                              active ? 'border-transparent text-white shadow-sm' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                            }`}
                            style={active ? { backgroundColor: TREND_COLORS[selectedIndex % TREND_COLORS.length] } : {}}
                          >
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : '#94a3b8' }} />
                            {option.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {groupedTrendOptions.length === 0 && <p className="py-2 text-xs text-gray-400">Loading options…</p>}
              </div>
              {trendSelections.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-4 text-[11px] text-gray-500">
                  <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-6 bg-gray-700" />Total</span>
                  <span className="inline-flex items-center gap-1.5 text-green-700"><span className="w-6 border-t-2 border-dashed border-green-600" />Anderson</span>
                  <span className="inline-flex items-center gap-1.5 text-yellow-700"><span className="w-6 border-t-2 border-dotted border-yellow-500" />Julia</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-6 border-t border-dashed border-gray-400" />Historical median</span>
                  <span className="inline-flex items-center gap-1.5 text-blue-600"><span className="w-6 border-t-2 border-dashed border-blue-500" />Projection</span>
                </div>
              )}
            </div>
            {trendSelections.length > 0 && trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    {trendSelections.map((selectionId, i) => (
                      <linearGradient key={selectionId} id={`grad${selectionId}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={TREND_COLORS[i % TREND_COLORS.length]} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={TREND_COLORS[i % TREND_COLORS.length]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip
                    content={({ active, label, payload }: any) => {
                      if (!active || !payload?.length) return null
                      const ranked = [...payload].sort((left, right) => {
                        const leftTotal = String(left.name).endsWith('· Total')
                        const rightTotal = String(right.name).endsWith('· Total')
                        if (leftTotal !== rightTotal) return leftTotal ? -1 : 1
                        const leftProjection = String(left.name).endsWith('· Projection')
                        const rightProjection = String(right.name).endsWith('· Projection')
                        if (leftProjection !== rightProjection) return leftProjection ? -1 : 1
                        return Number(right.value ?? 0) - Number(left.value ?? 0)
                      })
                      return (
                        <div className="min-w-52 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-lg">
                          <p className="mb-2 font-semibold text-gray-700">{label}</p>
                          <div className="space-y-1.5">
                            {ranked.map((item: any, index: number) => {
                              const isTotal = String(item.name).endsWith('· Total')
                              const isProjection = String(item.name).endsWith('· Projection')
                              const isAnderson = String(item.name).endsWith('· Anderson')
                              const color = isTotal || isProjection ? item.color : isAnderson ? '#16a34a' : '#eab308'
                              return (
                                <div key={`${item.dataKey}-${index}`} className={`flex items-center justify-between gap-5 ${isTotal ? 'border-b border-gray-100 pb-1.5 font-bold' : ''} ${isProjection ? 'italic' : ''}`}>
                                  <span className="flex items-center gap-1.5 text-gray-600">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                                    {item.name}
                                  </span>
                                  <span className="font-semibold" style={{ color }}>{fmt(Number(item.value ?? 0))}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    }}
                  />
                  {trendSelections.map((selectionId, i) => {
                    const option = trendOptions.find(value => value.id === selectionId)
                    const color = TREND_COLORS[i % TREND_COLORS.length]
                    const median = trendMedians.get(selectionId)
                    return median == null ? null : (
                      <ReferenceLine
                        key={`${selectionId}-median`}
                        y={median}
                        stroke={color}
                        strokeOpacity={0.45}
                        strokeDasharray="4 5"
                        label={{ value: `${option?.name ?? selectionId} median ${fmtShort(median)}`, position: 'insideTopRight', fill: color, fontSize: 9 }}
                      />
                    )
                  })}
                  {trendSelections.map((selectionId, i) => {
                    const option = trendOptions.find(value => value.id === selectionId)
                    const color = TREND_COLORS[i % TREND_COLORS.length]
                    return (
                      <Area
                        key={`${selectionId}-total`}
                        dataKey={`trend_${selectionId}_total`}
                        name={`${option?.name ?? String(selectionId)} · Total`}
                        stroke={color}
                        strokeWidth={3}
                        fill={`url(#grad${selectionId})`}
                        dot={{ r: 3, fill: color }}
                      />
                    )
                  })}
                  {trendSelections.map(selectionId => {
                    const option = trendOptions.find(value => value.id === selectionId)
                    return (
                      <Line
                        key={`${selectionId}-anderson`}
                        dataKey={`trend_${selectionId}_anderson`}
                        name={`${option?.name ?? String(selectionId)} · Anderson`}
                        stroke="#16a34a"
                        strokeWidth={2}
                        strokeDasharray="8 4"
                        dot={{ r: 2.5, fill: 'white', stroke: '#16a34a', strokeWidth: 2 }}
                        activeDot={{ r: 4 }}
                      />
                    )
                  })}
                  {trendSelections.map(selectionId => {
                    const option = trendOptions.find(value => value.id === selectionId)
                    return (
                      <Line
                        key={`${selectionId}-julia`}
                        dataKey={`trend_${selectionId}_julia`}
                        name={`${option?.name ?? String(selectionId)} · Julia`}
                        stroke="#eab308"
                        strokeWidth={2}
                        strokeDasharray="2 4"
                        dot={{ r: 2.5, fill: '#eab308' }}
                        activeDot={{ r: 4 }}
                      />
                    )
                  })}
                  {trendSelections.map((selectionId, i) => {
                    const option = trendOptions.find(value => value.id === selectionId)
                    const color = TREND_COLORS[i % TREND_COLORS.length]
                    return (
                      <Line
                        key={`${selectionId}-projection`}
                        dataKey={`trend_${selectionId}_projection`}
                        name={`${option?.name ?? String(selectionId)} · Projection`}
                        stroke={color}
                        strokeWidth={2.5}
                        strokeDasharray="10 6"
                        dot={{ r: 2.5, fill: 'white', stroke: color, strokeWidth: 2 }}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    )
                  })}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                {trendSelections.length === 0 ? `Select ${trendDimension} values above to see trends` : 'Loading…'}
              </div>
            )}
          </div>
        )}

        {view === 'funding' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <KpiCard label={`Funding transfers · ${isCustom ? periodLabel : year}`} value={fmt(fundingTransfers.reduce((sum, transfer) => sum + Math.abs(transfer.amount), 0))} color="indigo" icon={ArrowLeftRight} />
              <KpiCard label="Classified transfers" value={String(fundingTransfers.length)} color="emerald" icon={Layers} />
              <KpiCard label="Property funding" value={fmt(fundingTransfers.filter(transfer => transfer.transferReason === 'property_funding').reduce((sum, transfer) => sum + Math.abs(transfer.amount), 0))} color="amber" icon={DollarSign} />
            </div>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4"><h3 className="text-sm font-semibold text-gray-700">Funding movements</h3><p className="mt-1 text-xs text-gray-400">Shown separately from income and expenses. Ordinary account movements are excluded.</p></div>
              {fundingTransfers.length ? <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/80 text-[10px] uppercase tracking-widest text-gray-400"><th className="px-5 py-3 text-left font-semibold">Date</th><th className="px-5 py-3 text-left font-semibold">Reason</th><th className="px-5 py-3 text-left font-semibold">Funding context</th><th className="px-5 py-3 text-left font-semibold">Movement</th><th className="px-5 py-3 text-right font-semibold">Amount</th></tr></thead><tbody className="divide-y divide-gray-50">{fundingTransfers.map(transfer => <tr key={transfer.id} className="hover:bg-sky-50/40"><td className="px-5 py-3 text-xs text-gray-400">{transfer.date}</td><td className="px-5 py-3 font-medium text-gray-700">{transferReasonLabel(transfer.transferReason)}</td><td className="px-5 py-3 text-gray-500">{transfer.contextName ?? '—'}</td><td className="px-5 py-3 text-xs text-gray-500">{transfer.accountName} → {transfer.targetAccountName ?? 'Unknown account'}</td><td className="px-5 py-3 text-right font-semibold text-sky-600">{fmt(Math.abs(transfer.amount))}</td></tr>)}</tbody></table> : <div className="py-14 text-center text-sm text-gray-400">No classified funding transfers in this period.</div>}
            </div>
          </div>
        )}
      </div>
      {editTransaction && (
        <TransactionFormModal
          transaction={editTransaction}
          accounts={accounts}
          categories={categories}
          defaultAccountId={selectedAccountId}
          onClose={() => setEditTransaction(null)}
          onSave={async data => {
            await api.transactions.update(editTransaction.id, data)
            const currentDrill = drill
            setEditTransaction(null)
            setRefreshKey(value => value + 1)
            onRefreshAccounts?.()
            if (currentDrill?.type === 'category') {
              await drillCategory(currentDrill.categoryId ?? null, currentDrill.categoryName ?? 'Uncategorised', currentDrill.color ?? '#94a3b8')
            }
          }}
        />
      )}
    </div>
  )
}

function KpiCard({ label, value, color, icon: Icon }: {
  label: string
  value: string
  color: 'emerald' | 'rose' | 'amber' | 'indigo'
  icon: any
}) {
  const colors = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'text-emerald-400' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600', icon: 'text-rose-400' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'text-amber-400' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', icon: 'text-indigo-400' },
  }
  const c = colors[color]
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex items-start gap-3">
      <div className={`p-2 rounded-xl ${c.bg}`}>
        <Icon size={16} className={c.icon} />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className={`text-lg font-bold mt-0.5 ${c.text}`}>{value}</p>
      </div>
    </div>
  )
}
