import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { Category } from '../types/finance'

interface Props {
  categories: Category[]
}

export function CategoriesPage({ categories }: Props) {
  const [search, setSearch] = useState('')
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return query ? categories.filter(item => item.fullName.toLocaleLowerCase().includes(query)) : categories
  }, [categories, search])
  const families = [...new Set(visible.map(item => item.parentName ?? 'Other'))]

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-5">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Purposes</h1>
            <p className="mt-1 text-sm text-slate-500">The active transaction classification catalogue, grouped by financial purpose.</p>
          </div>
          <div className="relative w-72"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search purposes…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400" /></div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {families.map(family => (
            <section key={family} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3"><h2 className="text-sm font-semibold text-slate-800">{family}</h2></div>
              <div className="divide-y divide-slate-100">
                {visible.filter(item => (item.parentName ?? 'Other') === family).map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="flex-1 text-sm text-slate-700">{item.name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">{item.type}</span>
                    <span className="w-16 text-right text-xs text-slate-400">{item.txCount} txns</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
