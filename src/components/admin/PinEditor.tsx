import { useState } from 'react'
import type { Availability, Category, MediaItem, Pin } from '../../lib/types'
import { slugify } from '../../lib/slug'
import AvailabilityEditor from './AvailabilityEditor'
import MediaUploader from './MediaUploader'

interface Props {
  draft: Pin // for new pins: a stub with lat/lng and empty name
  isNew: boolean
  categories: Category[]
  saving: boolean
  onSave: (pin: Pin) => Promise<void>
  onDelete?: (pin: Pin) => Promise<void>
  onUploadMedia?: (pin: Pin, blob: Blob, filename: string, type: MediaItem['type']) => Promise<Pin>
  onRemoveMedia?: (pin: Pin, index: number) => Promise<Pin>
  onCancel: () => void
}

function cleanAvailability(av: Availability): Availability | undefined {
  const out: Availability = {}
  if (av.months?.length) out.months = av.months
  if (av.days?.length) out.days = av.days
  if (av.hours?.length) out.hours = av.hours
  if (av.peakHours?.length) out.peakHours = av.peakHours
  if (av.dateRanges?.length) out.dateRanges = av.dateRanges.filter((r) => r.start && r.end)
  if (!out.dateRanges?.length) delete out.dateRanges
  return Object.keys(out).length ? out : undefined
}

export default function PinEditor({
  draft,
  isNew,
  categories,
  saving,
  onSave,
  onDelete,
  onUploadMedia,
  onRemoveMedia,
  onCancel,
}: Props) {
  const [pin, setPin] = useState<Pin>({ ...draft })
  const [availability, setAvailability] = useState<Availability>(draft.availability ?? {})
  const [error, setError] = useState<string | null>(null)
  const [mediaBusy, setMediaBusy] = useState(false)

  const set = (patch: Partial<Pin>) => setPin((p) => ({ ...p, ...patch }))

  const save = async () => {
    setError(null)
    if (!pin.name.trim()) {
      setError('Give the pin a name.')
      return
    }
    if (!pin.category) {
      setError('Pick a category.')
      return
    }
    const id = isNew ? slugify(pin.name) || `pin-${Date.now()}` : pin.id
    try {
      await onSave({
        ...pin,
        id,
        name: pin.name.trim(),
        description: pin.description?.trim() || undefined,
        url: pin.url?.trim() || undefined,
        availability: cleanAvailability(availability),
        media: pin.media ?? [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    }
  }

  return (
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-label={isNew ? 'New pin' : 'Edit pin'}>
        <h3>{isNew ? '📍 New pin' : `✏️ ${draft.name}`}</h3>

        <div className="field">
          <label htmlFor="pin-name">Name</label>
          <input id="pin-name" value={pin.name} onChange={(e) => set({ name: e.target.value })} placeholder="Jasmine wall on Berean Ave" />
        </div>

        <div className="field">
          <label htmlFor="pin-cat">Category</label>
          <select id="pin-cat" value={pin.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="" disabled>
              Pick one…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="pin-desc">Description</label>
          <textarea
            id="pin-desc"
            rows={3}
            value={pin.description ?? ''}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Why is this spot special?"
          />
        </div>

        <div className="field">
          <label htmlFor="pin-url">Link (optional)</label>
          <input id="pin-url" value={pin.url ?? ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" />
        </div>

        <p className="hint">
          📍 {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
        </p>

        <AvailabilityEditor value={availability} onChange={setAvailability} />

        {!isNew && onUploadMedia && (
          <>
            {(pin.media ?? []).length > 0 && (
              <div className="field">
                <label>Media on this pin</label>
                {(pin.media ?? []).map((m, i) => (
                  <div key={i} className="step-row">
                    <span>{m.type === 'video' ? '📹' : m.type === 'audio' ? '🎙️' : '🖼️'}</span>
                    <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                      {m.src.split('/').pop()}
                    </span>
                    <button
                      type="button"
                      className="mini"
                      disabled={mediaBusy}
                      onClick={async () => {
                        if (!onRemoveMedia || !confirm('Remove this media from the pin? (The file stays in the repo.)')) return
                        setMediaBusy(true)
                        try {
                          setPin(await onRemoveMedia(pin, i))
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Remove failed.')
                        } finally {
                          setMediaBusy(false)
                        }
                      }}
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
            <MediaUploader
              busy={mediaBusy}
              onUpload={async (blob, filename, type) => {
                setMediaBusy(true)
                try {
                  setPin(await onUploadMedia(pin, blob, filename, type))
                } finally {
                  setMediaBusy(false)
                }
              }}
            />
          </>
        )}
        {isNew && <p className="hint">Save the pin first, then reopen it to add videos or voice notes.</p>}

        {error && <p className="error-text">{error}</p>}

        <div className="actions">
          <button className="btn primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save pin'}
          </button>
          <button className="btn" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          {!isNew && onDelete && (
            <button
              className="btn danger"
              disabled={saving}
              onClick={async () => {
                if (!confirm(`Delete "${draft.name}"? This removes it from the map.`)) return
                try {
                  await onDelete(draft)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Delete failed.')
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
