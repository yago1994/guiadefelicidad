/**
 * Build the `forage` layer (public/data/forage.json) from Falling Fruit
 * (https://fallingfruit.org) — an open, crowd-sourced map of edible trees and
 * plants. Unlike events, foraging spots are permanent locations, so they render
 * as always-on pins under the "forage" category and live in their own data file
 * (never the hand-curated pins.json).
 *
 * Falling Fruit exposes a documented public REST API (v0.3). Every endpoint
 * needs an API key in the `x-api-key` header; `AKDJGHSD` is the public key
 * Falling Fruit's own web client ships with. Override it with the
 * FALLINGFRUIT_API_KEY env var if you register your own.
 *
 * We query the /locations bounding-box endpoint for Atlanta, resolve each
 * location's edible-type names via /types, and write one pin per spot. By
 * default `muni=false` excludes bulk municipal street-tree inventories, keeping
 * the community-contributed foraging spots that are the point of the layer.
 *
 * Usage: node scripts/scrape/forage-fallingfruit.mjs
 *   FALLINGFRUIT_API_KEY   API key (default: the public AKDJGHSD)
 *   FORAGE_BOUNDS          "swlat,swlng|nelat,nelng" (default: intown Atlanta)
 *   FORAGE_MUNI            "true" to include municipal tree inventories (default false)
 *   FORAGE_MAX             hard cap on points written (default 2000)
 *   DRY_RUN=1              report without writing
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { inAtlanta, sleep } from './util.mjs'

const OUT_PATH = fileURLToPath(new URL('../../public/data/forage.json', import.meta.url))
const API = 'https://fallingfruit.org/api/0.3'
const API_KEY = process.env.FALLINGFRUIT_API_KEY || 'AKDJGHSD'
// intown Atlanta (roughly inside I-285's core) — tighten/widen via FORAGE_BOUNDS
const BOUNDS = process.env.FORAGE_BOUNDS || '33.647,-84.516|33.887,-84.289'
const INCLUDE_MUNI = process.env.FORAGE_MUNI === 'true'
const MAX = Number(process.env.FORAGE_MAX || 2000)
const PAGE = 1000 // API default/limit per request
const DRY_RUN = Boolean(process.env.DRY_RUN)

async function api(path, params = {}) {
  const url = new URL(`${API}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    headers: { 'x-api-key': API_KEY, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${res.statusText}`)
  return res.json()
}

/** id → human type name, so a location's type_ids become "Apple, Fig", etc. */
async function loadTypeNames() {
  try {
    const types = await api('/types')
    const map = new Map()
    for (const t of Array.isArray(types) ? types : []) {
      if (t && typeof t.id === 'number') map.set(t.id, t.name || t.common_names?.en?.[0] || null)
    }
    return map
  } catch (err) {
    console.error(`ℹ /types lookup failed (${err.message}) — falling back to any inline type_names`)
    return new Map()
  }
}

function nameFor(loc, typeNames) {
  // prefer names the list endpoint already inlined; else resolve via /types
  const names =
    (Array.isArray(loc.type_names) && loc.type_names.length ? loc.type_names : null) ??
    (Array.isArray(loc.type_ids) ? loc.type_ids.map((id) => typeNames.get(id)).filter(Boolean) : [])
  const unique = [...new Set(names)]
  return unique.length ? unique.join(', ') : 'Edible plant'
}

async function fetchAllLocations() {
  const out = []
  for (let offset = 0; out.length < MAX; offset += PAGE) {
    const batch = await api('/locations', {
      bounds: BOUNDS,
      muni: String(INCLUDE_MUNI),
      limit: String(PAGE),
      offset: String(offset),
    })
    const rows = Array.isArray(batch) ? batch : []
    out.push(...rows)
    console.log(`  … fetched ${rows.length} (offset ${offset}), ${out.length} total`)
    if (rows.length < PAGE) break
    await sleep(500) // be polite between pages
  }
  return out.slice(0, MAX)
}

async function main() {
  console.log(`ℹ Falling Fruit forage sweep — bounds ${BOUNDS}, muni=${INCLUDE_MUNI}`)
  const typeNames = await loadTypeNames()
  const locations = await fetchAllLocations()
  console.log(`✔ ${locations.length} locations returned`)

  const byId = new Map()
  for (const loc of locations) {
    const lat = Number(loc.lat)
    const lng = Number(loc.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inAtlanta(lat, lng)) continue
    const name = nameFor(loc, typeNames)
    const id = `ff-${loc.id}`
    byId.set(id, {
      id,
      name,
      category: 'forage',
      lat,
      lng,
      description: name,
      url: `https://fallingfruit.org/locations/${loc.id}`,
      origin: 'fallingfruit',
    })
  }

  const pins = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  console.log(`ℹ ${pins.length} forage pins after Atlanta filter + dedupe`)
  if (DRY_RUN) {
    console.log('DRY_RUN — not writing. First few:')
    for (const p of pins.slice(0, 8)) console.log(`  + ${p.id} (${p.name}) @ ${p.lat},${p.lng}`)
    return
  }
  await writeFile(OUT_PATH, JSON.stringify(pins, null, 2) + '\n')
  console.log(`✅ wrote ${pins.length} forage pins → public/data/forage.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
