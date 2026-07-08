export interface HoursRule {
  /** Weekdays this rule applies to (0=Sun … 6=Sat). Omitted = every day. */
  days?: number[]
  open: string // "HH:MM"
  close: string // "HH:MM" — may be earlier than open, meaning it crosses midnight
}

export interface PeakRule {
  days?: number[]
  from: string
  to: string
}

export interface DateRange {
  start: string // "YYYY-MM-DD" inclusive
  end: string // "YYYY-MM-DD" inclusive
}

export interface RecurrenceRule {
  /** 0=Sun … 6=Sat */
  weekday: number
  /** Which occurrence of that weekday in the month: 1st/2nd/3rd/4th, or -1 for "last". */
  ordinal: 1 | 2 | 3 | 4 | -1
  /** How many days the occurrence spans, starting on the matched day. Default 1. */
  durationDays?: number
}

export interface Availability {
  /** Months (1–12) the pin is in season. Omitted = all year. */
  months?: number[]
  /** Weekdays (0=Sun … 6=Sat) the pin exists at all. Omitted = every day. */
  days?: number[]
  /** Opening hours. Omitted = open all day. */
  hours?: HoursRule[]
  /** Specific date windows (e.g. a pop-up). Omitted = no restriction. */
  dateRanges?: DateRange[]
  /** When the spot is extra alive — rendered as a glowing "peak" marker. */
  peakHours?: PeakRule[]
  /**
   * "Nth weekday of every month" patterns, e.g. Critical Mass = last Friday.
   * Combine with `months` to make it yearly instead of monthly (e.g. "1st
   * Saturday of November" for a once-a-year festival).
   */
  recurrence?: RecurrenceRule[]
}

export interface MediaItem {
  type: 'video' | 'audio' | 'image'
  src: string // path relative to site root, e.g. "media/<pinId>/clip.mp4"
  caption?: string
}

export interface Pin {
  id: string
  name: string
  category: string
  /** Anchor point — for line pins, a representative point on the line. */
  lat: number
  lng: number
  description?: string
  url?: string
  availability?: Availability
  media?: MediaItem[]
  /** When set, the pin is a walkable stretch drawn as a line ([lng, lat] pairs). */
  line?: [number, number][]
  /** Pins imported from the Google Maps list sync. */
  origin?: 'google'
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
}

export interface ExperienceStep {
  pinId: string
  note?: string
}

export interface ExperienceType {
  id: string
  name: string
  color: string
}

export interface Experience {
  id: string
  name: string
  description?: string
  /** References an ExperienceType id — determines the path/marker color. */
  type: string
  steps: ExperienceStep[]
}

export interface EventItem {
  id: string
  title: string
  category: string
  venue?: string
  address?: string
  lat: number
  lng: number
  start: string // ISO datetime
  end?: string
  url?: string
  source: string
}

export interface EventsFile {
  updatedAt: string | null
  events: EventItem[]
}

export interface AppData {
  categories: Category[]
  pins: Pin[]
  experiences: Experience[]
  experienceTypes: ExperienceType[]
  events: EventItem[]
  eventsUpdatedAt: string | null
}

export type TimeScope = 'now' | 'today' | 'week' | 'all'

export type PinState = 'hidden' | 'visible' | 'peak'
