/**
 * Discovery probe for the Concrete Jungle tree map
 * (https://m.concrete-jungle.org/tree-map/).
 *
 * The map is a custom, JavaScript-rendered map with no documented API, so we
 * don't know where it loads its tree data from. This script drives headless
 * Chromium (Playwright), loads the page, and captures every network response,
 * then reports which ones look like the tree feed — any JSON/GeoJSON body that
 * carries coordinates — with record counts, detected field names, and a couple
 * of sample records. That tells us the exact endpoint and schema so we can then
 * write a proper `forage` source and parser.
 *
 * It writes nothing to the site's data; it only inspects and reports. Captured
 * candidate payloads are saved under OUT_DIR so they can be uploaded as a CI
 * artifact and inspected.
 *
 * Usage: node scripts/scrape/probe-concrete-jungle.mjs
 *        OUT_DIR=/some/dir to change where captures are written (default: a
 *        `concrete-jungle-probe` folder next to this script).
 *
 * NOTE: This host is blocked by some egress policies (returns a 403 CONNECT
 * tunnel failure). Run it where the open internet is reachable (e.g. GitHub
 * Actions via .github/workflows/forage-probe.yml).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const URL = 'https://m.concrete-jungle.org/tree-map/'
const OUT_DIR = process.env.OUT_DIR || fileURLToPath(new URL('./concrete-jungle-probe/', import.meta.url))
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** Recursively find the first array of ≥3 objects that carry a coordinate-ish pair. */
function findRecordArray(node, depth = 0) {
  if (!node || depth > 6) return null
  if (Array.isArray(node)) {
    const objs = node.filter((x) => x && typeof x === 'object')
    if (objs.length >= 3 && objs.some(hasCoords)) return node
    for (const child of node) {
      const hit = findRecordArray(child, depth + 1)
      if (hit) return hit
    }
    return null
  }
  if (typeof node === 'object') {
    // GeoJSON FeatureCollection
    if (node.type === 'FeatureCollection' && Array.isArray(node.features)) return node.features
    for (const v of Object.values(node)) {
      const hit = findRecordArray(v, depth + 1)
      if (hit) return hit
    }
  }
  return null
}

const COORD_KEY = /^(lat|latitude|lng|lon|long|longitude|y|x)$/i

function hasCoords(obj) {
  if (!obj || typeof obj !== 'object') return false
  if (obj.type === 'Feature' && obj.geometry?.coordinates) return true
  const keys = Object.keys(obj)
  const hasLat = keys.some((k) => /^(lat|latitude|y)$/i.test(k))
  const hasLng = keys.some((k) => /^(lng|lon|long|longitude|x)$/i.test(k))
  return hasLat && hasLng
}

function summarizeFields(records) {
  const sample = records.slice(0, 200)
  const fields = new Map()
  for (const r of sample) {
    const flat = r?.type === 'Feature' ? { ...r.properties, _geometry: r.geometry?.type } : r
    for (const [k, v] of Object.entries(flat ?? {})) {
      if (!fields.has(k)) fields.set(k, typeof v)
    }
  }
  return [...fields.entries()].map(([k, t]) => `${k}:${t}`)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const captures = [] // { url, count, fields, keys }
  try {
    const page = await browser.newPage({ userAgent: BROWSER_UA, viewport: { width: 390, height: 844 }, locale: 'en-US' })

    let saved = 0
    page.on('response', async (res) => {
      const url = res.url()
      const ct = (res.headers()['content-type'] || '').toLowerCase()
      if (!/json|geo\+json|javascript|text\/plain/.test(ct) && !/\.(json|geojson)(\?|$)/i.test(url)) return
      let body
      try {
        body = await res.text()
      } catch {
        return
      }
      let data
      try {
        data = JSON.parse(body)
      } catch {
        // some feeds wrap JSON in a JS callback — strip a leading `foo(` … `)`
        const m = body.match(/^[^({]*\((.*)\)\s*;?\s*$/s)
        if (!m) return
        try {
          data = JSON.parse(m[1])
        } catch {
          return
        }
      }
      const records = findRecordArray(data)
      if (!records || records.length < 3) return
      const idx = ++saved
      const file = `${OUT_DIR}/feed-${idx}.json`
      await writeFile(file, JSON.stringify(data, null, 2).slice(0, 5_000_000))
      captures.push({
        url,
        count: records.length,
        fields: summarizeFields(records),
        sample: records.slice(0, 2),
        file,
      })
      console.log(`  ⤷ candidate feed #${idx}: ${records.length} records ← ${url}`)
    })

    console.log(`ℹ loading ${URL}`)
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 90_000 }).catch((e) => console.error(`goto: ${e.message}`))
    // give lazy/tiled data a chance to load, and nudge the map to trigger fetches
    await page.waitForTimeout(8_000)
    try {
      await page.mouse.move(195, 420)
      await page.mouse.wheel(0, -600) // zoom-ish scroll
      await page.waitForTimeout(4_000)
    } catch {
      // ignore interaction errors
    }
  } finally {
    await browser.close()
  }

  console.log(`\n===== PROBE SUMMARY =====`)
  if (captures.length === 0) {
    console.log('No coordinate-bearing JSON feed captured. The map may render server-side,')
    console.log('use a tiled/binary vector source, or gate data behind an interaction.')
    console.log('Inspect the page manually or widen the response filter.')
  } else {
    captures.sort((a, b) => b.count - a.count)
    for (const c of captures) {
      console.log(`\n• ${c.count} records  ←  ${c.url}`)
      console.log(`  fields: ${c.fields.join(', ')}`)
      console.log(`  saved:  ${c.file}`)
      console.log(`  sample: ${JSON.stringify(c.sample[0])?.slice(0, 400)}`)
    }
    const best = captures[0]
    await writeFile(`${OUT_DIR}/summary.json`, JSON.stringify(captures.map(({ sample, ...c }) => c), null, 2) + '\n')
    console.log(`\n✅ best candidate: ${best.count} records at ${best.url}`)
    console.log(`   full captures + summary.json in ${OUT_DIR}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
