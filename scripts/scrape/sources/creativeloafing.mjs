import { fetchHtml, sleep } from '../util.mjs'

const BASE = 'https://creativeloafing.com'
const PAGES = [`${BASE}/atlanta-events/today`, `${BASE}/atlanta-events/this-week`]

/**
 * Creative Loafing Atlanta renders its calendar server-side with schema.org
 * microdata: each event sits in [itemtype*="schema.org/Event"] with an ISO
 * datetime on <time class="timeago"> and venue/address in the location Place.
 * No coordinates — the orchestrator geocodes "venue, Atlanta, GA".
 */
export async function fetchEvents() {
  const byKey = new Map()
  for (const url of PAGES) {
    try {
      // their CDN happily serves days-old cached listings without this
      const $ = await fetchHtml(url, { bustCache: true })
      $('[itemtype*="schema.org/Event"]').each((_, el) => {
        const $el = $(el)
        const title = $el.find('.event-title [itemprop="name"], [itemprop="name"]').first().text().trim()
        const href = $el.find('a[itemprop="url"]').attr('href')
        const iso = $el.find('time.timeago').attr('datetime')
        const venue = $el.find('[itemprop="location"] meta[itemprop="name"]').attr('content')?.trim()
        const addr = $el.find('[itemprop="location"] meta[itemprop="address"]').attr('content')?.trim()
        const category = $el.find('.event-category').first().text().trim()
        if (!title || !iso) return
        const key = `${title}|${iso}`
        if (byKey.has(key)) return
        byKey.set(key, {
          title,
          url: href ? new URL(href, BASE).toString() : undefined,
          start: iso,
          venue,
          // street addresses are rare here; venue name geocodes well in Atlanta
          address: venue ? `${venue}, ${addr || 'Atlanta, GA'}` : addr,
          description: category,
          source: 'creativeloafing',
        })
      })
    } catch (err) {
      console.error(`  creativeloafing page failed: ${url} (${err.message})`)
    }
    await sleep(600)
  }
  return [...byKey.values()]
}
