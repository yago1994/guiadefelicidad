import type { HoursRule } from './types'

/**
 * Free place search on OpenStreetMap data via Photon (no API key, CORS-open),
 * with best-effort detail enrichment (opening hours, website) from Overpass.
 */

export interface SearchResult {
  name: string
  lat: number
  lng: number
  address?: string
  category: string
  osmType?: 'N' | 'W' | 'R'
  osmId?: number
}

// generous Georgia-ish box — this is an Atlanta map
const BBOX = { latMin: 33.0, latMax: 34.8, lngMin: -85.6, lngMax: -82.8 }

export function categoryFromOsm(key?: string, value?: string): string {
  const v = `${key}=${value}`
  if (/amenity=(cafe|ice_cream)|shop=(bakery|coffee|tea)/.test(v)) return 'coffee'
  if (/amenity=(restaurant|fast_food|bar|pub|food_court|biergarten)/.test(v)) return 'food'
  if (/leisure=(park|garden|nature_reserve)|boundary=(national_park|protected_area)|natural=|landuse=recreation_ground/.test(v))
    return 'park'
  if (/shop=florist/.test(v)) return 'flowers'
  if (/tourism=(museum|gallery|artwork|attraction)|amenity=(theatre|cinema|arts_centre)|historic=/.test(v)) return 'art'
  if (/amenity=nightclub|amenity=music_venue|shop=music/.test(v)) return 'music'
  if (/amenity=marketplace/.test(v)) return 'market'
  if (/railway=(station|halt|tram_stop)|public_transport=|amenity=bus_station|highway=bus_stop|aerialway=station/.test(v))
    return 'transit'
  if (/leisure=(fitness_centre|sports_centre|pitch|stadium|track|swimming_pool)|sport=|route=/.test(v)) return 'active'
  if (/shop=/.test(v)) return 'market'
  return 'other'
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=33.762&lon=-84.39&limit=10&lang=en`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const json = await res.json()
  const results: SearchResult[] = []
  for (const f of json.features ?? []) {
    const p = f.properties ?? {}
    const [lng, lat] = f.geometry?.coordinates ?? []
    if (typeof lat !== 'number' || typeof lng !== 'number' || !p.name) continue
    if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax) continue
    const address = [
      [p.housenumber, p.street].filter(Boolean).join(' '),
      p.district,
      p.city,
    ]
      .filter(Boolean)
      .join(', ')
    results.push({
      name: p.name,
      lat,
      lng,
      address: address || undefined,
      category: categoryFromOsm(p.osm_key, p.osm_value),
      osmType: p.osm_type,
      osmId: p.osm_id,
    })
  }
  return results.slice(0, 6)
}

export async function fetchOsmDetails(
  osmType: 'N' | 'W' | 'R',
  osmId: number,
): Promise<{ openingHours?: string; website?: string }> {
  const type = { N: 'node', W: 'way', R: 'relation' }[osmType]
  const q = `[out:json][timeout:5];${type}(${osmId});out tags;`
  const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, {
    signal: AbortSignal.timeout(6_000),
  })
  if (!res.ok) return {}
  const json = await res.json()
  const tags = json.elements?.[0]?.tags ?? {}
  return {
    openingHours: typeof tags.opening_hours === 'string' ? tags.opening_hours : undefined,
    website: tags.website || tags['contact:website'] || undefined,
  }
}

const DAY_IDX: Record<string, number> = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 }

function padTime(t: string): string {
  const [h, m] = t.split(':')
  const hh = String(Math.min(Number(h), 23)).padStart(2, '0')
  const mm = Number(h) >= 24 ? '59' : m
  return `${hh}:${mm}`
}

/**
 * Lenient parser for common OSM opening_hours values into our HoursRule shape.
 * Handles "Mo-Fr 08:00-17:00; Sa,Su 09:00-14:00", multiple time ranges, and
 * "24/7" (→ undefined = always open). Rules it can't read are skipped rather
 * than guessed — the admin can always fix hours in the editor.
 */
export function parseOpeningHours(oh: string): HoursRule[] | undefined {
  if (!oh) return undefined
  if (/24\s*\/\s*7/.test(oh)) return undefined
  const rules: HoursRule[] = []
  for (const part of oh.split(';')) {
    const rule = part.trim()
    if (!rule || /\b(off|closed)\b/i.test(rule) || /^(PH|SH)/.test(rule)) continue
    const m = rule.match(/^([A-Za-z,\- ]*?)\s*((?:\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})(?:\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*)$/)
    if (!m) continue
    const daysPart = m[1].trim()
    let days: number[] | undefined
    if (daysPart) {
      const collected: number[] = []
      let ok = true
      for (const tok of daysPart.split(',')) {
        const t = tok.trim().toLowerCase()
        const range = t.match(/^([a-z]{2})\s*-\s*([a-z]{2})$/)
        if (range && DAY_IDX[range[1]] != null && DAY_IDX[range[2]] != null) {
          let d = DAY_IDX[range[1]]
          collected.push(d)
          while (d !== DAY_IDX[range[2]]) {
            d = (d + 1) % 7
            collected.push(d)
          }
        } else if (DAY_IDX[t] != null) {
          collected.push(DAY_IDX[t])
        } else {
          ok = false
          break
        }
      }
      if (!ok) continue
      const unique = [...new Set(collected)].sort((a, b) => a - b)
      days = unique.length === 7 ? undefined : unique
    }
    for (const span of m[2].split(',')) {
      const [open, close] = span.split('-').map((s) => padTime(s.trim()))
      if (open && close) rules.push({ ...(days ? { days } : {}), open, close })
    }
  }
  return rules.length ? rules : undefined
}
