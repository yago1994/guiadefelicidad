import type { Category } from '../lib/types'

interface Props {
  categories: Category[]
  /** null = all categories active */
  active: Set<string> | null
  onChange: (next: Set<string> | null) => void
}

export default function FilterBar({ categories, active, onChange }: Props) {
  const toggle = (id: string) => {
    if (active === null) {
      onChange(new Set([id]))
      return
    }
    const next = new Set(active)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next.size === 0 ? null : next)
  }

  return (
    <div className="filterbar">
      <button className={`chip ${active === null ? 'active' : ''}`} onClick={() => onChange(null)}>
        ✨ All
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          className={`chip ${active?.has(c.id) ? 'active' : ''}`}
          style={{ '--chip-color': c.color } as React.CSSProperties}
          onClick={() => toggle(c.id)}
        >
          <span>{c.icon}</span> {c.name}
        </button>
      ))}
    </div>
  )
}
