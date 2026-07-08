import type { Availability, DateRange, HoursRule, PeakRule, RecurrenceRule } from '../../lib/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ORDINALS: { value: RecurrenceRule['ordinal']; label: string }[] = [
  { value: 1, label: '1st' },
  { value: 2, label: '2nd' },
  { value: 3, label: '3rd' },
  { value: 4, label: '4th' },
  { value: -1, label: 'Last' },
]

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
  const recurrence = value.recurrence ?? []

  const setHour = (i: number, patch: Partial<HoursRule>) =>
    set({ hours: hours.map((h, j) => (j === i ? { ...h, ...patch } : h)) })
  const setPeak = (i: number, patch: Partial<PeakRule>) =>
    set({ peakHours: peaks.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const setRange = (i: number, patch: Partial<DateRange>) =>
    set({ dateRanges: ranges.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  const setRecurrence = (i: number, patch: Partial<RecurrenceRule>) =>
    set({ recurrence: recurrence.map((r, j) => (j === i ? { ...r, ...patch } : r)) })

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
        <label>Recurring pattern (e.g. "last Friday of the month")</label>
        {recurrence.map((r, i) => (
          <div className="rule-row" key={i}>
            <div className="times">
              <select value={r.ordinal} onChange={(e) => setRecurrence(i, { ordinal: Number(e.target.value) as RecurrenceRule['ordinal'] })}>
                {ORDINALS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select value={r.weekday} onChange={(e) => setRecurrence(i, { weekday: Number(e.target.value) })}>
                {DAYS.map((d, idx) => (
                  <option key={d} value={idx}>
                    {d}
                  </option>
                ))}
              </select>
              <span>of the month</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
              Spans
              <input
                type="number"
                min={1}
                max={10}
                style={{ width: 56 }}
                value={r.durationDays ?? 1}
                onChange={(e) => setRecurrence(i, { durationDays: Math.max(1, Number(e.target.value) || 1) })}
              />
              day(s)
            </label>
            <button
              type="button"
              className="remove"
              onClick={() =>
                set({ recurrence: recurrence.filter((_, j) => j !== i).length ? recurrence.filter((_, j) => j !== i) : undefined })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="add-rule"
          onClick={() => set({ recurrence: [...recurrence, { weekday: 5, ordinal: -1 }] })}
        >
          + Add recurring pattern
        </button>
        <p className="hint" style={{ marginTop: 4 }}>
          Combine with "Months in season" above to make it yearly instead of monthly — e.g. pick November + "1st
          Saturday" for a once-a-year festival.
        </p>
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
