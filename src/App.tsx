import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopNav } from './components/TopNav'
import { TransactionsPage } from './pages/Transactions'
import { OverviewPage } from './pages/Overview'
import { BudgetPage } from './pages/Budget'
import { ScheduledPage } from './pages/Scheduled'
import { ReportsPage } from './pages/Reports'
import { CategoriesPage } from './pages/Categories'
import { CalendarPage } from './pages/Calendar'
import { MerchantsPage } from './pages/Merchants'
import { PlanPage } from './pages/Plan'
import { HelpInfoModal } from './components/HelpInfoModal'
import { api } from './api'
import type { Account, Category, HouseholdMember } from './types/finance'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

export type Page = 'overview' | 'transactions' | 'merchants' | 'categories' | 'reports' | 'plan' | 'budget' | 'scheduled' | 'calendar'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!authReady) return <div className="min-h-screen bg-slate-50" />
  if (!session) return <SignIn />

  return <FinanceApp />
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setLoading(false)
    if (authError) setError(authError.message)
    else setSent(true)
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-sm p-7">
        <p className="text-xs font-bold tracking-[0.18em] text-blue-700 uppercase">Rangels V0.10</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Your finances, clearly.</h1>
        <p className="mt-2 text-sm text-slate-500">Sign in with your email. We’ll send you a secure link.</p>
        <label className="block mt-6 text-xs font-semibold text-slate-600">Email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {sent && <p className="mt-3 text-sm text-emerald-700">Check your inbox for the sign-in link.</p>}
        <button disabled={loading} className="mt-5 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{loading ? 'Sending…' : 'Email me a sign-in link'}</button>
      </form>
    </main>
  )
}

function FinanceApp() {
  const [page, setPage] = useState<Page>('transactions')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [showHelp, setShowHelp] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [now] = useState(() => new Date())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [dateMode, setDateMode] = useState<'month' | 'custom'>('month')
  const [customFrom, setCustomFrom] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  )
  const [customTo, setCustomTo] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  )

  const refreshAccounts = useCallback(() => {
    return api.accounts.list().then(setAccounts).catch(console.error)
  }, [])

  const refreshCategories = useCallback(() => {
    return api.categories.list().then(setCategories).catch(console.error)
  }, [])

  const refreshMembers = useCallback(() => {
    api.members.list().then(setMembers).catch(console.error)
  }, [])

  useEffect(() => {
    refreshAccounts()
    refreshCategories()
    refreshMembers()
  }, [refreshAccounts, refreshCategories, refreshMembers])

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const pageProps = {
    accounts, categories, selectedAccountId, month, year,
    dateMode, customFrom, customTo,
    onRefreshAccounts: refreshAccounts, onRefreshCategories: refreshCategories,
    onMonthChange: setMonth, onYearChange: setYear
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        accounts={accounts}
        members={members}
        selectedAccountId={selectedAccountId}
        onSelectAccount={setSelectedAccountId}
        onRefresh={refreshAccounts}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <TopNav
          page={page} onPageChange={setPage}
          month={month} year={year} onPrev={prevMonth} onNext={nextMonth}
          dateMode={dateMode} onDateModeChange={setDateMode}
          customFrom={customFrom} onCustomFromChange={setCustomFrom}
          customTo={customTo} onCustomToChange={setCustomTo}
          onHelp={() => setShowHelp(true)}
        />
        <main className="flex-1 overflow-hidden">
          {page === 'overview' && <OverviewPage {...pageProps} />}
          {page === 'transactions' && <TransactionsPage {...pageProps} />}
          {page === 'merchants' && <MerchantsPage {...pageProps} />}
          {page === 'categories' && <CategoriesPage {...pageProps} />}
          {page === 'reports' && <ReportsPage {...pageProps} />}
          {page === 'plan' && <PlanPage month={month} year={year} />}
          {page === 'budget' && <BudgetPage {...pageProps} />}
          {page === 'scheduled' && <ScheduledPage {...pageProps} />}
          {page === 'calendar' && <CalendarPage {...pageProps} />}
        </main>
      </div>
      {showHelp && <HelpInfoModal onClose={() => setShowHelp(false)} />}
    </div>
  )
}
