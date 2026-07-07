import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { USER_AGENT, sleep } from './util.mjs'

const CACHE_PATH = fileURLToPath(new URL('./geocode-cache.json', import.meta.url))

let cache = null

async function loadCache() {
  if (cache) return cache
  try {
    cache = JSON.parse(await readFile(CACHE_PATH, 'utf8'))
  } catch {
    cache = {}
  }
  return cache
}

export async function saveCache() {
  if (cache) await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n')
}

/**
 * Geocode an address via Nominatim. Committed cache + 1.1s spacing keeps us
 * comfortably inside their usage policy (max 1 req/s, identifying UA).
 */
export async function geocode(address) {
  const c = await loadCache()
  const key = address.toLowerCase().trim()
  if (key in c) return c[key]

  const q = /atlanta|ga\b|georgia/i.test(address) ? address : `${address}, Atlanta, GA`
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`
  let result = null
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) })
    if (res.ok) {
      const json = await res.json()
      if (json[0]) result = { lat: Number(json[0].lat), lng: Number(json[0].lon) }
    }
  } catch {
    // treat as unresolvable this run; cached miss below avoids re-hitting nightly
  }
  c[key] = result
  await sleep(1100)
  return result
}
