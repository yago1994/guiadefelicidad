import * as cheerio from 'cheerio'

export const USER_AGENT =
  'guiadefelicidad-events-bot/1.0 (+https://github.com/yago1994/guiadefelicidad; nightly community events map)'

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export async function fetchHtml(url, { bustCache = false, browserHeaders = false } = {}) {
  const target = bustCache ? `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}` : url
  const res = await fetch(target, {
    headers: browserHeaders
      ? {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Upgrade-Insecure-Requests': '1',
        }
      : {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return cheerio.load(await res.text())
}

export async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.json()
}

/**
 * Pull every schema.org Event object out of a page's JSON-LD blocks,
 * tolerating @graph wrappers, arrays, and malformed blocks.
 */
export function extractJsonLdEvents($) {
  const events = []
  $('script[type="application/ld+json"]').each((_, el) => {
    let parsed
    try {
      parsed = JSON.parse($(el).contents().text())
    } catch {
      return
    }
    const nodes = []
    const walk = (n) => {
      if (!n || typeof n !== 'object') return
      if (Array.isArray(n)) return n.forEach(walk)
      nodes.push(n)
      if (n['@graph']) walk(n['@graph'])
    }
    walk(parsed)
    for (const n of nodes) {
      const type = [].concat(n['@type'] ?? [])
      if (type.some((t) => typeof t === 'string' && t.toLowerCase().includes('event'))) {
        events.push(n)
      }
    }
  })
  return events
}

/** Normalize a schema.org Event node into our RawEvent shape (fields may be missing). */
export function fromJsonLd(node, source) {
  const place = node.location && !Array.isArray(node.location) ? node.location : (node.location ?? [])[0]
  const geo = place?.geo
  const addr = place?.address
  const addressText =
    typeof addr === 'string'
      ? addr
      : addr
        ? [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(', ')
        : undefined
  return {
    title: decodeEntities(node.name),
    url: typeof node.url === 'string' ? node.url : undefined,
    start: node.startDate,
    end: node.endDate,
    venue: decodeEntities(typeof place?.name === 'string' ? place.name : undefined),
    address: addressText,
    lat: geo?.latitude != null ? Number(geo.latitude) : undefined,
    lng: geo?.longitude != null ? Number(geo.longitude) : undefined,
    description: typeof node.description === 'string' ? node.description : undefined,
    source,
  }
}

function decodeEntities(s) {
  if (typeof s !== 'string') return undefined
  return cheerio.load(`<x>${s}</x>`)('x').text().trim()
}

/** Rough Atlanta metro bounding box — drops mis-geocoded results. */
export function inAtlanta(lat, lng) {
  return lat > 33.4 && lat < 34.2 && lng > -84.9 && lng < -83.9
}

const CATEGORY_KEYWORDS = [
  ['music', /concert|live music|dj |symphony|orchestra|band|album|tour|open mic|jazz|hip.?hop|karaoke/i],
  ['market', /market|bazaar|flea|vintage|maker|craft fair|pop.?up shop/i],
  ['active', /\brun\b|race|5k|10k|marathon|ride|bike|cycling|yoga|hike|climb|skate|paddle|fitness/i],
  ['art', /art|gallery|exhibit|museum|theatre|theater|film|movie|comedy|improv|poetry|dance|ballet|mural/i],
  ['food-drink', /food|tasting|dinner|brunch|beer|wine|cocktail|brew|festival|feast|bbq|barbecue|chef/i],
  ['park', /park|garden|nature|outdoor|picnic|botanical/i],
]

export function categorize(...texts) {
  const hay = texts.filter(Boolean).join(' ')
  for (const [cat, re] of CATEGORY_KEYWORDS) {
    if (re.test(hay)) return cat
  }
  return 'other'
}

export function eventId(source, title, start) {
  const slug = String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  const day = String(start ?? '').slice(0, 10)
  return `${source}-${slug}-${day}`
}
