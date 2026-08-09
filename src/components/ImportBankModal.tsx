import { useState, useRef, useEffect } from 'react'
import { Upload, Check, AlertCircle, Pencil, ChevronDown, ChevronRight, LoaderCircle, Circle, Eye, EyeOff } from 'lucide-react'
import { Modal } from './Modal'
import { api } from '../api'
import { canUseHouseholdBucket, emptyBucketLabel } from '../lib/classification'
import { fmt, formatDate } from '../utils'
import type { Account, Category, ClassificationOptions, ImportResult } from '../types/finance'
import { classifyConfidence } from '../lib/matching'
import type { ConfidenceGroup } from '../types/import'

interface PreviewRow {
  index: number
  date: string
  amount: number
  description: string
  suggestedCategoryId: string | null
  suggestedCategoryName: string | null
  confidence: number
  reason: string
  suggestions: Array<{
    categoryId: string
    categoryName: string
    confidence: number
    reason: string
  }>
  duplicate: boolean
  duplicateReason: string | null
}

type RowClassification = {
  canonicalCategoryId: string | null
  contextId: string | null
  bucketId: string | null
  taxTreatment: 'none' | 'deductible' | 'review'
  reimbursementStatus: 'none' | 'to_be_reimbursed' | 'reimbursed'
  tags: string[]
  mapped: boolean
}

interface Props {
  accounts: Account[]
  categories: Category[]
  onClose: () => void
  onDone: () => void
}

export function ImportBankModal({ accounts, categories, onClose, onDone }: Props) {
  const activeAccounts = accounts.filter(account => account.isActive)
  const [step, setStep] = useState<'pick' | 'categorize' | 'done'>('pick')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [format, setFormat] = useState('')
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [accountId, setAccountId] = useState<string>(activeAccounts[0]?.id ?? '')
  const [assignments, setAssignments] = useState<Record<number, string | null>>({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [focusRow, setFocusRow] = useState(0)
  const [catSearch, setCatSearch] = useState<Record<number, string>>({})
  const [catOpen, setCatOpen] = useState<number | null>(null)
  const [included, setIncluded] = useState<Set<number>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<ConfidenceGroup>>(new Set())
  const [loadError, setLoadError] = useState('')
  const [analysis, setAnalysis] = useState({ reading: false, found: null as number | null, duplicates: null as number | null, categorizing: false, done: false })
  const [hideDuplicates, setHideDuplicates] = useState(true)
  const [classificationOptions, setClassificationOptions] = useState<ClassificationOptions>({ contexts: [], buckets: [], categories: [] })
  const [classifications, setClassifications] = useState<Record<number, RowClassification>>({})

  useEffect(() => {
    api.classification.options().then(setClassificationOptions).catch(console.error)
  }, [])

  async function pickFile() {
    setLoading(true)
    setLoadError('')
    setAnalysis({ reading: false, found: null, duplicates: null, categorizing: false, done: false })
    try {
      const path = await api.import.bankCsvPick()
      if (!path) { setLoading(false); return }
      setAnalysis(current => ({ ...current, reading: true }))
      setFilePath(path)
      const preview = await api.import.bankCsvPreview(path, accountId, event => {
        if (event.stage === 'found') setAnalysis(current => ({ ...current, found: event.count ?? 0 }))
        if (event.stage === 'duplicates') setAnalysis(current => ({ ...current, duplicates: event.count ?? 0 }))
        if (event.stage === 'categorizing') setAnalysis(current => ({ ...current, categorizing: true }))
        if (event.stage === 'done') setAnalysis(current => ({ ...current, categorizing: true, done: true }))
      })
      setFormat(preview.format)
      setRows(preview.rows)
      // Pre-fill assignments from suggestions
      const init: Record<number, string | null> = {}
      preview.rows.forEach(r => { init[r.index] = r.suggestedCategoryId })
      setAssignments(init)
      const activeOptions = classificationOptions.categories.length ? classificationOptions : await api.classification.options()
      if (!classificationOptions.categories.length) setClassificationOptions(activeOptions)
      const initialClassifications: Record<number, RowClassification> = {}
      preview.rows.forEach(row => {
        initialClassifications[row.index] = classificationFromPurpose(row.suggestedCategoryId, activeOptions)
      })
      setClassifications(initialClassifications)
      setIncluded(new Set(preview.rows.filter(r => !r.duplicate).map(r => r.index)))
      setStep('categorize')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'The CSV could not be analysed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    if (!filePath || !accountId) return
    setLoading(true)
    try {
      const selected: Record<number, { categoryId: string | null; canonicalCategoryId: string | null; contextId: string | null; bucketId: string | null; taxTreatment: string; reimbursementStatus: string; tags: string[] } | '__skip__'> = {}
      rows.forEach(row => {
        const classification = classifications[row.index] ?? classificationFromPurpose(null, classificationOptions)
        selected[row.index] = included.has(row.index) ? { categoryId: assignments[row.index] ?? null, canonicalCategoryId: classification.canonicalCategoryId, contextId: classification.contextId, bucketId: classification.bucketId, taxTreatment: classification.taxTreatment, reimbursementStatus: classification.reimbursementStatus, tags: classification.tags } : '__skip__'
      })
      const res = await api.import.bankCsv(filePath, accountId, selected)
      setResult(res)
      setStep('done')
    } finally {
      setLoading(false)
    }
  }

  function setAssignment(rowIndex: number, categoryId: string | null) {
    setAssignments(a => ({ ...a, [rowIndex]: categoryId }))
    setClassifications(current => ({ ...current, [rowIndex]: classificationFromPurpose(categoryId, classificationOptions) }))
    setCatSearch(current => ({ ...current, [rowIndex]: '' }))
    setCatOpen(null)
    setFocusRow(r => r + 1)
  }

  const uncategorisedCount = rows.filter(row => !row.duplicate && assignments[row.index] == null).length
  const duplicateCount = rows.filter(row => row.duplicate).length
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
  const visibleRows = hideDuplicates ? rows.filter(row => !row.duplicate) : rows
  const confidenceGroups: Array<{ key: ConfidenceGroup; label: string; range: string; rows: PreviewRow[] }> = [
    { key: 'confident', label: 'Confident', range: '70–100%', rows: visibleRows.filter(row => classifyConfidence(row.confidence) === 'confident') },
    { key: 'likely', label: 'Likely', range: '50–70%', rows: visibleRows.filter(row => classifyConfidence(row.confidence) === 'likely') },
    { key: 'analysis', label: 'Requires analysis', range: 'Below 50%', rows: visibleRows.filter(row => classifyConfidence(row.confidence) === 'analysis') },
  ]

  function toggleGroup(groupRows: PreviewRow[]) {
    setIncluded(current => {
      const next = new Set(current)
      const selectableRows = groupRows.filter(row => !row.duplicate)
      const allSelected = selectableRows.every(row => current.has(row.index))
      selectableRows.forEach(row => allSelected ? next.delete(row.index) : next.add(row.index))
      return next
    })
  }

  function toggleCollapsed(group: ConfidenceGroup) {
    setCollapsedGroups(current => {
      const next = new Set(current)
      next.has(group) ? next.delete(group) : next.add(group)
      return next
    })
  }

  return (
    <Modal title="Import Bank CSV" onClose={onClose} wide closeOnBackdrop={false} closeOnEscape={false}>
      {step === 'pick' && (
        <div className="flex flex-col items-center justify-center py-10 gap-4">
          <Upload size={40} className="text-gray-300" />
          <p className="text-sm text-gray-500">Select a CSV export from your bank</p>
          <p className="text-xs text-gray-400">Supports CommBank, NAB, ING and most Australian bank formats</p>
          <div className="flex gap-3 items-center mt-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Import to account</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <button
              onClick={pickFile}
              disabled={loading || !accountId}
              className="mt-5 flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Analysing…' : 'Choose File'}
            </button>
          </div>
          {loading && <AnalysisProgress analysis={analysis} />}
          {loadError && <div className="max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs text-red-700">{loadError}</div>}
        </div>
      )}

      {step === 'categorize' && (
        <div className="flex flex-col gap-3">
          <AnalysisProgress analysis={analysis} compact />
          {/* Stats bar */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">{rows.length} transactions from <strong>{format}</strong></span>
            {uncategorisedCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertCircle size={14} /> {uncategorisedCount} uncategorised
              </span>
            )}
            {duplicateCount > 0 && <span className="text-slate-500">{duplicateCount} duplicates excluded</span>}
            {duplicateCount > 0 && <button onClick={() => setHideDuplicates(value => !value)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">{hideDuplicates ? <Eye size={13} /> : <EyeOff size={13} />}{hideDuplicates ? `Show ${duplicateCount} duplicates` : 'Hide duplicates'}</button>}
            <span className="ml-auto font-semibold text-gray-700">{fmt(totalAmount, true)}</span>
          </div>

          <p className="text-xs text-gray-400">
            Review and assign categories. Use <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">Tab</kbd> to navigate,
            type to filter categories, <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">Enter</kbd> to confirm first match.
          </p>

          {/* Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[24px_90px_minmax(260px,1fr)_100px_minmax(520px,1.5fr)] text-xs font-medium text-gray-400 uppercase tracking-wide bg-gray-50 px-3 py-2 gap-3">
              <span /><span>Date</span><span>Description</span><span className="text-right">Amount</span><span>Suggested categories</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100">
              {confidenceGroups.map(group => group.rows.length > 0 && (
                <div key={group.key}>
                  <div className="sticky top-0 z-10 w-full flex items-center gap-2 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                    <input type="checkbox" checked={group.rows.filter(row => !row.duplicate).every(row => included.has(row.index))} onChange={() => toggleGroup(group.rows)} title={`Select or exclude all ${group.label.toLowerCase()} transactions`} />
                    <button onClick={() => toggleCollapsed(group.key)} className="flex flex-1 items-center gap-2 text-left" aria-expanded={!collapsedGroups.has(group.key)}>
                      {collapsedGroups.has(group.key) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      {group.label} <span className="font-normal text-slate-400">{group.range} · {group.rows.length}</span>
                    </button>
                  </div>
                  {!collapsedGroups.has(group.key) && group.rows.map(row => {
                    const i = rows.indexOf(row)
                    return <ImportRow key={row.index} row={row} categories={categories} options={classificationOptions} classification={classifications[row.index] ?? classificationFromPurpose(null, classificationOptions)} onClassificationChange={classification => setClassifications(current => ({ ...current, [row.index]: classification }))} included={included.has(row.index)} onIncluded={() => setIncluded(current => { const next = new Set(current); next.has(row.index) ? next.delete(row.index) : next.add(row.index); return next })} assignedCategoryId={assignments[row.index] ?? null} focused={focusRow === i} catOpen={catOpen === i} catSearch={catSearch[i] ?? ''} onFocus={() => setFocusRow(i)} onOpenCat={() => setCatOpen(i)} onCloseCat={() => setCatOpen(null)} onCatSearch={s => setCatSearch(c => ({ ...c, [i]: s }))} onAssign={catId => setAssignment(row.index, catId)} />
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => setStep('pick')} className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">
              Back
            </button>
            <div className="flex-1" />
            <button
              onClick={handleImport}
              disabled={loading}
              className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Importing…' : `Import ${included.size} transactions`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="flex flex-col items-center py-10 gap-3">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <Check size={24} className="text-green-600" />
          </div>
          <p className="text-base font-semibold text-gray-800">Import complete</p>
          <p className="text-sm text-gray-500">
            <strong>{result.imported}</strong> transactions imported,
            <strong> {result.skipped}</strong> duplicates skipped
          </p>
          {result.errors.length > 0 && (
            <p className="text-xs text-red-500">{result.errors.length} errors</p>
          )}
          <button onClick={onDone} className="mt-4 bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700">
            Done
          </button>
        </div>
      )}
    </Modal>
  )
}

function classificationFromPurpose(categoryId: string | null, options: ClassificationOptions): RowClassification {
  const purpose = options.categories.find(item => item.id === categoryId)
  const household = options.contexts.find(item => item.name === 'Household')
  const daily = new Set(['Mortgage payment', 'Rent', 'Council rates', 'Electricity', 'Gas', 'Water', 'Internet', 'Mobile phone', 'Home insurance', 'Groceries', 'Fuel', 'Public transport', 'Parking', 'Tolls', 'Registration', 'Vehicle insurance', 'Vehicle maintenance', 'Childcare', 'School care', 'School fees', 'School supplies', 'Books and learning', 'Activities', 'Medical care', 'Pharmacy', 'Health insurance', 'Bank fees', 'Debt repayment', 'Tax payment'])
  const smile = new Set(['Travel', 'Gifts', 'Donations', 'Hobbies and collectibles'])
  const bucketName = purpose?.type === 'expense' ? smile.has(purpose.name) ? 'Smile' : daily.has(purpose.name) ? 'Daily Expenses' : 'Splurge' : null
  return { canonicalCategoryId: purpose?.id ?? null, contextId: purpose ? household?.id ?? null : null, bucketId: bucketName ? options.buckets.find(item => item.name === bucketName)?.id ?? null : null, taxTreatment: 'none', reimbursementStatus: 'none', tags: [], mapped: Boolean(purpose && household) }
}

function ClassificationEditor({ classification, options, editingField, onEdit, onChange }: {
  classification: RowClassification
  options: ClassificationOptions
  editingField: 'purpose' | 'context' | 'bucket' | 'tax' | 'reimbursement' | 'tags' | null
  onEdit: (field: 'purpose' | 'context' | 'bucket' | 'tax' | 'reimbursement' | 'tags' | null) => void
  onChange: (classification: RowClassification) => void
}) {
  const purpose = options.categories.find(item => item.id === classification.canonicalCategoryId)
  const context = options.contexts.find(item => item.id === classification.contextId)
  const bucket = options.buckets.find(item => item.id === classification.bucketId)
  const householdExpense = canUseHouseholdBucket(context?.name, purpose?.type)
  const score = (selected: boolean) => selected ? 'Selected' : '—'
  const rows = [
    { key: 'purpose' as const, label: 'Purpose', value: purpose ? `${purpose.family}: ${purpose.name}` : 'Requires review', score: score(Boolean(purpose)) },
    { key: 'context' as const, label: 'Context', value: context?.name ?? 'Requires review', score: score(Boolean(context)) },
    { key: 'bucket' as const, label: 'Bucket', value: bucket?.name ?? emptyBucketLabel(context?.name, purpose?.type), score: householdExpense ? score(Boolean(bucket)) : '—' },
    { key: 'tax' as const, label: 'Tax', value: classification.taxTreatment === 'review' ? 'Needs review' : classification.taxTreatment === 'deductible' ? 'Deductible' : 'None', score: score(classification.taxTreatment !== 'review') },
    { key: 'reimbursement' as const, label: 'Reimbursement', value: classification.reimbursementStatus === 'to_be_reimbursed' ? 'To be reimbursed' : classification.reimbursementStatus === 'reimbursed' ? 'Reimbursed' : 'None', score: 'Manual' },
    { key: 'tags' as const, label: 'Tags', value: classification.tags.length ? classification.tags.join(', ') : '—', score: classification.tags.length ? 'Manual' : '—' },
  ]
  return <div className="mt-2 overflow-hidden rounded-md border border-slate-100 bg-slate-50/80">
    {rows.map(row => <div key={row.key} className="border-b border-slate-100 last:border-0">
      <div className="grid grid-cols-[92px_minmax(0,1fr)_46px_24px] items-center gap-1 px-2 py-1 text-[9px]">
        <span className="font-semibold text-slate-400">{row.label}</span><span className={`truncate ${row.value === 'Requires review' ? 'text-amber-600' : 'text-slate-600'}`}>{row.value}</span><span className="text-right tabular-nums text-slate-400">{row.score}</span><button onClick={event => { event.stopPropagation(); onEdit(editingField === row.key ? null : row.key) }} className="rounded p-1 text-slate-400 hover:bg-white hover:text-blue-600" title={`Edit ${row.label.toLowerCase()}`}><Pencil size={10} /></button>
      </div>
      {editingField === row.key && <div className="border-t border-blue-100 bg-white p-1.5" onClick={event => event.stopPropagation()}>
        {row.key === 'purpose' && <select autoFocus value={classification.canonicalCategoryId ?? ''} onChange={event => { const canonicalCategoryId = event.target.value || null; const nextPurpose = options.categories.find(item => item.id === canonicalCategoryId); onChange({ ...classification, canonicalCategoryId, bucketId: nextPurpose?.type === 'income' ? null : classification.bucketId }) }} className="w-full rounded border border-blue-300 px-2 py-1 text-[10px]"><option value="">Requires review</option>{[...new Set(options.categories.map(item => item.family))].map(family => <optgroup key={family} label={family}>{options.categories.filter(item => item.family === family).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select>}
        {row.key === 'context' && <select autoFocus value={classification.contextId ?? ''} onChange={event => { const contextId = event.target.value || null; const nextContext = options.contexts.find(item => item.id === contextId); onChange({ ...classification, contextId, bucketId: canUseHouseholdBucket(nextContext?.name, purpose?.type) ? classification.bucketId : null }) }} className="w-full rounded border border-blue-300 px-2 py-1 text-[10px]"><option value="">Requires review</option>{options.contexts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        {row.key === 'bucket' && <select autoFocus value={classification.bucketId ?? ''} disabled={!householdExpense} onChange={event => onChange({ ...classification, bucketId: event.target.value || null })} className="w-full rounded border border-blue-300 px-2 py-1 text-[10px] disabled:bg-slate-100"><option value="">{emptyBucketLabel(context?.name, purpose?.type)}</option>{householdExpense && options.buckets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        {row.key === 'tax' && <select autoFocus value={classification.taxTreatment} onChange={event => onChange({ ...classification, taxTreatment: event.target.value as RowClassification['taxTreatment'] })} className="w-full rounded border border-blue-300 px-2 py-1 text-[10px]"><option value="none">None</option><option value="deductible">Deductible</option><option value="review">Needs review</option></select>}
        {row.key === 'reimbursement' && <select autoFocus value={classification.reimbursementStatus} onChange={event => onChange({ ...classification, reimbursementStatus: event.target.value as RowClassification['reimbursementStatus'] })} className="w-full rounded border border-blue-300 px-2 py-1 text-[10px]"><option value="none">None</option><option value="to_be_reimbursed">To be reimbursed</option><option value="reimbursed">Reimbursed</option></select>}
        {row.key === 'tags' && <input autoFocus defaultValue={classification.tags.join(', ')} onKeyDown={event => { if (event.key === 'Enter') onChange({ ...classification, tags: event.currentTarget.value.split(',').map(tag => tag.trim()).filter(Boolean) }) }} onBlur={event => onChange({ ...classification, tags: event.currentTarget.value.split(',').map(tag => tag.trim()).filter(Boolean) })} placeholder="Comma-separated tags" className="w-full rounded border border-blue-300 px-2 py-1 text-[10px]" />}
      </div>}
    </div>)}
  </div>
}

function AnalysisProgress({ analysis, compact = false }: { analysis: { reading: boolean; found: number | null; duplicates: number | null; categorizing: boolean; done: boolean }; compact?: boolean }) {
  const steps = [
    { label: 'Reading file', detail: analysis.reading ? 'File read successfully' : 'Reading the selected CSV', done: analysis.reading, active: !analysis.reading },
    { label: 'Transactions found', detail: analysis.found === null ? 'Waiting for file parsing' : `${analysis.found} transactions found`, done: analysis.found !== null, active: analysis.reading && analysis.found === null },
    { label: 'Identifying duplicates', detail: analysis.duplicates === null ? 'Waiting for transactions' : `${analysis.duplicates} duplicate${analysis.duplicates === 1 ? '' : 's'} identified`, done: analysis.duplicates !== null, active: analysis.found !== null && analysis.duplicates === null },
    { label: 'Categorizing', detail: analysis.done ? 'Suggestions and confidence scores ready' : 'Matching merchants and category history', done: analysis.done, active: analysis.categorizing && !analysis.done },
    { label: 'Done', detail: analysis.done ? 'Ready for your review' : 'Preparing review', done: analysis.done, active: false },
  ]
  return <div className={`w-full rounded-xl border border-slate-200 bg-slate-50 ${compact ? 'px-3 py-2' : 'max-w-lg px-4 py-3'}`}>
    <div className={compact ? 'grid grid-cols-5 gap-2' : 'space-y-2'}>
      {steps.map(step => <div key={step.label} className={`flex items-center gap-2 ${compact ? 'min-w-0' : ''}`}>
        {step.done ? <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check size={12} strokeWidth={3} /></span> : step.active ? <LoaderCircle size={20} className="shrink-0 animate-spin text-blue-500" /> : <Circle size={20} className="shrink-0 text-slate-300" />}
        <div className="min-w-0"><p className={`truncate text-xs font-semibold ${step.done ? 'text-emerald-700' : step.active ? 'text-blue-700' : 'text-slate-400'}`}>{step.label}</p>{!compact && <p className="text-[10px] text-slate-400">{step.detail}</p>}</div>
      </div>)}
    </div>
  </div>
}

function ImportRow({ row, categories, options, classification, onClassificationChange, included, onIncluded, assignedCategoryId, focused, catOpen, catSearch, onFocus, onOpenCat, onCloseCat, onCatSearch, onAssign }: {
  row: PreviewRow
  categories: Category[]
  options: ClassificationOptions
  classification: RowClassification
  onClassificationChange: (classification: RowClassification) => void
  assignedCategoryId: string | null
  included: boolean
  onIncluded: () => void
  focused: boolean
  catOpen: boolean
  catSearch: string
  onFocus: () => void
  onOpenCat: () => void
  onCloseCat: () => void
  onCatSearch: (s: string) => void
  onAssign: (id: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const assignedCat = categories.find(c => c.id === assignedCategoryId)
  const [editingField, setEditingField] = useState<'purpose' | 'context' | 'bucket' | 'tax' | 'reimbursement' | 'tags' | null>(null)
  const manuallySelected = assignedCat && !row.suggestions.some(suggestion => suggestion.categoryId === assignedCat.id)
  const visibleSuggestions = manuallySelected
    ? [
        { categoryId: assignedCat.id, categoryName: assignedCat.fullName, confidence: null, reason: 'Manually selected' },
        ...row.suggestions.slice(0, 2),
      ]
    : row.suggestions
  const filtered = categories.filter(c =>
    !catSearch || c.fullName.toLowerCase().includes(catSearch.toLowerCase())
  )

  useEffect(() => {
    if (catOpen) inputRef.current?.focus()
  }, [catOpen])

  return (
    <div
      className={`grid grid-cols-[24px_90px_minmax(260px,1fr)_100px_minmax(520px,1.5fr)] gap-3 px-3 py-2 items-center text-sm hover:bg-gray-50 ${focused ? 'bg-blue-50' : ''} ${included ? '' : 'opacity-40'}`}
      onClick={onFocus}
    >
      <input type="checkbox" checked={included} disabled={row.duplicate} onChange={onIncluded} onClick={e => e.stopPropagation()} />
      <span className="text-xs text-gray-400">{formatDate(row.date)}</span>
      <span className="text-gray-700 truncate text-xs" title={row.duplicateReason ?? row.reason}>{row.description}{row.duplicate && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700">Duplicate</span>}</span>
      <span className={`text-right text-xs font-semibold ${row.amount >= 0 ? 'text-green-600' : 'text-gray-700'}`}>
        {fmt(row.amount)}
      </span>
      <div className="relative">
        <div className="flex items-stretch gap-1.5">
          <div className="grid grid-cols-3 gap-1.5 flex-1 min-w-0">
            {visibleSuggestions.map(suggestion => {
              const category = categories.find(item => item.id === suggestion.categoryId)
              const selected = assignedCategoryId === suggestion.categoryId
              return (
                <button key={suggestion.categoryId} title={`${suggestion.categoryName} — ${suggestion.reason}`} onClick={event => { event.stopPropagation(); onAssign(suggestion.categoryId) }} className={`relative min-w-0 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${selected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200 font-semibold shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'}`}>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: category?.color ?? '#64748b' }} />
                    <span className="truncate">{suggestion.categoryName}</span>
                    <span className="ml-auto shrink-0 text-gray-400">{suggestion.confidence === null ? 'Manual' : `${Math.round(suggestion.confidence * 100)}%`}</span>
                    {selected && <Check size={11} className="shrink-0 text-blue-600" />}
                  </span>
                </button>
              )
            })}
            {visibleSuggestions.length === 0 && <span className="col-span-3 px-2 py-1.5 text-xs italic text-gray-400">No scored suggestion</span>}
          </div>
          <button title={assignedCat ? `Change ${assignedCat.fullName}` : 'Choose a category'} onClick={e => { e.stopPropagation(); catOpen ? onCloseCat() : onOpenCat() }} className={`shrink-0 rounded-md border px-2 transition-colors ${catOpen ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'}`}>
            <Pencil size={13} />
          </button>
        </div>
        <ClassificationEditor classification={classification} options={options} editingField={editingField} onEdit={setEditingField} onChange={next => { onClassificationChange({ ...next, mapped: false }); setEditingField(null) }} />

        {catOpen && (
          <div className="absolute top-full right-0 mt-1 w-[420px] bg-white border border-gray-200 rounded-lg shadow-xl z-40">
            <div className="p-1.5 border-b border-gray-100">
              <input
                ref={inputRef}
                value={catSearch}
                onChange={e => onCatSearch(e.target.value)}
                placeholder="Filter…"
                className="w-full px-2 py-1 text-xs focus:outline-none"
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (filtered.length > 0) onAssign(filtered[0].id)
                    else onCloseCat()
                  }
                  if (e.key === 'Escape') onCloseCat()
                  if (e.key === 'Tab') { e.preventDefault(); if (filtered.length > 0) onAssign(filtered[0].id) }
                }}
              />
            </div>
            <div className="max-h-40 overflow-y-auto">
              <button onMouseDown={() => onAssign(null)} className="w-full text-left px-2 py-1.5 text-xs text-gray-400 hover:bg-gray-50">
                No category
              </button>
              {filtered.map(c => (
                <button
                  key={c.id}
                  onMouseDown={() => onAssign(c.id)}
                  className={`w-full text-left px-2 py-1.5 text-xs flex items-center gap-2 hover:bg-blue-50 ${assignedCategoryId === c.id ? 'bg-blue-50 font-medium' : ''}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  {c.fullName}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
