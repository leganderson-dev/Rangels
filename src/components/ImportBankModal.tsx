import { useState, useRef, useEffect } from 'react'
import { Upload, Check, AlertCircle, Pencil } from 'lucide-react'
import { Modal } from './Modal'
import { api } from '../api'
import { fmt, formatDate } from '../utils'
import type { Account, Category, ImportResult } from '../types/finance'
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
}

interface Props {
  accounts: Account[]
  categories: Category[]
  onClose: () => void
  onDone: () => void
}

export function ImportBankModal({ accounts, categories, onClose, onDone }: Props) {
  const [step, setStep] = useState<'pick' | 'categorize' | 'done'>('pick')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [format, setFormat] = useState('')
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? '')
  const [assignments, setAssignments] = useState<Record<number, string | null>>({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [focusRow, setFocusRow] = useState(0)
  const [catSearch, setCatSearch] = useState<Record<number, string>>({})
  const [catOpen, setCatOpen] = useState<number | null>(null)
  const [included, setIncluded] = useState<Set<number>>(new Set())

  async function pickFile() {
    setLoading(true)
    try {
      const path = await api.import.bankCsvPick()
      if (!path) { setLoading(false); return }
      setFilePath(path)
      const preview = await api.import.bankCsvPreview(path)
      setFormat(preview.format)
      setRows(preview.rows)
      // Pre-fill assignments from suggestions
      const init: Record<number, string | null> = {}
      preview.rows.forEach(r => { init[r.index] = r.suggestedCategoryId })
      setAssignments(init)
      setIncluded(new Set(preview.rows.map(r => r.index)))
      setStep('categorize')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    if (!filePath || !accountId) return
    setLoading(true)
    try {
      const selected = Object.fromEntries(rows.map(row => [row.index, included.has(row.index) ? assignments[row.index] ?? null : '__skip__']))
      const res = await api.import.bankCsv(filePath, accountId, selected)
      setResult(res)
      setStep('done')
    } finally {
      setLoading(false)
    }
  }

  function setAssignment(rowIndex: number, categoryId: string | null) {
    setAssignments(a => ({ ...a, [rowIndex]: categoryId }))
    setCatOpen(null)
    setFocusRow(r => r + 1)
  }

  const uncategorisedCount = rows.filter(r => assignments[r.index] == null).length
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
  const confidenceGroups: Array<{ key: ConfidenceGroup; label: string; range: string; rows: PreviewRow[] }> = [
    { key: 'confident', label: 'Confident', range: '70–100%', rows: rows.filter(row => classifyConfidence(row.confidence) === 'confident') },
    { key: 'likely', label: 'Likely', range: '50–70%', rows: rows.filter(row => classifyConfidence(row.confidence) === 'likely') },
    { key: 'analysis', label: 'Requires analysis', range: 'Below 50%', rows: rows.filter(row => classifyConfidence(row.confidence) === 'analysis') },
  ]

  function toggleGroup(groupRows: PreviewRow[]) {
    setIncluded(current => {
      const next = new Set(current)
      const allSelected = groupRows.every(row => current.has(row.index))
      groupRows.forEach(row => allSelected ? next.delete(row.index) : next.add(row.index))
      return next
    })
  }

  return (
    <Modal title="Import Bank CSV" onClose={onClose} wide>
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
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <button
              onClick={pickFile}
              disabled={loading || !accountId}
              className="mt-5 flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Choose File'}
            </button>
          </div>
        </div>
      )}

      {step === 'categorize' && (
        <div className="flex flex-col gap-3">
          {/* Stats bar */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">{rows.length} transactions from <strong>{format}</strong></span>
            {uncategorisedCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertCircle size={14} /> {uncategorisedCount} uncategorised
              </span>
            )}
            <span className="ml-auto font-semibold text-gray-700">{fmt(totalAmount, true)}</span>
          </div>

          <p className="text-xs text-gray-400">
            Review and assign categories. Use <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">Tab</kbd> to navigate,
            type to filter categories, <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">Enter</kbd> to confirm first match.
          </p>

          {/* Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[24px_90px_1fr_100px_220px] text-xs font-medium text-gray-400 uppercase tracking-wide bg-gray-50 px-3 py-2 gap-3">
              <span /><span>Date</span><span>Description</span><span className="text-right">Amount</span><span>Suggestion</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100">
              {confidenceGroups.map(group => group.rows.length > 0 && (
                <div key={group.key}>
                  <button onClick={() => toggleGroup(group.rows)} className="sticky top-0 z-10 w-full flex items-center gap-2 bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700">
                    <input readOnly type="checkbox" checked={group.rows.every(row => included.has(row.index))} />
                    {group.label} <span className="font-normal text-slate-400">{group.range} · {group.rows.length}</span>
                  </button>
                  {group.rows.map(row => {
                    const i = rows.indexOf(row)
                    return <ImportRow key={row.index} row={row} categories={categories} included={included.has(row.index)} onIncluded={() => setIncluded(current => { const next = new Set(current); next.has(row.index) ? next.delete(row.index) : next.add(row.index); return next })} assignedCategoryId={assignments[row.index] ?? null} focused={focusRow === i} catOpen={catOpen === i} catSearch={catSearch[i] ?? ''} onFocus={() => setFocusRow(i)} onOpenCat={() => setCatOpen(i)} onCloseCat={() => setCatOpen(null)} onCatSearch={s => setCatSearch(c => ({ ...c, [i]: s }))} onAssign={catId => setAssignment(row.index, catId)} />
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
            <button onClick={onClose} className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={loading}
              className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Importing…' : `Import ${rows.length} transactions`}
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

function ImportRow({ row, categories, included, onIncluded, assignedCategoryId, focused, catOpen, catSearch, onFocus, onOpenCat, onCloseCat, onCatSearch, onAssign }: {
  row: PreviewRow
  categories: Category[]
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
  const filtered = categories.filter(c =>
    !catSearch || c.fullName.toLowerCase().includes(catSearch.toLowerCase())
  ).slice(0, 20)

  useEffect(() => {
    if (catOpen) inputRef.current?.focus()
  }, [catOpen])

  return (
    <div
      className={`grid grid-cols-[24px_90px_1fr_100px_220px] gap-3 px-3 py-2 items-center text-sm hover:bg-gray-50 ${focused ? 'bg-blue-50' : ''} ${included ? '' : 'opacity-40'}`}
      onClick={onFocus}
    >
      <input type="checkbox" checked={included} onChange={onIncluded} onClick={e => e.stopPropagation()} />
      <span className="text-xs text-gray-400">{formatDate(row.date)}</span>
      <span className="text-gray-700 truncate text-xs" title={row.reason}>{row.description}</span>
      <span className={`text-right text-xs font-semibold ${row.amount >= 0 ? 'text-green-600' : 'text-gray-700'}`}>
        {fmt(row.amount)}
      </span>
      <div className="relative">
        <button
          onClick={e => { e.stopPropagation(); catOpen ? onCloseCat() : onOpenCat() }}
          className={`w-full text-left px-2 py-1 rounded border text-xs flex items-center justify-between gap-1 transition-colors ${
            catOpen ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          {assignedCat ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: assignedCat.color }} />
              <span className="truncate">{assignedCat.fullName}</span>
            </span>
          ) : (
            <span className="text-gray-400 italic">Uncategorised</span>
          )}
          <span className="flex items-center gap-1 text-gray-400"><span>{Math.round(row.confidence * 100)}%</span><Pencil size={11} /></span>
        </button>

        {catOpen && (
          <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-xl z-40">
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
