import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowDown, Check, CircleDollarSign, Flame, PiggyBank, RotateCcw, Target, Users, WalletCards } from 'lucide-react'
import { api } from '../api'
import type { Account, AllocationPlanSummary, Transaction } from '../types/finance'
import { fmt, formatDate, monthName } from '../utils'
import { bucketFundingContribution, type FundedBucketName } from '../lib/allocation'
import { transactionReportingMemberName } from '../lib/reportingOwnership'
import { isActualTransaction } from '../lib/transactionTiming'

interface Props {
  accounts: Account[]
  month: number
  year: number
  dateMode: 'month' | 'custom'
  customFrom: string
  customTo: string
}

interface BudgetGroupSummary {
  id: string
  name: string
  amount: number
  spent: number
  transactions: Transaction[]
}

const BUCKET_TONES: Record<string, { bar: string; pale: string; text: string; icon: typeof WalletCards }> = {
  'Daily Expenses': { bar: 'bg-blue-500', pale: 'bg-blue-50', text: 'text-blue-700', icon: WalletCards },
  Splurge: { bar: 'bg-violet-500', pale: 'bg-violet-50', text: 'text-violet-700', icon: CircleDollarSign },
  Smile: { bar: 'bg-pink-500', pale: 'bg-pink-50', text: 'text-pink-700', icon: PiggyBank },
  'Fire Extinguisher': { bar: 'bg-orange-500', pale: 'bg-orange-50', text: 'text-orange-700', icon: Flame },
}

function monthEnd(month: number, year: number) {
  return new Date(year, month, 0).toISOString().slice(0, 10)
}

function householdIncome(rows: Transaction[]) {
  return rows.filter(row => !row.isTransfer && isActualTransaction(row) && row.contextName === 'Household' && row.amount > 0)
    .reduce((sum, row) => sum + row.amount, 0)
}

function bucketUse(rows: Transaction[], bucketId: string) {
  return rows.filter(row => !row.isTransfer && isActualTransaction(row) && row.bucketId === bucketId && row.amount < 0)
    .reduce((sum, row) => sum + Math.abs(row.amount), 0)
}

function isFundedBucket(name: string): name is FundedBucketName {
  return name === 'Smile' || name === 'Fire Extinguisher'
}

function targetUse(rows: Transaction[], target: AllocationPlanSummary['targets'][number]) {
  const spending = bucketUse(rows, target.bucketId)
  return isFundedBucket(target.name) ? bucketFundingContribution(rows, target.name) - spending : spending
}

export function PlanPage({ accounts, month, year, dateMode, customFrom, customTo }: Props) {
  const [plan, setPlan] = useState<AllocationPlanSummary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [ytdTransactions, setYtdTransactions] = useState<Transaction[]>([])
  const [budgetGroups, setBudgetGroups] = useState<BudgetGroupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('All')
  const [applyOwnershipOverrides, setApplyOwnershipOverrides] = useState(false)

  useEffect(() => {
    setLoading(true); setError('')
    const periodFilter = dateMode === 'custom' ? { dateFrom: customFrom, dateTo: customTo } : { month, year }
    const customEnd = new Date(`${customTo}T00:00:00`)
    const budgetMonth = dateMode === 'custom' && !Number.isNaN(customEnd.getTime()) ? customEnd.getMonth() + 1 : month
    const budgetYear = dateMode === 'custom' && !Number.isNaN(customEnd.getTime()) ? customEnd.getFullYear() : year
    Promise.all([
      api.allocation.plan(),
      api.transactions.list(periodFilter),
      dateMode === 'custom' ? api.transactions.list(periodFilter) : api.transactions.list({ dateFrom: `${year}-01-01`, dateTo: monthEnd(month, year) }),
      api.budgetGroups.list(budgetMonth, budgetYear),
    ]).then(([nextPlan, nextTransactions, nextYtd, nextBudgetGroups]) => {
      setPlan(nextPlan); setTransactions(nextTransactions); setYtdTransactions(nextYtd); setBudgetGroups(nextBudgetGroups)
    }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false))
  }, [month, year, dateMode, customFrom, customTo])

  const ownerNames = useMemo(() => ['All', ...Array.from(new Set(accounts.filter(account => account.isActive).map(account => account.memberName).filter(Boolean)))], [accounts])
  const scopedAccountIds = useMemo(() => {
    if (ownerFilter === 'All') return new Set(accounts.filter(account => account.isActive).map(account => account.id))
    return new Set(accounts.filter(account => account.isActive && account.memberName === ownerFilter).map(account => account.id))
  }, [accounts, ownerFilter])
  const scopedTransactions = useMemo(() => transactions.filter(row => ownerFilter === 'All'
    ? scopedAccountIds.has(row.accountId)
    : applyOwnershipOverrides
      ? transactionReportingMemberName(row, true) === ownerFilter
      : scopedAccountIds.has(row.accountId)), [transactions, ownerFilter, applyOwnershipOverrides, scopedAccountIds])
  const scopedYtdTransactions = useMemo(() => ytdTransactions.filter(row => ownerFilter === 'All'
    ? scopedAccountIds.has(row.accountId)
    : applyOwnershipOverrides
      ? transactionReportingMemberName(row, true) === ownerFilter
      : scopedAccountIds.has(row.accountId)), [ytdTransactions, ownerFilter, applyOwnershipOverrides, scopedAccountIds])
  const availableIncome = householdIncome(scopedTransactions)
  const ytdIncome = householdIncome(scopedYtdTransactions)
  const householdRows = useMemo(() => scopedTransactions.filter(row => !row.isTransfer && isActualTransaction(row) && row.contextName === 'Household'), [scopedTransactions])
  const totalHouseholdSpend = householdRows.filter(row => row.amount < 0).reduce((sum, row) => sum + Math.abs(row.amount), 0)
  const totalTargetUse = (plan?.targets ?? []).reduce((sum, target) => sum + targetUse(scopedTransactions, target), 0)
  const attributedMembers = useMemo(() => {
    const juliaAccountIds = new Set(accounts
      .filter(account => /julia/i.test(account.memberName) || /^julia\b/i.test(account.name))
      .map(account => account.id))
    const rowsByMember = new Map<string, Transaction[]>()
    for (const row of householdRows) {
      const name = applyOwnershipOverrides ? transactionReportingMemberName(row, true) : juliaAccountIds.has(row.accountId) ? 'Julia' : 'Anderson'
      rowsByMember.set(name, [...(rowsByMember.get(name) ?? []), row])
    }
    return [...rowsByMember.entries()].map(([name, rows]) => {
      return {
        name,
        income: rows.filter(row => row.amount > 0).reduce((sum, row) => sum + row.amount, 0),
        spending: rows.filter(row => row.amount < 0).reduce((sum, row) => sum + Math.abs(row.amount), 0),
        bucketSpend: new Map((plan?.targets ?? []).map(target => [target.bucketId, bucketUse(rows, target.bucketId)])),
      }
    }).sort((left, right) => right.income - left.income || right.spending - left.spending || left.name.localeCompare(right.name))
  }, [accounts, householdRows, plan, applyOwnershipOverrides])

  if (loading) return <div className="h-full overflow-auto p-6 text-sm text-slate-500">Loading allocation reporting…</div>
  if (error) return <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
  if (!plan) return <div className="m-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No active allocation plan is configured.</div>

  const allocatedTotal = plan.targets.reduce((sum, target) => sum + availableIncome * target.targetPercentage / 100, 0)
  const targetTotal = plan.targets.reduce((sum, target) => sum + target.targetPercentage, 0)
  const periodLabel = dateMode === 'custom' ? `${formatDate(customFrom)} – ${formatDate(customTo)}` : `${monthName(month)} ${year}`
  const periodNoun = dateMode === 'custom' ? 'selected range' : 'month'
  const householdMemberTotal = {
    name: ownerFilter === 'All' ? 'Household total' : `${ownerFilter} total`,
    income: availableIncome,
    spending: totalHouseholdSpend,
    bucketSpend: new Map(plan.targets.map(target => [target.bucketId, bucketUse(householdRows, target.bucketId)])),
  }
  const scopedBudgetGroups = budgetGroups.map(group => ({
    ...group,
    spent: group.transactions.filter(row => scopedAccountIds.has(row.accountId)).reduce((sum, row) => sum + Math.abs(row.amount), 0),
  }))
  const scopeName = ownerFilter === 'All' ? 'Household' : ownerFilter

  return (
    <div className="h-full overflow-auto bg-slate-50 p-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{plan.contextName} · {periodLabel}</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Income allocation & performance</h1><p className="mt-1 text-sm text-slate-500">Targets show intent. Classified transactions show reality. Transfers remain ledger-neutral.</p></div>
          <div className="flex flex-wrap items-center gap-3"><div className="flex rounded-lg bg-slate-200/70 p-1">{ownerNames.map(name => <button key={name} onClick={() => setOwnerFilter(name)} className={`rounded-md px-3 py-1 text-xs font-semibold ${ownerFilter === name ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{name}</button>)}</div><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={applyOwnershipOverrides} onChange={event => setApplyOwnershipOverrides(event.target.checked)} />Apply ownership overrides</label><div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><Check size={14} /> {targetTotal}% allocated</div></div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={`Eligible ${scopeName.toLowerCase()} income`} value={availableIncome} detail={`Allocation source for the ${periodNoun}`} tone="emerald" />
          <Metric label="Target allocations" value={allocatedTotal} detail={`${targetTotal}% of eligible income`} tone="blue" />
          <Metric label={`${scopeName} spending`} value={totalHouseholdSpend} detail="Household-context expenses in this scope" tone="slate" />
          <Metric label="Unspent target movement" value={allocatedTotal - totalTargetUse} detail="Smile and Fire use net funding; this is not a bank balance" tone={allocatedTotal - totalTargetUse >= 0 ? 'emerald' : 'red'} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900">Where the household income flows</h2><p className="mt-1 text-xs text-slate-500">Every target receives its percentage in parallel from the same eligible income—not one Bucket after another.</p></div><span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600">Fund transfers counted once</span></div>
          <div className="mt-5 grid items-stretch gap-3 lg:grid-cols-[220px_42px_1fr]">
            <div className="flex flex-col justify-center rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 text-center"><span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{scopeName} eligible income</span><strong className="mt-2 text-2xl text-emerald-800">{fmt(availableIncome)}</strong><span className="mt-1 text-[11px] text-emerald-700">Household context</span></div>
            <div className="hidden items-center justify-center lg:flex"><ArrowDown className="-rotate-90 text-slate-300" /></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {plan.targets.map(target => <FlowBucket key={target.id} target={target} income={availableIncome} />)}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Target versus actual use</h2><p className="text-xs text-slate-500">Expenses count as use. Smile and Fire Extinguisher show qualifying transfers into their joint accounts less expenses assigned to that Bucket.</p></div><div className="flex items-center gap-3 text-[10px] text-slate-500"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-emerald-500" />Anderson</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-amber-400" />Julia</span><span className="ml-1 text-xs text-slate-400">{periodLabel}</span></div></div>
          <div className="grid grid-cols-[minmax(180px,1fr)_110px_110px_110px] border-b border-slate-100 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><span>Bucket</span><span className="text-right">Target</span><span className="text-right">Used</span><span className="text-right">Movement</span></div>
          {plan.targets.map(target => <PerformanceRow key={target.id} target={target} income={availableIncome} rows={scopedTransactions} accounts={accounts} applyOwnershipOverrides={applyOwnershipOverrides} />)}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">{dateMode === 'custom' ? 'Selected-range movement' : 'Year-to-date roll-forward movement'}</h2><p className="mt-1 text-xs text-slate-500">{dateMode === 'custom' ? periodLabel : `January through ${monthName(month)}`}. This excludes opening entitlement balances and approved allowance movements.</p></div>
            <div className="divide-y divide-slate-100">
              {plan.targets.map(target => {
                const allocated = ytdIncome * target.targetPercentage / 100
                const used = targetUse(scopedYtdTransactions, target)
                return <div key={target.id} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3"><div><p className="text-sm font-medium text-slate-700">{target.name}</p><p className="mt-0.5 text-[11px] text-slate-400">{fmt(allocated)} allocated − {fmt(used)} used</p></div><strong className={allocated - used >= 0 ? 'text-emerald-600' : 'text-red-500'}>{fmt(allocated - used, true)}</strong></div>
              })}
            </div>
            <div className="flex gap-2 border-t border-amber-100 bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-800"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span><strong>Not yet an authoritative available balance.</strong> Opening balances, automatic allocation-ledger credits and audited member movements must be added before this can answer “how much do I have?”</span></div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Target size={17} className="text-blue-600" /><h2 className="font-semibold text-slate-900">Budget Groups are a separate control</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">Allocation decides how eligible income is divided between Buckets. Budget Groups remain monthly; in Custom mode this shows performance for the month containing the end date.</p><div className="mt-4 grid grid-cols-2 gap-3"><MiniMetric label="Budget Groups" value={String(scopedBudgetGroups.length)} /><MiniMetric label="Budgeted" value={fmt(scopedBudgetGroups.reduce((sum, group) => sum + group.amount, 0))} /><MiniMetric label="Budget spent" value={fmt(scopedBudgetGroups.reduce((sum, group) => sum + group.spent, 0))} /><MiniMetric label="Remaining" value={fmt(scopedBudgetGroups.reduce((sum, group) => sum + group.amount - group.spent, 0), true)} /></div>{scopedBudgetGroups.length > 0 && <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">{scopedBudgetGroups.map(group => <div key={group.id} className="flex items-center justify-between text-xs"><span className="truncate text-slate-500">{group.name}</span><strong className={group.spent > group.amount ? 'text-red-500' : 'text-slate-700'}>{fmt(group.spent)} / {fmt(group.amount)}</strong></div>)}</div>}</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2"><Users size={17} className="text-violet-600" /><h2 className="font-semibold text-slate-900">Who contributed and who made the purchase</h2></div><p className="mt-1 text-xs text-slate-500">Household total stays first. Members are ranked by income contributed, then purchases made. Anderson is green and Julia is yellow.</p></div>
          <div className="grid gap-3 p-5 md:grid-cols-2">
            <MemberCard member={householdMemberTotal} plan={plan} rank={1} tone="total" className="md:col-span-2" />
            {attributedMembers.map((member, index) => <MemberCard key={member.name} member={member} plan={plan} rank={index + 2} tone={member.name === 'Julia' ? 'julia' : 'anderson'} />)}
          </div>
          <div className="flex gap-2 border-t border-violet-100 bg-violet-50 px-5 py-3 text-xs leading-5 text-violet-800"><RotateCcw size={15} className="mt-0.5 shrink-0" /><span>Before individual available balances can be shown, Rangels still needs the agreed Anderson / Julia / Shared split, opening balances, and an immutable movement ledger.</span></div>
        </section>
      </div>
    </div>
  )
}

function Metric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: 'emerald' | 'blue' | 'slate' | 'red' }) {
  const colors = { emerald: 'text-emerald-700', blue: 'text-blue-700', slate: 'text-slate-800', red: 'text-red-600' }
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">{label}</p><p className={`mt-1 text-xl font-bold ${colors[tone]}`}>{fmt(value, tone === 'red')}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>
}

function FlowBucket({ target, income }: { target: AllocationPlanSummary['targets'][number]; income: number }) {
  const tone = BUCKET_TONES[target.name] ?? BUCKET_TONES['Daily Expenses']; const Icon = tone.icon
  return <div className={`rounded-xl p-4 ${tone.pale}`}><div className="flex items-center justify-between"><Icon size={17} className={tone.text} /><strong className={`text-sm ${tone.text}`}>{target.targetPercentage}%</strong></div><p className="mt-3 text-sm font-semibold text-slate-800">{target.name}</p><p className="mt-1 text-lg font-bold text-slate-900">{fmt(income * target.targetPercentage / 100)}</p></div>
}

function PerformanceRow({ target, income, rows, accounts, applyOwnershipOverrides }: { target: AllocationPlanSummary['targets'][number]; income: number; rows: Transaction[]; accounts: Account[]; applyOwnershipOverrides: boolean }) {
  const targetAmount = income * target.targetPercentage / 100; const used = targetUse(rows, target); const movement = targetAmount - used
  const usagePercentage = targetAmount > 0 ? used / targetAmount * 100 : used > 0 ? 100 : 0
  const progress = Math.max(0, Math.min(100, usagePercentage))
  const memberByAccount = new Map(accounts.map(account => [account.id, account.memberName]))
  const bucketRows = rows.filter(row => !row.isTransfer && isActualTransaction(row) && row.bucketId === target.bucketId && row.amount < 0)
  const segments = ['Anderson', 'Julia'].map(name => ({
    name,
    value: isFundedBucket(target.name)
      ? bucketFundingContribution(rows.filter(row => (applyOwnershipOverrides ? transactionReportingMemberName(row, true) : memberByAccount.get(row.accountId)) === name), target.name) - bucketRows.filter(row => (applyOwnershipOverrides ? transactionReportingMemberName(row, true) : memberByAccount.get(row.accountId)) === name).reduce((sum, row) => sum + Math.abs(row.amount), 0)
      : bucketRows.filter(row => (applyOwnershipOverrides ? transactionReportingMemberName(row, true) : memberByAccount.get(row.accountId)) === name).reduce((sum, row) => sum + Math.abs(row.amount), 0),
    color: name === 'Julia' ? 'bg-amber-400' : 'bg-emerald-500',
  })).filter(segment => segment.value > 0)
  const attributed = segments.reduce((sum, segment) => sum + segment.value, 0)
  const unattributed = Math.max(0, used - attributed)
  if (unattributed > 0) segments.push({ name: 'Other', value: unattributed, color: 'bg-slate-400' })
  const contributed = isFundedBucket(target.name) ? bucketFundingContribution(rows, target.name) : 0
  const fundedBucketSpent = isFundedBucket(target.name) ? bucketUse(rows, target.bucketId) : 0
  return <div className="grid grid-cols-[minmax(180px,1fr)_110px_110px_110px] items-center border-b border-slate-100 px-5 py-4 last:border-0"><div className="pr-5"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-800">{target.name}</span><span className={`text-[10px] ${usagePercentage > 100 ? 'font-semibold text-red-500' : 'text-slate-400'}`}>{Math.round(usagePercentage)}%</span></div><div className={`mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100 ${movement < 0 ? 'ring-1 ring-red-300' : ''}`}>{segments.map(segment => <div key={segment.name} title={`${segment.name}: ${fmt(segment.value)}`} className={`h-full ${segment.color}`} style={{ width: `${used > 0 ? progress * segment.value / used : 0}%` }} />)}</div><div className="mt-1 flex flex-wrap gap-3">{segments.map(segment => <span key={segment.name} className="text-[9px] text-slate-400">{segment.name} {fmt(segment.value)}</span>)}{isFundedBucket(target.name) && <span className="text-[9px] text-rose-500">{fmt(contributed)} transferred − {fmt(fundedBucketSpent)} spent</span>}</div></div><span className="text-right text-sm font-semibold text-slate-700">{fmt(targetAmount)}</span><span className="text-right text-sm font-semibold text-slate-700">{fmt(used)}</span><span className={`text-right text-sm font-bold ${movement >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(movement, true)}</span></div>
}

function MiniMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div> }

function MemberCard({ member, plan, rank, tone, className = '' }: { member: { name: string; income: number; spending: number; bucketSpend: Map<string, number> }; plan: AllocationPlanSummary; rank: number; tone: 'total' | 'anderson' | 'julia'; className?: string }) {
  const styles = {
    total: { card: 'border-slate-300 bg-slate-50', badge: 'bg-slate-800 text-white', avatar: 'bg-slate-200 text-slate-800', income: 'text-slate-900' },
    anderson: { card: 'border-emerald-200 bg-emerald-50/50', badge: 'bg-emerald-600 text-white', avatar: 'bg-emerald-100 text-emerald-800', income: 'text-emerald-700' },
    julia: { card: 'border-amber-200 bg-amber-50/60', badge: 'bg-amber-400 text-amber-950', avatar: 'bg-amber-100 text-amber-800', income: 'text-amber-700' },
  }[tone]
  return <div className={`rounded-xl border p-4 ${styles.card} ${className}`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${styles.avatar}`}>{member.name[0]}</span><h3 className="font-semibold text-slate-800">{member.name}</h3></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${styles.badge}`}>#{rank}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><p className="text-slate-400">Income contributed</p><p className={`mt-1 font-semibold ${styles.income}`}>{fmt(member.income)}</p></div><div><p className="text-slate-400">Purchases made</p><p className="mt-1 font-semibold text-slate-700">{fmt(member.spending)}</p></div></div><div className="mt-3 space-y-1.5 border-t border-slate-200/70 pt-3">{plan.targets.filter(target => target.name === 'Splurge' || target.name === 'Smile').map(target => <div key={target.id} className="flex justify-between text-xs"><span className="text-slate-500">{target.name} used</span><strong className="text-slate-700">{fmt(member.bucketSpend.get(target.bucketId) ?? 0)}</strong></div>)}</div></div>
}
