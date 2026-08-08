import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Search, ShieldAlert } from 'lucide-react'
import { api } from '../api'
import { fmt, formatDate } from '../utils'
import type { ClassificationOptions, LegacyCategoryMapping, LegacyTransactionSample } from '../types/finance'

type Draft = {
  canonicalCategoryId: string
  contextId: string
  bucketId: string
  taxTreatment: 'none' | 'deductible' | 'review'
}

type QueueFilter = 'unresolved' | 'protected' | 'resolved' | 'all'

function draftFor(mapping: LegacyCategoryMapping): Draft {
  return {
    canonicalCategoryId: mapping.canonicalCategoryId ?? '',
    contextId: mapping.contextId ?? '',
    bucketId: mapping.bucketId ?? '',
    taxTreatment: mapping.taxTreatment,
  }
}

function suggestedDraftFor(mapping: LegacyCategoryMapping, options: ClassificationOptions): Draft {
  const draft = draftFor(mapping)
  if (mapping.status === 'preserved' || mapping.legacyCategoryType === 'transfer') return draft
  const path = mapping.categoryPath.toLocaleLowerCase()
  const findContext = (name: string) => options.contexts.find(item => item.name === name)?.id ?? ''
  const findPurpose = (name: string, family?: string) => options.categories.find(item => item.name === name && item.type === mapping.legacyCategoryType && (!family || item.family === family))?.id ?? ''
  const findBucket = (name: string) => options.buckets.find(item => item.name === name)?.id ?? ''

  if (!draft.contextId) {
    if (path.startsWith('asa:')) draft.contextId = findContext('Business — ASA')
    else if (path.startsWith('house - currumundi')) draft.contextId = findContext('Property — Currumundi')
    else if (path.startsWith('house - evertonpark')) draft.contextId = findContext('Property — Everton Park')
    else if (path.startsWith('house - toogoom')) draft.contextId = findContext('Property — Toogoom')
    else draft.contextId = findContext('Household')
  }

  if (!draft.canonicalCategoryId) {
    const suggestions: Array<[RegExp, string, string?]> = mapping.legacyCategoryType === 'income'
      ? [
          [/^salario.*extra|additional/, 'Additional earnings'], [/^salario|salary/, 'Salary'],
          [/interest/, 'Interest'], [/rent/, 'Rental income'], [/refund|rebate/, 'Refund / rebate'],
          [/^asa:/, 'Business income'],
        ]
      : [
          [/supermarket|grocer/, 'Groceries'], [/restaurant|restaurante/, 'Restaurants'], [/cafe/, 'Cafes'],
          [/gasolina|petrol|fuel/, 'Fuel'], [/public transport|opal/, 'Public transport'], [/uber|taxi/, 'Rideshare and taxi'],
          [/kids:activities/, 'Activities'], [/kids:childcare/, 'Childcare'], [/kids:.*allowance/, 'Allowance'],
          [/kids:.*clothing/, 'Clothing', 'Children'], [/kids:.*entertainment/, 'Entertainment', 'Children'], [/kids:.*toys?/, 'Toys'],
          [/subscriptions?/, 'Subscriptions'], [/trips?|holidays?/, 'Travel'], [/alcohol/, 'Alcohol'],
          [/gifts?/, 'Gifts'], [/gadgets?|electronics?/, 'Electronics and gadgets'], [/selfcare|personal care/, 'Personal care'],
          [/entertainment & recreation:.*clothing/, 'Clothing', 'Lifestyle'], [/entertainment & recreation:/, 'Entertainment', 'Lifestyle'],
          [/transportation:.*parking/, 'Parking'], [/transportation:.*toll/, 'Tolls'],
          [/bank:.*fees?/, 'Bank fees'], [/insurance.*excess|excess/, 'Insurance excess'],
          [/^asa:academy/, 'Program / team costs'], [/^asa:.*uniform/, 'Uniforms'], [/^asa:.*staff/, 'Staff costs'],
          [/^asa:/, 'General operating costs'],
        ]
    const match = suggestions.find(([pattern]) => pattern.test(path))
    if (match) draft.canonicalCategoryId = findPurpose(match[1], match[2])
  }

  const context = options.contexts.find(item => item.id === draft.contextId)
  const purpose = options.categories.find(item => item.id === draft.canonicalCategoryId)
  if (!draft.bucketId && context?.name === 'Household' && purpose?.type === 'expense') {
    const daily = ['Groceries', 'Fuel', 'Public transport', 'Childcare', 'School care', 'School fees', 'School supplies', 'Books and learning', 'Activities', 'Medical care', 'Pharmacy', 'Electricity', 'Gas', 'Water', 'Internet', 'Mobile phone']
    const smile = ['Travel', 'Gifts', 'Donations']
    draft.bucketId = findBucket(smile.includes(purpose.name) ? 'Smile' : daily.includes(purpose.name) ? 'Daily Expenses' : 'Splurge')
  }
  return draft
}

function issuesFor(mapping: LegacyCategoryMapping, draft: Draft, options: ClassificationOptions): string[] {
  if (mapping.legacyCategoryType === 'transfer') return []
  const issues: string[] = []
  const purpose = options.categories.find(item => item.id === draft.canonicalCategoryId)
  const context = options.contexts.find(item => item.id === draft.contextId)
  if (!purpose) issues.push('Purpose')
  if (!context || context.name === 'Review required') issues.push('Context')
  if (purpose?.type === 'expense' && context?.name === 'Household' && !draft.bucketId) issues.push('Household bucket')
  if (draft.taxTreatment === 'review') issues.push('Tax decision')
  if (mapping.status === 'preserved' && !draft.canonicalCategoryId) issues.push('Protected manual decision')
  return issues
}

export function MigrationPage() {
  const [mappings, setMappings] = useState<LegacyCategoryMapping[]>([])
  const [options, setOptions] = useState<ClassificationOptions>({ contexts: [], buckets: [], categories: [] })
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [filter, setFilter] = useState<QueueFilter>('unresolved')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sampleRows, setSampleRows] = useState<Record<string, LegacyTransactionSample[]>>({})
  const [loadingSamplesId, setLoadingSamplesId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [nextMappings, nextOptions] = await Promise.all([api.classification.mappings(), api.classification.options()])
      setMappings(nextMappings)
      setOptions(nextOptions)
      setDrafts(Object.fromEntries(nextMappings.map(mapping => [mapping.categoryId, suggestedDraftFor(mapping, nextOptions)])))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const stateFor = (mapping: LegacyCategoryMapping) => {
    const draft = drafts[mapping.categoryId] ?? draftFor(mapping)
    const original = draftFor(mapping)
    const issues = issuesFor(mapping, draft, options)
    const persistedIssues = issuesFor(mapping, original, options)
    const dirty = JSON.stringify(draft) !== JSON.stringify(original)
    return { draft, issues, persistedIssues, dirty }
  }
  const resolvedCount = mappings.filter(mapping => stateFor(mapping).persistedIssues.length === 0).length
  const protectedCount = mappings.filter(mapping => mapping.status === 'preserved').length
  const unresolvedCount = mappings.length - resolvedCount
  const impactedTransactions = mappings
    .filter(mapping => stateFor(mapping).persistedIssues.length > 0)
    .reduce((sum, mapping) => sum + mapping.transactionCount, 0)

  const visible = useMemo(() => mappings
    .filter(mapping => {
      const issues = issuesFor(mapping, draftFor(mapping), options)
      if (filter === 'unresolved' && issues.length === 0) return false
      if (filter === 'resolved' && issues.length > 0) return false
      if (filter === 'protected' && mapping.status !== 'preserved') return false
      return !search || mapping.categoryPath.toLowerCase().includes(search.toLowerCase())
    })
    .sort((left, right) => right.transactionCount - left.transactionCount || left.categoryPath.localeCompare(right.categoryPath)),
  [mappings, options, filter, search])

  async function save(mapping: LegacyCategoryMapping) {
    const draft = drafts[mapping.categoryId] ?? draftFor(mapping)
    setSavingId(mapping.categoryId)
    setError('')
    try {
      await api.classification.saveMapping(mapping.categoryId, {
        canonicalCategoryId: draft.canonicalCategoryId || null,
        contextId: draft.contextId || null,
        bucketId: draft.bucketId || null,
        taxTreatment: draft.taxTreatment,
      })
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSavingId(null)
    }
  }

  async function toggleSamples(mapping: LegacyCategoryMapping) {
    if (expandedId === mapping.categoryId) {
      setExpandedId(null)
      return
    }
    setExpandedId(mapping.categoryId)
    if (sampleRows[mapping.categoryId]) return
    setLoadingSamplesId(mapping.categoryId)
    try {
      const samples = await api.classification.samples(mapping.categoryId)
      setSampleRows(current => ({ ...current, [mapping.categoryId]: samples }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoadingSamplesId(null)
    }
  }

  if (loading && mappings.length === 0) return <div className="h-full overflow-auto p-6 text-sm text-slate-500">Loading every legacy mapping…</div>

  return (
    <div className="h-full overflow-auto bg-slate-50 p-5">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2"><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">Temporary migration tool</span></div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Resolve legacy mappings</h1>
            <p className="mt-1 text-sm text-slate-500">Make each legacy category an approved Purpose, Context, Household Bucket, and Tax decision. Saving also updates its existing transactions.</p>
          </div>
          <div className="text-right"><p className="text-2xl font-bold text-slate-800">{resolvedCount} / {mappings.length}</p><p className="text-xs text-slate-400">mappings resolved</p></div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${mappings.length ? resolvedCount / mappings.length * 100 : 0}%` }} /></div>

        <div className="grid grid-cols-4 gap-3">
          <button onClick={() => setFilter('unresolved')} className={`rounded-xl border p-4 text-left ${filter === 'unresolved' ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200' : 'border-slate-200 bg-white'}`}><p className="text-2xl font-bold text-amber-700">{unresolvedCount}</p><p className="text-xs text-slate-500">Still ambiguous</p></button>
          <button onClick={() => setFilter('resolved')} className={`rounded-xl border p-4 text-left ${filter === 'resolved' ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200' : 'border-slate-200 bg-white'}`}><p className="text-2xl font-bold text-emerald-700">{resolvedCount}</p><p className="text-xs text-slate-500">Resolved</p></button>
          <button onClick={() => setFilter('protected')} className={`rounded-xl border p-4 text-left ${filter === 'protected' ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-200' : 'border-slate-200 bg-white'}`}><p className="text-2xl font-bold text-violet-700">{protectedCount}</p><p className="text-xs text-slate-500">Protected manual decisions</p></button>
          <button onClick={() => setFilter('all')} className={`rounded-xl border p-4 text-left ${filter === 'all' ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white'}`}><p className="text-2xl font-bold text-blue-700">{impactedTransactions}</p><p className="text-xs text-slate-500">Transactions awaiting complete mappings</p></button>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3">
          <div className="relative w-full max-w-md"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search legacy categories…" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400" /></div>
          <p className="text-xs text-slate-400">Showing {visible.length} · highest transaction impact first</p>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="space-y-2">
          {visible.map(mapping => {
            const { draft, persistedIssues, dirty } = stateFor(mapping)
            const context = options.contexts.find(item => item.id === draft.contextId)
            const purpose = options.categories.find(item => item.id === draft.canonicalCategoryId)
            const income = purpose?.type === 'income' || mapping.legacyCategoryType === 'income'
            const transfer = mapping.legacyCategoryType === 'transfer'
            const complete = persistedIssues.length === 0
            return (
              <div key={mapping.categoryId} className={`rounded-xl border bg-white shadow-sm ${complete ? 'border-emerald-200' : mapping.status === 'preserved' ? 'border-violet-200' : 'border-slate-200'}`}>
                <div className="grid grid-cols-[minmax(220px,1.15fr)_minmax(220px,1.3fr)_210px_180px_150px_110px] items-end gap-3 p-4">
                  <button type="button" onClick={() => toggleSamples(mapping)} aria-expanded={expandedId === mapping.categoryId} className="self-center min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      {complete ? <Check size={16} className="shrink-0 text-emerald-500" /> : mapping.status === 'preserved' ? <ShieldAlert size={16} className="shrink-0 text-violet-500" /> : <AlertTriangle size={16} className="shrink-0 text-amber-500" />}
                      <p className="truncate text-sm font-semibold text-slate-800" title={mapping.categoryPath}>{mapping.categoryPath}</p>
                      <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${expandedId === mapping.categoryId ? 'rotate-180' : ''}`} />
                    </div>
                    <p className="mt-1 pl-6 text-[11px] text-slate-400">{mapping.transactionCount} transaction{mapping.transactionCount === 1 ? '' : 's'} · {mapping.notes || 'No migration note'}</p>
                    {!complete && <div className="mt-2 flex flex-wrap gap-1 pl-6">{persistedIssues.map(issue => <span key={issue} className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Needs {issue}</span>)}{dirty && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-700">Suggested · review and save</span>}</div>}
                    <p className="mt-2 pl-6 text-[10px] font-medium text-blue-500">{expandedId === mapping.categoryId ? 'Hide samples' : 'View 3 transaction samples'}</p>
                  </button>

                  {transfer ? <>
                    <div className="col-span-4 rounded-lg border border-sky-100 bg-sky-50 px-4 py-2.5 text-xs text-sky-700"><strong>Ledger transfer:</strong> classification comes from its source and target accounts. It creates no income or expense and consumes no Household Bucket.</div>
                    <div className="flex h-[34px] items-center justify-center gap-1 rounded-lg bg-emerald-50 px-3 text-xs font-semibold text-emerald-700"><Check size={13} /> Exempt</div>
                  </> : <>
                    <Field label="Purpose"><SearchablePurposeSelect options={options.categories} value={draft.canonicalCategoryId} onChange={canonicalCategoryId => { const nextPurpose = options.categories.find(item => item.id === canonicalCategoryId); setDrafts(current => ({ ...current, [mapping.categoryId]: { ...draft, canonicalCategoryId, bucketId: nextPurpose?.type === 'income' ? '' : draft.bucketId } })) }} /></Field>
                    <Field label="Context"><select value={draft.contextId} onChange={event => { const contextId = event.target.value; const household = options.contexts.find(item => item.id === contextId)?.name === 'Household'; setDrafts(current => ({ ...current, [mapping.categoryId]: { ...draft, contextId, bucketId: household && !income ? draft.bucketId : '' } })) }} className="field-select"><option value="">Choose context…</option>{options.contexts.filter(item => item.name !== 'Review required').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                    <Field label="Household bucket"><select value={draft.bucketId} disabled={context?.name !== 'Household' || income} onChange={event => setDrafts(current => ({ ...current, [mapping.categoryId]: { ...draft, bucketId: event.target.value } }))} className="field-select disabled:bg-slate-100 disabled:text-slate-400"><option value="">{income ? 'Allocation source' : context?.name === 'Household' ? 'Choose bucket…' : 'Not applicable'}</option>{!income && options.buckets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                    <Field label="Tax"><select value={draft.taxTreatment} onChange={event => setDrafts(current => ({ ...current, [mapping.categoryId]: { ...draft, taxTreatment: event.target.value as Draft['taxTreatment'] } }))} className="field-select"><option value="none">None</option><option value="deductible">Deductible</option><option value="review">Needs review</option></select></Field>
                    <button onClick={() => save(mapping)} disabled={savingId === mapping.categoryId || !dirty} className={`flex h-[34px] items-center justify-center gap-1 rounded-lg px-3 text-xs font-semibold ${complete && !dirty ? 'bg-emerald-50 text-emerald-700' : dirty ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-400'} disabled:cursor-default`}>
                      {complete && !dirty ? <><Check size={13} /> Resolved</> : savingId === mapping.categoryId ? 'Applying…' : dirty ? <>Save <ChevronRight size={13} /></> : 'No changes'}
                    </button>
                  </>}
                </div>
                {expandedId === mapping.categoryId && (
                  <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Recent transaction samples</p>
                    {loadingSamplesId === mapping.categoryId ? <p className="py-3 text-xs text-slate-400">Loading samples…</p> : (sampleRows[mapping.categoryId]?.length ?? 0) > 0 ? (
                      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                        {sampleRows[mapping.categoryId].map(sample => <div key={sample.id} className="grid grid-cols-[90px_minmax(0,1fr)_120px] gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0"><span className="text-slate-400">{formatDate(sample.date)}</span><span className="truncate text-slate-700" title={sample.description}>{sample.description}</span><span className={`text-right font-semibold tabular-nums ${sample.amount >= 0 ? 'text-emerald-600' : 'text-slate-700'}`}>{sample.amount >= 0 ? '+' : '-'}{fmt(Math.abs(sample.amount))}</span></div>)}
                      </div>
                    ) : <p className="py-3 text-xs text-slate-400">No transactions are available for this category.</p>}
                  </div>
                )}
              </div>
            )
          })}
          {!visible.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-400">Nothing in this queue.</div>}
        </div>
      </div>
      <style>{`.field-select{width:100%;border:1px solid rgb(203 213 225);border-radius:.5rem;background:white;padding:.45rem .6rem;font-size:.75rem;color:rgb(51 65 85);outline:none}.field-select:focus{border-color:rgb(96 165 250);box-shadow:0 0 0 1px rgb(191 219 254)}`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>{children}</label>
}

function SearchablePurposeSelect({ options, value, onChange }: {
  options: ClassificationOptions['categories']
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find(option => option.id === value)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = options.filter(option => !normalizedQuery || option.name.toLocaleLowerCase().includes(normalizedQuery) || option.family.toLocaleLowerCase().includes(normalizedQuery))
  const families = [...new Set(filtered.map(option => option.family))]

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  function choose(nextValue: string) {
    onChange(nextValue)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen(current => !current)} aria-haspopup="listbox" aria-expanded={open} className="field-select flex items-center justify-between gap-2 text-left">
        <span className={selected ? 'truncate' : 'truncate text-slate-400'}>{selected?.name ?? 'Choose purpose…'}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[280px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); if (event.key === 'Enter' && filtered[0]) choose(filtered[0].id) }} placeholder="Search purposes…" className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
          <div role="listbox" className="max-h-72 overflow-y-auto p-1.5">
            <button type="button" onClick={() => choose('')} className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs text-slate-500 hover:bg-slate-50">Choose purpose…</button>
            {families.map(family => (
              <div key={family}>
                <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{family}</p>
                {filtered.filter(option => option.family === family).map(option => (
                  <button key={option.id} type="button" role="option" aria-selected={option.id === value} onClick={() => choose(option.id)} className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-blue-50 ${option.id === value ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700'}`}>
                    <span>{option.name}</span>{option.id === value && <Check size={13} />}
                  </button>
                ))}
              </div>
            ))}
            {!filtered.length && <p className="px-3 py-6 text-center text-xs text-slate-400">No purposes match “{query}”.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
