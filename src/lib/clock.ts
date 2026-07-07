/**
 * Current time, overridable with ?t=2026-04-15T18:30 in the URL for testing
 * seasonal/hourly visibility without waiting for the real clock.
 */
export function now(): Date {
  const t = new URLSearchParams(window.location.search).get('t')
  if (t) {
    const d = new Date(t)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}
