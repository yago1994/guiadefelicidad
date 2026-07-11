/**
 * Pull places from a shared Google Maps list into public/data/pins.json.
 *
 * Google offers no API for saved lists, and the list page renders client-side,
 * so this drives headless Chromium (Playwright) and captures the page's own
 * `search?tbm=map` data feed — which contains every place's name, coordinates,
 * address, place_id, and types. Scrolling the list panel pages through lists
 * > 20 items. Personal notes added when saving a place to a list are NOT
 * exposed anywhere on this page or feed (confirmed by inspecting both) — as
 * a substitute, each place's own Google-authored editorial blurb (the one-
 * line description Maps shows on the place's profile) is fetched from its
 * individual place page. Coverage is partial: Google only writes these for
 * some businesses, so many places fall back to their street address.
 *
 * Usage: GOOGLE_LIST_URL="https://maps.app.goo.gl/…" node scripts/sync-google-list.mjs
 *        DRY_RUN=1 to report without writing.
 *
 * Merge rules: imported pins get id `gmap-<slug>` and origin "google". Existing
 * pins keep every admin edit (category, availability, media, description) —
 * only name/coords refresh. The one exception: a pin whose description still
 * exactly matches its address (i.e. never hand-edited) is upgraded if Google
 * has since surfaced a real editorial description for it. Nothing is ever deleted.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const PINS_PATH = fileURLToPath(new URL('../public/data/pins.json', import.meta.url))
const LIST_URL = process.env.GOOGLE_LIST_URL
const DRY_RUN = Boolean(process.env.DRY_RUN)
// bounds how many individual place pages get visited per run (politeness + runtime)
const MAX_DESCRIPTION_LOOKUPS = 40

const TYPE_TO_CATEGORY = [
  [/coffee|cafe|bakery|tea/, 'coffee'],
  [/restaurant|food|bar|brewery|pizza|taco|ice_cream|dessert|meal/, 'food'],
  [/park|garden|campground|natural|trail|beach/, 'park'],
  [/florist|flower/, 'flowers'],
  [/museum|art_gallery|gallery|theater|theatre|movie/, 'art'],
  [/market|grocery|store|shopping/, 'market'],
  [/gym|bicycle|bike|sports|stadium|bowling|climbing/, 'active'],
  [/night_club|music|concert/, 'music'],
  [/subway_station|train_station|transit_station|bus_station|light_rail_station/, 'transit'],
]

function categoryFor(types) {
  const hay = (types ?? []).join(' ')
  for (const [re, cat] of TYPE_TO_CATEGORY) {
    if (re.test(hay)) return cat
  }
  return 'other'
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function resolveListUrl(url) {
  if (!/maps\.app\.goo\.gl|goo\.gl/.test(url)) return url
  // non-browser user agents get a plain 302 with the real list URL
  const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'curl/8.0' } })
  const loc = res.headers.get('location')
  if (!loc) throw new Error(`Could not resolve short link (${res.status})`)
  return loc
}

/** Parse one captured search?tbm=map response body into places. */
function parseFeed(body) {
  let payload
  try {
    const envelope = JSON.parse(body.slice(0, body.lastIndexOf('}') + 1))
    payload = envelope.d
  } catch {
    return []
  }
  if (typeof payload !== 'string') return []
  if (payload.startsWith(")]}'")) payload = payload.slice(payload.indexOf('\n') + 1)
  let data
  try {
    data = JSON.parse(payload)
  } catch {
    return []
  }
  const entries = data?.[0]?.[1]
  if (!Array.isArray(entries)) return []
  const places = []
  for (const entry of entries) {
    const place = entry?.[14]
    if (!Array.isArray(place)) continue
    const name = place[11]
    const coords = place[9]
    if (typeof name !== 'string' || !Array.isArray(coords)) continue
    const lat = coords[2]
    const lng = coords[3]
    if (typeof lat !== 'number' || typeof lng !== 'number') continue
    places.push({
      name,
      lat,
      lng,
      address: typeof place[39] === 'string' ? place[39] : undefined,
      placeId: typeof place[78] === 'string' ? place[78] : undefined,
      types: Array.isArray(place[76]) ? place[76].map((t) => t?.[0]).filter((t) => typeof t === 'string') : [],
    })
  }
  return places
}

async function scrapeList(url) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
    })
    const byKey = new Map()
    page.on('response', async (res) => {
      if (!res.url().includes('search?tbm=map')) return
      try {
        for (const p of parseFeed(await res.text())) {
          byKey.set(`${p.name}|${p.lat.toFixed(6)},${p.lng.toFixed(6)}`, p)
        }
      } catch {
        // ignore malformed chunks
      }
    })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    // EU-style consent wall, if any
    try {
      await page
        .locator('button:has-text("Accept all"), button:has-text("Aceptar todo"), button:has-text("Reject all")')
        .first()
        .click({ timeout: 5_000 })
    } catch {
      // no consent screen
    }
    await page.waitForTimeout(6_000)

    // page through long lists by wheel-scrolling over the results panel
    // (Google's panel is a virtualized custom scroller — DOM scrollTo is ignored)
    let stable = 0
    let lastCount = -1
    for (let round = 0; round < 20 && stable < 3; round++) {
      await page.mouse.move(320, 500)
      await page.mouse.wheel(0, 4_000)
      await page.waitForTimeout(2_000)
      if (process.env.DEBUG_SCROLL) console.log(`  round ${round}: places=${byKey.size}`)
      if (byKey.size === lastCount) stable++
      else stable = 0
      lastCount = byKey.size
    }
    return [...byKey.values()]
  } finally {
    await browser.close()
  }
}

/**
 * Google's own one-line editorial blurb for a place, scraped from its
 * individual Maps page (`div.PYvSYb`). Returns null when Google has none for
 * that business — that's the common case, not a failure.
 */
async function fetchEditorialDescription(browser, placeId) {
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'en-US',
  })
  try {
    await page.goto(`https://www.google.com/maps/place/?q=place_id:${placeId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    try {
      await page
        .locator('button:has-text("Accept all"), button:has-text("Aceptar todo"), button:has-text("Reject all")')
        .first()
        .click({ timeout: 4_000 })
    } catch {
      // no consent screen
    }
    await page.locator('.PYvSYb').first().waitFor({ timeout: 5_000 }).catch(() => {})
    const text = await page.evaluate(() => document.querySelector('.PYvSYb')?.innerText?.trim() || null)
    return text || null
  } catch {
    return null
  } finally {
    await page.close()
  }
}

/** Fetches editorial descriptions for a bounded set of places, keyed by placeId. */
async function fetchDescriptions(places) {
  const withPlaceId = places.filter((p) => p.placeId).slice(0, MAX_DESCRIPTION_LOOKUPS)
  if (withPlaceId.length === 0) return new Map()
  if (places.length > withPlaceId.length) {
    console.log(`ℹ description lookup capped at ${MAX_DESCRIPTION_LOOKUPS} places this run`)
  }
  const browser = await chromium.launch()
  const found = new Map()
  try {
    for (const place of withPlaceId) {
      const text = await fetchEditorialDescription(browser, place.placeId)
      if (text) found.set(place.placeId, text)
    }
  } finally {
    await browser.close()
  }
  return found
}

async function main() {
  if (!LIST_URL) {
    console.error('Set GOOGLE_LIST_URL to your shared list link (maps.app.goo.gl/…).')
    process.exit(1)
  }
  const url = await resolveListUrl(LIST_URL)
  console.log(`ℹ list URL: ${url.slice(0, 110)}…`)
  const places = await scrapeList(url)
  console.log(`✔ scraped ${places.length} places from the list`)
  if (places.length === 0) {
    console.error('✖ no places found — Google may have changed the page format, or the list is private/empty.')
    process.exit(1)
  }

  const pins = JSON.parse(await readFile(PINS_PATH, 'utf8'))
  const byId = new Map(pins.map((p) => [p.id, p]))

  // fetch real descriptions for brand-new places, plus any previously-synced
  // pin whose description still exactly equals its address (i.e. was never
  // hand-edited by the admin, so it's safe to upgrade)
  const needsDescription = places.filter((place) => {
    const existing = byId.get(`gmap-${slugify(place.name)}`)
    return !existing || existing.description === place.address
  })
  const descriptions = await fetchDescriptions(needsDescription)
  console.log(`ℹ found real descriptions for ${descriptions.size}/${needsDescription.length} places checked`)

  let added = 0
  let updated = 0
  let descriptionsUpgraded = 0
  for (const place of places) {
    const id = `gmap-${slugify(place.name)}`
    const existing = byId.get(id)
    const desc = place.placeId ? descriptions.get(place.placeId) : undefined
    if (existing) {
      if (existing.lat !== place.lat || existing.lng !== place.lng || existing.name !== place.name) {
        existing.name = place.name
        existing.lat = place.lat
        existing.lng = place.lng
        updated++
      }
      if (existing.description === place.address && desc) {
        existing.description = desc
        descriptionsUpgraded++
      }
    } else {
      byId.set(id, {
        id,
        name: place.name,
        category: categoryFor(place.types),
        lat: place.lat,
        lng: place.lng,
        description: desc ?? place.address,
        media: [],
        origin: 'google',
      })
      added++
    }
  }
  console.log(
    `ℹ ${added} new pins, ${updated} updated, ${descriptionsUpgraded} descriptions upgraded, ${places.length - added - updated} unchanged`,
  )
  if (DRY_RUN) {
    console.log('DRY_RUN — not writing. New pins would be:')
    for (const place of places) {
      const id = `gmap-${slugify(place.name)}`
      if (!pins.some((p) => p.id === id)) {
        const desc = place.placeId ? descriptions.get(place.placeId) : undefined
        console.log(`  + ${id} (${categoryFor(place.types)}) @ ${place.lat},${place.lng} — ${desc ?? place.address}`)
      }
    }
    return
  }
  await writeFile(PINS_PATH, JSON.stringify([...byId.values()], null, 2) + '\n')
  console.log(`✅ wrote ${byId.size} pins → public/data/pins.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
