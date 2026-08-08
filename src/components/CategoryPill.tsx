interface Props {
  name: string | null
  color: string | null
  size?: 'sm' | 'xs'
  maxWidth?: number
}

export function CategoryPill({ name, color, size = 'sm', maxWidth }: Props) {
  if (!name || /^\?+$/.test(name.trim())) return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 max-w-full truncate">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
      Needs category
    </span>
  )

  const bg = color ? hexToRgba(color, 0.12) : '#f3f4f6'
  const text = color ?? '#374151'
  const border = color ? hexToRgba(color, 0.25) : '#e5e7eb'

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium truncate ${size === 'xs' ? 'text-[10px]' : 'text-xs'}`}
      style={{ backgroundColor: bg, color: text, border: `1px solid ${border}`, maxWidth: maxWidth ?? '100%' }}
      title={name}
    >
      <span className="truncate">{name}</span>
    </span>
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
