import type { TimeScope } from '../lib/types'

const SCOPES: { id: TimeScope; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All' },
]

export default function TimeScopeBar({
  scope,
  onChange,
}: {
  scope: TimeScope
  onChange: (s: TimeScope) => void
}) {
  return (
    <div className="scopebar" role="tablist" aria-label="Time scope">
      {SCOPES.map((s) => (
        <button
          key={s.id}
          role="tab"
          aria-selected={scope === s.id}
          className={scope === s.id ? 'active' : ''}
          onClick={() => onChange(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
