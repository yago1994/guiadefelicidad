import type { Experience, Pin } from '../lib/types'
import { directionsUrl } from '../lib/format'

export function ExperienceList({
  experiences,
  isAdmin,
  onSelect,
  onEdit,
  onClose,
}: {
  experiences: Experience[]
  isAdmin: boolean
  onSelect: (id: string) => void
  onEdit?: (exp: Experience) => void
  onClose: () => void
}) {
  return (
    <div className="panel" role="dialog" aria-label="Experiences">
      <h3>✨ Experiences</h3>
      {experiences.length === 0 && <p className="hint">No experiences yet.</p>}
      {experiences.map((e) => (
        <div key={e.id} style={{ position: 'relative' }}>
          <button
            className="exp-item"
            style={{ '--exp-color': e.color } as React.CSSProperties}
            onClick={() => onSelect(e.id)}
          >
            <div className="name">{e.name}</div>
            <div className="meta">
              {e.steps.length} stops{e.description ? ` · ${e.description}` : ''}
            </div>
          </button>
          {isAdmin && onEdit && (
            <button
              className="btn"
              style={{ position: 'absolute', top: 10, right: 10, minHeight: 32, padding: '4px 10px' }}
              onClick={() => onEdit(e)}
            >
              ✏️
            </button>
          )}
        </div>
      ))}
      <div className="actions">
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

export function FollowBar({
  experience,
  pins,
  step,
  onStep,
  onExit,
}: {
  experience: Experience
  pins: Map<string, Pin>
  step: number
  onStep: (n: number) => void
  onExit: () => void
}) {
  const current = experience.steps[step]
  const pin = current ? pins.get(current.pinId) : undefined
  return (
    <div className="follow-bar" style={{ borderTop: `3px solid ${experience.color}` }}>
      <div className="step-title">
        <span style={{ color: experience.color }}>
          {step + 1}/{experience.steps.length}
        </span>
        {pin?.name ?? current?.pinId ?? '—'}
      </div>
      {current?.note && <div className="note">{current.note}</div>}
      <div className="row">
        <button className="btn" disabled={step === 0} onClick={() => onStep(step - 1)}>
          ← Prev
        </button>
        {pin && (
          <a className="btn primary" href={directionsUrl(pin.lat, pin.lng)} target="_blank" rel="noreferrer">
            🧭 Go
          </a>
        )}
        <button
          className="btn"
          disabled={step >= experience.steps.length - 1}
          onClick={() => onStep(step + 1)}
        >
          Next →
        </button>
        <button className="btn" onClick={onExit} aria-label="Exit experience">
          ✕
        </button>
      </div>
    </div>
  )
}
