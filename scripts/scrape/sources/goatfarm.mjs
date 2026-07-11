import { USER_AGENT, categorize, fetchHtml, sleep } from '../util.mjs'

const BASE = 'https://www.thegoatfarm.info'
const LISTING_URL = `${BASE}/events`
// every event on this site is at the same single venue
const VENUE = 'The Goat Farm'
const ADDRESS = '1200 Foster St NW, Atlanta, GA 30318'
const LAT = 33.785974513235445
const LNG = -84.4167698115391
// bounds how many event pages get fetched per run (politeness + runtime)
const MAX_EVENTS = 80

/** Squarespace event pages expose a clean per-event iCal export at ?format=ical. */
async function fetchIcs(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/calendar' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.text()
}

function unescapeIcsText(v) {
  return v.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\[nN]/g, ' ').replace(/\\\\/g, '\\').trim()
}

/** "20260513T230000Z" → "2026-05-13T23:00:00Z" */
function parseIcsDate(v) {
  const m = v?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!m) return undefined
  const [, y, mo, d, h, mi, s, z] = m
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}`
}

function parseVEvent(ics) {
  // unfold continuation lines (a leading space/tab means "joined with the previous line")
  const unfolded = ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
  const fields = {}
  for (const line of unfolded.split(/\r?\n/)) {
    const m = line.match(/^([A-Z-]+)(?:;[^:]*)?:(.*)$/)
    if (m) fields[m[1]] = m[2]
  }
  return fields
}

export async function fetchEvents() {
  const $ = await fetchHtml(LISTING_URL)
  const slugs = new Set()
  $('a[href^="/events/"]').each((_, el) => {
    const href = $(el).attr('href')
    const m = href?.match(/^\/events\/([a-z0-9-]+)/)
    if (m) slugs.add(m[1])
  })

  const events = []
  for (const slug of [...slugs].slice(0, MAX_EVENTS)) {
    const url = `${BASE}/events/${slug}`
    try {
      const ics = await fetchIcs(`${url}?format=ical`)
      const fields = parseVEvent(ics)
      const title = unescapeIcsText(fields.SUMMARY ?? '')
      const start = parseIcsDate(fields.DTSTART)
      if (!title || !start) continue
      const description = fields.DESCRIPTION ? unescapeIcsText(fields.DESCRIPTION) : undefined
      // it's an arts venue — prefer that over the generic keyword fallback of 'other'
      const guess = categorize(title, description)
      events.push({
        title,
        url,
        start,
        end: parseIcsDate(fields.DTEND),
        venue: VENUE,
        address: ADDRESS,
        lat: LAT,
        lng: LNG,
        description,
        categoryHint: guess === 'other' ? 'art' : guess,
        source: 'goatfarm',
      })
    } catch (err) {
      console.error(`  goatfarm event failed: ${slug} (${err.message})`)
    }
    await sleep(400)
  }
  return events
}
