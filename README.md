# Guía de Felicidad · Atlanta

A living map of Atlanta where pins appear **contextually** — only what's open, in season, or happening right now. Snapchat-hotspot energy: a concert in the park shows up as a pin while it's on; the jasmine wall only appears April–June; the Sunday market only on Sunday mornings.

**Live site:** https://yago1994.github.io/guiadefelicidad/

## How it works

- **Fully static** — Vite + React + [MapLibre GL](https://maplibre.org/) with free [OpenFreeMap](https://openfreemap.org/) tiles, hosted on GitHub Pages. No backend.
- **Two sources of truth:**
  1. **Curated pins** in [public/data/pins.json](public/data/pins.json), managed from the site itself in admin mode.
  2. **Scraped events** in `public/data/events.json`, refreshed weekly (Mondays) by a GitHub Actions cron ([.github/workflows/scrape-events.yml](.github/workflows/scrape-events.yml)) that sweeps Eventbrite Atlanta listings (incl. a Beltline keyword search), the Creative Loafing calendar, and The Goat Farm's event calendar, geocodes via Nominatim (cached), and categorizes by keywords. Only events in the next 14 days are kept — comfortably inside the weekly cadence, so nothing falls through the gap between runs.
- **Place search** — the 🔍 button searches restaurants, parks, and landmarks around Atlanta via [Photon](https://photon.komoot.io/) on OpenStreetMap data (free, no key). Anyone can search and get directions; in admin mode, *Add as pin* pre-fills the pin editor and imports the place's opening hours and website from OSM when available.
- **Time scopes** — Now / Today / This week / All. "Now" honors seasons (months), weekdays, opening hours, date windows, and recurring patterns; **peak hours** make a marker glow. "All" shows everything, dimming what's closed right now.
- **Recurring patterns** — a pin can exist on an "Nth weekday of the month" schedule (e.g. Critical Mass = last Friday of every month). Combine with "months" for a once-a-year event (e.g. Chomp and Stomp = 1st Saturday of November) — see `Availability.recurrence` in [types.ts](src/lib/types.ts).
- **Experiences** — ordered pin chains ("coffee → Beltline → jasmine wall") drawn as a dashed path with a step-by-step follow mode and Google Maps directions per stop. Each experience has a **type** (Signature route, Food crawl, Nature & outdoors, Date night, Nightlife…) that sets its path/marker color — manage types from admin mode (🎭 Experience types).
- **Media** — pins can carry short videos, images, and voice notes (recorded right in the browser), stored in `public/media/`.
- **Line pins** — a pin can be a whole walkable stretch (like the Beltline Eastside Trail): it draws as a colored line that follows the same visibility rules and glows at peak hours.
- **Google Maps list sync** — import places from a shared Google Maps list (`maps.app.goo.gl/…`). The [sync workflow](.github/workflows/sync-google-list.yml) drives headless Chromium to read the list (no official API exists), then merges places into `pins.json` as `gmap-*` pins — your edits to category, hours, and media on imported pins survive re-syncs, and nothing is ever deleted. Trigger it from admin mode (⟳ Sync Google list) or from the Actions tab.

## Admin mode

Open `/#/admin` on the site and paste a **fine-grained GitHub personal access token** scoped to this repo only, with *Contents: read & write* — plus *Actions: read & write* if you want the ⟳ Sync Google list button ([create one here](https://github.com/settings/personal-access-tokens/new)). The token lives only in your browser's localStorage.

Every save is a commit to `main`, which redeploys the site (~2 min):

- **📍 Add pin** — tap the map, fill the form (category, description, seasonality, hours, peak hours, date windows).
- **Live-edit description** — click a pin's description right in its card and start typing; it saves on blur, no need to open the full editor. Errors (e.g. network) show inline and keep your edit so nothing is lost.
- **✏️ Edit pin** — open a pin → *Edit pin* for everything else (category, availability, media). Upload video/audio/images (≤ 25 MB) or record a voice note. Media shows on the live site after the deploy.
- **↔️ Move a pin** — just drag its marker; confirm and it commits.
- **〰️ Draw line pin** — tap along a route, *Finish*, then fill the pin form. To edit later: open the pin → *Reshape on map* — drag points to move them, tap a point to remove it, drag a small mid-segment handle to add one, tap the map to extend the end.
- **🏷️ Categories** — add/edit categories (emoji icon + color).
- **✨ New experience** — tap pins in order, annotate stops, pick a type, save.
- **🎭 Experience types** — add/rename/recolor types; experiences using a deleted type fall back to the first remaining one.
- **⟳ Sync Google list** — paste your shared list link once; each press re-imports the list via GitHub Actions.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # visibility-engine unit tests
npm run scrape     # run the events scraper locally
npm run build      # production build (tsc + vite)
```

Testing tip: append `?t=2026-04-15T18:30` to the URL to fake the clock and preview seasonal/hourly visibility.

## Data model

See [src/lib/types.ts](src/lib/types.ts). A pin's `availability` supports `months`, `days` (weekdays), `hours` (may cross midnight), `dateRanges`, `recurrence` (nth-weekday-of-month), and `peakHours` — all optional; omitted means unrestricted.

## Not in v1

- Real-time crowd/occupancy data (no official Google API; the "peak" glow is where it would plug in — e.g. via BestTime.app later).
- Instagram event ingestion (bot-blocked, against ToS).
- discoveratlanta.com scraping (hard 403 bot wall).
