import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { api } from '../api'
import { fmt, monthName } from '../utils'
import { CategoryPill } from '../components/CategoryPill'
import type { Account, Category, MonthSummary } from '../types/finance'

interface Props {
  accounts: Account[]
  categories: Category[]
  selectedAccountId: string | null
  month: number
  year: number
  dateMode?: 'month' | 'custom'
  customFrom?: string
  customTo?: string
}

export function OverviewPage({ accounts, selectedAccountId, month, year, dateMode = 'month', customFrom, customTo }: Props) {
  const [summary, setSummary] = useState<MonthSummary | null>(null)
  const [recent, setRecent] = useState<any[]>([])

  useEffect(() => {
    const filter = dateMode === 'custom' && customFrom && customTo
      ? { dateFrom: customFrom, dateTo: customTo, accountId: selectedAccountId ?? undefined }
      : { month, year, accountId: selectedAccountId ?? undefined }
    if (dateMode === 'custom' && customFrom && customTo) {
      api.transactions.list(filter).then(txs => {
        const income = txs.filter(t => t.amount > 0 && !t.isTransfer && t.status === 'C').reduce((s, t) => s + t.amount, 0)
        const expenses = txs.filter(t => t.amount < 0 && !t.isTransfer && t.status === 'C').reduce((s, t) => s + t.amount, 0)
        const byCat = new Map<string, { categoryId: string; categoryFullName: string; categoryColor: string; total: number }>()
        for (const t of txs) {
          if (t.categoryId && !t.isTransfer && t.status === 'C') {
            const existing = byCat.get(t.categoryId)
            if (existing) existing.total += t.amount
            else byCat.set(t.categoryId, { categoryId: t.categoryId, categoryFullName: t.categoryFullName ?? '', categoryColor: t.categoryColor ?? '#6b7280', total: t.amount })
          }
        }
        setSummary({ income, expenses, balance: income + expenses, byCategory: [...byCat.values()] })
        setRecent(txs.slice(0, 10))
      })
    } else {
      api.transactions.monthSummary(month, year, selectedAccountId).then(setSummary)
      api.transactions.list({ month, year, accountId: selectedAccountId }).then(d => setRecent(d.slice(0, 10)))
    }
  }, [month, year, dateMode, customFrom, customTo, selectedAccountId])

  const totalBalance = accounts
    .filter(account => account.isActive)
    .reduce((sum, account) => sum + (account.balance ?? 0), 0)
  const periodLabel = dateMode === 'custom' && customFrom && customTo
    ? `${customFrom.slice(5)} – ${customTo.slice(5)}`
    : monthName(month)

  return (
    <div className="p-5 overflow-y-auto h-full space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Total Balance"
          value={fmt(totalBalance)}
          color={totalBalance >= 0 ? 'green' : 'red'}
          icon={<Wallet size={18} />}
        />
        <KpiCard
          label={`Income — ${periodLabel}`}
          value={fmt(summary?.income ?? 0)}
          color="green"
          icon={<TrendingUp size={18} />}
        />
        <KpiCard
          label={`Expenses — ${periodLabel}`}
          value={fmt(Math.abs(summary?.expenses ?? 0))}
          color="default"
          icon={<TrendingDown size={18} />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Top spending categories */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Spending — {periodLabel}</h3>
          <div className="space-y-2">
            {summary?.byCategory.filter(c => c.total < 0).slice(0, 8).map(c => (
              <div key={c.categoryId} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.categoryColor }} />
                <span className="flex-1 text-xs text-gray-600 truncate">{c.categoryFullName}</span>
                <span className="text-xs font-semibold text-gray-800">{fmt(Math.abs(c.total))}</span>
              </div>
            ))}
            {(!summary?.byCategory.length) && (
              <p className="text-xs text-gray-400">No data for this period</p>
            )}
          </div>
        </div>

        {/* Account balances */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Accounts</h3>
          <div className="space-y-2">
            {accounts.map(a => (
              <div key={a.id} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
                <span className={`flex-1 text-xs text-gray-600 truncate ${!a.isActive ? 'line-through opacity-60' : ''}`}>{a.name}</span>
                <span className={`text-xs font-semibold ${(a.balance ?? 0) < 0 ? 'text-red-500' : 'text-gray-800'} ${!a.isActive ? 'line-through opacity-60' : ''}`}>
                  {fmt(a.balance ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Transactions</h3>
        <div className="divide-y divide-gray-50">
          {recent.map(tx => (
            <div key={tx.id} className="flex items-center gap-3 py-2">
              <span className="text-xs text-gray-400 w-16 shrink-0">{tx.date.slice(5)}</span>
              <span className="flex-1 text-xs text-gray-700 truncate">{tx.description}</span>
              <CategoryPill name={tx.categoryFullName} color={tx.categoryColor} size="xs" />
              <span className={`text-xs font-semibold w-20 text-right ${tx.amount > 0 ? 'text-green-600' : 'text-gray-700'}`}>
                {fmt(tx.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, color, icon }: { label: string; value: string; color: 'green' | 'red' | 'default'; icon: React.ReactNode }) {
  const colors = { green: 'text-green-600', red: 'text-red-500', default: 'text-gray-800' }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className={`text-lg font-bold mt-0.5 ${colors[color]}`}>{value}</p>
      </div>
    </div>
  )
}
