import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  large?: boolean
  wide?: boolean
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  maximizable?: boolean
}

export function Modal({ title, onClose, children, large, wide, closeOnBackdrop = true, closeOnEscape = true, maximizable = false }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && closeOnEscape) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, closeOnEscape])

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (closeOnBackdrop && e.target === overlayRef.current) onClose() }}
    >
      <div className={`bg-white shadow-2xl flex flex-col transition-[width,height] ${maximized ? 'w-[calc(100vw-16px)] h-[calc(100vh-16px)] max-h-none rounded-lg' : `max-h-[94vh] rounded-xl ${wide ? 'w-[min(96vw,1500px)]' : large ? 'w-[min(92vw,720px)]' : 'w-[min(92vw,420px)]'}`}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <div className="flex items-center gap-1">
            {maximizable && <button onClick={() => setMaximized(value => !value)} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-md hover:bg-gray-100" title={maximized ? 'Restore window' : 'Maximize window'}>{maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-md hover:bg-gray-100"><X size={16} /></button>
          </div>
        </div>
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
      </div>
    </div>
  )
}
