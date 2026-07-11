import { useRef, useState } from 'react'
import type { Category, EventItem, MediaItem, Pin } from '../lib/types'
import { mediaUrl } from '../lib/data'
import { availabilityLines, directionsUrl, eventWhen, peakBadge } from '../lib/format'

interface Props {
  item: { kind: 'pin'; pin: Pin } | { kind: 'event'; event: EventItem }
  category?: Category
  at: Date
  mediaOverrides: Record<string, string>
  isAdmin: boolean
  onClose: () => void
  onEdit?: (pin: Pin) => void
  onSaveDescription?: (pin: Pin, description: string) => Promise<void>
}

/**
 * Click-to-edit description, saved on blur. Keyed by pin id from the parent
 * so switching pins remounts it with fresh state instead of leaking edits.
 */
function EditableDescription({
  pin,
  onSave,
}: {
  pin: Pin
  onSave: (pin: Pin, description: string) => Promise<void>
}) {
  const [value, setValue] = useState(pin.description ?? '')
  const [saved, setSaved] = useState(pin.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const commit = async () => {
    if (value === saved) return
    setBusy(true)
    setError(null)
    try {
      await onSave(pin, value)
      setSaved(value)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="desc-edit">
      <textarea
        ref={taRef}
        className="desc-edit-input"
        rows={2}
        placeholder="Add a description…"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setValue(saved)
            taRef.current?.blur()
          } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            taRef.current?.blur()
          }
        }}
      />
      {busy && <span className="hint desc-edit-status">Saving…</span>}
      {error && <span className="error-text desc-edit-status">{error}</span>}
    </div>
  )
}

function Media({ m, overrides }: { m: MediaItem; overrides: Record<string, string> }) {
  const src = overrides[m.src] ?? mediaUrl(m.src)
  return (
    <figure style={{ margin: 0 }}>
      {m.type === 'video' && <video src={src} controls playsInline preload="metadata" />}
      {m.type === 'audio' && <audio src={src} controls preload="metadata" />}
      {m.type === 'image' && <img src={src} alt={m.caption ?? ''} loading="lazy" />}
      {m.caption && <figcaption className="hint">{m.caption}</figcaption>}
    </figure>
  )
}

export default function DetailSheet({
  item,
  category,
  at,
  mediaOverrides,
  isAdmin,
  onClose,
  onEdit,
  onSaveDescription,
}: Props) {
  const isPin = item.kind === 'pin'
  const name = isPin ? item.pin.name : item.event.title
  const lat = isPin ? item.pin.lat : item.event.lat
  const lng = isPin ? item.pin.lng : item.event.lng
  const badge = isPin
    ? peakBadge(item.pin.availability, at)
    : new Date(item.event.start).getTime() <= at.getTime()
      ? 'Happening now'
      : null

  return (
    <div className="sheet" role="dialog" aria-label={name}>
      <div className="grab" />
      <button className="close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <h2>
        <span>{category?.icon ?? '📍'}</span> {name}
      </h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {category && <span className="cat-tag">{category.name}</span>}
        {badge && <span className="badge-now">⚡ {badge}</span>}
        {!isPin && <span className="cat-tag">via {item.event.source}</span>}
      </div>

      {isPin ? (
        <>
          {isAdmin && onSaveDescription ? (
            <EditableDescription key={item.pin.id} pin={item.pin} onSave={onSaveDescription} />
          ) : (
            item.pin.description && <p className="desc">{item.pin.description}</p>
          )}
          <ul className="avail-lines">
            {availabilityLines(item.pin.availability).map((l, i) => (
              <li key={i}>🕐 {l}</li>
            ))}
          </ul>
          {item.pin.media && item.pin.media.length > 0 && (
            <div className="media-list">
              {item.pin.media.map((m, i) => (
                <Media key={i} m={m} overrides={mediaOverrides} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="desc">
            🗓 {eventWhen(item.event)}
            {item.event.venue && (
              <>
                <br />
                📍 {item.event.venue}
              </>
            )}
          </p>
        </>
      )}

      <div className="actions">
        <a className="btn primary" href={directionsUrl(lat, lng)} target="_blank" rel="noreferrer">
          🧭 Directions
        </a>
        {isPin && item.pin.url && (
          <a className="btn" href={item.pin.url} target="_blank" rel="noreferrer">
            🔗 Website
          </a>
        )}
        {!isPin && item.event.url && (
          <a className="btn" href={item.event.url} target="_blank" rel="noreferrer">
            🔗 Event page
          </a>
        )}
        {isAdmin && isPin && onEdit && (
          <button className="btn" onClick={() => onEdit(item.pin)}>
            ✏️ Edit pin
          </button>
        )}
      </div>
    </div>
  )
}
