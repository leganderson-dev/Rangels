import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Page } from '../App'
import { monthName } from '../utils'

const TABS: { id: Page; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'merchants', label: 'Merchants' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'categories', label: 'Categories' },
  { id: 'reports', label: 'Reports' },
  { id: 'plan', label: 'Plan' },
  { id: 'budget', label: 'Budget' },
  { id: 'scheduled', label: 'Scheduled' },
]

interface Props {
  page: Page
  onPageChange: (p: Page) => void
  month: number
  year: number
  onPrev: () => void
  onNext: () => void
  dateMode: 'month' | 'custom'
  onDateModeChange: (m: 'month' | 'custom') => void
  customFrom: string
  onCustomFromChange: (v: string) => void
  customTo: string
  onCustomToChange: (v: string) => void
}

export function TopNav({
  page, onPageChange,
  month, year, onPrev, onNext,
  dateMode, onDateModeChange,
  customFrom, onCustomFromChange,
  customTo, onCustomToChange,
}: Props) {
  const showDateNav = ['overview', 'transactions', 'calendar', 'reports', 'budget'].includes(page)

  return (
    <header className="bg-white border-b border-gray-200 flex items-center gap-4 px-4 h-11 shrink-0 titlebar-drag">
      {/* macOS traffic light spacing */}
      <div className="w-16 shrink-0" />

      {/* Tabs */}
      <nav className="flex items-center gap-0.5 titlebar-nodrag">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onPageChange(tab.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              page === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {showDateNav && (
        <div className="flex items-center gap-2 titlebar-nodrag">
          {/* Mode toggle */}
          <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => onDateModeChange('month')}
              className={`px-2.5 py-1 ${dateMode === 'month' ? 'bg-gray-100 text-gray-800 font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Month
            </button>
            <button
              onClick={() => onDateModeChange('custom')}
              className={`px-2.5 py-1 ${dateMode === 'custom' ? 'bg-gray-100 text-gray-800 font-medium' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Custom
            </button>
          </div>

          {/* Month nav or date inputs */}
          {dateMode === 'month' ? (
            <div className="flex items-center gap-1">
              <button onClick={onPrev} className="p-1 rounded hover:bg-gray-100 text-gray-500">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-gray-700 w-28 text-center">
                {monthName(month)} {year}
              </span>
              <button onClick={onNext} className="p-1 rounded hover:bg-gray-100 text-gray-500">
                <ChevronRight size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={customFrom}
                onChange={e => onCustomFromChange(e.target.value)}
                className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700"
              />
              <span className="text-gray-400">–</span>
              <input
                type="date"
                value={customTo}
                onChange={e => onCustomToChange(e.target.value)}
                className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700"
              />
            </div>
          )}
        </div>
      )}
    </header>
  )
}
