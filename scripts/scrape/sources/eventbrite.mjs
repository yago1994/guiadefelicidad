import { extractJsonLdEvents, fetchHtml, fromJsonLd, sleep } from '../util.mjs'

/**
 * Eventbrite public listing pages embed a schema.org ItemList with full event
 * data including venue geo coordinates. We sweep a few Atlanta pages: the
 * general listing, a couple of category pages (which double as a category
 * hint), and a "beltline" keyword search so Beltline happenings are covered
 * even though beltline.org itself renders its list client-side.
 */
const PAGES = [
  { url: 'https://www.eventbrite.com/d/ga--atlanta/events/', hint: null },
  { url: 'https://www.eventbrite.com/d/ga--atlanta/events/?page=2', hint: null },
  { url: 'https://www.eventbrite.com/d/ga--atlanta/music--events/', hint: 'music' },
  { url: 'https://www.eventbrite.com/d/ga--atlanta/food-and-drink--events/', hint: 'food-drink' },
  { url: 'https://www.eventbrite.com/d/ga--atlanta/arts--events/', hint: 'art' },
  { url: 'https://www.eventbrite.com/d/ga--atlanta/beltline/', hint: null },
]

/** Listing pages carry date-only starts; detail pages have exact times. */
const MAX_DETAIL_LOOKUPS = 50

function itemListEvents($) {
  const out = []
  $('script[type="application/ld+json"]').each((_, el) => {
    let parsed
    try {
      parsed = JSON.parse($(el).contents().text())
    } catch {
      return
    }
    for (const block of [].concat(parsed)) {
      if (block?.['@type'] === 'ItemList') {
        for (const li of block.itemListElement ?? []) {
          if (li?.item) out.push(li.item)
        }
      }
    }
  })
  return out
}

export async function fetchEvents() {
  const byUrl = new Map()
  for (const page of PAGES) {
    try {
      const $ = await fetchHtml(page.url, { browserHeaders: true })
      for (const node of itemListEvents($)) {
        const ev = { ...fromJsonLd(node, 'eventbrite'), categoryHint: page.hint }
        if (ev.url && !byUrl.has(ev.url)) byUrl.set(ev.url, ev)
      }
    } catch (err) {
      console.error(`  eventbrite page failed: ${page.url} (${err.message})`)
    }
    await sleep(600)
  }

  // upgrade date-only starts to exact times from the event detail page
  const needTimes = [...byUrl.values()].filter((e) => e.start && e.start.length <= 10).slice(0, MAX_DETAIL_LOOKUPS)
  for (const ev of needTimes) {
    try {
      const $ = await fetchHtml(ev.url, { browserHeaders: true })
      const detail = extractJsonLdEvents($).map((n) => fromJsonLd(n, 'eventbrite'))[0]
      if (detail?.start) {
        ev.start = detail.start
        ev.end = detail.end ?? ev.end
        ev.venue = ev.venue ?? detail.venue
        ev.lat = ev.lat ?? detail.lat
        ev.lng = ev.lng ?? detail.lng
      }
    } catch {
      // keep the date-only version
    }
    await sleep(400)
  }
  return [...byUrl.values()]
}
