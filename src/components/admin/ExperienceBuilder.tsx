import type { Experience, ExperienceType, Pin } from '../../lib/types'

interface Props {
  draft: Experience
  isNew: boolean
  pins: Map<string, Pin>
  types: ExperienceType[]
  saving: boolean
  onChange: (next: Experience) => void
  onSave: () => Promise<void>
  onDelete?: () => Promise<void>
  onManageTypes: () => void
  onCancel: () => void
}

/**
 * Docked panel (not a modal) so the map stays tappable — tapping pins on the
 * map appends steps while this is open.
 */
export default function ExperienceBuilder({
  draft,
  isNew,
  pins,
  types,
  saving,
  onChange,
  onSave,
  onDelete,
  onManageTypes,
  onCancel,
}: Props) {
  const move = (i: number, dir: -1 | 1) => {
    const steps = [...draft.steps]
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    onChange({ ...draft, steps })
  }

  return (
    <div className="panel" role="dialog" aria-label="Experience builder" style={{ maxHeight: '55vh' }}>
      <h3>{isNew ? '✨ New experience' : `✏️ ${draft.name || 'Experience'}`}</h3>
      <p className="hint" style={{ marginTop: -6 }}>
        Tap pins on the map to add stops in order.
      </p>

      <div className="field">
        <input
          value={draft.name}
          placeholder="Experience name"
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={draft.type} onChange={(e) => onChange({ ...draft, type: e.target.value })} style={{ flex: 1 }}>
          <option value="" disabled>
            Pick a type…
          </option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            flexShrink: 0,
            background: types.find((t) => t.id === draft.type)?.color ?? '#888',
            border: '2px solid rgba(0,0,0,0.15)',
          }}
        />
        <button type="button" className="btn" style={{ minHeight: 34, padding: '6px 10px', flexShrink: 0 }} onClick={onManageTypes}>
          🎭 Types
        </button>
      </div>
      <div className="field">
        <input
          value={draft.description ?? ''}
          placeholder="One-line description (optional)"
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
      </div>

      {draft.steps.map((s, i) => (
        <div className="step-row" key={`${s.pinId}-${i}`}>
          <span className="n">{i + 1}</span>
          <div className="grow">
            <div className="pin-name">{pins.get(s.pinId)?.name ?? s.pinId}</div>
            <input
              value={s.note ?? ''}
              placeholder="Note for this stop…"
              style={{ marginTop: 4, padding: '4px 8px', fontSize: 13 }}
              onChange={(e) =>
                onChange({
                  ...draft,
                  steps: draft.steps.map((st, j) => (j === i ? { ...st, note: e.target.value } : st)),
                })
              }
            />
          </div>
          <button className="mini" onClick={() => move(i, -1)} aria-label="Move up">
            ↑
          </button>
          <button className="mini" onClick={() => move(i, 1)} aria-label="Move down">
            ↓
          </button>
          <button
            className="mini"
            onClick={() => onChange({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}
            aria-label="Remove stop"
          >
            🗑
          </button>
        </div>
      ))}

      <div className="actions">
        <button
          className="btn primary"
          disabled={saving || !draft.name.trim() || !draft.type || draft.steps.length < 2}
          onClick={onSave}
        >
          {saving ? 'Saving…' : 'Save experience'}
        </button>
        <button className="btn" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
        {!isNew && onDelete && (
          <button
            className="btn danger"
            disabled={saving}
            onClick={() => confirm(`Delete "${draft.name}"?`) && onDelete()}
          >
            Delete
          </button>
        )}
      </div>
      {draft.steps.length < 2 && <p className="hint">Add at least two stops to save.</p>}
    </div>
  )
}
