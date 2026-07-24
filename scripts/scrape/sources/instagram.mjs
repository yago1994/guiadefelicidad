import { categorize, sleep } from '../util.mjs'

/**
 * Best-effort Instagram source. Instagram serves a login wall to
 * unauthenticated clients and aggressively blocks datacenter IPs (like the
 * GitHub Actions runner this scraper runs on), so this is inherently fragile
 * and DELIBERATELY fails soft: any block, rate-limit, or format change just
 * makes it return [] and the orchestrator skips it — the weekly scrape never
 * breaks because of Instagram.
 *
 * It reads the same public JSON endpoint the profile web page uses
 * (web_profile_info), which returns recent posts with their captions. Event
 * details on Instagram live in free-text captions, so the date/time and any
 * venue are parsed heuristically from the caption — expect misses. Posts with
 * no parseable upcoming date are dropped here; posts with no usable Atlanta
 * location are dropped downstream by the orchestrator's geocode+bbox filter.
 *
 * Reliability: set the IG_SESSIONID env var (a `sessionid` cookie from a
 * logged-in browser session, stored as a GitHub Actions secret) to fetch as an
 * authenticated user, which sidesteps most of the datacenter-IP blocking.
 * Without it the endpoint often returns nothing from CI — that's expected.
 */

// public web app id the instagram.com frontend sends; required by the endpoint
const IG_APP_ID = '936619743392459'
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// accounts to sweep; extend as more Atlanta event pages are worth following
const ACCOUNTS = (process.env.IG_USERNAMES || 'frenchprovatl')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** US Eastern wall-clock (y,mo,d,h,mi) → correct UTC ISO string, DST-aware. */
function easternToUtcIso(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess))
  const f = {}
  for (const p of parts) f[p.type] = p.value
  const asLocal = Date.UTC(+f.year, +f.month - 1, +f.day, +f.hour === 24 ? 0 : +f.hour, +f.minute, +f.second)
  return new Date(guess - (asLocal - guess)).toISOString()
}

/** Pull the first plausible upcoming time from an event caption, if any. */
function parseCaptionDate(text, now) {
  if (!text) return undefined
  const hay = text.toLowerCase()

  // date: "july 26", "jul 26th", optionally ", 2026"
  let mo, day, year
  const named = hay.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/)
  if (named) {
    mo = MONTHS[named[1]]
    day = +named[2]
    if (named[3]) year = +named[3]
  } else {
    // numeric: "7/26" or "7/26/2026"
    const numeric = hay.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
    if (!numeric) return undefined
    mo = +numeric[1]
    day = +numeric[2]
    if (numeric[3]) year = numeric[3].length === 2 ? 2000 + +numeric[3] : +numeric[3]
  }
  if (!mo || mo > 12 || !day || day > 31) return undefined

  // time: "7pm", "7:30 pm", "at 8" (assume pm for a bare evening-ish hour)
  let hour = 19
  let minute = 0
  const ampm = hay.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
  if (ampm) {
    hour = +ampm[1] % 12
    if (ampm[3] === 'pm') hour += 12
    minute = ampm[2] ? +ampm[2] : 0
  } else {
    const at = hay.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/)
    if (at) {
      hour = +at[1]
      minute = at[2] ? +at[2] : 0
      if (hour < 9) hour += 12 // "at 7" for an event almost always means 7pm
    }
  }

  // infer the year when the caption omits it: this year, unless that date has
  // already passed (then it's next year). Cheap and good enough for the
  // orchestrator's 14-day window.
  if (!year) {
    year = now.getUTCFullYear()
    const thisYear = Date.UTC(year, mo - 1, day)
    if (thisYear < now.getTime() - 2 * 86400e3) year += 1
  }
  return easternToUtcIso(year, mo, day, hour, minute)
}

/** First meaningful caption line as a title, hashtags/emoji-noise trimmed. */
function titleFromCaption(text) {
  const line = (text || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'))
  if (!line) return undefined
  return line.replace(/#\w+/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, 90) || undefined
}

const STREET = /\b\d{1,5}\s+([A-Za-z0-9.'-]+\s+){1,4}(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|way|pkwy|parkway|pl|place|ct|court|ter|terrace|hwy|highway)\b(\s+(ne|nw|se|sw))?/i

/** Best-effort venue/address from the post's location tag or caption text. */
function extractAddress(text, location) {
  if (location?.name) {
    const name = location.name
    return /atlanta|,\s*ga\b/i.test(name) ? name : `${name}, Atlanta, GA`
  }
  const m = (text || '').match(STREET)
  if (m) {
    const addr = m[0].trim()
    return /atlanta|,\s*ga\b/i.test(text) ? addr : `${addr}, Atlanta, GA`
  }
  return undefined
}

async function fetchProfile(username) {
  const headers = {
    'User-Agent': BROWSER_UA,
    Accept: '*/*',
    'X-IG-App-ID': IG_APP_ID,
    'X-Requested-With': 'XMLHttpRequest',
    Referer: `https://www.instagram.com/${username}/`,
  }
  if (process.env.IG_SESSIONID) headers.Cookie = `sessionid=${process.env.IG_SESSIONID}`
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`GET web_profile_info(${username}) → ${res.status}`)
  const json = await res.json() // throws on the HTML login wall — caught by caller
  return json?.data?.user?.edge_owner_to_timeline_media?.edges ?? []
}

export async function fetchEvents() {
  const now = new Date()
  const events = []
  for (const username of ACCOUNTS) {
    let edges
    try {
      edges = await fetchProfile(username)
    } catch (err) {
      // login wall / block / rate-limit / format change — skip this account
      console.error(`  instagram @${username} unavailable (${err.message})`)
      continue
    }
    for (const { node } of edges) {
      const caption = node?.edge_media_to_caption?.edges?.[0]?.node?.text
      const start = parseCaptionDate(caption, now)
      const title = titleFromCaption(caption)
      if (!start || !title) continue
      events.push({
        title,
        url: node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : `https://www.instagram.com/${username}/`,
        start,
        venue: node.location?.name,
        address: extractAddress(caption, node.location),
        description: caption,
        categoryHint: categorize(title, caption) === 'other' ? undefined : categorize(title, caption),
        source: 'instagram',
      })
    }
    await sleep(1_000)
  }
  return events
}
