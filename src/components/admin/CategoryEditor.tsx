import { useState } from 'react'
import type { Category } from '../../lib/types'
import { slugify } from '../../lib/slug'

interface Props {
  categories: Category[]
  saving: boolean
  onSave: (next: Category[]) => Promise<void>
  onClose: () => void
}

export default function CategoryEditor({ categories, saving, onSave, onClose }: Props) {
  const [list, setList] = useState<Category[]>(categories.map((c) => ({ ...c })))
  const [error, setError] = useState<string | null>(null)

  const update = (i: number, patch: Partial<Category>) =>
    setList((l) => l.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  const save = async () => {
    setError(null)
    const cleaned = list
      .map((c) => ({ ...c, name: c.name.trim(), icon: c.icon.trim() || '📍' }))
      .filter((c) => c.name)
      .map((c) => ({ ...c, id: c.id || slugify(c.name) }))
    try {
      await onSave(cleaned)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    }
  }

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Categories">
        <h3>🏷️ Categories</h3>
        {list.map((c, i) => (
          <div className="cat-row" key={i}>
            <input
              className="icon-input"
              value={c.icon}
              onChange={(e) => update(i, { icon: e.target.value })}
              aria-label="Icon"
            />
            <input value={c.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Name" placeholder="Name" />
            <input
              type="color"
              value={c.color}
              onChange={(e) => update(i, { color: e.target.value })}
              aria-label="Color"
            />
            <button
              className="mini btn"
              style={{ minHeight: 32 }}
              onClick={() => setList((l) => l.filter((_, j) => j !== i))}
              aria-label="Remove category"
            >
              🗑
            </button>
          </div>
        ))}
        <button className="add-rule" onClick={() => setList((l) => [...l, { id: '', name: '', icon: '📍', color: '#90a4ae' }])}>
          + Add category
        </button>
        <p className="hint">Deleting a category doesn't delete its pins — they'll show with a generic icon until recategorized.</p>
        {error && <p className="error-text">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save categories'}
          </button>
          <button className="btn" disabled={saving} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
