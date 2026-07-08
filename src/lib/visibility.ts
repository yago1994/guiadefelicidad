import type { Availability, EventItem, Pin, PinState, RecurrenceRule, TimeScope } from './types'

const DAY_MS = 24 * 60 * 60 * 1000
/** Events with no end time are assumed to last this long. */
const DEFAULT_EVENT_HOURS = 3
/** In "now" scope, events starting within this window already show. */
const SOON_HOURS = 2

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Normalizes a (year, month) pair after adding `delta` months, handling year rollover. */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 }
}

/** The date of the Nth (or, for ordinal -1, last) `weekday` in `year`/`month` (0-indexed). */
export function nthWeekdayOfMonth(year: number, month: number, weekday: number, ordinal: number): Date {
  if (ordinal > 0) {
    const first = new Date(year, month, 1)
    const offset = (weekday - first.getDay() + 7) % 7
    return new Date(year, month, 1 + offset + (ordinal - 1) * 7)
  }
  const lastDay = daysInMonth(year, month)
  const last = new Date(year, month, lastDay)
  const offset = (last.getDay() - weekday + 7) % 7
  return new Date(year, month, lastDay - offset)
}

function atMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Does `day` fall within this rule's window? Checks the rule's anchor for
 * both `day`'s month and the previous month, so a multi-day span starting
 * near a month boundary (e.g. "last Friday", duration 3) is still caught
 * when `day` lands in the following month.
 */
function inRecurrenceWindow(rule: RecurrenceRule, day: Date): boolean {
  const duration = rule.durationDays ?? 1
  const dayTime = atMidnight(day)
  for (const delta of [0, -1]) {
    const { year, month } = shiftMonth(day.getFullYear(), day.getMonth(), delta)
    const anchor = atMidnight(nthWeekdayOfMonth(year, month, rule.weekday, rule.ordinal))
    if (dayTime >= anchor && dayTime <= anchor + (duration - 1) * DAY_MS) return true
  }
  return false
}

export function matchesRecurrence(rules: RecurrenceRule[] | undefined, day: Date): boolean {
  if (!rules?.length) return true
  return rules.some((r) => inRecurrenceWindow(r, day))
}

/** Month / weekday / date-range / recurrence checks — "does this pin exist on this calendar day?" */
export function existsOnDay(av: Availability | undefined, day: Date): boolean {
  if (!av) return true
  if (av.months?.length && !av.months.includes(day.getMonth() + 1)) return false
  if (av.days?.length && !av.days.includes(day.getDay())) return false
  if (av.dateRanges?.length) {
    const key = dateKey(day)
    if (!av.dateRanges.some((r) => r.start <= key && key <= r.end)) return false
  }
  if (!matchesRecurrence(av.recurrence, day)) return false
  return true
}

interface TimeRule {
  days?: number[]
  from: string
  to: string
}

/**
 * Is `at` inside any of the rules? Rules whose end is <= start cross midnight
 * (e.g. 20:00–02:00): they match from `from` on their listed day through to
 * `to` on the following morning.
 */
function inTimeRules(rules: TimeRule[], at: Date): boolean {
  const t = minutesOfDay(at)
  const day = at.getDay()
  const prevDay = (day + 6) % 7
  return rules.some((r) => {
    const from = toMinutes(r.from)
    const to = toMinutes(r.to)
    const appliesTo = (d: number) => !r.days?.length || r.days.includes(d)
    if (from < to) return appliesTo(day) && t >= from && t < to
    // crosses midnight: evening part belongs to the rule's day,
    // morning part belongs to the previous day's rule
    return (appliesTo(day) && t >= from) || (appliesTo(prevDay) && t < to)
  })
}

export function isOpenAt(av: Availability | undefined, at: Date): boolean {
  if (!av?.hours?.length) return true
  return inTimeRules(
    av.hours.map((h) => ({ days: h.days, from: h.open, to: h.close })),
    at,
  )
}

export function isPeakAt(av: Availability | undefined, at: Date): boolean {
  if (!av?.peakHours?.length) return false
  return inTimeRules(av.peakHours, at)
}

/**
 * Core contextual-visibility decision for admin pins.
 * - now:   exists today AND currently open; peak if inside peakHours
 * - today: exists today (hour of day ignored)
 * - week:  exists on any of the next 7 days
 * - all:   always visible (callers may dim pins whose "now" state is hidden)
 */
export function pinState(pin: Pin, at: Date, scope: TimeScope): PinState {
  const av = pin.availability
  switch (scope) {
    case 'now': {
      if (!existsOnDay(av, at)) {
        // an open-past-midnight pin from yesterday still counts early morning
        const yesterday = new Date(at.getTime() - DAY_MS)
        if (!(existsOnDay(av, yesterday) && crossesIntoMorning(av, at))) return 'hidden'
      } else if (!isOpenAt(av, at)) {
        return 'hidden'
      }
      return isPeakAt(av, at) ? 'peak' : 'visible'
    }
    case 'today':
      return existsOnDay(av, at) ? 'visible' : 'hidden'
    case 'week': {
      for (let i = 0; i < 7; i++) {
        if (existsOnDay(av, new Date(at.getTime() + i * DAY_MS))) return 'visible'
      }
      return 'hidden'
    }
    case 'all':
      return 'visible'
  }
}

/** True when `at` falls in the early-morning tail of an hours rule that crossed midnight. */
function crossesIntoMorning(av: Availability | undefined, at: Date): boolean {
  if (!av?.hours?.length) return false
  const t = minutesOfDay(at)
  const prevDay = (at.getDay() + 6) % 7
  return av.hours.some((h) => {
    const open = toMinutes(h.open)
    const close = toMinutes(h.close)
    const appliesPrev = !h.days?.length || h.days.includes(prevDay)
    return close <= open && appliesPrev && t < close
  })
}

function eventEnd(ev: EventItem): Date {
  if (ev.end) return new Date(ev.end)
  return new Date(new Date(ev.start).getTime() + DEFAULT_EVENT_HOURS * 3600 * 1000)
}

/**
 * Visibility for scraped events.
 * - now:   ongoing → peak; starting within 2h → visible
 * - today: starts today or is ongoing today
 * - week:  starts (or is ongoing) within the next 7 days
 * - all:   anything not already over
 */
export function eventState(ev: EventItem, at: Date, scope: TimeScope): PinState {
  const start = new Date(ev.start)
  const end = eventEnd(ev)
  if (end.getTime() < at.getTime()) return 'hidden'
  switch (scope) {
    case 'now': {
      if (start.getTime() <= at.getTime()) return 'peak' // happening right now
      if (start.getTime() - at.getTime() <= SOON_HOURS * 3600 * 1000) return 'visible'
      return 'hidden'
    }
    case 'today':
      return start.getTime() < at.getTime() + DAY_MS && dateKey(start) === dateKey(at)
        ? 'visible'
        : start.getTime() <= at.getTime()
          ? 'visible' // ongoing multi-day event
          : 'hidden'
    case 'week':
      return start.getTime() <= at.getTime() + 7 * DAY_MS ? 'visible' : 'hidden'
    case 'all':
      return 'visible'
  }
}
