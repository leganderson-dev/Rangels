import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { api } from '../api'
import { transferReasonNeedsContext, transferReasons } from '../lib/transfers'
import type { Account, BulkTransactionChanges, ClassificationOptions, Transaction, TransferReason } from '../types/finance'
import { Modal } from './Modal'

interface Props {
  transactions: Transaction[]
  accounts: Account[]
  onClose: () => void
  onSave: (changes: BulkTransactionChanges) => Promise<void>
}

const UNCHANGED = '__unchanged__'
const CLEAR = '__clear__'

export function BulkTransactionEditModal({ transactions, accounts, onClose, onSave }: Props) {
  const [options, setOptions] = useState<ClassificationOptions>({ contexts: [], buckets: [], categories: [] })
  const [transactionType, setTransactionType] = useState(UNCHANGED)
  const [date, setDate] = useState('')
  const [accountId, setAccountId] = useState(UNCHANGED)
  const [targetAccountId, setTargetAccountId] = useState(UNCHANGED)
  const [purposeId, setPurposeId] = useState(UNCHANGED)
  const [contextId, setContextId] = useState(UNCHANGED)
  const [bucketId, setBucketId] = useState(UNCHANGED)
  const [tax, setTax] = useState(UNCHANGED)
  const [reimbursement, setReimbursement] = useState(UNCHANGED)
  const [transferReason, setTransferReason] = useState(UNCHANGED)
  const [status, setStatus] = useState(UNCHANGED)
  const [changeTags, setChangeTags] = useState(false)
  const [tags, setTags] = useState('')
  const [changeNote, setChangeNote] = useState(false)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api.classification.options().then(setOptions).catch(error => setError(String(error))) }, [])
  const activeAccounts = useMemo(() => accounts.filter(account => account.isActive), [accounts])
  const purposeType = transactionType === 'income' || transactionType === 'expense' ? transactionType : null
  const families = useMemo(() => [...new Set(options.categories.filter(item => !purposeType || item.type === purposeType).map(item => item.family))], [options, purposeType])

  const hasChanges = transactionType !== UNCHANGED || Boolean(date) || accountId !== UNCHANGED || targetAccountId !== UNCHANGED || purposeId !== UNCHANGED || contextId !== UNCHANGED || bucketId !== UNCHANGED || tax !== UNCHANGED || reimbursement !== UNCHANGED || transferReason !== UNCHANGED || status !== UNCHANGED || changeTags || changeNote

  async function submit() {
    setError('')
    if (transactionType === 'transfer' && (targetAccountId === UNCHANGED || targetAccountId === CLEAR || transferReason === UNCHANGED || transferReason === CLEAR)) {
      setError('Changing transactions to transfers requires a target account and transfer reason.')
      return
    }
    if (transactionType === 'transfer' && accountId !== UNCHANGED && accountId === targetAccountId) {
      setError('The source and target accounts must be different.')
      return
    }
    if (transactionType === 'transfer' && transferReasonNeedsContext(transferReason as TransferReason) && (contextId === UNCHANGED || contextId === CLEAR)) {
      setError('That transfer reason requires a funding context.')
      return
    }
    const changes: BulkTransactionChanges = {}
    if (transactionType !== UNCHANGED) changes.transactionType = transactionType as BulkTransactionChanges['transactionType']
    if (date) changes.date = date
    if (accountId !== UNCHANGED) changes.accountId = accountId
    if (targetAccountId !== UNCHANGED) changes.targetAccountId = targetAccountId === CLEAR ? null : targetAccountId
    if (purposeId !== UNCHANGED) changes.canonicalCategoryId = purposeId === CLEAR ? null : purposeId
    if (contextId !== UNCHANGED) changes.contextId = contextId === CLEAR ? null : contextId
    if (bucketId !== UNCHANGED) changes.bucketId = bucketId === CLEAR ? null : bucketId
    if (tax !== UNCHANGED) changes.taxTreatment = tax as BulkTransactionChanges['taxTreatment']
    if (reimbursement !== UNCHANGED) changes.reimbursementStatus = reimbursement as BulkTransactionChanges['reimbursementStatus']
    if (transferReason !== UNCHANGED) changes.transferReason = transferReason === CLEAR ? null : transferReason as TransferReason
    if (status !== UNCHANGED) changes.status = status
    if (changeTags) changes.tags = tags.split(',').map(tag => tag.trim()).filter(Boolean)
    if (changeNote) changes.comment = comment
    setSaving(true)
    try { await onSave(changes) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setSaving(false) }
  }

  const selectClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <Modal title={`Bulk edit ${transactions.length} transactions`} onClose={onClose} wide closeOnBackdrop={false}>
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <div><p className="font-semibold">Description and amount will be preserved.</p><p className="text-xs text-blue-700 mt-0.5">Every control starts as Leave unchanged. Changing type only normalises the existing amount sign: positive for income, negative for expenses/transfers.</p></div>
        </div>

        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Transaction</p>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Type"><select value={transactionType} onChange={event => setTransactionType(event.target.value)} className={selectClass}><option value={UNCHANGED}>Leave unchanged</option><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option></select></Field>
            <Field label="Date"><input type="date" value={date} onChange={event => setDate(event.target.value)} className={selectClass} /><p className="text-[10px] text-gray-400 mt-1">Blank = unchanged</p></Field>
            <Field label={transactionType === 'transfer' ? 'From account' : 'Account'}><select value={accountId} onChange={event => setAccountId(event.target.value)} className={selectClass}><option value={UNCHANGED}>Leave unchanged</option>{activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
            <Field label="Status"><select value={status} onChange={event => setStatus(event.target.value)} className={selectClass}><option value={UNCHANGED}>Leave unchanged</option><option value="C">Completed</option><option value="P">Pending</option></select></Field>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Classification</p>
          <div className="grid grid-cols-5 gap-3">
            <Field label="Purpose"><select value={purposeId} onChange={event => setPurposeId(event.target.value)} className={selectClass}><option value={UNCHANGED}>Leave unchanged</option><option value={CLEAR}>Clear purpose</option>{families.map(family => <optgroup key={family} label={family}>{options.categories.filter(item => item.family === family && (!purposeType || item.type === purposeType)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select></Field>
            <Field label="Context"><select value={contextId} onChange={event => setContextId(event.target.value)} className={selectClass}><option value={UNCHANGED}>Leave unchanged</option><option value={CLEAR}>Clear context</option>{options.contexts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Household bucket"><select value={bucketId} onChange={event => setBucketId(event.target.value)} className={selectClass}><option value={UNCHANGED}>Leave unchanged</option><option value={CLEAR}>Not applicable</option>{options.buckets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Tax"><select value={tax} onChange={event => setTax(event.target.value)} className={selectClass}><option value={UNCHANGED}>Leave unchanged</option><option value="none">None</option><option value="deductible">Deductible</option><option value="review">Needs review</option></select></Field>
            <Field label="Reimbursement"><select value={reimbursement} onChange={event => setReimbursement(event.target.value)} className={selectClass}><option value={UNCHANGED}>Leave unchanged</option><option value="none">None</option><option value="to_be_reimbursed">To be reimbursed</option><option value="reimbursed">Reimbursed</option></select></Field>
          </div>
        </section>

        <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 mb-3">Transfer details</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="To account"><select value={targetAccountId} onChange={event => setTargetAccountId(event.target.value)} className={selectClass}><option value={UNCHANGED}>Leave unchanged</option><option value={CLEAR}>Clear target</option>{activeAccounts.filter(account => account.id !== accountId).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
            <Field label="Transfer reason"><select value={transferReason} onChange={event => setTransferReason(event.target.value)} className={selectClass}><option value={UNCHANGED}>Leave unchanged</option><option value={CLEAR}>Clear reason</option>{transferReasons.map(reason => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></Field>
            <div className="text-xs text-sky-700 pt-6">Used only for transfers. Purpose, Bucket, Tax and Reimbursement are cleared when type changes to Transfer.</div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <OptionalText label="Tags (comma separated)" enabled={changeTags} onEnabled={setChangeTags} value={tags} onChange={setTags} placeholder="Blank clears all tags" />
          <OptionalText label="Note" enabled={changeNote} onEnabled={setChangeNote} value={comment} onChange={setComment} placeholder="Blank clears the note" />
        </section>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4"><button onClick={onClose} className="px-5 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button><button onClick={submit} disabled={!hasChanges || saving} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">{saving ? 'Applying…' : `Apply to ${transactions.length} transactions`}</button></div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>{children}</label> }

function OptionalText({ label, enabled, onEnabled, value, onChange, placeholder }: { label: string; enabled: boolean; onEnabled: (value: boolean) => void; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="rounded-xl border border-gray-200 p-3"><label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-2"><input type="checkbox" checked={enabled} onChange={event => onEnabled(event.target.checked)} /> Change {label.toLowerCase()}</label><input disabled={!enabled} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400" /></div>
}
