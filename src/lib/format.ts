import type { Availability, EventItem } from './types'
import { isPeakAt } from './visibility'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`
}

function listMonths(months: number[]): string {
  const sorted = [...months].sort((a, b) => a - b)
  // render consecutive runs as ranges: [4,5,6] → "Apr–Jun"
  const parts: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (const m of sorted.slice(1).concat(NaN)) {
    if (m === prev + 1) {
      prev = m
      continue
    }
    parts.push(start === prev ? MONTHS[start - 1] : `${MONTHS[start - 1]}–${MONTHS[prev - 1]}`)
    start = prev = m
  }
  return parts.join(', ')
}

/** Human summary lines like "In season Apr–Jun" / "Sun 9 AM – 1 PM". */
export function availabilityLines(av: Availability | undefined): string[] {
  if (!av) return []
  const lines: string[] = []
  if (av.months?.length) lines.push(`In season ${listMonths(av.months)}`)
  if (av.days?.length && !av.hours?.some((h) => h.days?.length)) {
    lines.push(`Only ${av.days.map((d) => DAYS[d]).join(', ')}`)
  }
  for (const h of av.hours ?? []) {
    const days = h.days?.length ? `${h.days.map((d) => DAYS[d]).join(', ')} ` : ''
    lines.push(`${days}${fmtTime(h.open)} – ${fmtTime(h.close)}`)
  }
  for (const r of av.dateRanges ?? []) {
    lines.push(`${r.start} → ${r.end}`)
  }
  return lines
}

export function peakBadge(av: Availability | undefined, at: Date): string | null {
  return isPeakAt(av, at) ? 'Happening now' : null
}

export function eventWhen(ev: EventItem): string {
  const start = new Date(ev.start)
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: start.getMinutes() ? '2-digit' : undefined,
  }
  let s = start.toLocaleString('en-US', opts)
  if (ev.end) {
    const end = new Date(ev.end)
    const sameDay = start.toDateString() === end.toDateString()
    s += sameDay
      ? ` – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: end.getMinutes() ? '2-digit' : undefined })}`
      : ` → ${end.toLocaleString('en-US', { month: 'short', day: 'numeric' })}`
  }
  return s
}

export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}
