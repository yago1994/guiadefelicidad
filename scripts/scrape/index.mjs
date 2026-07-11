import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { fetchEvents as eventbrite } from './sources/eventbrite.mjs'
import { fetchEvents as creativeLoafing } from './sources/creativeloafing.mjs'
import { fetchEvents as goatFarm } from './sources/goatfarm.mjs'
import { apiCalls, geocode, saveCache } from './geocode.mjs'
import { categorize, eventId, inAtlanta } from './util.mjs'

const OUT_PATH = fileURLToPath(new URL('../../public/data/events.json', import.meta.url))
// NOTE: discoveratlanta.com is behind a hard bot wall (403 even with browser
// UAs) and beltline.org renders its list client-side from a private API —
// Beltline coverage comes from the Eventbrite "beltline" keyword sweep instead.
const SOURCES = [
  ['eventbrite', eventbrite],
  ['creativeloafing', creativeLoafing],
  ['goatfarm', goatFarm],
]
// paired with the weekly cron: every event enters this window at least a
// week before it happens, so one run per week is enough to catch it
const HORIZON_DAYS = 14
const MAX_GEOCODES_PER_RUN = 60 // Nominatim politeness: bounded API calls per run (cache hits are free)

async function main() {
  const raw = []
  for (const [name, fn] of SOURCES) {
    try {
      const events = await fn()
      console.log(`✔ ${name}: ${events.length} events`)
      raw.push(...events)
    } catch (err) {
      console.error(`✖ ${name} failed (skipped): ${err.message}`)
    }
  }

  const now = new Date()
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86400e3)
  const yesterday = new Date(now.getTime() - 86400e3)

  // basic validity + time window
  let events = raw.filter((e) => {
    if (!e.title || !e.start) return false
    const start = new Date(e.start)
    if (isNaN(start.getTime())) return false
    const end = e.end ? new Date(e.end) : start
    return end >= yesterday && start <= horizon
  })

  // geocode the ones missing coords (bounded per run; cache persists misses)
  for (const e of events) {
    if ((e.lat == null || e.lng == null) && e.address && apiCalls < MAX_GEOCODES_PER_RUN) {
      const hit = await geocode(e.address)
      if (hit) {
        e.lat = hit.lat
        e.lng = hit.lng
      }
    }
  }
  await saveCache()
  console.log(`ℹ geocoded ${apiCalls} new addresses this run`)

  const before = events.length
  events = events.filter((e) => e.lat != null && e.lng != null && inAtlanta(e.lat, e.lng))
  console.log(`ℹ dropped ${before - events.length} events without usable Atlanta coordinates`)

  // normalize, categorize, dedupe
  const byId = new Map()
  for (const e of events) {
    const id = eventId(e.source, e.title, e.start)
    if (byId.has(id)) continue
    byId.set(id, {
      id,
      title: e.title.trim(),
      category: e.categoryHint ?? categorize(e.title, e.description, e.venue),
      venue: e.venue,
      address: e.address,
      lat: e.lat,
      lng: e.lng,
      start: e.start,
      end: e.end || undefined,
      url: e.url,
      source: e.source,
    })
  }

  const out = {
    updatedAt: now.toISOString(),
    events: [...byId.values()].sort((a, b) => a.start.localeCompare(b.start)),
  }
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n')
  console.log(`✅ wrote ${out.events.length} events → public/data/events.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
