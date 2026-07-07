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

export default function DetailSheet({ item, category, at, mediaOverrides, isAdmin, onClose, onEdit }: Props) {
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
          {item.pin.description && <p className="desc">{item.pin.description}</p>}
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
