import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Building2, Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../api'
import { Modal } from '../components/Modal'
import type { Asset, AssetLoan, ClassificationOption } from '../types/finance'
import { fmt, formatDate, today } from '../utils'
import { calculateMonthlyLoanProjection, type RepaymentType } from '../lib/loans'
import { projectedLoanBalance } from '../lib/loans'
import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtShort } from '../utils'

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-xs font-semibold text-slate-600'

export function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [contexts, setContexts] = useState<ClassificationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingAsset, setEditingAsset] = useState<Asset | 'new' | null>(null)
  const [loanTarget, setLoanTarget] = useState<{ asset: Asset; loan: AssetLoan | null } | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError('')
      const [assetRows, options] = await Promise.all([api.assets.list(), api.classification.options()])
      setAssets(assetRows)
      setContexts(options.contexts)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load assets.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const totals = useMemo(() => assets.reduce((result, asset) => {
    const value = asset.valuation?.value ?? 0
    const debt = asset.loans.reduce((sum, loan) => sum + loan.balance, 0)
    const monthlyRepayments = asset.loans.reduce((sum, loan) => sum + (projectionFor(loan)?.monthlyRepayment ?? 0), 0)
    return { value: result.value + value, debt: result.debt + debt, repayments: result.repayments + monthlyRepayments }
  }, { value: 0, debt: 0, repayments: 0 }), [assets])

  async function deleteAsset(asset: Asset) {
    if (!window.confirm(`Delete ${asset.name}, including its valuation history and loans?`)) return
    try { await api.assets.delete(asset.id); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete the asset.') }
  }

  async function deleteLoan(loan: AssetLoan) {
    if (!window.confirm(`Delete ${loan.name}?`)) return
    try { await api.assets.deleteLoan(loan.id); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete the loan.') }
  }

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Assets</h1>
            <p className="text-sm text-slate-500">Property portfolio and associated debt.</p>
          </div>
          <button onClick={() => setEditingAsset('new')} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Plus size={16} /> Add Asset</button>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Summary label="Total assets" value={fmt(totals.value)} />
          <Summary label="Total debt" value={fmt(totals.debt)} />
          <Summary label="Net wealth" value={fmt(totals.value - totals.debt)} accent />
          <Summary label="Projected monthly repayments" value={fmt(totals.repayments)} subtext="At current balances, rates and terms" />
        </div>

        {!loading && assets.length > 0 && <PortfolioSimulator assets={assets} />}

        {loading ? <p className="py-16 text-center text-sm text-slate-400">Loading assets…</p> : assets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-20 text-center">
            <Building2 className="mx-auto text-slate-300" size={34} />
            <p className="mt-3 font-semibold text-slate-700">No assets yet</p>
            <p className="mt-1 text-sm text-slate-500">Add your first property to start the portfolio view.</p>
          </div>
        ) : <div className="space-y-4">{assets.map(asset => <AssetCard key={asset.id} asset={asset} onEdit={() => setEditingAsset(asset)} onDelete={() => void deleteAsset(asset)} onAddLoan={() => setLoanTarget({ asset, loan: null })} onEditLoan={loan => setLoanTarget({ asset, loan })} onDeleteLoan={loan => void deleteLoan(loan)} />)}</div>}
      </div>

      {editingAsset && <AssetForm asset={editingAsset === 'new' ? null : editingAsset} contexts={contexts} onClose={() => setEditingAsset(null)} onSaved={async () => { setEditingAsset(null); await refresh() }} />}
      {loanTarget && <LoanForm asset={loanTarget.asset} loan={loanTarget.loan} onClose={() => setLoanTarget(null)} onSaved={async () => { setLoanTarget(null); await refresh() }} />}
    </div>
  )
}

function Summary({ label, value, subtext, accent }: { label: string; value: string; subtext?: string; accent?: boolean }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-2 text-xl font-bold ${accent ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</p>{subtext && <p className="mt-1 text-[11px] text-slate-400">{subtext}</p>}</div>
}

function projectionFor(loan: AssetLoan) {
  if (!loan.repaymentType || !loan.remainingTermYears) return null
  return calculateMonthlyLoanProjection(loan.balance, loan.interestRate, loan.remainingTermYears, loan.repaymentType)
}

function PortfolioSimulator({ assets }: { assets: Asset[] }) {
  const [growthRate, setGrowthRate] = useState(4)
  const [years, setYears] = useState(10)
  const [rateAdjustments, setRateAdjustments] = useState<Record<string, number>>({})
  const adjustmentFor = (assetId: string) => rateAdjustments[assetId] ?? 0

  const data = useMemo(() => Array.from({ length: years + 1 }, (_, year) => {
    let value = 0
    let debt = 0
    assets.forEach(asset => {
      value += (asset.valuation?.value ?? 0) * Math.pow(1 + growthRate / 100, year)
      asset.loans.forEach(loan => {
        if (!loan.repaymentType || !loan.remainingTermYears) debt += loan.balance
        else debt += projectedLoanBalance(loan.balance, Math.max(0, loan.interestRate + (rateAdjustments[asset.id] ?? 0)), loan.remainingTermYears, loan.repaymentType, year * 12)
      })
    })
    return { year: year === 0 ? 'Now' : `Year ${year}`, value, debt, equity: value - debt }
  }), [assets, growthRate, years, rateAdjustments])

  const scenarioRepayment = assets.reduce((portfolioTotal, asset) => portfolioTotal + asset.loans.reduce((assetTotal, loan) => {
    if (!loan.repaymentType || !loan.remainingTermYears) return assetTotal
    return assetTotal + calculateMonthlyLoanProjection(loan.balance, Math.max(0, loan.interestRate + adjustmentFor(asset.id)), loan.remainingTermYears, loan.repaymentType).monthlyRepayment
  }, 0), 0)
  const final = data[data.length - 1]

  return <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="font-bold text-slate-900">Portfolio projection</h2><p className="mt-0.5 text-xs text-slate-500">Scenario only — these controls do not change recorded valuations or loan rates.</p></div>
      <div className="flex gap-3"><label className="text-xs font-semibold text-slate-600">Annual property growth<input type="number" min="-20" max="30" step="0.25" value={growthRate} onChange={event => setGrowthRate(Number(event.target.value))} className="ml-2 w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm" />%</label><label className="text-xs font-semibold text-slate-600">Horizon<select value={years} onChange={event => setYears(Number(event.target.value))} className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm"><option value={5}>5 years</option><option value={10}>10 years</option><option value={15}>15 years</option><option value={20}>20 years</option><option value={30}>30 years</option></select></label></div>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}><defs><linearGradient id="assetProjection" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} /><XAxis dataKey="year" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" /><YAxis tickFormatter={value => fmtShort(value)} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={58} /><Tooltip formatter={value => fmt(Number(value ?? 0))} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0' }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Area dataKey="value" name="Property value" stroke="#2563eb" strokeWidth={2} fill="url(#assetProjection)" /><Line dataKey="debt" name="Loan balance" stroke="#ef4444" strokeWidth={2} dot={false} /><Line dataKey="equity" name="Equity" stroke="#10b981" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div>
      <div className="space-y-3"><div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">At year {years}</p><p className="mt-1 text-sm text-slate-600">Property value <strong className="float-right text-slate-900">{fmt(final.value)}</strong></p><p className="mt-1 text-sm text-slate-600">Loan balance <strong className="float-right text-slate-900">{fmt(final.debt)}</strong></p><p className="mt-1 text-sm text-slate-600">Equity <strong className="float-right text-emerald-700">{fmt(final.equity)}</strong></p><p className="mt-2 border-t border-slate-200 pt-2 text-sm text-slate-600">Monthly repayments now <strong className="float-right text-slate-900">{fmt(scenarioRepayment)}</strong></p></div>
        <div><p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Interest-rate simulation</p>{assets.map(asset => <div key={asset.id} className="mb-3 rounded-lg border border-slate-200 p-2.5"><div className="flex justify-between text-xs"><span className="font-semibold text-slate-700">{asset.name}</span><span className={adjustmentFor(asset.id) === 0 ? 'text-slate-500' : adjustmentFor(asset.id) > 0 ? 'text-red-600' : 'text-emerald-600'}>{adjustmentFor(asset.id) > 0 ? '+' : ''}{adjustmentFor(asset.id).toFixed(2)} pp</span></div><input aria-label={`${asset.name} interest rate adjustment`} type="range" min="-3" max="5" step="0.25" value={adjustmentFor(asset.id)} onChange={event => setRateAdjustments(current => ({ ...current, [asset.id]: Number(event.target.value) }))} className="mt-2 w-full accent-blue-600" /><div className="flex justify-between text-[9px] text-slate-400"><span>-3 pp</span><button onClick={() => setRateAdjustments(current => ({ ...current, [asset.id]: 0 }))} className="hover:text-blue-600">Reset</button><span>+5 pp</span></div></div>)}</div>
      </div>
    </div>
    <p className="mt-2 text-[10px] text-slate-400">Assumes annual compound property growth, unchanged scenario rates, scheduled monthly P&amp;I repayments, and no selling costs, tax, redraws or extra repayments. Interest-only balances remain flat. Loans missing repayment details are held flat.</p>
  </section>
}

function AssetCard({ asset, onEdit, onDelete, onAddLoan, onEditLoan, onDeleteLoan }: { asset: Asset; onEdit: () => void; onDelete: () => void; onAddLoan: () => void; onEditLoan: (loan: AssetLoan) => void; onDeleteLoan: (loan: AssetLoan) => void }) {
  const value = asset.valuation?.value ?? 0
  const debt = asset.loans.reduce((sum, loan) => sum + loan.balance, 0)
  const equity = value - debt
  const lvr = value > 0 ? debt / value * 100 : 0
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4">
      <div className="flex gap-3"><div className="rounded-lg bg-blue-50 p-2 text-blue-600"><Building2 size={20} /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-900">{asset.name}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-600">{asset.role}</span></div><p className="mt-1 text-xs text-slate-500">{asset.contextName ? `Context: ${asset.contextName}` : 'No Context linked'}</p></div></div>
      <div className="flex gap-1"><button onClick={onEdit} title="Edit asset" className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={15} /></button><button onClick={onDelete} title="Delete asset" className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></div>
    </div>
    <div className="grid grid-cols-2 gap-px bg-slate-100 md:grid-cols-4"><Metric label="Current value" value={fmt(value)} note={asset.valuation ? `Valued ${formatDate(asset.valuation.valuedOn)}` : 'No valuation'} /><Metric label="Loan balance" value={fmt(debt)} /><Metric label="Equity" value={fmt(equity)} /><Metric label="LVR" value={`${lvr.toFixed(1)}%`} /></div>
    <div className="p-4">
      <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Associated loans</h3><button onClick={onAddLoan} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"><Plus size={14} /> Add loan</button></div>
      {asset.loans.length === 0 ? <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">No loans associated with this asset.</p> : <div className="divide-y divide-slate-100">{asset.loans.map(loan => {
        const projection = projectionFor(loan)
        return <div key={loan.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3"><div className="flex items-center gap-3"><Landmark size={17} className="shrink-0 text-slate-400" /><div><p className="text-sm font-semibold text-slate-800">{loan.name}</p><p className="text-xs text-slate-500">Balance at {formatDate(loan.balanceOn)}{loan.repaymentType && loan.remainingTermYears ? ` · ${loan.repaymentType === 'interest_only' ? 'Interest Only' : 'Principal & Interest'} · ${loan.remainingTermYears} years remaining` : ''}</p></div></div><div className="flex items-center gap-4 text-right"><div><p className="text-sm font-semibold text-slate-800">{fmt(loan.balance)} · {loan.interestRate.toFixed(2)}%</p>{projection ? <p className="text-xs text-slate-500">Projected {fmt(projection.monthlyRepayment)}/month</p> : <button onClick={() => onEditLoan(loan)} className="text-xs font-semibold text-amber-600 hover:text-amber-700">Complete repayment setup</button>}</div><div className="flex"><button onClick={() => onEditLoan(loan)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100"><Pencil size={14} /></button><button onClick={() => onDeleteLoan(loan)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></div></div></div>
      })}</div>}
    </div>
  </section>
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) { return <div className="bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-900">{value}</p>{note && <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>}</div> }

function AssetForm({ asset, contexts, onClose, onSaved }: { asset: Asset | null; contexts: ClassificationOption[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(asset?.name ?? '')
  const [role, setRole] = useState<Asset['role']>(asset?.role ?? 'investment')
  const [contextId, setContextId] = useState(asset?.contextId ?? '')
  const [value, setValue] = useState(String(asset?.valuation?.value ?? ''))
  const [valuedOn, setValuedOn] = useState(asset?.valuation?.valuedOn ?? today())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(''); try { const data = { name, role, contextId: contextId || null, value: Number(value), valuedOn }; if (asset) await api.assets.update(asset.id, data); else await api.assets.add(data); await onSaved() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the asset.'); setSaving(false) } }
  return <Modal title={asset ? 'Edit Asset' : 'Add Asset'} onClose={onClose}><form onSubmit={submit} className="space-y-4"><label className={labelClass}>Property name<input required value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="e.g. Everton Park" /></label><div className="grid grid-cols-2 gap-3"><label className={labelClass}>Role<select value={role} onChange={e => setRole(e.target.value as Asset['role'])} className={inputClass}><option value="home">Home</option><option value="investment">Investment</option><option value="other">Other</option></select></label><label className={labelClass}>Context<select value={contextId} onChange={e => setContextId(e.target.value)} className={inputClass}><option value="">None</option>{contexts.map(context => <option key={context.id} value={context.id}>{context.name}</option>)}</select></label></div><div className="grid grid-cols-2 gap-3"><label className={labelClass}>Current value (AUD)<input required min="0" step="0.01" type="number" value={value} onChange={e => setValue(e.target.value)} className={inputClass} /></label><label className={labelClass}>Valuation date<input required type="date" value={valuedOn} onChange={e => setValuedOn(e.target.value)} className={inputClass} /></label></div><p className="text-xs text-slate-500">A dated valuation is retained in the property’s history.</p>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex gap-2 pt-2"><button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-700">Cancel</button><button disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save Asset'}</button></div></form></Modal>
}

function LoanForm({ asset, loan, onClose, onSaved }: { asset: Asset; loan: AssetLoan | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(loan?.name ?? '')
  const [balance, setBalance] = useState(String(loan?.balance ?? ''))
  const [balanceOn, setBalanceOn] = useState(loan?.balanceOn ?? today())
  const [interestRate, setInterestRate] = useState(String(loan?.interestRate ?? ''))
  const [repaymentType, setRepaymentType] = useState<RepaymentType | ''>(loan?.repaymentType ?? '')
  const [remainingTermYears, setRemainingTermYears] = useState(String(loan?.remainingTermYears ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const projection = repaymentType && Number(remainingTermYears) > 0 ? calculateMonthlyLoanProjection(Number(balance || 0), Number(interestRate || 0), Number(remainingTermYears), repaymentType) : null
  async function submit(event: FormEvent) { event.preventDefault(); if (!repaymentType) return; setSaving(true); setError(''); try { const data = { name, balance: Number(balance), balanceOn, interestRate: Number(interestRate), repaymentType, remainingTermYears: Number(remainingTermYears) }; if (loan) await api.assets.updateLoan(loan.id, data); else await api.assets.addLoan(asset.id, data); await onSaved() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the loan.'); setSaving(false) } }
  return <Modal title={`${loan ? 'Edit' : 'Add'} Loan — ${asset.name}`} onClose={onClose}><form onSubmit={submit} className="space-y-4"><label className={labelClass}>Loan name<input required value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="e.g. ING Home Loan" /></label><div className="grid grid-cols-2 gap-3"><label className={labelClass}>Current balance (AUD)<input required min="0" step="0.01" type="number" value={balance} onChange={e => setBalance(e.target.value)} className={inputClass} /></label><label className={labelClass}>Balance date<input required type="date" value={balanceOn} onChange={e => setBalanceOn(e.target.value)} className={inputClass} /></label></div><label className={labelClass}>Repayment type<select required value={repaymentType} onChange={e => setRepaymentType(e.target.value as RepaymentType | '')} className={inputClass}><option value="">Select repayment type…</option><option value="principal_and_interest">Principal &amp; Interest</option><option value="interest_only">Interest Only</option></select></label><div className="grid grid-cols-2 gap-3"><label className={labelClass}>Interest rate (% p.a.)<input required min="0" max="100" step="0.0001" type="number" value={interestRate} onChange={e => setInterestRate(e.target.value)} className={inputClass} placeholder="6.25" /></label><label className={labelClass}>Remaining term (years)<input required min="0.01" max="100" step="0.01" type="number" value={remainingTermYears} onChange={e => setRemainingTermYears(e.target.value)} className={inputClass} placeholder="25" /></label></div>{projection && <div className="rounded-lg bg-blue-50 px-3 py-2.5"><p className="text-xs text-blue-700">Projected monthly repayment</p><p className="font-bold text-blue-900">{fmt(projection.monthlyRepayment)}</p><p className="text-[11px] text-blue-600">First month: {fmt(projection.firstMonthInterest)} interest{repaymentType === 'principal_and_interest' ? ` + ${fmt(projection.firstMonthPrincipal)} principal` : ''}</p><p className="mt-1 text-[10px] text-blue-500">Monthly projection assumes the rate remains unchanged.</p></div>}{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex gap-2 pt-2"><button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-700">Cancel</button><button disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save Loan'}</button></div></form></Modal>
}
