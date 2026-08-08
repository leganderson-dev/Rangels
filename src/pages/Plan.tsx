import { useEffect, useMemo, useState } from 'react'
import { Check, RotateCcw, Users } from 'lucide-react'
import { api } from '../api'
import type { AllocationPlanSummary, Transaction } from '../types/finance'
import { fmt, monthName } from '../utils'

interface Props {
  month: number
  year: number
}

export function PlanPage({ month, year }: Props) {
  const [plan, setPlan] = useState<AllocationPlanSummary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([
      api.allocation.plan(),
      api.transactions.list({ month, year }),
    ]).then(([nextPlan, nextTransactions]) => {
      setPlan(nextPlan)
      setTransactions(nextTransactions)
    }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false))
  }, [month, year])

  const householdTransactions = useMemo(
    () => transactions.filter(transaction => !transaction.isTransfer && transaction.contextName === 'Household'),
    [transactions],
  )
  const availableIncome = householdTransactions
    .filter(transaction => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const actualByBucket = useMemo(() => {
    const result = new Map<string, number>()
    for (const transaction of transactions) {
      if (transaction.amount >= 0 || !transaction.bucketId) continue
      result.set(transaction.bucketId, (result.get(transaction.bucketId) ?? 0) + Math.abs(transaction.amount))
    }
    return result
  }, [transactions])

  if (loading) return <div className="h-full overflow-auto p-6 text-sm text-slate-500">Loading the shared household plan…</div>
  if (error) return <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
  if (!plan) return <div className="m-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No active allocation plan is configured.</div>

  return (
    <div className="h-full overflow-auto bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{plan.contextName}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Shared allocation plan</h1>
            <p className="mt-1 text-sm text-slate-500">One household plan for Anderson and Julia, with individual allowances and contribution visibility.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-right shadow-sm">
            <p className="text-xs text-slate-400">Available income · {monthName(month)} {year}</p>
            <p className="mt-0.5 text-xl font-bold text-emerald-700">{fmt(availableIncome)}</p>
            <p className="mt-1 text-[10px] text-slate-400">Household-classified income only</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-800">{plan.name}</h2>
              <p className="text-xs text-slate-400">Targets describe shares of incoming eligible household income.</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              <Check size={14} /> {plan.targets.reduce((sum, target) => sum + target.targetPercentage, 0)}% allocated
            </div>
          </div>

          <div className="grid grid-cols-[1fr_120px_150px_150px] border-b border-slate-100 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Allocation</span><span className="text-right">Target</span><span className="text-right">Actual</span><span className="text-right">Variance</span>
          </div>
          {plan.targets.map(target => {
            const targetAmount = availableIncome * target.targetPercentage / 100
            const actual = actualByBucket.get(target.bucketId) ?? 0
            const variance = targetAmount - actual
            return (
              <div key={target.id} className="grid grid-cols-[1fr_120px_150px_150px] items-center border-b border-slate-100 px-5 py-4 last:border-0">
                <div>
                  <p className="font-semibold text-slate-800">{target.name}</p>
                  {(target.name === 'Splurge' || target.name === 'Smile') && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-blue-600"><Users size={12} /> Individual allowances · Anderson and Julia</p>
                  )}
                  {(target.name === 'Splurge' || target.name === 'Smile') && (
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400"><RotateCcw size={10} /> Unused allowance rolls forward</p>
                  )}
                </div>
                <div className="text-right"><p className="font-semibold text-slate-700">{fmt(targetAmount)}</p><p className="text-xs text-slate-400">{target.targetPercentage}%</p></div>
                <p className="text-right font-semibold text-slate-700">{fmt(actual)}</p>
                <p className={`text-right font-semibold ${variance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{variance >= 0 ? '+' : ''}{fmt(variance)}</p>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {['Anderson', 'Julia'].map(member => {
            const memberTransactions = householdTransactions.filter(transaction => transaction.memberName === member)
            const contributed = memberTransactions.filter(transaction => transaction.amount > 0).reduce((sum, transaction) => sum + transaction.amount, 0)
            const spent = memberTransactions.filter(transaction => transaction.amount < 0).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)
            return (
              <div key={member} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">{member[0]}</span><h3 className="font-semibold text-slate-800">{member}</h3></div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-slate-400">Income contributed</p><p className="mt-1 font-semibold text-emerald-700">{fmt(contributed)}</p></div>
                  <div><p className="text-xs text-slate-400">Purchases effectuated</p><p className="mt-1 font-semibold text-slate-700">{fmt(spent)}</p></div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
