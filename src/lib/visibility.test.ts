import { describe, expect, it } from 'vitest'
import { eventState, pinState } from './visibility'
import type { EventItem, Pin } from './types'

function pin(availability?: Pin['availability']): Pin {
  return { id: 'p', name: 'P', category: 'other', lat: 0, lng: 0, availability }
}

// 2026-06-06 is a Saturday; 2026-06-08 is a Monday
const satAfternoon = new Date('2026-06-06T15:00:00')
const satNight = new Date('2026-06-06T23:30:00')
const monMorning = new Date('2026-06-08T09:00:00')
const january = new Date('2026-01-10T15:00:00')

describe('pinState — now scope', () => {
  it('shows unrestricted pins', () => {
    expect(pinState(pin(), satAfternoon, 'now')).toBe('visible')
  })

  it('hides out-of-season pins and shows in-season ones', () => {
    const jasmine = pin({ months: [4, 5, 6] })
    expect(pinState(jasmine, satAfternoon, 'now')).toBe('visible')
    expect(pinState(jasmine, january, 'now')).toBe('hidden')
  })

  it('respects opening hours', () => {
    const p = pin({ hours: [{ open: '11:00', close: '21:00' }] })
    expect(pinState(p, satAfternoon, 'now')).toBe('visible')
    expect(pinState(p, satNight, 'now')).toBe('hidden')
  })

  it('handles hours that cross midnight', () => {
    // Sat 20:00 – Sun 02:00
    const bar = pin({ hours: [{ days: [6], open: '20:00', close: '02:00' }] })
    expect(pinState(bar, satNight, 'now')).toBe('visible')
    expect(pinState(bar, new Date('2026-06-07T01:30:00'), 'now')).toBe('visible') // Sun 1:30am
    expect(pinState(bar, new Date('2026-06-07T03:00:00'), 'now')).toBe('hidden')
    expect(pinState(bar, satAfternoon, 'now')).toBe('hidden')
  })

  it('weekday-only pins (Sunday market)', () => {
    const market = pin({ days: [0], hours: [{ open: '09:00', close: '13:00' }] })
    expect(pinState(market, new Date('2026-06-07T10:00:00'), 'now')).toBe('visible')
    expect(pinState(market, new Date('2026-06-07T14:00:00'), 'now')).toBe('hidden')
    expect(pinState(market, satAfternoon, 'now')).toBe('hidden')
  })

  it('peak hours upgrade to peak', () => {
    const p = pin({ peakHours: [{ days: [6], from: '12:00', to: '18:00' }] })
    expect(pinState(p, satAfternoon, 'now')).toBe('peak')
    expect(pinState(p, monMorning, 'now')).toBe('visible')
  })

  it('date ranges gate visibility', () => {
    const popup = pin({ dateRanges: [{ start: '2026-06-01', end: '2026-06-07' }] })
    expect(pinState(popup, satAfternoon, 'now')).toBe('visible')
    expect(pinState(popup, monMorning, 'now')).toBe('hidden')
  })
})

describe('pinState — today / week / all scopes', () => {
  it('today ignores hour of day but keeps seasonality', () => {
    const market = pin({ days: [0], hours: [{ open: '09:00', close: '13:00' }] })
    expect(pinState(market, new Date('2026-06-07T22:00:00'), 'today')).toBe('visible')
    expect(pinState(market, satAfternoon, 'today')).toBe('hidden')
  })

  it('week shows anything available in the next 7 days', () => {
    const market = pin({ days: [0] })
    expect(pinState(market, monMorning, 'week')).toBe('visible')
    const jasmine = pin({ months: [4, 5, 6] })
    expect(pinState(jasmine, january, 'week')).toBe('hidden')
    // June 28 (Sun) → July window crosses month boundary
    const july = pin({ months: [7] })
    expect(pinState(july, new Date('2026-06-28T12:00:00'), 'week')).toBe('visible')
  })

  it('all shows everything', () => {
    expect(pinState(pin({ months: [4] }), january, 'all')).toBe('visible')
  })
})

describe('eventState', () => {
  const ev = (start: string, end?: string): EventItem => ({
    id: 'e',
    title: 'E',
    category: 'music',
    lat: 0,
    lng: 0,
    start,
    end,
    source: 'test',
  })

  it('ongoing events are peak in now scope', () => {
    expect(eventState(ev('2026-06-06T14:00:00', '2026-06-06T17:00:00'), satAfternoon, 'now')).toBe('peak')
  })

  it('events starting within 2h are visible in now scope', () => {
    expect(eventState(ev('2026-06-06T16:30:00'), satAfternoon, 'now')).toBe('visible')
    expect(eventState(ev('2026-06-06T19:00:00'), satAfternoon, 'now')).toBe('hidden')
  })

  it('past events are always hidden', () => {
    expect(eventState(ev('2026-06-05T10:00:00', '2026-06-05T12:00:00'), satAfternoon, 'all')).toBe('hidden')
  })

  it('today scope shows events later today but not tomorrow', () => {
    expect(eventState(ev('2026-06-06T20:00:00'), satAfternoon, 'today')).toBe('visible')
    expect(eventState(ev('2026-06-07T20:00:00'), satAfternoon, 'today')).toBe('hidden')
  })

  it('week scope shows the next 7 days only', () => {
    expect(eventState(ev('2026-06-10T20:00:00'), satAfternoon, 'week')).toBe('visible')
    expect(eventState(ev('2026-06-20T20:00:00'), satAfternoon, 'week')).toBe('hidden')
  })
})
