import { useMemo, useState } from 'react'
import { parseFourColumnBankExport, parseHistoricalExport } from './lib/importers'
import { suggestCategories } from './lib/matching'
import type { HistoricalTransaction, ImportedTransaction } from './types/import'

const currency = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
})

async function readFile(file: File): Promise<string> {
  return file.text()
}

function App() {
  const [history, setHistory] = useState<HistoricalTransaction[]>([])
  const [transactions, setTransactions] = useState<ImportedTransaction[]>([])
  const [historyName, setHistoryName] = useState('')
  const [bankName, setBankName] = useState('')
  const [error, setError] = useState('')

  const suggestedCount = useMemo(
    () => transactions.filter(({ suggestions }) => suggestions.length > 0).length,
    [transactions],
  )
  const confirmedCount = useMemo(
    () => transactions.filter(({ selectedCategory }) => selectedCategory).length,
    [transactions],
  )

  async function loadHistory(file?: File) {
    if (!file) return

    try {
      const parsed = parseHistoricalExport(await readFile(file))
      setHistory(parsed)
      setHistoryName(file.name)
      setTransactions([])
      setBankName('')
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read the file.')
    }
  }

  async function loadBank(file?: File) {
    if (!file) return

    if (history.length === 0) {
      setError('Import the historical finance export first.')
      return
    }

    try {
      const parsed = parseFourColumnBankExport(await readFile(file))
      setTransactions(
        parsed.map((transaction) => ({
          ...transaction,
          suggestions: suggestCategories(transaction.description, history),
        })),
      )
      setBankName(file.name)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read the file.')
    }
  }

  function selectCategory(transactionIndex: number, category: string) {
    setTransactions((current) =>
      current.map((transaction, index) =>
        index === transactionIndex
          ? { ...transaction, selectedCategory: category }
          : transaction,
      ),
    )
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Rangels V0.1 · Import prototype</p>
        <h1>Import transactions</h1>
        <p className="intro">
          Teach Rangels from your existing history, then preview a bank export.
          Files stay in this browser and are not uploaded.
        </p>
      </header>

      <section className="file-grid" aria-label="Import files">
        <label className="file-card">
          <span className="step">1</span>
          <strong>Historical finance export</strong>
          <span className="hint">Used to learn previous category decisions.</span>
          <input
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            onChange={(event) => void loadHistory(event.target.files?.[0])}
          />
          <span className={historyName ? 'file-name ready' : 'file-name'}>
            {historyName || 'Choose historical file'}
          </span>
        </label>

        <label className={`file-card ${history.length === 0 ? 'disabled' : ''}`}>
          <span className="step">2</span>
          <strong>Bank CSV</strong>
          <span className="hint">Currently supports the supplied four-column format.</span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={history.length === 0}
            onChange={(event) => void loadBank(event.target.files?.[0])}
          />
          <span className={bankName ? 'file-name ready' : 'file-name'}>
            {bankName || 'Choose bank file'}
          </span>
        </label>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      {transactions.length > 0 && (
        <section className="results">
          <div className="summary">
            <div>
              <strong>{transactions.length}</strong>
              <span>transactions</span>
            </div>
            <div>
              <strong>{suggestedCount}</strong>
              <span>with suggestions</span>
            </div>
            <div>
              <strong>{confirmedCount}</strong>
              <span>confirmed</span>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Category suggestions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction, index) => (
                  <tr key={`${transaction.date}-${transaction.description}-${index}`}>
                    <td>{transaction.date}</td>
                    <td className="description">{transaction.description}</td>
                    <td className={transaction.amount < 0 ? 'negative amount' : 'positive amount'}>
                      {currency.format(transaction.amount)}
                    </td>
                    <td>
                      <div className="suggestions">
                        {transaction.suggestions.length > 0 ? (
                          transaction.suggestions.map((suggestion) => (
                            <button
                              type="button"
                              key={suggestion.category}
                              className={
                                transaction.selectedCategory === suggestion.category
                                  ? 'selected'
                                  : ''
                              }
                              title={`Matched “${suggestion.matchedDescription}”`}
                              onClick={() => selectCategory(index, suggestion.category)}
                            >
                              {suggestion.category}
                              <small>{Math.round(suggestion.confidence * 100)}%</small>
                            </button>
                          ))
                        ) : (
                          <span className="unmatched">No match</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}

export default App
