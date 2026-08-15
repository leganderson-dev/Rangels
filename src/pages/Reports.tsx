import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, ReferenceLine
} from 'recharts'
import { api } from '../api'
import { fmt, fmtShort, monthShort, monthName } from '../utils'
import type { Account, Category, Transaction } from '../types/finance'
import { TrendingUp, TrendingDown, DollarSign, ChevronRight, ArrowLeft, ArrowLeftRight, BarChart2, PieChart as PieIcon, TrendingUp as TrendIcon, Layers } from 'lucide-react'
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
  const [trendCats, setTrendCats] = useState<string[]>([])
  const [trendData, setTrendData] = useState<any[]>([])
  const [fundingTransfers, setFundingTransfers] = useState<Transaction[]>([])
  const [periodTransactions, setPeriodTransactions] = useState<Transaction[]>([])
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const isCustom = dateMode === 'custom' && !!customFrom && !!customTo

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
    setDrillTxns(txns)
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
    if (view !== 'trends' || trendCats.length === 0) { setTrendData([]); return }
    Promise.all(
      Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
        api.transactions.monthSummary(m, year, selectedAccountId).then(s => ({ month: m, byCategory: s?.byCategory ?? [] }))
      )
    ).then(months => {
      const data = months.map(({ month: m, byCategory }) => {
        const entry: any = { name: monthShort(m) }
        trendCats.forEach(catId => {
          const found = byCategory.find((c: any) => c.categoryId === catId)
          entry[`cat_${catId}`] = found ? Math.abs(found.total) : 0
        })
        return entry
      })
      setTrendData(data)
    })
  }, [view, trendCats, year, selectedAccountId])

  const netData = yearly.map(m => ({
    name: monthShort(m.month),
    month: m.month,
    net: m.income + m.expenses,
    income: m.income,
    expenses: Math.abs(m.expenses),
  }))

  const expenseBreakdown = catBreakdown.filter(c => c.total < 0)
  const incomeBreakdown = catBreakdown.filter(c => c.total > 0)
  const totalExpenses = yearly.reduce((s, m) => s + Math.abs(m.expenses), 0)
  const totalIncome = yearly.reduce((s, m) => s + m.income, 0)
  const avgMonthlyExpenses = yearly.filter(m => m.expenses !== 0).length
    ? totalExpenses / yearly.filter(m => m.expenses !== 0).length : 0
  const netSavings = totalIncome - totalExpenses
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0

  const periodLabel = isCustom ? `${customFrom!.slice(5)} – ${customTo!.slice(5)}` : `${monthName(month)} ${year}`
  const drillMonthName = drill?.month ? `${monthName(drill.month)} ${year}` : periodLabel
  const topExpCats = expenseBreakdown.slice(0, 8)

  const contributionByCategory = useMemo(() => {
    const juliaAccounts = new Set(accounts
      .filter(account => /julia/i.test(account.memberName) || /^julia\b/i.test(account.name))
      .map(account => account.id))
    const totals = new Map<string, { anderson: number; julia: number }>()

    for (const transaction of periodTransactions) {
      if (transaction.isTransfer || transaction.status !== 'C' || transaction.amount >= 0) continue
      const key = transaction.categoryId ?? '__none'
      const current = totals.get(key) ?? { anderson: 0, julia: 0 }
      const amount = Math.abs(transaction.amount)
      if (juliaAccounts.has(transaction.accountId)) current.julia += amount
      else current.anderson += amount
      totals.set(key, current)
    }

    return totals
  }, [accounts, periodTransactions])

  const topCatsForTrend = useMemo(() =>
    catBreakdown.filter(c => c.total < 0).slice(0, 10),
  [catBreakdown])

  function toggleTrendCat(id: string) {
    setTrendCats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

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
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">Top Expenses — {drillMonthName}</h3>
                  <p className="text-xs text-gray-400 mt-1">Each bar shows who paid, based on the source account. Click a row to drill in.</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />Anderson</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-pink-500" />Julia</span>
                </div>
              </div>
              <div className="space-y-3">
                {topExpCats.map((c, i) => {
                  const maxVal = Math.abs(expenseBreakdown[0]?.total ?? 1)
                  const contribution = contributionByCategory.get(c.categoryId ?? '__none') ?? { anderson: 0, julia: 0 }
                  const andersonPct = (contribution.anderson / maxVal) * 100
                  const juliaPct = (contribution.julia / maxVal) * 100
                  return (
                    <button
                      key={c.categoryId}
                      onClick={() => drillCategory(c.categoryId, c.categoryFullName ?? 'Uncategorised', c.categoryColor ?? '#94a3b8')}
                      className="w-full group text-left"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-300 w-4 font-mono">{i + 1}</span>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.categoryColor }} />
                          <span className="text-xs text-gray-600 group-hover:text-gray-900 transition-colors">{c.categoryFullName ?? 'Uncategorised'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="hidden md:inline text-[10px] font-semibold text-blue-600">Anderson {fmt(contribution.anderson)}</span>
                          <span className="hidden md:inline text-[10px] font-semibold text-pink-500">Julia {fmt(contribution.julia)}</span>
                          <span className="text-xs font-bold text-gray-700">{fmt(Math.abs(c.total))}</span>
                          <ChevronRight size={12} className="text-gray-300 group-hover:text-gray-500" />
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden ml-6 flex">
                        <div
                          className="h-full bg-blue-600 transition-all"
                          style={{ width: `${andersonPct}%` }}
                          title={`Anderson: ${fmt(contribution.anderson)}`}
                        />
                        <div
                          className="h-full bg-pink-500 transition-all"
                          style={{ width: `${juliaPct}%` }}
                          title={`Julia: ${fmt(contribution.julia)}`}
                        />
                      </div>
                    </button>
                  )
                })}
              </div>
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
                    <th className="text-left px-5 py-2.5 font-semibold">Description</th>
                    <th className="text-left px-5 py-2.5 font-semibold">Account</th>
                    <th className="text-right px-5 py-2.5 font-semibold">Date</th>
                    <th className="text-right px-5 py-2.5 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {drillTxns.map(t => (
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
            <div className="flex items-start gap-4 mb-5">
              <div className="shrink-0">
                <h3 className="text-sm font-semibold text-gray-700">Spending Trends</h3>
                <p className="text-xs text-gray-400 mt-0.5">Select categories to compare</p>
              </div>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {topCatsForTrend.map((c, i) => {
                  const active = trendCats.includes(c.categoryId)
                  return (
                    <button
                      key={c.categoryId}
                      onClick={() => toggleTrendCat(c.categoryId)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                        active ? 'text-white border-transparent shadow-sm' : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                      }`}
                      style={active ? { backgroundColor: TREND_COLORS[i % TREND_COLORS.length] } : {}}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : (c.categoryColor ?? '#94a3b8') }}
                      />
                      {c.categoryFullName ?? 'Uncategorised'}
                    </button>
                  )
                })}
              </div>
            </div>
            {trendCats.length > 0 && trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    {trendCats.map((catId, i) => (
                      <linearGradient key={catId} id={`grad${catId}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={TREND_COLORS[i % TREND_COLORS.length]} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={TREND_COLORS[i % TREND_COLORS.length]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip
              formatter={v => fmt(Number(v ?? 0))}
                    contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                  />
                  {trendCats.map((catId, i) => {
                    const cat = categories.find(c => c.id === catId)
                    return (
                      <Area
                        key={catId}
                        dataKey={`cat_${catId}`}
                        name={cat?.fullName ?? String(catId)}
                        stroke={TREND_COLORS[i % TREND_COLORS.length]}
                        strokeWidth={2.5}
                        fill={`url(#grad${catId})`}
                        dot={{ r: 3, fill: TREND_COLORS[i % TREND_COLORS.length] }}
                      />
                    )
                  })}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                {trendCats.length === 0 ? 'Select categories above to see trends' : 'Loading…'}
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
