import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, Plus, Edit2, Trash2 } from 'lucide-react'
import { api } from '../api'
import { fmt } from '../utils'
import { TransactionFormModal } from '../components/TransactionFormModal'
import { CategoryPill } from '../components/CategoryPill'
import type { Transaction, Account, Category } from '../types/finance'

interface CalendarDay {
  date: string
  total: number
  income: number
  expenses: number
  balance: number
  transactionCount: number
}

interface Props {
  accounts: Account[]
  categories: Category[]
  selectedAccountId: string | null
  month: number
  year: number
  onRefreshAccounts: () => void
  onRefreshCategories?: () => void
  onMonthChange?: (m: number) => void
  onYearChange?: (y: number) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildGrid(year: number, month: number, dayMap: Map<string, CalendarDay>) {
  const firstDay = new Date(year, month - 1, 1)
  const lastDate = new Date(year, month, 0).getDate()
  const startDow = (firstDay.getDay() + 6) % 7 // Mon=0

  const cells: Array<{ date: string; day: number; isCurrentMonth: boolean; data: CalendarDay | null }> = []

  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, -i)
    cells.push({ date: localDateStr(d), day: d.getDate(), isCurrentMonth: false, data: null })
  }
  for (let d = 1; d <= lastDate; d++) {
    const dt = new Date(year, month - 1, d)
    const dateStr = localDateStr(dt)
    cells.push({ date: dateStr, day: d, isCurrentMonth: true, data: dayMap.get(dateStr) ?? null })
  }
  const rem = cells.length % 7
  if (rem !== 0) {
    for (let i = 1; i <= 7 - rem; i++) {
      const dt = new Date(year, month, i)
      cells.push({ date: localDateStr(dt), day: dt.getDate(), isCurrentMonth: false, data: null })
    }
  }
  return cells
}

export function CalendarPage({ accounts, categories, selectedAccountId, month, year, onRefreshAccounts }: Props) {
  const [calData, setCalData] = useState<{ startBalance: number; days: CalendarDay[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [calError, setCalError] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [calKey, setCalKey] = useState(0)

  const loadCalendar = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setCalError(null)
    api.transactions
      .calendarSummary(month, year, selectedAccountId ?? undefined)
      .then(data => { if (!cancelled) { setCalData(data); setLoading(false) } })
      .catch((err: any) => {
        if (!cancelled) {
          const msg = err?.message ?? String(err)
          console.error('[Calendar] calendarSummary failed:', msg)
          setCalError(msg)
          setCalData(null)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [month, year, selectedAccountId, calKey])

  useEffect(() => loadCalendar(), [loadCalendar])

  const dayMap = useMemo(() => {
    if (!calData) return new Map<string, CalendarDay>()
    return new Map(calData.days.map(d => [d.date, d]))
  }, [calData])

  const grid = useMemo(() => buildGrid(year, month, dayMap), [year, month, dayMap])

  const todayStr = localDateStr(new Date())

  const monthIncome = calData?.days.reduce((s, d) => s + d.income, 0) ?? 0
  const monthExpenses = calData?.days.reduce((s, d) => s + d.expenses, 0) ?? 0
  const net = monthIncome + monthExpenses
  function refreshCalendar() { setCalKey(k => k + 1) }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Summary strip */}
      <div className="flex items-stretch border-b border-gray-100 bg-white shrink-0">
        <SummaryCell label="Income" value={fmt(monthIncome)} valueClass="text-emerald-600" />
        <SummaryCell label="Expenses" value={fmt(Math.abs(monthExpenses))} valueClass="text-rose-500" />
        <SummaryCell
          label="Net"
          value={calData ? fmt(net, true) : '—'}
          valueClass={net >= 0 ? 'text-emerald-600' : 'text-rose-500'}
          last
        />
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 bg-white border-b border-gray-200 shrink-0">
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            className={`py-2 text-center text-xs font-semibold uppercase tracking-widest border-r border-gray-100 last:border-r-0 ${
              i >= 5 ? 'text-rose-400' : 'text-gray-400'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
        ) : calError ? (
          <div className="flex items-center justify-center h-40 px-8">
            <p className="text-sm text-red-500 text-center break-all">Error loading calendar: {calError}</p>
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {grid.map((cell, idx) => {
              const isWeekend = (idx % 7) >= 5
              const isToday = cell.date === todayStr
              const isSelected = cell.date === selectedDay

              return (
                <div
                  key={cell.date}
                  onDoubleClick={() => cell.isCurrentMonth && setSelectedDay(cell.date)}
                  className={[
                    'border-b border-r border-gray-100 p-2 flex flex-col min-h-[100px] select-none',
                    cell.isCurrentMonth ? 'bg-white hover:bg-blue-50/40 cursor-pointer' : 'bg-gray-50/60',
                    isSelected ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/60' : '',
                    isToday && !isSelected ? 'ring-2 ring-inset ring-blue-300' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    {cell.isCurrentMonth && cell.data && cell.data.transactionCount > 1 ? (
                      <span
                        className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500"
                        title={`${cell.data.transactionCount} transactions`}
                      >
                        {cell.data.transactionCount} txns
                      </span>
                    ) : <span />}
                    {isToday ? (
                      <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {cell.day}
                      </span>
                    ) : (
                      <span className={`text-sm font-medium ${
                        !cell.isCurrentMonth ? 'text-gray-300'
                          : isWeekend ? 'text-rose-400'
                          : 'text-gray-500'
                      }`}>
                        {cell.day}
                      </span>
                    )}
                  </div>

                  {cell.data && cell.isCurrentMonth && (
                    <div className="mt-auto pt-2 space-y-0.5">
                      {cell.data.total !== 0 && <p className={`text-xs font-bold text-right tabular-nums ${cell.data.total > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{fmt(cell.data.total, true)}</p>}
                      <p className="text-xs font-semibold text-right tabular-nums text-slate-400" title="Closing balance at the end of this day">
                        {fmt(cell.data.balance)}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Day panel */}
      {selectedDay && (
        <DayPanel
          date={selectedDay}
          accounts={accounts}
          categories={categories}
          selectedAccountId={selectedAccountId}
          onClose={() => setSelectedDay(null)}
          onChanged={() => { refreshCalendar(); onRefreshAccounts() }}
        />
      )}
    </div>
  )
}

// ─── Day transactions panel ───────────────────────────────────────────────────

function DayPanel({ date, accounts, categories, selectedAccountId, onClose, onChanged }: {
  date: string
  accounts: Account[]
  categories: Category[]
  selectedAccountId: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.transactions
      .list({ dateFrom: date, dateTo: date, accountId: selectedAccountId ?? undefined })
      .then(data => { if (!cancelled) { setTxs(data); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [date, selectedAccountId, refreshKey])

  // Close on Escape
  useEffect(() => {
    if (showAdd || editTx) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, showAdd, editTx])

  function refresh() { setRefreshKey(k => k + 1); onChanged() }

  async function handleDelete(id: string) {
    if (!confirm('Delete this transaction?')) return
    await api.transactions.delete(id)
    refresh()
  }

  const incomeTxs = txs.filter(t => t.amount > 0 && !t.isTransfer)
  const expenseTxs = txs.filter(t => t.amount < 0 && !t.isTransfer)
  const transferTxs = txs.filter(t => t.isTransfer)
  const income = incomeTxs.reduce((s, t) => s + t.amount, 0)
  const expenses = expenseTxs.reduce((s, t) => s + t.amount, 0)

  const [y, m, d] = date.split('-').map(Number)
  const displayDate = new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-[100]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-[480px] bg-white shadow-2xl z-[101] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-800 truncate">{displayDate}</h2>
            {!loading && txs.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {txs.length} transaction{txs.length !== 1 ? 's' : ''}
                {income > 0 && <span className="text-emerald-600 ml-2">{fmt(income)}</span>}
                {expenses < 0 && <span className="text-rose-500 ml-1">{fmt(expenses)}</span>}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shrink-0"
          >
            <Plus size={14} /> Add
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        {/* Transaction list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
          )}
          {!loading && txs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-400">
              <p className="text-sm">No transactions on this day</p>
              <button
                onClick={() => setShowAdd(true)}
                className="text-blue-600 text-sm hover:underline"
              >
                Add one
              </button>
            </div>
          )}
          {!loading && incomeTxs.length > 0 && (
            <DayTxGroup
              label="Income"
              transactions={incomeTxs}
              total={income}
              tone="income"
              onEdit={setEditTx}
              onDelete={handleDelete}
            />
          )}
          {!loading && expenseTxs.length > 0 && (
            <DayTxGroup
              label="Expenses"
              transactions={expenseTxs}
              total={expenses}
              tone="expense"
              onEdit={setEditTx}
              onDelete={handleDelete}
            />
          )}
          {!loading && transferTxs.length > 0 && (
            <DayTxGroup
              label="Transfers"
              transactions={transferTxs}
              tone="transfer"
              onEdit={setEditTx}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>

      {(showAdd || editTx) && (
        <TransactionFormModal
          transaction={editTx ?? undefined}
          accounts={accounts}
          categories={categories}
          defaultDate={date}
          onClose={() => { setShowAdd(false); setEditTx(null) }}
          onSave={async data => {
            if (editTx) await api.transactions.update(editTx.id, data)
            else await api.transactions.add(data)
            setShowAdd(false); setEditTx(null)
            refresh()
          }}
        />
      )}
    </>
  )
}

function DayTxGroup({ label, transactions, total, tone, onEdit, onDelete }: {
  label: string
  transactions: Transaction[]
  total?: number
  tone: 'income' | 'expense' | 'transfer'
  onEdit: (transaction: Transaction) => void
  onDelete: (id: string) => void
}) {
  const tones = {
    income: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    expense: 'bg-rose-50 text-rose-600 border-rose-100',
    transfer: 'bg-sky-50 text-sky-600 border-sky-100',
  }

  return (
    <section>
      <div className={`flex items-center justify-between px-5 py-2 border-y ${tones[tone]}`}>
        <span className="text-[11px] font-bold uppercase tracking-widest">
          {label} <span className="font-medium opacity-60">{transactions.length}</span>
        </span>
        {total !== undefined && <span className="text-xs font-bold tabular-nums">{fmt(total)}</span>}
      </div>
      {transactions.map(tx => (
        <DayTxRow
          key={tx.id}
          tx={tx}
          onEdit={() => onEdit(tx)}
          onDelete={() => onDelete(tx.id)}
        />
      ))}
    </section>
  )
}

function DayTxRow({ tx, onEdit, onDelete }: { tx: Transaction; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 hover:bg-gray-50 group">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate font-medium">{tx.description}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <CategoryPill name={tx.categoryFullName} color={tx.categoryColor} />
          {tx.accountName && <span className="text-[11px] text-gray-300">{tx.accountName}</span>}
        </div>
      </div>
      <span className={`text-sm font-bold tabular-nums shrink-0 ${
        tx.isTransfer ? 'text-sky-600'
          : tx.amount > 0 ? 'text-emerald-600'
          : 'text-slate-700'
      }`}>
        {tx.isTransfer ? `→ ${tx.targetAccountName ?? ''}` : fmt(tx.amount)}
      </span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700">
          <Edit2 size={13} />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-600">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function SummaryCell({ label, value, valueClass = 'text-gray-700', last = false }: {
  label: string; value: string; valueClass?: string; last?: boolean
}) {
  return (
    <div className={`flex flex-col py-2 px-4 ${last ? '' : 'border-r border-gray-100'}`}>
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">{label}</span>
      <span className={`text-sm font-bold mt-0.5 tabular-nums ${valueClass}`}>{value}</span>
    </div>
  )
}
