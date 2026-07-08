import type { AppData, Category, EventsFile, Experience, ExperienceType, Pin } from './types'

const base = import.meta.env.BASE_URL

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${base}${path}?v=${Date.now()}`)
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch {
    return fallback
  }
}

export async function loadAppData(): Promise<AppData> {
  const [categories, pins, experiences, experienceTypes, eventsFile] = await Promise.all([
    getJson<Category[]>('data/categories.json', []),
    getJson<Pin[]>('data/pins.json', []),
    getJson<Experience[]>('data/experiences.json', []),
    getJson<ExperienceType[]>('data/experience-types.json', []),
    getJson<EventsFile>('data/events.json', { updatedAt: null, events: [] }),
  ])
  return {
    categories,
    pins,
    experiences,
    experienceTypes,
    events: eventsFile.events,
    eventsUpdatedAt: eventsFile.updatedAt,
  }
}

export function mediaUrl(src: string): string {
  if (src.startsWith('blob:') || src.startsWith('http')) return src
  return `${base}${src}`
}
