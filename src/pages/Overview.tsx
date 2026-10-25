import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Building2, CircleDollarSign, Landmark, PiggyBank, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api'
import { fmt, fmtShort, monthName, today } from '../utils'
import type { Account, Asset, ScheduledTransaction, Transaction } from '../types/finance'
import type { Page } from '../App'
import { calculateMonthlyLoanProjection } from '../lib/loans'
import { summarizeAccountPosition } from '../lib/accountPosition'
import { transactionReportingMemberName } from '../lib/reportingOwnership'
import { isActualTransaction } from '../lib/transactionTiming'

interface Props {
  accounts: Account[]
  selectedAccountId: string | null
  month: number
  year: number
  dateMode?: 'month' | 'custom'
  customFrom?: string
  customTo?: string
  onNavigate: (page: Page) => void
}

interface BudgetGroupSummary { id: string; name: string; amount: number; spent: number }
interface MonthPoint { key: string; label: string; income: number; expenses: number; surplus: number }

export function OverviewPage({ accounts, selectedAccountId, month, year, dateMode = 'month', customFrom, customTo, onNavigate }: Props) {
  const [owner, setOwner] = useState('All')
  const [applyOwnershipOverrides, setApplyOwnershipOverrides] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [trendTransactions, setTrendTransactions] = useState<Transaction[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [budgets, setBudgets] = useState<BudgetGroupSummary[]>([])
  const [schedules, setSchedules] = useState<ScheduledTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const owners = useMemo(() => ['All', ...Array.from(new Set(accounts.filter(account => account.isActive).map(account => account.memberName).filter(Boolean)))], [accounts])
  const scopedAccountIds = useMemo(() => {
    if (selectedAccountId) return new Set([selectedAccountId])
    if (owner === 'All') return new Set(accounts.filter(account => account.isActive).map(account => account.id))
    return new Set(accounts.filter(account => account.isActive && account.memberName === owner).map(account => account.id))
  }, [accounts, owner, selectedAccountId])

  const period = useMemo(() => dateMode === 'custom' && customFrom && customTo
    ? { dateFrom: customFrom, dateTo: customTo, label: `${formatShortDate(customFrom)} – ${formatShortDate(customTo)}` }
    : { dateFrom: `${year}-${pad(month)}-01`, dateTo: endOfMonth(year, month), label: `${monthName(month)} ${year}` }, [dateMode, customFrom, customTo, month, year])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const trendStartDate = new Date(year, month - 6, 1)
    const trendFrom = isoDate(trendStartDate)
    const requests = () => [
      api.transactions.list({ dateFrom: period.dateFrom, dateTo: period.dateTo }),
      api.transactions.list({ dateFrom: trendFrom, dateTo: period.dateTo }),
      api.assets.list(),
      api.budgetGroups.list(month, year),
      api.scheduled.list(),
    ] as const

    async function load() {
      let results = await Promise.allSettled(requests())
      const clockSkew = results.some(result => result.status === 'rejected' && String(result.reason).toLowerCase().includes('jwt issued at future'))
      if (clockSkew) {
        try {
          await api.session.recover()
          results = await Promise.allSettled(requests())
        } catch {
          // The section-level fallback below preserves any data that did load.
        }
      }
      if (cancelled) return
      const [periodResult, trendResult, assetsResult, budgetResult, scheduleResult] = results
      if (periodResult.status === 'fulfilled') setTransactions(periodResult.value)
      if (trendResult.status === 'fulfilled') setTrendTransactions(trendResult.value)
      if (assetsResult.status === 'fulfilled') setAssets(assetsResult.value)
      if (budgetResult.status === 'fulfilled') setBudgets(budgetResult.value)
      if (scheduleResult.status === 'fulfilled') setSchedules(scheduleResult.value)
      const failures = results.filter(result => result.status === 'rejected')
      setError(failures.length ? `${failures.length} overview section${failures.length === 1 ? '' : 's'} could not refresh. Your last available figures remain displayed.` : '')
    }

    void load().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period.dateFrom, period.dateTo, month, year])

  const transactionInScope = (transaction: Transaction) => selectedAccountId
    ? scopedAccountIds.has(transaction.accountId)
    : owner === 'All'
      ? scopedAccountIds.has(transaction.accountId)
      : applyOwnershipOverrides
        ? transactionReportingMemberName(transaction, true) === owner
        : scopedAccountIds.has(transaction.accountId)
  const scopedTransactions = transactions.filter(transactionInScope)
  const posted = scopedTransactions.filter(transaction => isActualTransaction(transaction) && !transaction.isTransfer)
  const income = posted.filter(transaction => transaction.amount > 0).reduce((sum, transaction) => sum + transaction.amount, 0)
  const expenses = Math.abs(posted.filter(transaction => transaction.amount < 0).reduce((sum, transaction) => sum + transaction.amount, 0))
  const surplus = income - expenses
  const savingsRate = income > 0 ? surplus / income * 100 : 0
  const scopedAccounts = accounts.filter(account => account.isActive && scopedAccountIds.has(account.id))
  const scopedAccountPosition = summarizeAccountPosition(scopedAccounts)
  const householdAccountPosition = summarizeAccountPosition(accounts.filter(account => account.isActive))
  const propertyValue = assets.reduce((sum, asset) => sum + (asset.valuation?.value ?? 0), 0)
  const debt = assets.reduce((sum, asset) => sum + asset.loans.reduce((loanSum, loan) => loanSum + loan.balance, 0), 0)
  const netWorth = propertyValue + householdAccountPosition.net - debt
  const totalAssets = propertyValue + householdAccountPosition.assets
  const totalDebt = debt + householdAccountPosition.liabilities
  const propertyEquity = propertyValue - debt
  const scopeLabel = selectedAccountId ? accounts.find(account => account.id === selectedAccountId)?.name ?? 'Selected account' : owner === 'All' ? 'Household' : owner

  const trendData = buildTrend(trendTransactions.filter(transactionInScope), period.dateTo)
  const budgetRows = selectedAccountId || owner !== 'All'
    ? budgets.map(group => ({ ...group, spent: transactions.filter(transaction => transactionInScope(transaction) && groupMatchesTransaction(group, transaction)).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0) }))
    : budgets
  const budgetTotal = budgetRows.reduce((sum, group) => sum + group.amount, 0)
  const budgetSpent = budgetRows.reduce((sum, group) => sum + group.spent, 0)
  const attention = buildAttention({ accounts: scopedAccounts, assets, transactions: scopedTransactions, budgets: budgetRows, schedules: schedules.filter(schedule => scopedAccountIds.has(schedule.accountId)) })
  const wealthData = [{ name: 'Property', value: Math.max(0, propertyValue), color: '#2563eb' }, { name: 'Account assets', value: householdAccountPosition.assets, color: '#10b981' }].filter(item => item.value > 0)

  return <div className="h-full overflow-y-auto bg-slate-50 p-5">
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-lg font-bold text-slate-900">Financial Overview</h1><p className="text-xs text-slate-500">Household position as at {formatLongDate(today())} · Cashflow for {period.label}</p></div>
        {!selectedAccountId && <div className="flex flex-wrap items-center gap-3"><div className="flex rounded-lg bg-slate-200/70 p-1">{owners.map(name => <button key={name} onClick={() => setOwner(name)} className={`rounded-md px-3 py-1 text-xs font-semibold ${owner === name ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{name}</button>)}</div><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={applyOwnershipOverrides} onChange={event => setApplyOwnershipOverrides(event.target.checked)} />Apply ownership overrides</label></div>}
        {selectedAccountId && <button onClick={() => {}} className="cursor-default rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">Account view: {scopeLabel}</button>}
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <PositionCard label="Household net worth" value={fmt(netWorth)} note="Assets − property and account debt" icon={<PiggyBank size={18} />} accent={netWorth >= 0 ? 'emerald' : 'red'} />
        <PositionCard label="Total assets" value={fmt(totalAssets)} note={`${fmt(propertyValue)} property · ${fmt(householdAccountPosition.assets)} accounts`} icon={<Building2 size={18} />} accent="blue" />
        <PositionCard label="Total debt" value={fmt(totalDebt)} note={`${fmt(debt)} property · ${fmt(householdAccountPosition.liabilities)} accounts`} icon={<Landmark size={18} />} accent="red" />
        <PositionCard label={`${scopeLabel} account position`} value={fmt(scopedAccountPosition.net)} note={`${fmt(scopedAccountPosition.assets)} assets · ${fmt(scopedAccountPosition.liabilities)} owed`} icon={<Wallet size={18} />} accent={scopedAccountPosition.net >= 0 ? 'slate' : 'red'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.75fr]">
        <Panel title="Six-month cashflow" subtitle={`${scopeLabel} · transfers between accounts excluded`}>
          <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} /><YAxis tickFormatter={value => fmtShort(value)} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={55} /><Tooltip formatter={value => fmt(Number(value ?? 0))} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0' }} /><Bar dataKey="income" name="Income" fill="#10b981" radius={[3, 3, 0, 0]} /><Bar dataKey="expenses" name="Expenses" fill="#f87171" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="Asset composition" subtitle="Account debt is shown separately and deducted from net worth">
          <div className="grid h-64 grid-cols-[1fr_1.15fr] items-center"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={wealthData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>{wealthData.map(item => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={value => fmt(Number(value ?? 0))} /></PieChart></ResponsiveContainer><div className="space-y-3">{wealthData.map(item => <div key={item.name}><div className="flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</div><p className="ml-4 text-sm font-bold text-slate-800">{fmt(item.value)}</p></div>)}<div className="border-t border-slate-100 pt-2"><p className="text-xs text-slate-500">Net worth</p><p className="text-base font-bold text-emerald-700">{fmt(netWorth)}</p></div></div></div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={`This period — ${period.label}`} subtitle={`${scopeLabel} cashflow`}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><MiniMetric label="Income" value={fmt(income)} tone="green" icon={<TrendingUp size={14} />} /><MiniMetric label="Expenses" value={fmt(expenses)} tone="red" icon={<TrendingDown size={14} />} /><MiniMetric label="Surplus / deficit" value={fmt(surplus)} tone={surplus >= 0 ? 'green' : 'red'} icon={<CircleDollarSign size={14} />} /><MiniMetric label="Savings rate" value={`${savingsRate.toFixed(1)}%`} tone={savingsRate >= 0 ? 'green' : 'red'} icon={<PiggyBank size={14} />} /></div>
        </Panel>
        <Panel title="Budget health" subtitle={budgetRows.length ? `${budgetRows.length} active budget group${budgetRows.length === 1 ? '' : 's'}` : 'No budget groups configured'} action={() => onNavigate('budget')}>
          {budgetRows.length === 0 ? <Empty text="Create budget groups to track spending here." /> : <><div className="mb-3 flex items-end justify-between"><div><p className="text-xl font-bold text-slate-900">{fmt(budgetSpent)}</p><p className="text-xs text-slate-500">of {fmt(budgetTotal)} budgeted</p></div><p className={`text-sm font-bold ${budgetSpent > budgetTotal ? 'text-red-600' : 'text-slate-700'}`}>{budgetTotal > 0 ? `${Math.round(budgetSpent / budgetTotal * 100)}%` : '—'}</p></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${budgetSpent > budgetTotal ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, budgetTotal > 0 ? budgetSpent / budgetTotal * 100 : 0)}%` }} /></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><BudgetState label="On track" count={budgetRows.filter(group => group.spent < group.amount * .8).length} tone="green" /><BudgetState label="At risk" count={budgetRows.filter(group => group.spent >= group.amount * .8 && group.spent <= group.amount).length} tone="amber" /><BudgetState label="Over" count={budgetRows.filter(group => group.spent > group.amount).length} tone="red" /></div></>}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Panel title="Property and debt" subtitle={`${assets.length} propert${assets.length === 1 ? 'y' : 'ies'} · ${fmt(propertyEquity)} equity`} action={() => onNavigate('assets')}>
          {assets.length === 0 ? <Empty text="Add properties to complete the wealth view." /> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-400"><th className="pb-2">Property</th><th className="pb-2 text-right">Value</th><th className="pb-2 text-right">Debt</th><th className="pb-2 text-right">Equity</th><th className="pb-2 text-right">LVR</th><th className="pb-2 text-right">Repayment</th></tr></thead><tbody>{assets.map(asset => { const value = asset.valuation?.value ?? 0; const assetDebt = asset.loans.reduce((sum, loan) => sum + loan.balance, 0); const repayment = asset.loans.reduce((sum, loan) => !loan.repaymentType || !loan.remainingTermYears ? sum : sum + calculateMonthlyLoanProjection(loan.balance, loan.interestRate, loan.remainingTermYears, loan.repaymentType).monthlyRepayment, 0); return <tr key={asset.id} className="border-b border-slate-50 last:border-0"><td className="py-3 font-semibold text-slate-800">{asset.name}<span className="ml-2 text-[10px] font-normal capitalize text-slate-400">{asset.role}</span></td><td className="py-3 text-right text-slate-600">{fmt(value)}</td><td className="py-3 text-right text-slate-600">{fmt(assetDebt)}</td><td className="py-3 text-right font-semibold text-emerald-700">{fmt(value - assetDebt)}</td><td className="py-3 text-right text-slate-600">{value ? `${(assetDebt / value * 100).toFixed(1)}%` : '—'}</td><td className="py-3 text-right text-slate-600">{repayment ? `${fmt(repayment)}/mo` : 'Incomplete'}</td></tr> })}</tbody></table></div>}
        </Panel>
        <Panel title="Attention required" subtitle={attention.length ? `${attention.length} item${attention.length === 1 ? '' : 's'} to review` : 'Everything looks current'}>
          {attention.length === 0 ? <div className="py-8 text-center text-sm text-emerald-600">No immediate issues found.</div> : <div className="divide-y divide-slate-100">{attention.slice(0, 7).map((item, index) => <button key={`${item.label}-${index}`} onClick={() => onNavigate(item.page)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50"><div className={`rounded-md p-1.5 ${item.tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}><AlertTriangle size={14} /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-700">{item.label}</p><p className="truncate text-[10px] text-slate-400">{item.detail}</p></div><ArrowRight size={13} className="text-slate-300" /></button>)}</div>}
        </Panel>
      </div>

      {loading && <div className="fixed inset-x-0 bottom-7 h-0.5 animate-pulse bg-blue-500" />}
      <p className="pb-2 text-center text-[10px] text-slate-400">Net worth uses every active account balance—including credit-card debt—plus property valuations, less property loans. It excludes superannuation until those assets are added.</p>
    </div>
  </div>
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: () => void; children: React.ReactNode }) { return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-start justify-between"><div><h2 className="text-sm font-bold text-slate-800">{title}</h2>{subtitle && <p className="mt-0.5 text-[10px] text-slate-400">{subtitle}</p>}</div>{action && <button onClick={action} className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700">View details <ArrowRight size={12} /></button>}</div>{children}</section> }
function PositionCard({ label, value, note, icon, accent }: { label: string; value: string; note: string; icon: React.ReactNode; accent: 'emerald' | 'blue' | 'red' | 'slate' }) { const styles = { emerald: 'bg-emerald-50 text-emerald-700', blue: 'bg-blue-50 text-blue-700', red: 'bg-red-50 text-red-600', slate: 'bg-slate-100 text-slate-600' }; return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-slate-900">{value}</p></div><div className={`rounded-lg p-2 ${styles[accent]}`}>{icon}</div></div><p className="mt-2 truncate text-[10px] text-slate-400" title={note}>{note}</p></div> }
function MiniMetric({ label, value, tone, icon }: { label: string; value: string; tone: 'green' | 'red'; icon: React.ReactNode }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">{icon}{label}</p><p className={`mt-2 text-base font-bold ${tone === 'green' ? 'text-emerald-700' : 'text-red-600'}`}>{value}</p></div> }
function BudgetState({ label, count, tone }: { label: string; count: number; tone: 'green' | 'amber' | 'red' }) { const styles = { green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700' }; return <div className={`rounded-lg py-2 ${styles[tone]}`}><p className="text-lg font-bold">{count}</p><p className="text-[10px]">{label}</p></div> }
function Empty({ text }: { text: string }) { return <p className="py-8 text-center text-xs text-slate-400">{text}</p> }

function buildTrend(rows: Transaction[], periodEnd: string): MonthPoint[] {
  const end = new Date(`${periodEnd}T12:00:00`)
  return Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(end.getFullYear(), end.getMonth() - (5 - offset), 1)
    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
    const posted = rows.filter(row => row.date.startsWith(key) && isActualTransaction(row) && !row.isTransfer)
    const income = posted.filter(row => row.amount > 0).reduce((sum, row) => sum + row.amount, 0)
    const expenses = Math.abs(posted.filter(row => row.amount < 0).reduce((sum, row) => sum + row.amount, 0))
    return { key, label: date.toLocaleString('en-AU', { month: 'short' }), income, expenses, surplus: income - expenses }
  })
}

function buildAttention({ accounts, assets, transactions, budgets, schedules }: { accounts: Account[]; assets: Asset[]; transactions: Transaction[]; budgets: BudgetGroupSummary[]; schedules: ScheduledTransaction[] }) {
  const items: Array<{ label: string; detail: string; page: Page; tone: 'amber' | 'red' }> = []
  const missingPurpose = transactions.filter(row => isActualTransaction(row) && !row.isTransfer && !row.canonicalCategoryId).length
  if (missingPurpose) items.push({ label: `${missingPurpose} transaction${missingPurpose === 1 ? '' : 's'} missing a Purpose`, detail: 'Classification is needed for accurate reporting.', page: 'transactions', tone: 'amber' })
  assets.forEach(asset => {
    if (!asset.valuation || daysSince(asset.valuation.valuedOn) > 365) items.push({ label: `${asset.name} valuation is ${asset.valuation ? 'over a year old' : 'missing'}`, detail: 'Update it to keep net worth reliable.', page: 'assets', tone: 'amber' })
    asset.loans.filter(loan => !loan.repaymentType || !loan.remainingTermYears).forEach(loan => items.push({ label: `${loan.name} repayment details are incomplete`, detail: 'Add repayment type and remaining term.', page: 'assets', tone: 'amber' }))
  })
  accounts.filter(account => !account.lastUpdatedOn || daysSince(account.lastUpdatedOn) > 45).slice(0, 2).forEach(account => items.push({ label: `${account.name} balance may be stale`, detail: account.lastUpdatedOn ? `Last updated ${account.lastUpdatedOn}.` : 'No balance date has been set.', page: 'transactions', tone: 'amber' }))
  budgets.filter(group => group.spent > group.amount).forEach(group => items.push({ label: `${group.name} is over budget`, detail: `${fmt(group.spent - group.amount)} above its monthly budget.`, page: 'budget', tone: 'red' }))
  const nextThirtyDays = new Date(); nextThirtyDays.setDate(nextThirtyDays.getDate() + 30)
  const upcoming = schedules.filter(schedule => schedule.isActive && schedule.nextDate >= today() && schedule.nextDate <= isoDate(nextThirtyDays) && Math.abs(schedule.amount) >= 1000)
  if (upcoming.length) items.push({ label: `${upcoming.length} large scheduled payment${upcoming.length === 1 ? '' : 's'} within 30 days`, detail: 'Review upcoming cash requirements.', page: 'scheduled', tone: 'amber' })
  return items.sort((a, b) => Number(b.tone === 'red') - Number(a.tone === 'red'))
}

function groupMatchesTransaction(group: BudgetGroupSummary & { transactions?: Transaction[] }, transaction: Transaction) { return Boolean(group.transactions?.some(row => row.id === transaction.id)) }
function daysSince(value: string) { return Math.floor((Date.now() - new Date(`${value}T12:00:00`).getTime()) / 86400000) }
function pad(value: number) { return String(value).padStart(2, '0') }
function endOfMonth(year: number, month: number) { return `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}` }
function isoDate(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` }
function formatShortDate(value: string) { const [, month, day] = value.split('-'); return `${day}/${month}` }
function formatLongDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) }
