import { useMemo, useState } from 'react'
import { FolderPlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { api } from '../api'
import type { Category } from '../types/finance'

interface Props {
  categories: Category[]
  onRefreshCategories: () => void | Promise<void>
}

type PurposeDraft = {
  name: string
  family: string
  type: 'income' | 'expense'
}

const emptyDraft: PurposeDraft = { name: '', family: '', type: 'expense' }

export function CategoriesPage({ categories, onRefreshCategories }: Props) {
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<PurposeDraft | null>(null)
  const [editing, setEditing] = useState<Category | null>(null)
  const [newGroup, setNewGroup] = useState(false)
  const [groupDirection, setGroupDirection] = useState<'income' | 'expense' | 'both'>('expense')
  const [renamingFamily, setRenamingFamily] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return query ? categories.filter(item => item.fullName.toLocaleLowerCase().includes(query)) : categories
  }, [categories, search])
  const families = [...new Set(visible.map(item => item.parentName ?? 'Other'))]
  const allFamilies = [...new Set(categories.map(item => item.parentName ?? 'Other'))]

  const openPurpose = (category?: Category) => {
    setError('')
    setNewGroup(false)
    setEditing(category ?? null)
    setDraft(category
      ? { name: category.name, family: category.parentName ?? 'Other', type: category.type === 'income' ? 'income' : 'expense' }
      : { ...emptyDraft, family: allFamilies[0] ?? '' })
  }

  const openGroup = () => {
    setError('')
    setEditing(null)
    setNewGroup(true)
    setGroupDirection('expense')
    setDraft({ ...emptyDraft })
  }

  const savePurpose = async () => {
    if (!draft) return
    setBusy(true); setError('')
    try {
      const payload = {
        ...draft,
        type: newGroup && groupDirection !== 'both' ? groupDirection : draft.type,
      }
      if (editing) await api.categories.update(editing.id, payload)
      else await api.categories.create(payload)
      await onRefreshCategories()
      setDraft(null); setEditing(null); setNewGroup(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Purpose could not be saved.')
    } finally { setBusy(false) }
  }

  const renameGroup = async () => {
    if (!renamingFamily) return
    setBusy(true); setError('')
    try {
      await api.categories.renameGroup(renamingFamily, renameValue)
      await onRefreshCategories()
      setRenamingFamily(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The group could not be renamed.')
    } finally { setBusy(false) }
  }

  const deletePurpose = async () => {
    if (!deleting) return
    setBusy(true); setError('')
    try {
      await api.categories.delete(deleting.id)
      await onRefreshCategories()
      setDeleting(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Purpose could not be deleted.')
    } finally { setBusy(false) }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-5">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Purposes</h1>
            <p className="mt-1 text-sm text-slate-500">The active transaction classification catalogue, grouped by financial purpose.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-72"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search purposes…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400" /></div>
            <button onClick={openGroup} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><FolderPlus size={15} /> New group</button>
            <button onClick={() => openPurpose()} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Plus size={15} /> New Purpose</button>
          </div>
        </div>

        {error && !draft && !deleting && !renamingFamily && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {families.map(family => (
            <section key={family} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-800">{family}</h2>
                <button onClick={() => { setError(''); setRenamingFamily(family); setRenameValue(family) }} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700" title="Rename group"><Pencil size={14} /></button>
              </div>
              <div className="divide-y divide-slate-100">
                {visible.filter(item => (item.parentName ?? 'Other') === family).map(item => (
                  <div key={item.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="min-w-0 flex-1 text-sm text-slate-700">{item.name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">{item.type}</span>
                    <span className="w-16 text-right text-xs text-slate-400">{item.txCount} txns</span>
                    <div className="flex w-12 justify-end opacity-30 transition group-hover:opacity-100">
                      <button onClick={() => openPurpose(item)} className="rounded p-1 text-slate-500 hover:bg-slate-200" title="Edit Purpose"><Pencil size={13} /></button>
                      <button onClick={() => { setError(''); setDeleting(item) }} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete Purpose"><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {draft && (
        <Modal title={editing ? 'Edit Purpose' : newGroup ? 'Create Purpose group' : 'New Purpose'} onClose={() => { if (!busy) { setDraft(null); setError('') } }}>
          {newGroup && <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800"><strong>A group organizes related Purposes.</strong> Its income/expense choice controls where its first Purpose appears. Context and Bucket stay on each transaction, because the same Purpose may be used for Household, Property, or Business.</div>}
          <div className="space-y-4">
            <Field label={newGroup ? '1. What should the group be called?' : 'Group'}>
              {newGroup ? <input autoFocus value={draft.family} onChange={event => setDraft({ ...draft, family: event.target.value })} placeholder="e.g. Pets" className="field" /> : <select value={draft.family} onChange={event => setDraft({ ...draft, family: event.target.value })} className="field">{allFamilies.map(family => <option key={family}>{family}</option>)}</select>}
            </Field>
            {newGroup && <Field label="2. What kind of Purposes will this group contain?"><div className="grid grid-cols-3 gap-2">{(['expense', 'income', 'both'] as const).map(value => <button type="button" key={value} onClick={() => { setGroupDirection(value); if (value !== 'both') setDraft({ ...draft, type: value }) }} className={`rounded-lg border px-2 py-2 text-sm capitalize ${groupDirection === value ? 'border-blue-500 bg-blue-50 font-semibold text-blue-700' : 'border-slate-200 text-slate-600'}`}>{value === 'both' ? 'Both' : `${value} only`}</button>)}</div></Field>}
            <Field label={newGroup ? '3. Name the first Purpose in this group' : 'Purpose name'}><input autoFocus={!newGroup} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Veterinary care" className="field" /></Field>
            {(!newGroup || groupDirection === 'both') && <Field label="Transaction type"><select value={draft.type} disabled={Boolean(editing?.txCount)} onChange={event => setDraft({ ...draft, type: event.target.value as 'income' | 'expense' })} className="field disabled:bg-slate-100 disabled:text-slate-400"><option value="expense">Expense</option><option value="income">Income</option></select>{editing && editing.txCount > 0 && <p className="mt-1 text-xs text-amber-700">Type cannot be changed while {editing.txCount} transactions use this Purpose.</p>}</Field>}
          </div>
          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <ModalActions busy={busy} disabled={!draft.name.trim() || !draft.family.trim()} action={editing ? 'Save changes' : newGroup ? 'Create group' : 'Create Purpose'} onCancel={() => setDraft(null)} onSave={savePurpose} />
        </Modal>
      )}

      {renamingFamily && <Modal title="Rename group" onClose={() => setRenamingFamily(null)}><p className="mb-4 text-sm text-slate-500">Every Purpose in <strong>{renamingFamily}</strong> will move to the renamed group.</p><Field label="Group name"><input autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} className="field" /></Field>{error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<ModalActions busy={busy} disabled={!renameValue.trim() || renameValue.trim() === renamingFamily} action="Rename group" onCancel={() => setRenamingFamily(null)} onSave={renameGroup} /></Modal>}

      {deleting && <Modal title="Delete Purpose" onClose={() => setDeleting(null)}><div className={`rounded-lg border p-4 text-sm ${deleting.txCount ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800'}`}>{deleting.txCount ? <><strong>{deleting.fullName}</strong> is used by {deleting.txCount} transactions and cannot be safely deleted yet. Reassign those transactions first.</> : <>Delete <strong>{deleting.fullName}</strong>? This cannot be undone.</>}</div>{error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<ModalActions busy={busy} disabled={deleting.txCount > 0} danger action="Delete Purpose" onCancel={() => setDeleting(null)} onSave={deletePurpose} /></Modal>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-lg font-bold text-slate-900">{title}</h2><button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button></div><div className="p-5">{children}</div></div></div>
}

function ModalActions({ busy, disabled, danger = false, action, onCancel, onSave }: { busy: boolean; disabled: boolean; danger?: boolean; action: string; onCancel: () => void; onSave: () => void }) {
  return <div className="mt-5 flex justify-end gap-2"><button disabled={busy} onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button><button disabled={busy || disabled} onClick={onSave} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{busy ? 'Saving…' : action}</button></div>
}
