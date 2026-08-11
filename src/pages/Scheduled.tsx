import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Calendar, RefreshCw, Sparkles, ChevronDown, ChevronRight, Check, X } from 'lucide-react'
import { Modal } from '../components/Modal'
import { api } from '../api'
import { fmt, formatDate, today, FREQUENCIES } from '../utils'
import type { Account, Category, ClassificationOptions, ScheduledSuggestion, ScheduledTransaction } from '../types/finance'
import { canUseHouseholdBucket, emptyBucketLabel } from '../lib/classification'
import { discoverScheduledSuggestions } from '../lib/recurrence'

interface Props {
  accounts: Account[]
  categories: Category[]
  onRefreshAccounts: () => void
  selectedAccountId?: any
  month?: any
  year?: any
  onRefreshCategories?: any
  onMonthChange?: any
  onYearChange?: any
}

export function ScheduledPage({ accounts, categories, onRefreshAccounts: onRefresh }: Props) {
  const [scheduled, setScheduled] = useState<ScheduledTransaction[]>([])
  const [editing, setEditing] = useState<ScheduledTransaction | null>(null)
  const [suggestionDraft, setSuggestionDraft] = useState<ScheduledSuggestion | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [suggestions, setSuggestions] = useState<ScheduledSuggestion[]>([])
  const [analysing, setAnalysing] = useState(true)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null)

  const analyse = useCallback((nextScheduled: ScheduledTransaction[]) => {
    setAnalysing(true)
    setAnalysisError(null)
    const activeAccountIds = new Set(accounts.filter(account => account.isActive).map(account => account.id))
    api.transactions.list()
      .then(history => setSuggestions(discoverScheduledSuggestions(history.filter(transaction => activeAccountIds.has(transaction.accountId)), nextScheduled)))
      .catch(error => setAnalysisError(error instanceof Error ? error.message : 'Could not analyse transaction history.'))
      .finally(() => setAnalysing(false))
  }, [accounts])

  function load(refreshSuggestions = false) {
    api.scheduled.list().then(nextScheduled => {
      setScheduled(nextScheduled)
      if (refreshSuggestions) analyse(nextScheduled)
    })
  }
  useEffect(() => {
    api.scheduled.list().then(nextScheduled => {
      setScheduled(nextScheduled)
      analyse(nextScheduled)
    }).catch(error => {
      setAnalysisError(error instanceof Error ? error.message : 'Could not load scheduled transactions.')
      setAnalysing(false)
    })
  }, [analyse])

  async function handleDelete(id: string) {
    if (!confirm('Delete this scheduled transaction?')) return
    await api.scheduled.delete(id)
    load(true)
  }

  async function handleProcessDue() {
    await api.scheduled.processDue()
    load()
    onRefresh()
  }

  const upcoming = scheduled.filter(s => s.isActive).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  const inactive = scheduled.filter(s => !s.isActive)

  return (
    <div className="p-5 overflow-y-auto h-full space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Scheduled Transactions</h2>
          <p className="text-xs text-gray-400 mt-0.5">{upcoming.length} active recurring transactions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleProcessDue}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50"
            title="Run any transactions due today"
          >
            <RefreshCw size={13} /> Process Due
          </button>
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={14} /> Add Scheduled
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-blue-100 bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-blue-100 bg-blue-50/60 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600"><Sparkles size={16} /></span>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Suggested from transaction history</h3>
              <p className="mt-0.5 text-xs text-slate-500">Repeated merchants ranked by timing, amount stability and supporting history.</p>
            </div>
          </div>
          <button onClick={() => analyse(scheduled)} disabled={analysing} className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50">
            <RefreshCw size={12} className={analysing ? 'animate-spin' : ''} /> {analysing ? 'Analysing…' : 'Analyse again'}
          </button>
        </div>
        {analysisError && <p className="m-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{analysisError}</p>}
        {!analysing && !analysisError && suggestions.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No new reliable recurring patterns found.</p>}
        {suggestions.length > 0 && (
          <div className="divide-y divide-slate-100">
            {suggestions.map(suggestion => {
              const expanded = expandedSuggestion === suggestion.key
              const frequencyLabel = FREQUENCIES.find(item => item.value === suggestion.frequency)?.label ?? suggestion.frequency
              return <div key={suggestion.key}>
                <div className="grid grid-cols-[minmax(240px,1fr)_110px_135px_90px_150px] items-center gap-3 px-4 py-3 text-sm">
                  <button onClick={() => setExpandedSuggestion(expanded ? null : suggestion.key)} className="flex min-w-0 items-center gap-2 text-left">
                    {expanded ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
                    <span className="min-w-0"><span className="block truncate font-medium text-slate-800">{suggestion.merchant}</span><span className="block truncate text-[11px] text-slate-400">{suggestion.accountName} · {suggestion.occurrenceCount} transactions</span></span>
                  </button>
                  <span className="text-xs font-medium text-slate-600">{frequencyLabel}</span>
                  <span className={`font-semibold ${suggestion.amount > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>{fmt(suggestion.amount, true)}</span>
                  <span className={`w-fit rounded-full px-2 py-1 text-[11px] font-semibold ${suggestion.confidence >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{suggestion.confidence}%</span>
                  <div className="flex justify-end gap-1.5"><button onClick={() => setSuggestions(current => current.filter(item => item.key !== suggestion.key))} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100" title="Dismiss suggestion"><X size={14} /></button><button onClick={() => { setEditing(null); setSuggestionDraft(suggestion); setShowForm(true) }} className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"><Check size={13} /> Review</button></div>
                </div>
                {expanded && <div className="border-t border-slate-100 bg-slate-50/70 px-10 py-3">
                  <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500"><span>Typical: <strong className="text-slate-700">{fmt(suggestion.amount, true)}</strong></span><span>Range: <strong className="text-slate-700">{fmt(suggestion.minAmount, true)} to {fmt(suggestion.maxAmount, true)}</strong></span><span>Next expected: <strong className="text-slate-700">{formatDate(suggestion.nextDate)}</strong></span>{suggestion.categoryFullName && <span>Purpose: <strong className="text-slate-700">{suggestion.categoryFullName}</strong></span>}</div>
                  <div className="grid gap-1">{suggestion.evidence.map((row, index) => <div key={`${row.date}-${index}`} className="grid grid-cols-[90px_100px_1fr] gap-3 text-[11px] text-slate-500"><span>{formatDate(row.date)}</span><span className={row.amount > 0 ? 'text-emerald-600' : 'text-slate-700'}>{fmt(row.amount, true)}</span><span className="truncate">{row.description}</span></div>)}</div>
                </div>}
              </div>
            })}
          </div>
        )}
      </section>

      {upcoming.length === 0 && inactive.length === 0 && (
        <div className="text-center py-14 text-gray-400 text-sm">
          No scheduled transactions yet.
          <button onClick={() => { setEditing(null); setShowForm(true) }} className="block mx-auto mt-2 text-blue-600 hover:underline">
            Create your first
          </button>
        </div>
      )}

      {/* Active scheduled */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          {upcoming.map(s => (
            <ScheduledRow
              key={s.id}
              item={s}
              onEdit={() => { setEditing(s); setShowForm(true) }}
              onDelete={() => handleDelete(s.id)}
            />
          ))}
        </div>
      )}

      {/* Inactive */}
      {inactive.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide pt-2">Inactive</p>
          {inactive.map(s => (
            <ScheduledRow
              key={s.id}
              item={s}
              onEdit={() => { setEditing(s); setShowForm(true) }}
              onDelete={() => handleDelete(s.id)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <ScheduledFormModal
          item={editing ?? undefined}
          suggestion={suggestionDraft ?? undefined}
          accounts={accounts}
          categories={categories}
          onClose={() => { setShowForm(false); setSuggestionDraft(null) }}
          onSave={async data => {
            if (editing && (editing as ScheduledTransaction).id) {
              await api.scheduled.update((editing as ScheduledTransaction).id, data)
            } else {
              await api.scheduled.add(data)
            }
            load(true)
            setShowForm(false)
            setSuggestionDraft(null)
          }}
        />
      )}
    </div>
  )
}

function ScheduledRow({ item, onEdit, onDelete }: {
  item: ScheduledTransaction
  onEdit: () => void
  onDelete: () => void
}) {
  const freqLabel = FREQUENCIES.find(f => f.value === item.frequency)?.label ?? item.frequency
  const isOverdue = item.isActive && item.nextDate < today()

  return (
    <div className={`bg-white rounded-xl border p-4 flex items-center gap-3 ${item.isActive ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 shrink-0">
        <Calendar size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.description}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {freqLabel} · Next: <span className={isOverdue ? 'text-red-500 font-medium' : ''}>{formatDate(item.nextDate)}</span>
          {item.categoryFullName && ` · ${item.categoryFullName}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold ${item.amount > 0 ? 'text-green-600' : 'text-gray-800'}`}>
          {fmt(item.amount, true)}
        </p>
        <p className="text-xs text-gray-400">{item.accountName}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function ScheduledFormModal({ item, suggestion, accounts, categories, onClose, onSave }: {
  item?: ScheduledTransaction
  suggestion?: ScheduledSuggestion
  accounts: Account[]
  categories: Category[]
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const availableAccounts = accounts.filter(account => account.isActive || account.id === item?.accountId)
  const seed = item ?? suggestion
  const [description, setDescription] = useState(seed?.description ?? '')
  const [amount, setAmount] = useState(seed ? String(Math.abs(seed.amount)) : '')
  const [isExpense, setIsExpense] = useState(!seed || seed.amount < 0)
  const [accountId, setAccountId] = useState(seed?.accountId ?? accounts.find(account => account.isActive)?.id ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(seed?.categoryId ?? null)
  const [contextId, setContextId] = useState(seed?.contextId ?? '')
  const [bucketId, setBucketId] = useState(seed?.bucketId ?? '')
  const [taxTreatment, setTaxTreatment] = useState<ScheduledTransaction['taxTreatment']>(seed?.taxTreatment ?? 'none')
  const [classificationOptions, setClassificationOptions] = useState<ClassificationOptions>({ contexts: [], buckets: [], categories: [] })
  const [frequency, setFrequency] = useState(seed?.frequency ?? 'monthly')
  const [nextDate, setNextDate] = useState(seed?.nextDate ?? today())
  const [isActive, setIsActive] = useState(item?.isActive ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catSearch, setCatSearch] = useState('')

  const filtered = categories.filter(c => !catSearch || c.fullName.toLowerCase().includes(catSearch.toLowerCase())).slice(0, 40)
  const selectedCat = categories.find(c => c.id === categoryId)
  const selectedPurpose = classificationOptions.categories.find(item => item.id === categoryId)
  const selectedContext = classificationOptions.contexts.find(item => item.id === contextId)

  useEffect(() => {
    api.classification.options().then(options => {
      setClassificationOptions(options)
      setContextId(current => current || options.contexts.find(context => context.name === 'Household')?.id || '')
    }).catch(console.error)
  }, [])

  async function handleSave() {
    if (!description.trim() || !amount || !accountId || !categoryId || !contextId || taxTreatment === 'review' || (canUseHouseholdBucket(selectedContext?.name, selectedPurpose?.type) && !bucketId)) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        description: description.trim(),
        amount: (isExpense ? -1 : 1) * Math.abs(parseFloat(amount)),
        accountId,
        categoryId,
        contextId,
        bucketId: canUseHouseholdBucket(selectedContext?.name, selectedPurpose?.type) ? bucketId || null : null,
        taxTreatment,
        frequency,
        startDate: nextDate,
        nextDate,
        isActive
      })
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={item ? 'Edit Scheduled' : suggestion ? 'Review Suggested Schedule' : 'New Scheduled Transaction'} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {['Expense', 'Income'].map(t => (
            <button
              key={t}
              onClick={() => setIsExpense(t === 'Expense')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                (t === 'Expense') === isExpense ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
          <input
            autoFocus
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Rent"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Amount (AUD)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
              step="0.01"
              min="0"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Next Date</label>
            <input
              type="date"
              value={nextDate}
              onChange={e => setNextDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Account</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableAccounts.map(a => <option key={a.id} value={a.id} disabled={!a.isActive}>{a.name}{a.isActive ? '' : ' (inactive)'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Frequency</label>
            <select
              value={frequency}
              onChange={e => setFrequency(e.target.value as ScheduledTransaction['frequency'])}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>

        {/* Purpose */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Purpose</label>
          <div className="relative">
            <input
              value={catSearch || (selectedCat ? selectedCat.fullName : '')}
              onChange={e => { setCatSearch(e.target.value); if (!e.target.value) setCategoryId(null) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search purpose…"
              onFocus={() => setCatSearch('')}
            />
            {catSearch && (
              <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-xl z-30 max-h-40 overflow-y-auto">
                {filtered.map(c => (
                  <button
                    key={c.id}
                    onMouseDown={() => { setCategoryId(c.id); setCatSearch('') }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 flex items-center gap-2"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.fullName}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Context</label><select value={contextId} onChange={event => { setContextId(event.target.value); setBucketId('') }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"><option value="">Choose…</option>{classificationOptions.contexts.filter(context => context.name !== 'Review required').map(context => <option key={context.id} value={context.id}>{context.name}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Household Bucket</label><select value={bucketId} disabled={!canUseHouseholdBucket(selectedContext?.name, selectedPurpose?.type)} onChange={event => setBucketId(event.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100"><option value="">{emptyBucketLabel(selectedContext?.name, selectedPurpose?.type)}</option>{classificationOptions.buckets.map(bucket => <option key={bucket.id} value={bucket.id}>{bucket.name}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Tax</label><select value={taxTreatment} onChange={event => setTaxTreatment(event.target.value as ScheduledTransaction['taxTreatment'])} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"><option value="none">None</option><option value="deductible">Deductible</option><option value="review">Needs review</option></select></div>
        </div>

        {/* Active toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={e => setIsActive(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-600">Active (auto-execute when due)</span>
        </label>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !description.trim() || !amount || !categoryId || !contextId || taxTreatment === 'review' || (canUseHouseholdBucket(selectedContext?.name, selectedPurpose?.type) && !bucketId)}
            className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : (item ? 'Update' : 'Add')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
