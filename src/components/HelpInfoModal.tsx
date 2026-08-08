import { ArrowDown, ArrowRight, Building2, CircleHelp, Database, Home, Landmark, Users } from 'lucide-react'
import { Modal } from './Modal'

export function HelpInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How Rangels works" onClose={onClose} wide>
      <div className="mx-auto max-w-6xl space-y-6 text-slate-700">
        <section>
          <p className="text-sm leading-6 text-slate-500">Rangels keeps the bank ledger, who made the transaction, what it was for, and how it affects the financial plan as separate—but connected—facts.</p>
          <div className="mt-4 grid grid-cols-[1fr_42px_1fr_42px_1fr] items-stretch gap-2">
            <MapCard icon={<Users size={18} />} title="Member" body="Anderson, Julia, or Joint" foot="Inherited from the account" />
            <Arrow />
            <MapCard icon={<Landmark size={18} />} title="Account" body="The physical source or target" foot="Owns balances and imports" />
            <Arrow />
            <MapCard icon={<Database size={18} />} title="Transaction" body="Date, description and amount" foot="The ledger remains authoritative" />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-sm font-bold text-slate-900">How a transaction is classified</h3>
          <div className="mt-4 grid grid-cols-[1fr_36px_1fr_36px_1fr_36px_1fr] items-center gap-1">
            <FlowNode title="Description" value="WOOLWORTHS 4430" />
            <Arrow compact />
            <FlowNode title="Purpose" value="Groceries" accent="blue" />
            <Arrow compact />
            <FlowNode title="Context" value="Household" accent="violet" />
            <Arrow compact />
            <FlowNode title="Bucket" value="Daily Expenses" accent="emerald" />
          </div>
          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-400"><span>Account owner: Anderson</span><span>•</span><span>Tax: None</span><span>•</span><span>Reimbursement: None</span></div>
        </section>

        <section className="grid grid-cols-3 gap-4">
          <ContextCard icon={<Home size={17} />} title="Household" examples="Normal shared and individual living activity">
            <p>Household expenses receive a Purpose and a Bucket. The account owner identifies who effectuated the expense.</p>
          </ContextCard>
          <ContextCard icon={<Building2 size={17} />} title="Businesses" examples="ASA · Folium Studio">
            <p>Business revenue and operating costs remain in their business context. They are not forced into Household buckets.</p>
          </ContextCard>
          <ContextCard icon={<Landmark size={17} />} title="Properties" examples="Currumundi · Everton Park · Toogoom">
            <p>Property income and costs remain attached to the relevant property for accurate cash-flow reporting.</p>
          </ContextCard>
        </section>

        <section className="grid grid-cols-[1.1fr_0.9fr] gap-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
            <h3 className="text-sm font-bold text-slate-900">Shared Household allocation</h3>
            <p className="mt-1 text-xs text-slate-500">Eligible Household income is divided by percentage—not by filling one physical account first.</p>
            <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-3 text-center text-sm font-semibold">Eligible Household income</div>
            <div className="flex justify-center py-2"><ArrowDown size={18} className="text-emerald-500" /></div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Allocation name="Daily Expenses" percentage="60%" />
              <Allocation name="Splurge" percentage="10%" detail="Individual allowances" />
              <Allocation name="Smile" percentage="10%" detail="Individual/shared goals" />
              <Allocation name="Fire Extinguisher" percentage="20%" />
            </div>
            <p className="mt-3 text-[11px] text-slate-500">Unused individual allowances roll forward. Owner-authorised allowance movements will be logged when the allocation ledger is implemented.</p>
          </div>

          <div className="space-y-4">
            <InfoBox title="Transfers are not spending">
              <p>Anderson account → Joint account is an internal transfer. It changes where money sits and records Anderson as contributor, but creates neither income nor expense and consumes no Bucket.</p>
            </InfoBox>
            <InfoBox title="Joint is a target owner">
              <p>Joint is intended for shared target accounts. If purchases are imported directly from a Joint account, they remain attributed as Joint unless explicitly corrected.</p>
            </InfoBox>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <div className="flex gap-3"><CircleHelp size={20} className="mt-0.5 shrink-0 text-amber-600" /><div><h3 className="text-sm font-bold text-slate-900">Import intelligence and the temporary Migration page</h3><p className="mt-1 text-xs leading-5 text-slate-600">Imports learn from merchant rules, prior descriptions, corrections, account ownership, and approved mappings. Legacy Alzex categories are retained only as historical evidence. Use <strong>Migration</strong> to give every ambiguous legacy category an approved Purpose, Context, Household Bucket, and Tax decision. Once that queue is complete, legacy categories can disappear from the normal import workflow.</p></div></div>
        </section>

        <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5">
          <h3 className="text-sm font-bold text-slate-900">Logic map: where transactions come from and what they affect</h3>
          <div className="mt-4 grid grid-cols-[1fr_32px_1fr_32px_1.25fr_32px_1fr] items-center gap-1">
            <div className="space-y-2"><MiniNode value="Bank import" /><MiniNode value="Manual entry" /><MiniNode value="Process scheduled item" /></div>
            <Arrow compact />
            <FlowNode title="Authoritative event" value="Transaction" accent="blue" />
            <Arrow compact />
            <div className="space-y-2"><MiniNode value="Member + Account" /><MiniNode value="Purpose + Context" /><MiniNode value="Bucket + Tax + Tags" /></div>
            <Arrow compact />
            <div className="space-y-2"><MiniNode value="Account balance" /><MiniNode value="Budget actual" /><MiniNode value="Allocation actual" /><MiniNode value="Reports & calendar" /></div>
          </div>
          <p className="mt-4 text-[11px] leading-5 text-slate-500">A scheduled item is only a reusable expectation until it is processed. A Budget or Goal never creates a bank transaction by itself. Reports read classified ledger transactions; they do not maintain a second balance.</p>
        </section>

        <section>
          <div className="flex items-end justify-between"><div><h3 className="text-sm font-bold text-slate-900">Concepts and their rules</h3><p className="mt-1 text-xs text-slate-400">Each concept answers one question. Keeping them separate prevents double-counting and misleading reports.</p></div></div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Concept term="Account & owner" question="Where is the money, and who effectuated it?" status="Live">
              An account holds the physical balance. Its owner supplies member attribution. Existing accounts are Anderson’s; future accounts can be Julia’s or Joint. A target account does not change the contributor recorded from the source.
            </Concept>
            <Concept term="Context" question="Which financial area owns the result?" status="Live">
              Household, Business — ASA, Business — Folium Studio, or a named property. Context prevents business and property activity from being mixed into Household performance.
            </Concept>
            <Concept term="Purpose" question="What was the transaction for?" status="Live">
              The reusable economic meaning—Groceries, Software, Insurance, Salary. Purpose replaces the reporting job previously performed by hundreds of legacy category paths.
            </Concept>
            <Concept term="Bucket" question="Which Household allocation did this expense consume?" status="Live">
              Daily Expenses, Splurge, Smile, or Fire Extinguisher. Buckets apply to Household expenses. Income is an allocation source, while ledger transfers consume no Bucket.
            </Concept>
            <Concept term="Allocation plan" question="How should eligible income be divided?" status="Foundation">
              The shared Household target is 60/10/10/20. It is a percentage plan, independent of which physical account holds the money. Target versus actual is shown in Plan.
            </Concept>
            <Concept term="Individual allowance" question="Whose share of a shared Bucket is available?" status="Agreed next">
              Splurge and Smile have Anderson and Julia allowances. Unused value rolls forward. Only the owner can reallocate accumulated value, and every movement must be logged.
            </Concept>
            <Concept term="Goal" question="What future outcome are we funding?" status="Agreed next">
              A Goal is a measurable destination such as Mojo, a holiday, or mortgage reduction. Allocation can fund a Goal; the Goal is not a category, merchant, expense, or physical account.
            </Concept>
            <Concept term="Budget" question="How much may selected spending consume this month?" status="Live">
              A monthly amount attached to one or more category groups. Spending becomes Budget actual when matching transactions occur. A Budget resets by period and does not allocate or move money.
            </Concept>
            <Concept term="Scheduled transaction" question="What recurring ledger event do we expect?" status="Live">
              A dated template with amount, account, category and frequency. “Process Due” creates the actual transaction and advances the next date; only the created transaction affects balances and reports.
            </Concept>
            <Concept term="Merchant rule" question="How should a recurring description be recognized?" status="Live">
              Matching phrases remember classification for future imports and can update matching history. Rules provide evidence; low-confidence or conflicting results still require review.
            </Concept>
            <Concept term="Tax, reimbursement & tags" question="What additional reporting dimensions apply?" status="Live">
              These are independent of Purpose. Tax records treatment, reimbursement records recovery state, and tags capture flexible details without creating duplicate categories.
            </Concept>
            <Concept term="Reports & Calendar" question="What happened over time?" status="Live">
              Both aggregate the same ledger. Income, expenses and net respond to the selected period. Internal transfers are excluded from income and expenses to avoid double-counting.
            </Concept>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">Allocation, Budget and Goal are different</h3>
          <div className="mt-3 grid grid-cols-[150px_1fr_1fr_1fr] overflow-hidden rounded-xl border border-slate-200 text-xs">
            <div className="bg-slate-50 p-3 font-semibold text-slate-500">Concept</div><div className="bg-slate-50 p-3 font-semibold text-slate-500">Allocation</div><div className="bg-slate-50 p-3 font-semibold text-slate-500">Budget</div><div className="bg-slate-50 p-3 font-semibold text-slate-500">Goal</div>
            <TableLabel>Primary question</TableLabel><TableCell>How should income be divided?</TableCell><TableCell>How much may we spend?</TableCell><TableCell>What outcome are we building?</TableCell>
            <TableLabel>Time behaviour</TableLabel><TableCell>Percentage plan; allowance may roll forward</TableCell><TableCell>Period-specific, normally monthly</TableCell><TableCell>Continues until achieved or closed</TableCell>
            <TableLabel>Moves money?</TableLabel><TableCell>No—records intended ownership</TableCell><TableCell>No—measures transactions</TableCell><TableCell>No—receives attributed funding</TableCell>
            <TableLabel>Example</TableLabel><TableCell>10% to Smile</TableCell><TableCell>$800 dining limit</TableCell><TableCell>$15,000 Japan holiday</TableCell>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-slate-900">Quick glossary</h3>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <Glossary term="Purpose" meaning="What the transaction was for: groceries, software, insurance." />
            <Glossary term="Context" meaning="Which financial area it belongs to: Household, business, or property." />
            <Glossary term="Bucket" meaning="Which Household allocation the expense consumes." />
            <Glossary term="Account owner" meaning="Who owns the account and effectuated or contributed the transaction." />
          </div>
        </section>

        <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-[11px] text-slate-400"><span>Rangels V0.7.1 · This guide reflects the current agreed model.</span><span>Ledger first · Import first · No destructive legacy conversion</span></div>
      </div>
    </Modal>
  )
}

function MapCard({ icon, title, body, foot }: { icon: React.ReactNode; title: string; body: string; foot: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-blue-600">{icon}<h3 className="text-sm font-bold text-slate-900">{title}</h3></div><p className="mt-3 text-sm font-medium text-slate-700">{body}</p><p className="mt-1 text-xs text-slate-400">{foot}</p></div>
}

function Arrow({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center justify-center"><ArrowRight size={compact ? 16 : 20} className="text-slate-300" /></div>
}

function FlowNode({ title, value, accent = 'slate' }: { title: string; value: string; accent?: 'slate' | 'blue' | 'violet' | 'emerald' }) {
  const tones = { slate: 'border-slate-200 bg-white', blue: 'border-blue-200 bg-blue-50', violet: 'border-violet-200 bg-violet-50', emerald: 'border-emerald-200 bg-emerald-50' }
  return <div className={`rounded-xl border p-3 text-center ${tones[accent]}`}><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>
}

function ContextCard({ icon, title, examples, children }: { icon: React.ReactNode; title: string; examples: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-slate-700">{icon}<h3 className="text-sm font-bold text-slate-900">{title}</h3></div><p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-blue-500">{examples}</p><div className="mt-2 text-xs leading-5 text-slate-500">{children}</div></div>
}

function Allocation({ name, percentage, detail }: { name: string; percentage: string; detail?: string }) {
  return <div className="rounded-lg border border-emerald-100 bg-white p-2"><p className="text-lg font-bold text-emerald-700">{percentage}</p><p className="text-[11px] font-semibold text-slate-700">{name}</p>{detail && <p className="mt-1 text-[9px] text-slate-400">{detail}</p>}</div>
}

function InfoBox({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-bold text-slate-900">{title}</h3><div className="mt-2 text-xs leading-5 text-slate-500">{children}</div></div>
}

function Glossary({ term, meaning }: { term: string; meaning: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-bold text-slate-800">{term}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{meaning}</p></div>
}

function MiniNode({ value }: { value: string }) {
  return <div className="rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-center text-[11px] font-medium text-slate-600">{value}</div>
}

function Concept({ term, question, status, children }: { term: string; question: string; status: 'Live' | 'Foundation' | 'Agreed next'; children: React.ReactNode }) {
  const tone = status === 'Live' ? 'bg-emerald-50 text-emerald-700' : status === 'Foundation' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><h4 className="text-sm font-bold text-slate-900">{term}</h4><span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${tone}`}>{status}</span></div><p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-blue-500">{question}</p><p className="mt-2 text-xs leading-5 text-slate-500">{children}</p></div>
}

function TableLabel({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-slate-200 bg-slate-50 p-3 font-semibold text-slate-600">{children}</div>
}

function TableCell({ children }: { children: React.ReactNode }) {
  return <div className="border-l border-t border-slate-200 p-3 leading-5 text-slate-500">{children}</div>
}
