import { useState, useRef, useEffect } from 'react'
import { Modal } from './Modal'
import { today } from '../utils'
import type { Transaction, Account, Category } from '../types/finance'
import type { ClassificationOptions } from '../types/finance'
import { api } from '../api'
import { canUseHouseholdBucket, emptyBucketLabel } from '../lib/classification'
import { transferReasonNeedsContext, transferReasons } from '../lib/transfers'
import type { TransferReason } from '../types/finance'

interface Props {
  transaction?: Transaction
  accounts: Account[]
  categories: Category[]
  defaultDate?: string
  onClose: () => void
  onSave: (data: any) => Promise<void>
}

export function TransactionFormModal({ transaction, accounts, defaultDate, onClose, onSave }: Props) {
  const availableSourceAccounts = accounts.filter(account => account.isActive || account.id === transaction?.accountId)
  const availableTargetAccounts = accounts.filter(account => account.isActive || account.id === transaction?.targetAccountId)
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [amount, setAmount] = useState(transaction ? String(Math.abs(transaction.amount)) : '')
  const [isExpense, setIsExpense] = useState(!transaction || transaction.amount < 0)
  const [date, setDate] = useState(transaction?.date ?? defaultDate ?? today())
  const [accountId, setAccountId] = useState(transaction?.accountId ?? accounts.find(account => account.isActive)?.id ?? '')
  const [comment, setComment] = useState(transaction?.comment ?? '')
  const [isTransfer, setIsTransfer] = useState(transaction?.isTransfer ?? false)
  const [targetAccountId, setTargetAccountId] = useState<string | null>(transaction?.targetAccountId ?? null)
  const [saving, setSaving] = useState(false)
  const [options, setOptions] = useState<ClassificationOptions>({ contexts: [], buckets: [], categories: [] })
  const [canonicalCategoryId, setCanonicalCategoryId] = useState(transaction?.canonicalCategoryId ?? '')
  const [contextId, setContextId] = useState(transaction?.contextId ?? '')
  const [bucketId, setBucketId] = useState(transaction?.bucketId ?? '')
  const [reimbursementStatus, setReimbursementStatus] = useState(transaction?.reimbursementStatus ?? 'none')
  const [taxTreatment, setTaxTreatment] = useState(transaction?.taxTreatment ?? 'none')
  const [tags, setTags] = useState(transaction?.tags ?? '')
  const [transferReason, setTransferReason] = useState<TransferReason | ''>(transaction?.transferReason ?? (transaction?.isTransfer ? 'account_movement' : ''))

  const descRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    descRef.current?.focus()
    api.classification.options().then(setOptions).catch(console.error)
  }, [])

  async function handleSave() {
    if (!description.trim() || !amount || !accountId || (isTransfer && (!targetAccountId || !transferReason || (transferReasonNeedsContext(transferReason) && !contextId)))) return
    setSaving(true)
    try {
      const sign = isTransfer ? -1 : (isExpense ? -1 : 1)
      const selectedContext = options.contexts.find(item => item.id === contextId)
      const bucketAllowed = canUseHouseholdBucket(selectedContext?.name, isExpense ? 'expense' : 'income')
      await onSave({
        description: description.trim(),
        comment,
        date,
        amount: sign * Math.abs(parseFloat(amount)),
        accountId,
        targetAccountId: isTransfer ? targetAccountId : null,
        isTransfer,
        status: 'C'
        ,canonicalCategoryId: isTransfer ? null : canonicalCategoryId || null
        ,contextId: contextId || null
        ,bucketId: isTransfer || !bucketAllowed ? null : bucketId || null
        ,reimbursementStatus: isTransfer ? 'none' : reimbursementStatus
        ,taxTreatment: isTransfer ? 'none' : taxTreatment
        ,transferReason: isTransfer ? transferReason : null
        ,tags
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={transaction ? 'Edit Transaction' : 'New Transaction'} onClose={onClose} large>
      <div className="space-y-3">
        {/* Type toggle */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {['Expense', 'Income', 'Transfer'].map(t => (
            <button
              key={t}
              onClick={() => {
                setIsTransfer(t === 'Transfer')
                setIsExpense(t === 'Expense')
              }}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                (t === 'Transfer' && isTransfer) || (t === 'Expense' && !isTransfer && isExpense) || (t === 'Income' && !isTransfer && !isExpense)
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
          <input
            ref={descRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Coles Earlwood"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Amount */}
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

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Account */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{isTransfer ? 'From Account' : 'Account'}</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableSourceAccounts.map(a => <option key={a.id} value={a.id} disabled={!a.isActive}>{a.name}{a.isActive ? '' : ' (inactive)'}</option>)}
            </select>
          </div>

          {/* Target account */}
          {isTransfer ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To Account</label>
              <select
                value={targetAccountId ?? ''}
                onChange={e => setTargetAccountId(e.target.value || null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select account…</option>
                {availableTargetAccounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id} disabled={!a.isActive}>{a.name}{a.isActive ? '' : ' (inactive)'}</option>)}
              </select>
            </div>
          ) : null}

        </div>

        {isTransfer && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 space-y-3">
            <div><p className="text-xs font-semibold text-slate-700">Transfer classification</p><p className="text-[11px] text-slate-500">Ledger-neutral: never counted as income, expense, tax or a Household Bucket.</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Transfer reason</label><select value={transferReason} onChange={event => setTransferReason(event.target.value as TransferReason)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"><option value="">Choose reason…</option>{transferReasons.map(reason => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Funding context {transferReasonNeedsContext(transferReason || null) ? '' : '(optional)'}</label><select value={contextId} onChange={event => setContextId(event.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"><option value="">None</option>{options.contexts.filter(item => item.name !== 'Review required' && item.name !== 'Household').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            </div>
          </div>
        )}

        {!isTransfer && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-700">Classification</p>
              <p className="text-[11px] text-slate-400">Purpose, Context and Household Bucket are the active reporting dimensions.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Context</label>
                <select value={contextId} onChange={e => { const nextContext = options.contexts.find(item => item.id === e.target.value); setContextId(e.target.value); if (!canUseHouseholdBucket(nextContext?.name, isExpense ? 'expense' : 'income')) setBucketId('') }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Not classified</option>
                  {options.contexts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Household bucket</label>
                <select value={bucketId} onChange={e => setBucketId(e.target.value)} disabled={!canUseHouseholdBucket(options.contexts.find(item => item.id === contextId)?.name, isExpense ? 'expense' : 'income')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-400">
                  <option value="">{emptyBucketLabel(options.contexts.find(item => item.id === contextId)?.name, isExpense ? 'expense' : 'income')}</option>
                  {isExpense && options.buckets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Purpose</label>
              <select value={canonicalCategoryId} onChange={e => setCanonicalCategoryId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Requires review</option>
                {[...new Set(options.categories.map(item => item.family))].map(family => (
                  <optgroup key={family} label={family}>{options.categories.filter(item => item.family === family && (isExpense ? item.type === 'expense' : item.type === 'income')).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Reimbursement</label>
                <select value={reimbursementStatus} onChange={e => setReimbursementStatus(e.target.value as typeof reimbursementStatus)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="none">None</option><option value="to_be_reimbursed">To be reimbursed</option><option value="reimbursed">Reimbursed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tax treatment</label>
                <select value={taxTreatment} onChange={e => setTaxTreatment(e.target.value as typeof taxTreatment)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="none">None</option><option value="deductible">Deductible</option><option value="review">Needs review</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tags (optional, comma separated)</label>
              <input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. Christmas, Hanna" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" />
            </div>
          </div>
        )}

        {/* Comment */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Note (optional)</label>
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Add a note…"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !description.trim() || !amount || (isTransfer && (!targetAccountId || !transferReason || (transferReasonNeedsContext(transferReason) && !contextId)))}
            className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : (transaction ? 'Update' : 'Add')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
