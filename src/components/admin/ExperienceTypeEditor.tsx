import { useState } from 'react'
import type { ExperienceType } from '../../lib/types'
import { slugify } from '../../lib/slug'

interface Props {
  types: ExperienceType[]
  saving: boolean
  onSave: (next: ExperienceType[]) => Promise<void>
  onClose: () => void
}

export default function ExperienceTypeEditor({ types, saving, onSave, onClose }: Props) {
  const [list, setList] = useState<ExperienceType[]>(types.map((t) => ({ ...t })))
  const [error, setError] = useState<string | null>(null)

  const update = (i: number, patch: Partial<ExperienceType>) =>
    setList((l) => l.map((t, j) => (j === i ? { ...t, ...patch } : t)))

  const save = async () => {
    setError(null)
    const cleaned = list
      .map((t) => ({ ...t, name: t.name.trim() }))
      .filter((t) => t.name)
      .map((t) => ({ ...t, id: t.id || slugify(t.name) }))
    if (cleaned.length === 0) {
      setError('Add at least one type.')
      return
    }
    try {
      await onSave(cleaned)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    }
  }

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Experience types">
        <h3>🎭 Experience types</h3>
        <p className="hint" style={{ marginTop: -6 }}>
          Group experiences by kind — the color shows on the map path and in the experience list.
        </p>
        {list.map((t, i) => (
          <div className="cat-row" key={i}>
            <input
              type="color"
              value={t.color}
              onChange={(e) => update(i, { color: e.target.value })}
              aria-label="Color"
            />
            <input value={t.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Name" placeholder="Name" />
            <button
              className="mini btn"
              style={{ minHeight: 32 }}
              onClick={() => setList((l) => l.filter((_, j) => j !== i))}
              aria-label="Remove type"
            >
              🗑
            </button>
          </div>
        ))}
        <button className="add-rule" onClick={() => setList((l) => [...l, { id: '', name: '', color: '#7c4dff' }])}>
          + Add type
        </button>
        <p className="hint">
          Deleting a type in use falls back to the first remaining type for its experiences — reassign them from the
          experience editor if needed.
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save types'}
          </button>
          <button className="btn" disabled={saving} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
