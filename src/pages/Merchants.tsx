import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Pencil, Search, Sparkles, Store } from 'lucide-react'
import { api } from '../api'
import { Modal } from '../components/Modal'
import { fmt, formatDate } from '../utils'
import type { Category, ClassificationOptions, MerchantInsight } from '../types/finance'

interface Props {
  categories: Category[]
  onRefreshCategories: () => void
}

type MerchantFilter = 'all' | 'learned' | 'review' | 'unclassified'

function merchantState(merchant: MerchantInsight): Exclude<MerchantFilter, 'all'> {
  if (!merchant.categoryId) return 'unclassified'
  if (merchant.remembered || merchant.confidence >= 0.8) return 'learned'
  return 'review'
}

export function MerchantsPage({ categories, onRefreshCategories }: Props) {
  const [merchants, setMerchants] = useState<MerchantInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<MerchantFilter>('all')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [applying, setApplying] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(100)
  const [message, setMessage] = useState<string | null>(null)
  const [editingRule, setEditingRule] = useState<MerchantInsight | null>(null)
  const [classificationOptions, setClassificationOptions] = useState<ClassificationOptions>({ contexts: [], buckets: [], categories: [] })

  async function load() {
    setLoading(true)
    try {
      const data = await api.merchants.list()
      setMerchants(data)
      setDrafts(Object.fromEntries(data.filter(item => item.categoryId).map(item => [item.key, item.categoryId!])))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(); api.classification.options().then(setClassificationOptions).catch(console.error) }, [])

  const counts = useMemo(() => ({
    all: merchants.length,
    learned: merchants.filter(item => merchantState(item) === 'learned').length,
    review: merchants.filter(item => merchantState(item) === 'review').length,
    unclassified: merchants.filter(item => merchantState(item) === 'unclassified').length,
  }), [merchants])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return merchants.filter(merchant => {
      if (filter !== 'all' && merchantState(merchant) !== filter) return false
      return !query || merchant.name.toLocaleLowerCase().includes(query) || merchant.aliases.some(alias => alias.toLocaleLowerCase().includes(query))
    })
  }, [merchants, search, filter])

  const categoryOptions = [...categories]
    .filter(category => !/^\?+$/.test(category.fullName.trim()))
    .sort((left, right) => left.fullName.localeCompare(right.fullName))

  async function apply(merchant: MerchantInsight) {
    const categoryId = drafts[merchant.key]
    if (!categoryId) return
    setApplying(merchant.key)
    setMessage(null)
    try {
      await api.merchants.applyCategory({
        key: merchant.key,
        name: merchant.name,
        aliases: merchant.aliases,
        transactionIds: merchant.transactionIds,
        categoryId,
      })
      setMessage(`${merchant.name} will now use this category for existing and future matching transactions.`)
      await load()
      onRefreshCategories()
    } finally {
      setApplying(null)
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-50/60">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-start gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Merchants</h1>
            <p className="mt-0.5 text-sm text-slate-500">Turn transaction history into reliable classification rules.</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-3">
          <Stat label="All merchants" value={counts.all} tone="slate" active={filter === 'all'} onClick={() => { setFilter('all'); setVisibleCount(100) }} />
          <Stat label="High confidence" value={counts.learned} tone="green" active={filter === 'learned'} onClick={() => { setFilter('learned'); setVisibleCount(100) }} />
          <Stat label="Needs review" value={counts.review} tone="amber" active={filter === 'review'} onClick={() => { setFilter('review'); setVisibleCount(100) }} />
          <Stat label="Unclassified" value={counts.unclassified} tone="rose" active={filter === 'unclassified'} onClick={() => { setFilter('unclassified'); setVisibleCount(100) }} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="relative w-full max-w-xl">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={event => { setSearch(event.target.value); setVisibleCount(100) }} placeholder="Search merchant names or source descriptions…" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" />
          </div>
          {(filter !== 'all' || search) && (
            <button onClick={() => { setFilter('all'); setSearch(''); setVisibleCount(100) }} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Clear filters</button>
          )}
          <div className="flex-1" />
          <p className="whitespace-nowrap text-xs text-slate-400">Showing {Math.min(filtered.length, visibleCount)} of {filtered.length}</p>
        </div>
        {message && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</div>}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-400">Analysing merchant history…</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-400">No merchants match this view.</div>
        ) : (
          <div className="mx-auto max-w-7xl space-y-2">
            {filtered.slice(0, visibleCount).map(merchant => (
              <MerchantRow
                key={merchant.key}
                merchant={merchant}
                categories={categoryOptions}
                selectedCategoryId={drafts[merchant.key] ?? ''}
                applying={applying === merchant.key}
                onCategoryChange={categoryId => setDrafts(current => ({ ...current, [merchant.key]: categoryId }))}
                onApply={() => apply(merchant)}
                onEditRule={() => setEditingRule(merchant)}
              />
            ))}
            {visibleCount < filtered.length && (
              <button onClick={() => setVisibleCount(count => count + 100)} className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Show 100 more · {filtered.length - visibleCount} remaining
              </button>
            )}
          </div>
        )}
      </div>
      {editingRule && (
        <MerchantRuleModal
          merchant={editingRule}
          categories={categoryOptions}
          options={classificationOptions}
          onClose={() => setEditingRule(null)}
          onSave={async data => {
            await api.merchants.saveRule({
              merchantId: editingRule.merchantId,
              key: editingRule.key,
              transactionIds: editingRule.transactionIds,
              ...data,
            })
            setEditingRule(null)
            setMessage(`${data.name} rule saved. Future imports will use its matching phrases.`)
            await load()
            onRefreshCategories()
          }}
        />
      )}
    </div>
  )
}

function Stat({ label, value, tone, active, onClick }: { label: string; value: number; tone: 'slate' | 'green' | 'amber' | 'rose'; active: boolean; onClick: () => void }) {
  const styles = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  }
  return (
    <button onClick={onClick} aria-pressed={active} className={`rounded-xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${styles[tone]} ${active ? 'ring-2 ring-slate-700 ring-offset-2' : ''}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <p className="text-xs font-medium opacity-70">{label}</p>
        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-50">Filter</span>
      </div>
    </button>
  )
}

function MerchantRow({ merchant, categories, selectedCategoryId, applying, onCategoryChange, onApply, onEditRule }: {
  merchant: MerchantInsight
  categories: Category[]
  selectedCategoryId: string
  applying: boolean
  onCategoryChange: (categoryId: string) => void
  onApply: () => void
  onEditRule: () => void
}) {
  const state = merchantState(merchant)
  const badge = state === 'learned'
    ? { label: merchant.remembered ? 'Remembered' : 'High confidence', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 }
    : state === 'review'
      ? { label: 'Needs review', classes: 'bg-amber-50 text-amber-700 border-amber-200', Icon: AlertCircle }
      : { label: 'Unclassified', classes: 'bg-rose-50 text-rose-700 border-rose-200', Icon: AlertCircle }

  return (
    <article className="grid grid-cols-[minmax(240px,1.2fr)_minmax(300px,1.5fr)_150px_220px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-r border-slate-100 p-4">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Store size={17} /></div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-slate-900" title={merchant.name}>{merchant.name}</h2>
            <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.classes}`}><badge.Icon size={10} />{badge.label}</span>
          </div>
        </div>
        <details className="mt-3 text-[11px] text-slate-400">
          <summary className="cursor-pointer hover:text-slate-600">{merchant.aliases.length} source description{merchant.aliases.length === 1 ? '' : 's'}</summary>
          <div className="mt-1 max-h-20 space-y-1 overflow-y-auto pr-2">{merchant.aliases.map(alias => <p key={alias} className="truncate" title={alias}>{alias}</p>)}</div>
        </details>
        <p className="mt-2 text-[10px] text-slate-400">First seen {formatDate(merchant.firstSeen)} · Last seen {formatDate(merchant.lastSeen)}</p>
      </div>

      <div className="border-r border-slate-100 p-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Category evidence</p>
        {merchant.candidates.length ? merchant.candidates.map(candidate => (
          <div key={candidate.categoryId} className="mb-2 grid grid-cols-[minmax(120px,1fr)_120px_42px] items-center gap-2 text-xs">
            <span className="truncate text-slate-600" title={candidate.categoryName}>{candidate.categoryName}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${candidate.percentage * 100}%`, backgroundColor: candidate.categoryColor }} /></div>
            <span className="text-right tabular-nums text-slate-400">{Math.round(candidate.percentage * 100)}%</span>
          </div>
        )) : <p className="text-xs text-slate-400">No prior category decisions.</p>}
      </div>

      <div className="border-r border-slate-100 p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">History</p>
        <p className="mt-2 text-xl font-bold text-slate-800 tabular-nums">{merchant.transactionCount}</p>
        <p className="text-xs text-slate-400">transactions</p>
        <p className="mt-3 text-sm font-semibold text-slate-700 tabular-nums">{fmt(merchant.totalAmount)}</p>
        <p className="text-[10px] text-slate-400">absolute value</p>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Sparkles size={12} className={merchant.confidence >= 0.8 ? 'text-emerald-500' : 'text-amber-500'} />{Math.round(merchant.confidence * 100)}% confidence</div>
      </div>

      <div className="p-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Classification</label>
        <select value={selectedCategoryId} onChange={event => onCategoryChange(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 outline-none focus:border-blue-400">
          <option value="">Choose category…</option>
          {categories.map(category => <option key={category.id} value={category.id}>{category.fullName}</option>)}
        </select>
        <button onClick={onApply} disabled={!selectedCategoryId || applying} className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
          {applying ? 'Applying…' : `Apply to ${merchant.transactionCount} & remember`}
        </button>
        <button onClick={onEditRule} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <Pencil size={11} /> Edit import rule
        </button>
        <p className="mt-2 text-center text-[10px] text-slate-400">Used for future matching imports</p>
      </div>
    </article>
  )
}

function MerchantRuleModal({ merchant, categories, options, onClose, onSave }: {
  merchant: MerchantInsight
  categories: Category[]
  options: ClassificationOptions
  onClose: () => void
  onSave: (data: { name: string; categoryId: string; phrases: string[]; canonicalCategoryId: string | null; contextId: string | null; bucketId: string | null; taxTreatment: 'none' | 'deductible' | 'review' }) => Promise<void>
}) {
  const [name, setName] = useState(merchant.name)
  const [categoryId, setCategoryId] = useState(merchant.categoryId ?? '')
  const [phrases, setPhrases] = useState((merchant.rulePhrases.length ? merchant.rulePhrases : [merchant.name]).join('\n'))
  const [saving, setSaving] = useState(false)
  const [canonicalCategoryId, setCanonicalCategoryId] = useState(merchant.canonicalCategoryId ?? '')
  const [contextId, setContextId] = useState(merchant.contextId ?? '')
  const [bucketId, setBucketId] = useState(merchant.bucketId ?? '')
  const [taxTreatment, setTaxTreatment] = useState(merchant.taxTreatment)

  async function save() {
    const rulePhrases = phrases.split('\n').map(phrase => phrase.trim()).filter(Boolean)
    if (!name.trim() || !categoryId || rulePhrases.length === 0) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), categoryId, phrases: rulePhrases, canonicalCategoryId: canonicalCategoryId || null, contextId: contextId || null, bucketId: bucketId || null, taxTreatment })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Edit merchant import rule" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Merchant name</label>
          <input autoFocus value={name} onChange={event => setName(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-3">
          <div><p className="text-xs font-semibold text-slate-700">V0.4 structured defaults</p><p className="text-[11px] text-slate-400">Remembered for matching transactions during future imports.</p></div>
          <div><label className="mb-1 block text-xs text-slate-500">Purpose</label><select value={canonicalCategoryId} onChange={event => setCanonicalCategoryId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Requires review</option>{[...new Set(options.categories.map(item => item.family))].map(family => <optgroup key={family} label={family}>{options.categories.filter(item => item.family === family).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-xs text-slate-500">Context</label><select value={contextId} onChange={event => { setContextId(event.target.value); if (!options.contexts.find(item => item.id === event.target.value)?.name.startsWith('Personal')) setBucketId('') }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Requires review</option>{options.contexts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><label className="mb-1 block text-xs text-slate-500">Personal bucket</label><select value={bucketId} onChange={event => setBucketId(event.target.value)} disabled={!options.contexts.find(item => item.id === contextId)?.name.startsWith('Personal')} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"><option value="">None</option>{options.buckets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div>
          <div><label className="mb-1 block text-xs text-slate-500">Tax treatment</label><select value={taxTreatment} onChange={event => setTaxTreatment(event.target.value as typeof taxTreatment)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="none">None</option><option value="deductible">Deductible</option><option value="review">Needs review</option></select></div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Default category</label>
          <select value={categoryId} onChange={event => setCategoryId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400">
            <option value="">Choose category…</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.fullName}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Matching phrases</label>
          <textarea value={phrases} onChange={event => setPhrases(event.target.value)} rows={7} className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder={'NETFLIX\nNETFLIX.COM'} />
          <p className="mt-1.5 text-[11px] leading-4 text-slate-400">One phrase per line. Matching ignores case, punctuation, card numbers and common bank wording. More specific phrases are checked first.</p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          This rule will classify matching transactions during import and update this merchant’s existing history.
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving || !name.trim() || !categoryId || !phrases.trim()} className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">{saving ? 'Saving…' : 'Save rule'}</button>
        </div>
      </div>
    </Modal>
  )
}
