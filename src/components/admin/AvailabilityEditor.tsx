import type { Availability, DateRange, HoursRule, PeakRule } from '../../lib/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function ToggleChips({
  options,
  selected,
  onChange,
}: {
  options: string[]
  selected: number[]
  onChange: (next: number[]) => void
}) {
  const toggle = (i: number) =>
    onChange(selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i].sort((a, b) => a - b))
  return (
    <div className="chip-row">
      {options.map((label, i) => (
        <button
          key={label}
          type="button"
          className={`chip ${selected.includes(i) ? 'active' : ''}`}
          onClick={() => toggle(i)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * Edits an Availability object. Empty arrays are normalized away so an
 * unrestricted pin stores no availability at all.
 */
export default function AvailabilityEditor({
  value,
  onChange,
}: {
  value: Availability
  onChange: (next: Availability) => void
}) {
  const set = (patch: Partial<Availability>) => onChange({ ...value, ...patch })

  const hours = value.hours ?? []
  const peaks = value.peakHours ?? []
  const ranges = value.dateRanges ?? []

  const setHour = (i: number, patch: Partial<HoursRule>) =>
    set({ hours: hours.map((h, j) => (j === i ? { ...h, ...patch } : h)) })
  const setPeak = (i: number, patch: Partial<PeakRule>) =>
    set({ peakHours: peaks.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const setRange = (i: number, patch: Partial<DateRange>) =>
    set({ dateRanges: ranges.map((r, j) => (j === i ? { ...r, ...patch } : r)) })

  return (
    <>
      <div className="field">
        <label>Months in season (none = all year)</label>
        <ToggleChips
          options={MONTHS}
          selected={(value.months ?? []).map((m) => m - 1)}
          onChange={(sel) => set({ months: sel.length ? sel.map((i) => i + 1) : undefined })}
        />
      </div>

      <div className="field">
        <label>Days it exists (none = every day)</label>
        <ToggleChips
          options={DAYS}
          selected={value.days ?? []}
          onChange={(sel) => set({ days: sel.length ? sel : undefined })}
        />
      </div>

      <div className="field">
        <label>Opening hours (none = always open)</label>
        {hours.map((h, i) => (
          <div className="rule-row" key={i}>
            <ToggleChips
              options={DAYS}
              selected={h.days ?? []}
              onChange={(sel) => setHour(i, { days: sel.length ? sel : undefined })}
            />
            <div className="times">
              <input type="time" value={h.open} onChange={(e) => setHour(i, { open: e.target.value })} />
              →
              <input type="time" value={h.close} onChange={(e) => setHour(i, { close: e.target.value })} />
            </div>
            <button
              type="button"
              className="remove"
              onClick={() => set({ hours: hours.filter((_, j) => j !== i).length ? hours.filter((_, j) => j !== i) : undefined })}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="add-rule"
          onClick={() => set({ hours: [...hours, { open: '09:00', close: '21:00' }] })}
        >
          + Add hours
        </button>
      </div>

      <div className="field">
        <label>Peak hours (glows on the map)</label>
        {peaks.map((p, i) => (
          <div className="rule-row" key={i}>
            <ToggleChips
              options={DAYS}
              selected={p.days ?? []}
              onChange={(sel) => setPeak(i, { days: sel.length ? sel : undefined })}
            />
            <div className="times">
              <input type="time" value={p.from} onChange={(e) => setPeak(i, { from: e.target.value })} />
              →
              <input type="time" value={p.to} onChange={(e) => setPeak(i, { to: e.target.value })} />
            </div>
            <button
              type="button"
              className="remove"
              onClick={() =>
                set({ peakHours: peaks.filter((_, j) => j !== i).length ? peaks.filter((_, j) => j !== i) : undefined })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="add-rule"
          onClick={() => set({ peakHours: [...peaks, { from: '17:00', to: '20:00' }] })}
        >
          + Add peak window
        </button>
      </div>

      <div className="field">
        <label>Date windows (e.g. a pop-up)</label>
        {ranges.map((r, i) => (
          <div className="rule-row" key={i}>
            <div className="times">
              <input type="date" value={r.start} onChange={(e) => setRange(i, { start: e.target.value })} />
              →
              <input type="date" value={r.end} onChange={(e) => setRange(i, { end: e.target.value })} />
            </div>
            <button
              type="button"
              className="remove"
              onClick={() =>
                set({ dateRanges: ranges.filter((_, j) => j !== i).length ? ranges.filter((_, j) => j !== i) : undefined })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="add-rule"
          onClick={() => set({ dateRanges: [...ranges, { start: '', end: '' }] })}
        >
          + Add date window
        </button>
      </div>
    </>
  )
}
