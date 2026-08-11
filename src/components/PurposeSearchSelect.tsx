import { useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

export type PurposeSearchOption = { id: string; name: string; family: string; fullName: string }

interface Props {
  value: string
  options: PurposeSearchOption[]
  onChange: (value: string) => void
  emptyLabel?: string
}

export function PurposeSearchSelect({ value, options, onChange, emptyLabel = 'Choose purpose…' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find(option => option.id === value)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matches = options.filter(option => !normalizedQuery || option.name.toLocaleLowerCase().includes(normalizedQuery) || option.family.toLocaleLowerCase().includes(normalizedQuery) || option.fullName.toLocaleLowerCase().includes(normalizedQuery))
  const families = [...new Set(matches.map(option => option.family))]

  return (
    <div className={`relative ${open ? 'z-50' : ''}`}>
      <button type="button" onClick={() => { setOpen(current => !current); setQuery('') }} className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 outline-none hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
        <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-slate-400'}`}>{selected?.fullName ?? emptyLabel}</span>
        <ChevronDown size={14} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }} onBlur={() => setTimeout(() => setOpen(false), 180)} placeholder="Search purpose or group…" className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { onChange(''); setOpen(false) }} className="w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-50">{emptyLabel}</button>
            {families.map(family => (
              <div key={family || 'Other'}>
                <p className="sticky top-0 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{family || 'Other'}</p>
                {matches.filter(option => option.family === family).map(option => (
                  <button key={option.id} type="button" onMouseDown={event => event.preventDefault()} onClick={() => { onChange(option.id); setOpen(false) }} className={`w-full px-4 py-2 text-left text-sm hover:bg-blue-50 ${option.id === value ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700'}`}>
                    {option.name}
                  </button>
                ))}
              </div>
            ))}
            {matches.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">No matching purposes</p>}
          </div>
        </div>
      )}
    </div>
  )
}
