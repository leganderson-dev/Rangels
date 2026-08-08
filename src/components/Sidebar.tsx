import { useState, useMemo } from 'react'
import { PlusCircle, ChevronRight, Download, Upload, Pencil, GripVertical, LogOut } from 'lucide-react'
import { api } from '../api'
import type { Account } from '../types/finance'
import { AccountFormModal } from './AccountFormModal'
import { fmt } from '../utils'
import { supabase } from '../lib/supabase'

interface Props {
  accounts: Account[]
  selectedAccountId: string | null
  onSelectAccount: (id: string | null) => void
  onRefresh: () => void
}

type DropZone =
  | { kind: 'before'; id: string }
  | { kind: 'onto'; id: string }
  | { kind: 'group'; name: string }
  | { kind: 'ungrouped-end' }

export function Sidebar({ accounts, selectedAccountId, onSelectAccount, onRefresh }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [dbStatus, setDbStatus] = useState<{ msg: string; ok: boolean } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const [pendingGroup, setPendingGroup] = useState<{ draggedId: string; targetId: string } | null>(null)
  const [pendingGroupName, setPendingGroupName] = useState('')

  const totalBalance = accounts.reduce((s, a) => s + (a.balance ?? 0), 0)

  const { ungrouped, groups } = useMemo(() => {
    const groupMap = new Map<string, Account[]>()
    const ungrouped: Account[] = []
    for (const a of accounts) {
      if (a.groupName) {
        if (!groupMap.has(a.groupName)) groupMap.set(a.groupName, [])
        groupMap.get(a.groupName)!.push(a)
      } else {
        ungrouped.push(a)
      }
    }
    const groups = [...groupMap.entries()].map(([name, children]) => ({
      name,
      children,
      balance: children.reduce((s, a) => s + (a.balance ?? 0), 0),
      color: children[0]?.color ?? '#3b82f6',
    }))
    return { ungrouped, groups }
  }, [accounts])

  const orderedAccounts = useMemo(() => {
    const list: { account: Account; groupName: string | null }[] = []
    for (const a of ungrouped) list.push({ account: a, groupName: null })
    for (const g of groups) {
      for (const a of g.children) list.push({ account: a, groupName: g.name })
    }
    return list
  }, [ungrouped, groups])

  function toggleGroup(name: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  async function commitDrop(zone: DropZone) {
    if (dragId === null) return
    const rest = orderedAccounts.filter(i => i.account.id !== dragId)
    const dragged = orderedAccounts.find(i => i.account.id === dragId)
    if (!dragged) return

    if (zone.kind === 'onto') {
      const target = rest.find(i => i.account.id === zone.id)
      if (target?.groupName) {
        // Target is already grouped → join that group after the target
        const targetIdx = rest.findIndex(i => i.account.id === zone.id)
        const newList = [...rest]
        newList.splice(targetIdx + 1, 0, { account: dragged.account, groupName: target.groupName })
        const updates = newList.map((item, idx) => ({ id: item.account.id, groupName: item.groupName, displayOrder: idx }))
        await api.accounts.reorder(updates)
        onRefresh()
      } else {
        // Target is ungrouped → prompt for a new group name
        setPendingGroup({ draggedId: dragId, targetId: zone.id })
        setPendingGroupName('')
      }
      setDragId(null)
      setDropZone(null)
      return
    }

    let newGroupName: string | null
    let insertIdx: number

    if (zone.kind === 'before') {
      const targetIdx = rest.findIndex(i => i.account.id === zone.id)
      newGroupName = rest[targetIdx]?.groupName ?? null
      insertIdx = targetIdx < 0 ? rest.length : targetIdx
    } else if (zone.kind === 'group') {
      newGroupName = zone.name
      const lastIdx = rest.reduce<number>((acc, item, idx) => item.groupName === zone.name ? idx : acc, -1)
      insertIdx = lastIdx >= 0 ? lastIdx + 1 : rest.length
    } else {
      newGroupName = null
      const lastUngroupedIdx = rest.reduce<number>((acc, item, idx) => item.groupName === null ? idx : acc, -1)
      insertIdx = lastUngroupedIdx >= 0 ? lastUngroupedIdx + 1 : 0
    }

    const newList = [...rest]
    newList.splice(insertIdx, 0, { account: dragged.account, groupName: newGroupName })
    const updates = newList.map((item, idx) => ({ id: item.account.id, groupName: item.groupName, displayOrder: idx }))
    await api.accounts.reorder(updates)
    onRefresh()
    setDragId(null)
    setDropZone(null)
  }

  async function confirmGroup() {
    if (!pendingGroup || !pendingGroupName.trim()) return
    const name = pendingGroupName.trim()
    const dragged = orderedAccounts.find(i => i.account.id === pendingGroup.draggedId)
    if (!dragged) return

    // Insert dragged after target; both get new group name
    const rest = orderedAccounts.filter(i => i.account.id !== pendingGroup.draggedId)
    const targetIdx = rest.findIndex(i => i.account.id === pendingGroup.targetId)
    const newList = [...rest]
    newList.splice(targetIdx + 1, 0, { account: dragged.account, groupName: name })
    const updates = newList.map((item, idx) => ({
      id: item.account.id,
      groupName: item.account.id === pendingGroup.targetId ? name : item.groupName,
      displayOrder: idx,
    }))
    await api.accounts.reorder(updates)
    onRefresh()
    setPendingGroup(null)
    setPendingGroupName('')
  }

  // Position-aware drag handlers for account rows
  function handleAccountDragOver(id: string, e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const isTop = (e.clientY - rect.top) < rect.height * 0.45
    setDropZone(isTop ? { kind: 'before', id } : { kind: 'onto', id })
  }

  function handleAccountDrop(id: string, e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    // Use current dropZone (set by last dragover) so the zone matches where cursor actually is
    if (dropZone && (dropZone.kind === 'before' || dropZone.kind === 'onto') && dropZone.id === id) {
      commitDrop(dropZone)
    }
  }

  function handleZoneDragOver(zone: DropZone, e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropZone(zone)
  }

  function handleZoneDrop(zone: DropZone, e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    commitDrop(zone)
  }

  const isDragging = dragId !== null

  return (
    <aside className="w-56 bg-slate-900 flex flex-col h-full shrink-0">
      <div className="h-10 titlebar-drag" />

      <div
        className={`mx-3 mb-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${selectedAccountId === null ? 'bg-slate-700' : 'hover:bg-slate-800'}`}
        onClick={() => onSelectAccount(null)}
      >
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Overall</p>
        <p className={`text-base font-semibold mt-0.5 ${totalBalance >= 0 ? 'text-white' : 'text-red-400'}`}>
          {fmt(totalBalance)}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {/* Inline group name prompt */}
        {pendingGroup && (
          <div className="mx-1 mb-2 p-2 bg-slate-700 rounded-lg border border-slate-600">
            <p className="text-xs text-slate-400 mb-1.5">Group name</p>
            <input
              autoFocus
              value={pendingGroupName}
              onChange={e => setPendingGroupName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmGroup()
                if (e.key === 'Escape') { setPendingGroup(null); setPendingGroupName('') }
              }}
              placeholder="e.g. NAB"
              className="w-full bg-slate-800 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
            />
            <div className="flex gap-1 mt-2">
              <button
                onClick={() => { setPendingGroup(null); setPendingGroupName('') }}
                className="flex-1 text-xs text-slate-400 hover:text-white py-1"
              >
                Cancel
              </button>
              <button
                onClick={confirmGroup}
                disabled={!pendingGroupName.trim()}
                className="flex-1 text-xs text-white bg-blue-600 rounded px-2 py-1 hover:bg-blue-700 disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {ungrouped.map(account => (
          <DraggableRow
            key={account.id}
            account={account}
            selected={selectedAccountId === account.id}
            isDragging={dragId === account.id}
            isDropBefore={dropZone?.kind === 'before' && dropZone.id === account.id}
            isDropOnto={dropZone?.kind === 'onto' && dropZone.id === account.id}
            onClick={() => onSelectAccount(account.id === selectedAccountId ? null : account.id)}
            onEdit={() => setEditAccount(account)}
            onLastUpdatedChange={async value => { await api.accounts.update(account.id, { lastUpdatedOn: value }); onRefresh() }}
            onDragStart={() => { setDragId(account.id); setDropZone(null) }}
            onDragEnd={() => { setDragId(null); setDropZone(null) }}
            onDragOver={e => handleAccountDragOver(account.id, e)}
            onDrop={e => handleAccountDrop(account.id, e)}
          />
        ))}

        {isDragging && (
          <div
            onDragOver={e => handleZoneDragOver({ kind: 'ungrouped-end' }, e)}
            onDrop={e => handleZoneDrop({ kind: 'ungrouped-end' }, e)}
            className={`h-1.5 mx-1 rounded transition-colors ${dropZone?.kind === 'ungrouped-end' ? 'bg-blue-500' : 'bg-transparent'}`}
          />
        )}

        {groups.map(group => {
          const collapsed = collapsedGroups.has(group.name)
          const groupSelected = group.children.some(a => a.id === selectedAccountId)
          const isGroupTarget = dropZone?.kind === 'group' && dropZone.name === group.name

          return (
            <div
              key={group.name}
              className={`mb-2 rounded-xl border bg-slate-800/40 p-1 shadow-sm transition-colors ${
                isGroupTarget
                  ? 'border-blue-400 ring-1 ring-blue-500/60'
                  : groupSelected
                    ? 'border-slate-500 shadow-black/20'
                    : 'border-slate-700/80 shadow-black/10'
              }`}
            >
              <button
                onClick={() => toggleGroup(group.name)}
                onDragOver={e => handleZoneDragOver({ kind: 'group', name: group.name }, e)}
                onDrop={e => handleZoneDrop({ kind: 'group', name: group.name }, e)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-colors ${
                  isGroupTarget
                    ? 'bg-blue-500/20'
                    : groupSelected && collapsed
                      ? 'bg-slate-700'
                      : 'hover:bg-slate-700/60'
                }`}
              >
                <ChevronRight
                  size={12}
                  className={`text-slate-500 shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`}
                />
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 text-xs font-semibold truncate">{group.name}</p>
                  <p className={`text-xs font-semibold ${group.balance < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                    {fmt(group.balance)}
                  </p>
                </div>
              </button>

              {!collapsed && (
                <div className="mt-1 space-y-0.5 border-t border-slate-700/70 pt-1 pl-2">
                  {group.children.map(account => (
                    <DraggableRow
                      key={account.id}
                      account={account}
                      selected={selectedAccountId === account.id}
                      isDragging={dragId === account.id}
                      isDropBefore={dropZone?.kind === 'before' && dropZone.id === account.id}
                      isDropOnto={dropZone?.kind === 'onto' && dropZone.id === account.id}
                      onClick={() => onSelectAccount(account.id === selectedAccountId ? null : account.id)}
                      onEdit={() => setEditAccount(account)}
                      onLastUpdatedChange={async value => { await api.accounts.update(account.id, { lastUpdatedOn: value }); onRefresh() }}
                      onDragStart={() => { setDragId(account.id); setDropZone(null) }}
                      onDragEnd={() => { setDragId(null); setDropZone(null) }}
                      onDragOver={e => handleAccountDragOver(account.id, e)}
                      onDrop={e => handleAccountDrop(account.id, e)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mx-3 mb-4 space-y-1">
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm"
        >
          <PlusCircle size={15} />
          <span>Add account</span>
        </button>

        <div className="flex gap-1">
          <button
            title="Backup database"
            onClick={async () => {
              const res = await api.db.backup()
              setDbStatus(res.ok ? { msg: 'Backup saved', ok: true } : null)
              if (res.ok) setTimeout(() => setDbStatus(null), 3000)
            }}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors text-xs"
          >
            <Download size={12} /> Backup
          </button>
          <button
            title="Restore database"
            onClick={async () => {
              if (!confirm('Import this backup and update matching Rangels records?')) return
              const res = await api.db.restore()
              if (res.ok) { setDbStatus({ msg: 'Backup restored', ok: true }); onRefresh() }
            }}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors text-xs"
          >
            <Upload size={12} /> Restore
          </button>
        </div>

        <button onClick={() => supabase.auth.signOut()} className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors text-xs">
          <LogOut size={12} /> Sign out
        </button>

        {dbStatus && (
          <p className={`text-[10px] text-center px-2 ${dbStatus.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {dbStatus.msg}
          </p>
        )}
      </div>

      {showAdd && (
        <AccountFormModal
          onClose={() => setShowAdd(false)}
          onSave={async (data) => {
            await api.accounts.add(data)
            onRefresh()
            setShowAdd(false)
          }}
        />
      )}

      {editAccount && (
        <AccountFormModal
          account={editAccount}
          onClose={() => setEditAccount(null)}
          onSave={async (data) => {
            await api.accounts.update(editAccount.id, data)
            onRefresh()
            setEditAccount(null)
          }}
          onDelete={async () => {
            await api.accounts.delete(editAccount.id)
            onRefresh()
            setEditAccount(null)
          }}
        />
      )}
    </aside>
  )
}

function DraggableRow({ account, selected, isDragging, isDropBefore, isDropOnto, onClick, onEdit, onLastUpdatedChange, onDragStart, onDragEnd, onDragOver, onDrop }: {
  account: Account
  selected: boolean
  isDragging: boolean
  isDropBefore: boolean
  isDropOnto: boolean
  onClick: () => void
  onEdit: () => void
  onLastUpdatedChange: (value: string | null) => Promise<void>
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const balance = account.balance ?? 0
  const [editingDate, setEditingDate] = useState(false)
  const [savingDate, setSavingDate] = useState(false)

  const formattedDate = account.lastUpdatedOn
    ? new Date(`${account.lastUpdatedOn}T00:00:00`).toLocaleDateString('en-AU')
    : null

  return (
    <div onDragOver={onDragOver} onDrop={onDrop}>
      {isDropBefore && <div className="h-0.5 bg-blue-500 mx-1 rounded mb-0.5" />}
      <div
        draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
        onDragEnd={onDragEnd}
        className={`group relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg select-none transition-colors hover:cursor-grab active:cursor-grabbing
          ${isDropOnto ? 'ring-1 ring-blue-500 bg-blue-500/10' : selected ? 'bg-slate-700' : 'hover:bg-slate-800'}
          ${isDragging ? 'opacity-30' : ''}`}
        onClick={onClick}
      >
        <GripVertical
          size={11}
          className="text-slate-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        />
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: account.color }} />
        <div className="flex-1 min-w-0">
          <p className="text-slate-200 text-xs font-medium truncate">{account.name}</p>
          <p className={`text-xs font-semibold ${balance < 0 ? 'text-red-400' : 'text-slate-400'}`}>
            {fmt(balance)}
          </p>
          {editingDate ? (
            <input
              autoFocus
              type="date"
              value={account.lastUpdatedOn ?? ''}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              onBlur={() => setEditingDate(false)}
              onChange={async e => {
                e.stopPropagation()
                setSavingDate(true)
                await onLastUpdatedChange(e.target.value || null)
                setSavingDate(false)
                setEditingDate(false)
              }}
              className="mt-0.5 block w-full rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-[10px] text-slate-300 outline-none focus:border-blue-400 [color-scheme:dark]"
            />
          ) : (
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setEditingDate(true) }}
              className="mt-0.5 block text-[10px] leading-none text-slate-500 hover:text-slate-300"
              title="Change last updated date"
            >
              {savingDate ? 'Saving…' : formattedDate ? `Updated ${formattedDate}` : 'Set updated date'}
            </button>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-500 hover:text-slate-200 transition-opacity"
          title="Edit account"
        >
          <Pencil size={11} />
        </button>
      </div>
    </div>
  )
}
