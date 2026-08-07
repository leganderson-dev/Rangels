import { useState } from 'react'
import { Database } from 'lucide-react'
import { api } from '../api'

interface Props {
  onDone: () => void
}

export function ImportAlzexButton({ onDone }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleImport() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.import.alzex()
      if (res) {
        setResult(res)
        onDone()
        setTimeout(() => setResult(null), 4000)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The Alzex import failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleImport}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        title="Import from Alzex CSV export"
      >
        <Database size={14} />
        {loading ? 'Importing…' : 'Import Alzex'}
      </button>
      {result && (
        <div className="absolute top-full right-0 mt-1 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 whitespace-nowrap z-10">
          ✓ {result.imported} imported, {result.skipped} skipped
        </div>
      )}
      {error && (
        <div className="absolute top-full right-0 mt-1 max-w-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 z-20">
          Import failed: {error}
        </div>
      )}
    </div>
  )
}
