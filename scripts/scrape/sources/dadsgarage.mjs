import { categorize, fetchHtml, fetchIcs, parseIcsDate, parseVEvent, sleep, unescapeIcsText } from '../util.mjs'

// Dad's Garage is a Squarespace site, same as The Goat Farm: its show pages
// live at /shows/<slug> and each one exposes a per-event iCal at ?format=ical.
// Every show happens at the one venue, so coordinates are fixed (no geocode).
const BASE = 'https://www.dadsgarage.com'
const LISTING_URL = `${BASE}/shows`
const VENUE = "Dad's Garage Theatre"
const ADDRESS = '569 Ezzard St SE, Atlanta, GA 30312'
const LAT = 33.7530542
const LNG = -84.3686693
// bounds how many event pages get fetched per run (politeness + runtime)
const MAX_EVENTS = 80

export async function fetchEvents() {
  const $ = await fetchHtml(LISTING_URL, { browserHeaders: true })
  const slugs = new Set()
  $('a[href^="/shows/"]').each((_, el) => {
    const href = $(el).attr('href')
    // slug only — strip any ?date=… recurring-occurrence query the listing adds
    const m = href?.match(/^\/shows\/([a-z0-9-]+)/i)
    if (m) slugs.add(m[1])
  })

  const events = []
  for (const slug of [...slugs].slice(0, MAX_EVENTS)) {
    const url = `${BASE}/shows/${slug}`
    try {
      const ics = await fetchIcs(`${url}?format=ical`)
      const fields = parseVEvent(ics)
      const title = unescapeIcsText(fields.SUMMARY ?? '')
      const start = parseIcsDate(fields.DTSTART)
      if (!title || !start) continue
      const description = fields.DESCRIPTION ? unescapeIcsText(fields.DESCRIPTION) : undefined
      // it's a comedy/improv theatre — prefer 'art' over the generic 'other' fallback
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
        source: 'dadsgarage',
      })
    } catch (err) {
      console.error(`  dadsgarage event failed: ${slug} (${err.message})`)
    }
    await sleep(400)
  }
  return events
}
