import { describe, expect, it } from 'vitest'
import { categoryFromOsm, parseOpeningHours } from './geosearch'

describe('parseOpeningHours', () => {
  it('parses a simple weekday range', () => {
    expect(parseOpeningHours('Mo-Fr 08:00-17:00')).toEqual([{ days: [1, 2, 3, 4, 5], open: '08:00', close: '17:00' }])
  })

  it('parses multiple rules and day lists', () => {
    expect(parseOpeningHours('Mo-Fr 08:00-17:00; Sa,Su 09:00-14:00')).toEqual([
      { days: [1, 2, 3, 4, 5], open: '08:00', close: '17:00' },
      { days: [0, 6], open: '09:00', close: '14:00' },
    ])
  })

  it('parses multiple time spans in one rule', () => {
    expect(parseOpeningHours('Tu-Su 11:00-14:30,17:00-22:00')).toEqual([
      { days: [0, 2, 3, 4, 5, 6], open: '11:00', close: '14:30' },
      { days: [0, 2, 3, 4, 5, 6], open: '17:00', close: '22:00' },
    ])
  })

  it('treats 24/7 and every-day rules as unrestricted', () => {
    expect(parseOpeningHours('24/7')).toBeUndefined()
    expect(parseOpeningHours('Mo-Su 00:00-24:00')).toEqual([{ open: '00:00', close: '23:59' }])
  })

  it('skips rules it cannot read instead of guessing', () => {
    expect(parseOpeningHours('Mo-Fr 08:00-17:00; PH off')).toEqual([
      { days: [1, 2, 3, 4, 5], open: '08:00', close: '17:00' },
    ])
    expect(parseOpeningHours('sunrise-sunset')).toBeUndefined()
  })

  it('handles wrap-around day ranges', () => {
    expect(parseOpeningHours('Fr-Mo 10:00-16:00')).toEqual([{ days: [0, 1, 5, 6], open: '10:00', close: '16:00' }])
  })
})

describe('categoryFromOsm', () => {
  it('maps common OSM types', () => {
    expect(categoryFromOsm('amenity', 'cafe')).toBe('coffee')
    expect(categoryFromOsm('amenity', 'restaurant')).toBe('food')
    expect(categoryFromOsm('leisure', 'park')).toBe('park')
    expect(categoryFromOsm('tourism', 'museum')).toBe('art')
    expect(categoryFromOsm('office', 'company')).toBe('other')
  })
})
