import { useEffect, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Plus, Trash2, X, Check, Edit2, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronRight, CircleDollarSign, Gauge, ReceiptText, TriangleAlert } from 'lucide-react'
import { api } from '../api'
import { fmt, monthName } from '../utils'
import { TransactionFormModal } from '../components/TransactionFormModal'
import type { Account, Category, ClassificationOptions, Transaction } from '../types/finance'

interface Props {
  accounts: Account[]
  categories: Category[]
  month: number
  year: number
  selectedAccountId: string | null
  onRefreshAccounts?: any
  onRefreshCategories?: any
  onMonthChange?: any
  onYearChange?: any
}

interface BudgetGroup {
  id: string
  name: string
  month: number
  year: number
  amount: number
  spent: number
  spentByMember: Record<string, number>
  transactions: Transaction[]
  members: BudgetGroupMember[]
}

interface BudgetGroupMember {
  id: string
  groupId: string
  memberType: BudgetDimension
  memberId: string
  memberName: string
  memberColor: string
  isExclusion: boolean
}

type BudgetDimension = 'purpose' | 'purpose_family' | 'bucket' | 'context'

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || hex.length < 7) return `rgba(100,100,100,${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const MEMBER_COLORS: Record<string, string> = {
  Anderson: '#2563eb',
  Julia: '#a855f7',
  Joint: '#14b8a6',
  Unassigned: '#94a3b8',
}

function StackedBudgetBar({ spentByMember, budget, height = 'h-2.5' }: {
  spentByMember: Record<string, number>
  budget: number
  height?: string
}) {
  const entries = Object.entries(spentByMember)
    .filter(([, amount]) => amount > 0)
    .sort(([left], [right]) => ['Anderson', 'Julia', 'Joint'].indexOf(left) - ['Anderson', 'Julia', 'Joint'].indexOf(right))
  const spent = entries.reduce((sum, [, amount]) => sum + amount, 0)
  const scale = Math.max(spent, budget, 1)
  const markerPosition = Math.min(100, (budget / scale) * 100)
  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-gray-100 ${height}`}>
      <div className="flex h-full">
        {entries.map(([member, amount]) => (
          <div
            key={member}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(amount / scale) * 100}%`, backgroundColor: MEMBER_COLORS[member] ?? MEMBER_COLORS.Unassigned }}
            title={`${member}: ${fmt(amount)}`}
          />
        ))}
      </div>
      <div
        className="absolute inset-y-0 z-10 border-l-2 border-dashed border-slate-700/70"
        style={{ left: markerPosition === 100 ? 'calc(100% - 2px)' : `${markerPosition}%` }}
        title={`Budget: ${fmt(budget)}`}
      />
    </div>
  )
}

function BudgetMetric({ icon, label, value, detail, tone }: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  tone: 'blue' | 'slate' | 'green' | 'amber' | 'red'
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-lg font-bold tabular-nums text-slate-800">{value}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-400">{detail}</p>
      </div>
    </div>
  )
}

type MemberFilter = 'all' | 'Anderson' | 'Julia'
type TransactionSortKey = 'date' | 'description' | 'account' | 'purpose' | 'amount'

export function BudgetPage({ accounts, categories, month, year, selectedAccountId, onRefreshAccounts, onRefreshCategories }: Props) {
  const [groups, setGroups] = useState<BudgetGroup[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<BudgetGroup | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('all')
  const [applyOwnershipOverrides, setApplyOwnershipOverrides] = useState(false)
  const [transactionSort, setTransactionSort] = useState<{ key: TransactionSortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' })
  const [collapsedPurposeFamilies, setCollapsedPurposeFamilies] = useState<Set<string>>(new Set())
  const [collapsedPurposes, setCollapsedPurposes] = useState<Set<string>>(new Set())
  const [loadError, setLoadError] = useState<string | null>(null)

  const selectedAccount = accounts.find(account => account.id === selectedAccountId) ?? null
  const scopedAccountIds = selectedAccountId
    ? [selectedAccountId]
    : memberFilter === 'all'
      ? undefined
      : applyOwnershipOverrides ? undefined : accounts.filter(account => account.memberName === memberFilter).map(account => account.id)

  function load() {
    setLoadError(null)
    api.budgetGroups.list(month, year, scopedAccountIds, !selectedAccountId && memberFilter !== 'all' ? memberFilter : undefined, applyOwnershipOverrides)
      .then(setGroups)
      .catch(error => {
        console.error('[Budget] Could not load budget groups:', error)
        setLoadError(error instanceof Error ? error.message : String(error))
      })
  }

  useEffect(() => { load() }, [month, year, selectedAccountId, memberFilter, applyOwnershipOverrides, accounts])

  useEffect(() => {
    if (!groups.length) setSelectedGroupId(null)
    else if (!selectedGroupId || !groups.some(group => group.id === selectedGroupId)) setSelectedGroupId(groups[0].id)
  }, [groups, selectedGroupId])

  async function handleDelete(id: string) {
    if (!confirm('Delete this budget group?')) return
    await api.budgetGroups.delete(id)
    load()
  }

  const totalBudget = groups.reduce((s, g) => s + g.amount, 0)
  const totalSpent = groups.reduce((s, g) => s + g.spent, 0)
  const totalSpentByMember = groups.reduce<Record<string, number>>((totals, group) => {
    Object.entries(group.spentByMember ?? {}).forEach(([member, amount]) => {
      totals[member] = (totals[member] ?? 0) + amount
    })
    return totals
  }, {})
  const remaining = totalBudget - totalSpent
  const overallPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
  const overBudgetCount = groups.filter(group => group.amount > 0 && group.spent > group.amount).length
  const watchCount = groups.filter(group => group.amount > 0 && group.spent <= group.amount && group.spent / group.amount >= 0.8).length
  const totalTransactions = groups.reduce((sum, group) => sum + group.transactions.length, 0)
  const selectedGroup = groups.find(group => group.id === selectedGroupId) ?? null
  const selectedGroupTransactions = selectedGroup?.transactions ?? []
  const selectedTransactions = [...selectedGroupTransactions].sort((left, right) => {
    const values: Record<TransactionSortKey, [string | number, string | number]> = {
      date: [left.date, right.date],
      description: [left.description, right.description],
      account: [left.accountName, right.accountName],
      purpose: [left.categoryFullName ?? '', right.categoryFullName ?? ''],
      amount: [Math.abs(left.amount), Math.abs(right.amount)],
    }
    const [leftValue, rightValue] = values[transactionSort.key]
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue))
    return transactionSort.direction === 'asc' ? comparison : -comparison
  })
  const purposeHierarchy = [...selectedTransactions.reduce((familyMap, transaction) => {
    const familyName = transaction.canonicalCategoryFamily ?? 'Uncategorised'
    const purposeName = transaction.canonicalCategoryName ?? 'Needs purpose'
    const family = familyMap.get(familyName) ?? { name: familyName, total: 0, count: 0, purposes: new Map<string, { name: string; total: number; transactions: Transaction[] }>() }
    const purpose = family.purposes.get(purposeName) ?? { name: purposeName, total: 0, transactions: [] }
    const amount = Math.abs(transaction.amount)
    purpose.transactions.push(transaction)
    purpose.total += amount
    family.purposes.set(purposeName, purpose)
    family.total += amount
    family.count += 1
    familyMap.set(familyName, family)
    return familyMap
  }, new Map<string, { name: string; total: number; count: number; purposes: Map<string, { name: string; total: number; transactions: Transaction[] }> }>()).values()]
    .map(family => ({
      ...family,
      purposes: [...family.purposes.values()].sort((left, right) => compareHierarchyGroups(
        left.name,
        left.total,
        left.transactions,
        right.name,
        right.total,
        right.transactions,
        transactionSort.key,
        transactionSort.direction,
      )),
    }))
    .sort((left, right) => compareHierarchyGroups(
      left.name,
      left.total,
      left.purposes.flatMap(purpose => purpose.transactions),
      right.name,
      right.total,
      right.purposes.flatMap(purpose => purpose.transactions),
      transactionSort.key,
      transactionSort.direction,
    ))

  function compareHierarchyGroups(
    leftName: string,
    leftTotal: number,
    leftTransactions: Transaction[],
    rightName: string,
    rightTotal: number,
    rightTransactions: Transaction[],
    key: TransactionSortKey,
    direction: 'asc' | 'desc',
  ) {
    const groupValue = (name: string, total: number, transactions: Transaction[]): string | number => {
      if (key === 'amount') return total
      if (key === 'date') return transactions.map(transaction => transaction.date).sort().at(-1) ?? ''
      if (key === 'account') return [...new Set(transactions.map(transaction => transaction.accountName))].sort().join(', ')
      return name
    }
    const leftValue = groupValue(leftName, leftTotal, leftTransactions)
    const rightValue = groupValue(rightName, rightTotal, rightTransactions)
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue))
    if (comparison !== 0) return direction === 'asc' ? comparison : -comparison
    return leftName.localeCompare(rightName)
  }

  function toggleCollapsed(setter: Dispatch<SetStateAction<Set<string>>>, key: string) {
    setter(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function changeTransactionSort(key: TransactionSortKey) {
    setTransactionSort(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-white shrink-0">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Budget Control Centre</h2>
          <p className="text-xs text-gray-400 mt-0.5">{monthName(month)} {year} · Track limits, ownership and the transactions behind each group</p>
        </div>
        <div className="flex-1" />
        {selectedAccount ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            Account: {selectedAccount.name}
          </div>
        ) : (
          <div className="flex items-center rounded-lg bg-gray-100 p-1" aria-label="Budget account owner filter">
            {(['all', 'Anderson', 'Julia'] as const).map(member => (
              <button
                key={member}
                type="button"
                onClick={() => setMemberFilter(member)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${memberFilter === member ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {member === 'all' ? 'All' : member}
              </button>
            ))}
          </div>
        )}
        <label
          className="flex items-center gap-2 text-xs text-gray-600"
          title="When enabled, budget ownership follows the transaction's assigned reporting owner instead of the paying account owner."
        >
          <input
            type="checkbox"
            checked={applyOwnershipOverrides}
            onChange={event => setApplyOwnershipOverrides(event.target.checked)}
          />
          Apply ownership overrides
        </label>
        <button
          onClick={() => { setEditingGroup(null); setShowForm(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={14} /> New Budget Group
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50/70 p-5 space-y-5">
        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Could not load Budget: {loadError}
          </div>
        )}
        {totalBudget > 0 && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
              <BudgetMetric icon={<CircleDollarSign size={17} />} label="Monthly plan" value={fmt(totalBudget)} detail={`${groups.length} active ${groups.length === 1 ? 'group' : 'groups'}`} tone="blue" />
              <BudgetMetric icon={<ReceiptText size={17} />} label="Tracked spend" value={fmt(totalSpent)} detail={`${totalTransactions} matched transaction${totalTransactions === 1 ? '' : 's'}`} tone="slate" />
              <BudgetMetric icon={remaining < 0 ? <TriangleAlert size={17} /> : <Gauge size={17} />} label={remaining < 0 ? 'Over plan' : 'Available'} value={fmt(Math.abs(remaining))} detail={`${overallPct.toFixed(0)}% of plan used`} tone={remaining < 0 ? 'red' : 'green'} />
              <BudgetMetric icon={<TriangleAlert size={17} />} label="Needs attention" value={`${overBudgetCount + watchCount}`} detail={`${overBudgetCount} over · ${watchCount} near limit`} tone={overBudgetCount > 0 ? 'red' : 'amber'} />
            </div>
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Combined group progress</p>
                  <p className="text-[11px] text-slate-400">Spend can appear in more than one group when their rules overlap.</p>
                </div>
                <span className={`text-sm font-bold tabular-nums ${remaining < 0 ? 'text-red-500' : 'text-slate-700'}`}>{overallPct.toFixed(0)}%</span>
              </div>
              <StackedBudgetBar spentByMember={totalSpentByMember} budget={totalBudget} height="h-2.5" />
            </div>
          </section>
        )}

        {groups.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Plus size={24} className="text-gray-300" />
            </div>
            <p className="text-sm">No budget groups yet</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-blue-600 text-sm hover:underline">
              Create your first budget group
            </button>
          </div>
        )}

        {groups.length > 0 && (
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Budget groups</h3>
              <p className="mt-0.5 text-xs text-slate-400">Choose a group to inspect and edit its matched transactions.</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500">
              {Object.entries(MEMBER_COLORS).filter(([member]) => member !== 'Unassigned').map(([member, color]) => (
                <span key={member} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{member}</span>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map(group => {
          const pct = group.amount > 0 ? (group.spent / group.amount) * 100 : 0
          const over = group.spent > group.amount
          const nearLimit = !over && pct >= 80
          const status = over ? 'Over budget' : nearLimit ? 'Near limit' : 'On track'
          return (
            <div
              key={group.id}
              onClick={() => setSelectedGroupId(group.id)}
              className={`group flex min-h-[230px] flex-col overflow-hidden rounded-2xl border bg-white shadow-sm cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md ${selectedGroupId === group.id ? 'border-blue-400 ring-2 ring-blue-100' : over ? 'border-red-200' : nearLimit ? 'border-amber-200' : 'border-slate-200'}`}
            >
              <div className="flex h-full flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">{group.name}</h3>
                    <span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${over ? 'bg-red-50 text-red-600' : nearLimit ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{status}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button aria-label={`Edit ${group.name}`} onClick={(event) => { event.stopPropagation(); setEditingGroup(group); setShowForm(true) }} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"><Edit2 size={13} /></button>
                    <button aria-label={`Delete ${group.name}`} onClick={(event) => { event.stopPropagation(); handleDelete(group.id) }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={13} /></button>
                  </div>
                </div>

                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Spent</p>
                    <p className={`mt-0.5 text-2xl font-bold tabular-nums ${over ? 'text-red-500' : 'text-slate-800'}`}>{fmt(group.spent)}</p>
                  </div>
                  <div className="pb-0.5 text-right">
                    <p className={`text-lg font-bold tabular-nums ${over ? 'text-red-500' : nearLimit ? 'text-amber-600' : 'text-slate-700'}`}>{pct.toFixed(0)}%</p>
                    <p className="text-[10px] text-slate-400">of {fmt(group.amount)}</p>
                  </div>
                </div>

                <div className="mt-3"><StackedBudgetBar spentByMember={group.spentByMember ?? {}} budget={group.amount} /></div>

                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {Object.entries(group.spentByMember ?? {}).filter(([, amount]) => amount > 0).map(([member, amount]) => (
                    <span key={member} className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: MEMBER_COLORS[member] ?? MEMBER_COLORS.Unassigned }} />
                      {member} {fmt(amount)}
                    </span>
                  ))}
                </div>

                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className={over ? 'font-semibold text-red-500' : 'text-slate-500'}>{over ? `${fmt(group.spent - group.amount)} over` : `${fmt(group.amount - group.spent)} available`}</span>
                  <span className="text-slate-400">{group.transactions.length} transaction{group.transactions.length === 1 ? '' : 's'}</span>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap gap-1">
                      {group.members.map(m => (
                        <span
                          key={m.id}
                          className="inline-flex max-w-full items-center gap-1 truncate px-2 py-0.5 rounded-full text-[10px] font-medium border"
                          style={{
                            backgroundColor: m.isExclusion ? '#fff1f2' : hexToRgba(m.memberColor, 0.1),
                            color: m.isExclusion ? '#e11d48' : m.memberColor,
                            borderColor: m.isExclusion ? '#fecdd3' : hexToRgba(m.memberColor, 0.2),
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.isExclusion ? '#f43f5e' : m.memberColor }} />
                          {m.isExclusion ? 'Except ' : ''}{m.memberName}
                          {m.memberType === 'purpose_family' && <span className="opacity-60">+ all purposes</span>}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        </div>

        {selectedGroup && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-gray-800">{selectedGroup.name} transactions</h3>
                <p className="mt-0.5 text-xs text-gray-400">
                  {selectedGroupTransactions.length} posted {selectedGroupTransactions.length === 1 ? 'expense' : 'expenses'} · {fmt(selectedGroup.spent)}
                </p>
              </div>
              <span className="text-xs text-gray-400">Select a row to edit</span>
            </div>
            {selectedGroupTransactions.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-400">No matching transactions for this scope and month.</div>
            ) : (
              <div>
                <div className="grid grid-cols-[90px_minmax(220px,1fr)_150px_180px_110px] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2">
                  {([
                    ['date', 'Date'],
                    ['description', 'Description'],
                    ['account', 'Account'],
                    ['purpose', 'Purpose'],
                    ['amount', 'Amount'],
                  ] as const).map(([key, label]) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => changeTransactionSort(key)}
                      className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide hover:text-blue-600 ${key === 'amount' ? 'justify-end' : ''} ${transactionSort.key === key ? 'text-blue-600' : 'text-gray-400'}`}
                    >
                      {label}
                      {transactionSort.key !== key ? <ArrowUpDown size={10} /> : transactionSort.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                    </button>
                  ))}
                </div>
                <div>
                {purposeHierarchy.map(family => {
                  const familyCollapsed = collapsedPurposeFamilies.has(family.name)
                  return (
                    <div key={family.name}>
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(setCollapsedPurposeFamilies, family.name)}
                        className="grid w-full grid-cols-[1fr_110px] items-center gap-3 border-b border-t border-slate-200 bg-slate-100 px-4 py-2.5 text-left first:border-t-0 hover:bg-slate-200/70"
                      >
                        <span className="flex items-center gap-2">
                          {familyCollapsed ? <ChevronRight size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-700">{family.name}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-200">{family.count}</span>
                        </span>
                        <span className="text-right text-xs font-bold tabular-nums text-slate-700">{fmt(family.total)}</span>
                      </button>
                      {!familyCollapsed && family.purposes.map(purpose => {
                        const purposeKey = `${family.name}|${purpose.name}`
                        const purposeCollapsed = collapsedPurposes.has(purposeKey)
                        return (
                          <div key={purposeKey}>
                            <button
                              type="button"
                              onClick={() => toggleCollapsed(setCollapsedPurposes, purposeKey)}
                              className="grid w-full grid-cols-[1fr_110px] items-center gap-3 border-b border-gray-200 bg-slate-50 px-4 py-2 text-left hover:bg-blue-50/60"
                            >
                              <span className="flex items-center gap-2 pl-5">
                                {purposeCollapsed ? <ChevronRight size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                                <span className="text-xs font-semibold text-slate-600">{purpose.name}</span>
                                <span className="text-[10px] font-medium text-slate-400">{purpose.transactions.length}</span>
                              </span>
                              <span className="text-right text-xs font-semibold tabular-nums text-slate-600">{fmt(purpose.total)}</span>
                            </button>
                            {!purposeCollapsed && (
                              <div className="divide-y divide-gray-100">
                                {purpose.transactions.map(transaction => (
                                  <button
                                    type="button"
                                    key={transaction.id}
                                    onClick={() => setEditingTransaction(transaction)}
                                    className="grid w-full grid-cols-[90px_minmax(220px,1fr)_150px_180px_110px] items-center gap-3 px-4 py-2.5 text-left hover:bg-blue-50/50"
                                  >
                                    <span className="text-xs tabular-nums text-gray-500">{transaction.date}</span>
                                    <span className="truncate text-sm font-medium text-gray-700" title={transaction.description}>{transaction.description}</span>
                                    <span className="min-w-0 text-xs text-gray-500">
                                      <span className="block truncate">{transaction.accountName}</span>
                                      {applyOwnershipOverrides && transaction.reportingMemberName && transaction.reportingMemberName !== transaction.memberName && (
                                        <span className="block truncate text-[10px] font-semibold text-violet-600">Owner: {transaction.reportingMemberName}</span>
                                      )}
                                    </span>
                                    <span className="truncate text-xs text-gray-500" title={transaction.categoryFullName ?? undefined}>{transaction.categoryFullName ?? 'Uncategorised'}</span>
                                    <span className="text-right text-sm font-semibold tabular-nums text-red-500">{fmt(Math.abs(transaction.amount))}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <BudgetGroupForm
          categories={categories}
          month={month}
          year={year}
          editGroup={editingGroup}
          onClose={() => { setShowForm(false); setEditingGroup(null) }}
          onSave={() => { load(); setShowForm(false); setEditingGroup(null) }}
        />
      )}
      {editingTransaction && (
        <TransactionFormModal
          transaction={editingTransaction}
          accounts={accounts}
          categories={categories}
          onClose={() => setEditingTransaction(null)}
          onSave={async data => {
            await api.transactions.update(editingTransaction.id, data)
            setEditingTransaction(null)
            load()
            onRefreshAccounts?.()
            onRefreshCategories?.()
          }}
        />
      )}
    </div>
  )
}

function BudgetGroupForm({ categories, month, year, editGroup, onClose, onSave }: {
  categories: Category[]
  month: number
  year: number
  editGroup: BudgetGroup | null
  onClose: () => void
  onSave: () => void
}) {
  const [name, setName] = useState(editGroup?.name ?? '')
  const [amount, setAmount] = useState(editGroup?.amount?.toString() ?? '')
  const firstIncludedMember = editGroup?.members.find(member => !member.isExclusion)
  const initialDimension = firstIncludedMember?.memberType === 'bucket' || firstIncludedMember?.memberType === 'context'
    ? firstIncludedMember.memberType
    : 'purpose'
  const [dimension, setDimension] = useState<'purpose' | 'bucket' | 'context'>(initialDimension)
  const [selectedMembers, setSelectedMembers] = useState<Map<string, BudgetDimension>>(
    () => new Map(editGroup?.members.filter(member => !member.isExclusion).map(m => [m.memberId, m.memberType]) ?? [])
  )
  const [excludedMembers, setExcludedMembers] = useState<Map<string, BudgetDimension>>(
    () => new Map(editGroup?.members.filter(member => member.isExclusion).map(m => [m.memberId, m.memberType]) ?? [])
  )
  const [ruleMode, setRuleMode] = useState<'include' | 'exclude'>('include')
  const [options, setOptions] = useState<ClassificationOptions>({ contexts: [], buckets: [], categories: [] })
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { api.classification.options().then(setOptions) }, [])

  const purposeFamilies = [...new Set(options.categories.map(category => category.family))]
  const query = search.trim().toLowerCase()
  const purposeChoices = purposeFamilies.flatMap(family => [
          { id: family, name: family, detail: 'Parent Purpose · includes every purpose below', color: '#6366f1', type: 'purpose_family' as const },
          ...options.categories
            .filter(category => category.family === family)
            .map(category => ({ id: category.id, name: category.name, detail: family, color: categories.find(item => item.id === category.id)?.color ?? '#64748b', type: 'purpose' as const })),
        ])
  const bucketChoices = options.buckets.map(item => ({ id: item.id, name: item.name, detail: 'Household Bucket', color: '#8b5cf6', type: 'bucket' as const }))
  const contextChoices = options.contexts.map(item => ({ id: item.id, name: item.name, detail: 'Context', color: '#0f766e', type: 'context' as const }))
  const allChoices = [...purposeChoices, ...bucketChoices, ...contextChoices]
  const choices = dimension === 'bucket' ? bucketChoices : dimension === 'context' ? contextChoices : purposeChoices
  const filteredChoices = query
    ? choices.filter(choice => choice.name.toLowerCase().includes(query) || choice.detail.toLowerCase().includes(query))
    : choices

  function changeDimension(next: 'purpose' | 'bucket' | 'context') {
    if (next === dimension) return
    setDimension(next)
    setSearch('')
  }

  function toggleMember(id: string, type: BudgetDimension) {
    const activeSetter = ruleMode === 'include' ? setSelectedMembers : setExcludedMembers
    const oppositeSetter = ruleMode === 'include' ? setExcludedMembers : setSelectedMembers
    activeSetter(prev => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, type)
      return next
    })
    oppositeSetter(prev => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  function removeMember(id: string, exclusion: boolean) {
    const setter = exclusion ? setExcludedMembers : setSelectedMembers
    setter(previous => {
      const next = new Map(previous)
      next.delete(id)
      return next
    })
  }

  async function handleSave() {
    if (!name.trim() || !amount || selectedMembers.size === 0) return
    setSaving(true)
    try {
      const members = [...selectedMembers.entries()].map(([memberId, memberType]) => ({
        memberId,
        memberType,
        isExclusion: false,
      })).concat([...excludedMembers.entries()].map(([memberId, memberType]) => ({ memberId, memberType, isExclusion: true })))
      if (editGroup) {
        await api.budgetGroups.update(editGroup.id, { name: name.trim(), amount: parseFloat(amount) })
        await api.budgetGroups.setMembers(editGroup.id, members)
      } else {
        const groupId = await api.budgetGroups.add({ name: name.trim(), month, year, amount: parseFloat(amount) })
        await api.budgetGroups.setMembers(groupId, members)
      }
      onSave()
    } finally {
      setSaving(false)
    }
  }

  const selectedChoices = allChoices.filter(choice => selectedMembers.has(choice.id))
  const excludedChoices = allChoices.filter(choice => excludedMembers.has(choice.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">
            {editGroup ? 'Edit Budget Group' : 'New Budget Group'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-5 min-h-0">
          {/* Name + Amount */}
          <div className="grid grid-cols-2 gap-4 shrink-0">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Group Name</label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Household, Food, Kids…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Monthly Budget</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="1000.00"
                step="50"
                min="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1 shrink-0">
            {(['purpose', 'bucket', 'context'] as const).map(item => (
              <button
                key={item}
                onClick={() => changeDimension(item)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize transition ${dimension === item ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {item === 'purpose' ? 'Purposes' : item === 'bucket' ? 'Buckets' : 'Contexts'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 shrink-0">
            {(['include', 'exclude'] as const).map(mode => (
              <button
                type="button"
                key={mode}
                onClick={() => setRuleMode(mode)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${ruleMode === mode ? mode === 'include' ? 'bg-white text-blue-600 shadow-sm' : 'bg-white text-rose-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {mode === 'include' ? 'Include matching' : 'Exclude matching'}
              </button>
            ))}
          </div>

          {selectedChoices.length > 0 && (
            <div className="shrink-0">
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Included</label>
              <div className="flex flex-wrap gap-2">
                {selectedChoices.map(choice => (
                  <div
                    key={choice.id}
                    className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium border"
                    style={{
                      backgroundColor: hexToRgba(choice.color, 0.1),
                      color: choice.color,
                      borderColor: hexToRgba(choice.color, 0.3),
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: choice.color }} />
                    {choice.name}
                    {choice.type === 'purpose_family' && <span className="opacity-60">+ all</span>}
                    <button
                      onClick={() => removeMember(choice.id, false)}
                      className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center hover:bg-black/10"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}


          {excludedChoices.length > 0 && (
            <div className="shrink-0">
              <label className="block text-xs font-semibold text-rose-500 mb-2 uppercase tracking-wide">Excluded</label>
              <div className="flex flex-wrap gap-2">
                {excludedChoices.map(choice => (
                  <div key={choice.id} className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 py-1 pl-2.5 pr-1 text-xs font-medium text-rose-600">
                    <span className="h-2 w-2 rounded-full bg-rose-400" />
                    {choice.name}
                    {choice.type === 'purpose_family' && <span className="opacity-60">+ all</span>}
                    <button onClick={() => removeMember(choice.id, true)} className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-rose-100">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <label className={`text-xs font-semibold uppercase tracking-wide ${ruleMode === 'exclude' ? 'text-rose-500' : 'text-gray-500'}`}>{ruleMode === 'exclude' ? 'Exclude' : 'Include'} {dimension === 'purpose' ? 'Purposes' : dimension === 'bucket' ? 'Buckets' : 'Contexts'}</label>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 w-36"
              />
            </div>
            <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50">
              {filteredChoices.map(choice => {
                const selected = (ruleMode === 'include' ? selectedMembers : excludedMembers).has(choice.id)
                const exclusionMode = ruleMode === 'exclude'
                return (
                  <button
                    type="button"
                    key={`${choice.type}:${choice.id}`}
                    onClick={() => toggleMember(choice.id, choice.type)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 ${selected ? exclusionMode ? 'bg-rose-50/60' : 'bg-blue-50/60' : ''} ${choice.type === 'purpose_family' ? 'border-t border-gray-200 mt-1' : 'pl-10'}`}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${selected ? exclusionMode ? 'border-rose-500 bg-rose-500' : 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                      {selected && <Check size={10} className="text-white" strokeWidth={3} />}
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: choice.color }} />
                    <span className={`flex-1 text-sm ${choice.type === 'purpose_family' ? 'font-bold text-gray-800' : 'text-gray-650'}`}>{choice.name}</span>
                    <span className="text-[10px] text-gray-400">{choice.detail}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !amount || selectedMembers.size === 0}
            className="flex-[2] bg-blue-600 text-white rounded-xl px-6 py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : editGroup ? 'Update Group' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}
