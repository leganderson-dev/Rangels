import { useState } from 'react'
import { Modal } from './Modal'
import { ACCOUNT_TYPES, ACCOUNT_COLORS } from '../utils'
import type { Account, HouseholdMember } from '../types/finance'

interface Props {
  account?: Account
  members: HouseholdMember[]
  onClose: () => void
  onSave: (data: Pick<Account, 'name' | 'type' | 'color' | 'initialBalance' | 'memberId' | 'isActive'> & { groupName: string | null }) => Promise<void>
  onDelete?: () => Promise<void>
}

export function AccountFormModal({ account, members, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<Account['type']>(account?.type ?? 'checking')
  const [color, setColor] = useState(account?.color ?? ACCOUNT_COLORS[0])
  const [initialBalance, setInitialBalance] = useState(String(account?.initialBalance ?? '0'))
  const [groupName, setGroupName] = useState(account?.groupName ?? '')
  const [memberId, setMemberId] = useState(account?.memberId ?? members[0]?.id ?? '')
  const [isActive, setIsActive] = useState(account?.isActive ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        type,
        color,
        initialBalance: parseFloat(initialBalance) || 0,
        groupName: groupName.trim() || null,
        memberId,
        isActive,
      })
    } catch (e: any) {
      const msg: string = e?.message ?? String(e)
      if (msg.includes('UNIQUE')) setError('An account with that name already exists.')
      else setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={account ? 'Edit Account' : 'New Account'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
          <select
            value={memberId}
            onChange={e => setMemberId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-400">Imports use the account owner as the member attribution.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. NAB Everyday"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as Account['type'])}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Opening Balance</label>
          <input
            type="number"
            value={initialBalance}
            onChange={e => setInitialBalance(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            step="0.01"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Group <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. ING, NAB"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
          <div className="flex gap-2 flex-wrap">
            {ACCOUNT_COLORS.map(c => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Select account color ${c}`}
                aria-pressed={color === c}
                className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
          <input
            type="checkbox"
            checked={!isActive}
            onChange={event => setIsActive(!event.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-slate-600"
          />
          <span>
            <span className="block text-sm font-medium text-gray-700">Inactive</span>
            <span className="block text-xs text-gray-400">Keep its history, but exclude it from transactions, transfers and imports.</span>
          </span>
        </label>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-2 pt-2">
          {onDelete && (
            <button
              onClick={async () => {
                if (!confirm(`Delete "${account?.name}"? This cannot be undone.`)) return
                await onDelete()
              }}
              className="border border-red-300 text-red-600 rounded-lg px-3 py-2 text-sm hover:bg-red-50"
            >
              Delete
            </button>
          )}
          <button onClick={onClose} className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim() || !memberId}
            className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
