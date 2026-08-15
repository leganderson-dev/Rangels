import { useEffect, useState } from 'react'
import { Plus, Trash2, X, Check, Edit2 } from 'lucide-react'
import { api } from '../api'
import { fmt, monthName } from '../utils'
import type { Account, Category, ClassificationOptions } from '../types/finance'

interface Props {
  accounts: Account[]
  categories: Category[]
  month: number
  year: number
  selectedAccountId?: any
  onRefreshAccounts?: any
  onRefreshCategories?: any
  onMonthChange?: any
  onYearChange?: any
}

interface BudgetGroup {
  id: string
  name: string
  month: number
  year: number
  amount: number
  spent: number
  members: BudgetGroupMember[]
}

interface BudgetGroupMember {
  id: string
  groupId: string
  memberType: BudgetDimension
  memberId: string
  memberName: string
  memberColor: string
}

type BudgetDimension = 'purpose' | 'purpose_family' | 'bucket' | 'context'

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || hex.length < 7) return `rgba(100,100,100,${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function BudgetPage({ categories, month, year }: Props) {
  const [groups, setGroups] = useState<BudgetGroup[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<BudgetGroup | null>(null)

  function load() {
    api.budgetGroups.list(month, year).then(setGroups)
  }

  useEffect(() => { load() }, [month, year])

  async function handleDelete(id: string) {
    if (!confirm('Delete this budget group?')) return
    await api.budgetGroups.delete(id)
    load()
  }

  const totalBudget = groups.reduce((s, g) => s + g.amount, 0)
  const totalSpent = groups.reduce((s, g) => s + g.spent, 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-white shrink-0">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Budget — {monthName(month)} {year}</h2>
          {totalBudget > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {fmt(totalSpent)} spent · {fmt(totalBudget - totalSpent)} remaining · {Math.round((totalSpent / totalBudget) * 100)}%
            </p>
          )}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => { setEditingGroup(null); setShowForm(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={14} /> New Budget Group
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {totalBudget > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Overall Budget</span>
              <span className="text-sm font-bold text-gray-700">
                {fmt(totalSpent)} <span className="text-gray-400 font-normal text-xs">/ {fmt(totalBudget)}</span>
              </span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
              {groups.map(g => {
                const w = totalBudget > 0 ? (Math.min(g.spent, g.amount) / totalBudget) * 100 : 0
                return (
                  <div
                    key={g.id}
                    className="h-full"
                    style={{ width: `${w}%`, backgroundColor: g.members[0]?.memberColor ?? '#94a3b8', opacity: 0.8 }}
                    title={`${g.name}: ${fmt(g.spent)}`}
                  />
                )
              })}
            </div>
          </div>
        )}

        {groups.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Plus size={24} className="text-gray-300" />
            </div>
            <p className="text-sm">No budget groups yet</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-blue-600 text-sm hover:underline">
              Create your first budget group
            </button>
          </div>
        )}

        {groups.map(group => {
          const pct = group.amount > 0 ? Math.min(100, (group.spent / group.amount) * 100) : 0
          const over = group.spent > group.amount
          return (
            <div
              key={group.id}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${over ? 'border-red-200' : 'border-gray-200'}`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">{group.name}</h3>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {group.members.map(m => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border"
                          style={{
                            backgroundColor: hexToRgba(m.memberColor, 0.1),
                            color: m.memberColor,
                            borderColor: hexToRgba(m.memberColor, 0.2),
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.memberColor }} />
                          {m.memberName}
                          {m.memberType === 'purpose_family' && <span className="opacity-60">+ all purposes</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <button
                      onClick={() => { setEditingGroup(group); setShowForm(true) }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(group.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs mb-2">
                  <span className={`font-bold text-base ${over ? 'text-red-500' : 'text-gray-800'}`}>{fmt(group.spent)}</span>
                  <span className="text-gray-400">of {fmt(group.amount)}</span>
                </div>

                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${over ? 'bg-red-400' : pct > 85 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between mt-2">
                  {over ? (
                    <span className="text-xs text-red-500 font-medium">Over budget by {fmt(group.spent - group.amount)}</span>
                  ) : (
                    <span className="text-xs text-gray-400">{fmt(group.amount - group.spent)} remaining</span>
                  )}
                  <span className="text-xs font-semibold text-gray-500">{pct.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {showForm && (
        <BudgetGroupForm
          categories={categories}
          month={month}
          year={year}
          editGroup={editingGroup}
          onClose={() => { setShowForm(false); setEditingGroup(null) }}
          onSave={() => { load(); setShowForm(false); setEditingGroup(null) }}
        />
      )}
    </div>
  )
}

function BudgetGroupForm({ categories, month, year, editGroup, onClose, onSave }: {
  categories: Category[]
  month: number
  year: number
  editGroup: BudgetGroup | null
  onClose: () => void
  onSave: () => void
}) {
  const [name, setName] = useState(editGroup?.name ?? '')
  const [amount, setAmount] = useState(editGroup?.amount?.toString() ?? '')
  const initialDimension = editGroup?.members[0]?.memberType === 'bucket' || editGroup?.members[0]?.memberType === 'context'
    ? editGroup.members[0].memberType
    : 'purpose'
  const [dimension, setDimension] = useState<'purpose' | 'bucket' | 'context'>(initialDimension)
  const [selectedMembers, setSelectedMembers] = useState<Map<string, BudgetDimension>>(
    () => new Map(editGroup?.members.map(m => [m.memberId, m.memberType]) ?? [])
  )
  const [options, setOptions] = useState<ClassificationOptions>({ contexts: [], buckets: [], categories: [] })
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { api.classification.options().then(setOptions) }, [])

  const purposeFamilies = [...new Set(options.categories.map(category => category.family))]
  const query = search.trim().toLowerCase()
  const choices = dimension === 'bucket'
    ? options.buckets.map(item => ({ id: item.id, name: item.name, detail: 'Household Bucket', color: '#8b5cf6', type: 'bucket' as const }))
    : dimension === 'context'
      ? options.contexts.map(item => ({ id: item.id, name: item.name, detail: 'Context', color: '#0f766e', type: 'context' as const }))
      : purposeFamilies.flatMap(family => [
          { id: family, name: family, detail: 'Parent Purpose · includes every purpose below', color: '#6366f1', type: 'purpose_family' as const },
          ...options.categories
            .filter(category => category.family === family)
            .map(category => ({ id: category.id, name: category.name, detail: family, color: categories.find(item => item.id === category.id)?.color ?? '#64748b', type: 'purpose' as const })),
        ])
  const filteredChoices = query
    ? choices.filter(choice => choice.name.toLowerCase().includes(query) || choice.detail.toLowerCase().includes(query))
    : choices

  function changeDimension(next: 'purpose' | 'bucket' | 'context') {
    if (next === dimension) return
    setDimension(next)
    setSelectedMembers(new Map())
    setSearch('')
  }

  function toggleMember(id: string, type: BudgetDimension) {
    setSelectedMembers(prev => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, type)
      return next
    })
  }

  async function handleSave() {
    if (!name.trim() || !amount || selectedMembers.size === 0) return
    setSaving(true)
    try {
      const members = [...selectedMembers.entries()].map(([memberId, memberType]) => ({
        memberId,
        memberType,
      }))
      if (editGroup) {
        await api.budgetGroups.update(editGroup.id, { name: name.trim(), amount: parseFloat(amount) })
        await api.budgetGroups.setMembers(editGroup.id, members)
      } else {
        const groupId = await api.budgetGroups.add({ name: name.trim(), month, year, amount: parseFloat(amount) })
        await api.budgetGroups.setMembers(groupId, members)
      }
      onSave()
    } finally {
      setSaving(false)
    }
  }

  const selectedChoices = choices.filter(choice => selectedMembers.has(choice.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">
            {editGroup ? 'Edit Budget Group' : 'New Budget Group'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col p-6 gap-5 min-h-0">
          {/* Name + Amount */}
          <div className="grid grid-cols-2 gap-4 shrink-0">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Group Name</label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Household, Food, Kids…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Monthly Budget</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="1000.00"
                step="50"
                min="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1 shrink-0">
            {(['purpose', 'bucket', 'context'] as const).map(item => (
              <button
                key={item}
                onClick={() => changeDimension(item)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize transition ${dimension === item ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {item === 'purpose' ? 'Purposes' : item === 'bucket' ? 'Buckets' : 'Contexts'}
              </button>
            ))}
          </div>

          {selectedChoices.length > 0 && (
            <div className="shrink-0">
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Included</label>
              <div className="flex flex-wrap gap-2">
                {selectedChoices.map(choice => (
                  <div
                    key={choice.id}
                    className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium border"
                    style={{
                      backgroundColor: hexToRgba(choice.color, 0.1),
                      color: choice.color,
                      borderColor: hexToRgba(choice.color, 0.3),
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: choice.color }} />
                    {choice.name}
                    {choice.type === 'purpose_family' && <span className="opacity-60">+ all</span>}
                    <button
                      onClick={() => toggleMember(choice.id, choice.type)}
                      className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center hover:bg-black/10"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select {dimension === 'purpose' ? 'Purposes' : dimension === 'bucket' ? 'Buckets' : 'Contexts'}</label>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 w-36"
              />
            </div>
            <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50">
              {filteredChoices.map(choice => {
                const selected = selectedMembers.has(choice.id)
                return (
                  <button
                    type="button"
                    key={`${choice.type}:${choice.id}`}
                    onClick={() => toggleMember(choice.id, choice.type)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 ${selected ? 'bg-blue-50/60' : ''} ${choice.type === 'purpose_family' ? 'border-t border-gray-200 mt-1' : 'pl-10'}`}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${selected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                      {selected && <Check size={10} className="text-white" strokeWidth={3} />}
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: choice.color }} />
                    <span className={`flex-1 text-sm ${choice.type === 'purpose_family' ? 'font-bold text-gray-800' : 'text-gray-650'}`}>{choice.name}</span>
                    <span className="text-[10px] text-gray-400">{choice.detail}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !amount || selectedMembers.size === 0}
            className="flex-[2] bg-blue-600 text-white rounded-xl px-6 py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : editGroup ? 'Update Group' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}
