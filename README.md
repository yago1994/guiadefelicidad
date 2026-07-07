# Guía de Felicidad · Atlanta

A living map of Atlanta where pins appear **contextually** — only what's open, in season, or happening right now. Snapchat-hotspot energy: a concert in the park shows up as a pin while it's on; the jasmine wall only appears April–June; the Sunday market only on Sunday mornings.

**Live site:** https://yago1994.github.io/guiadefelicidad/

## How it works

- **Fully static** — Vite + React + [MapLibre GL](https://maplibre.org/) with free [OpenFreeMap](https://openfreemap.org/) tiles, hosted on GitHub Pages. No backend.
- **Two sources of truth:**
  1. **Curated pins** in [public/data/pins.json](public/data/pins.json), managed from the site itself in admin mode.
  2. **Scraped events** in `public/data/events.json`, refreshed nightly by a GitHub Actions cron ([.github/workflows/scrape-events.yml](.github/workflows/scrape-events.yml)) that sweeps Eventbrite Atlanta listings (incl. a Beltline keyword search) and the Creative Loafing calendar, geocodes via Nominatim (cached), and categorizes by keywords.
- **Time scopes** — Now / Today / This week / All. "Now" honors seasons (months), weekdays, opening hours, and date windows; **peak hours** make a marker glow. "All" shows everything, dimming what's closed right now.
- **Experiences** — ordered pin chains ("coffee → Beltline → jasmine wall") drawn as a dashed path with a step-by-step follow mode and Google Maps directions per stop.
- **Media** — pins can carry short videos, images, and voice notes (recorded right in the browser), stored in `public/media/`.

## Admin mode

Open `/#/admin` on the site and paste a **fine-grained GitHub personal access token** with *Contents: read & write* on this repo only ([create one here](https://github.com/settings/personal-access-tokens/new)). The token lives only in your browser's localStorage.

Every save is a commit to `main`, which redeploys the site (~2 min):

- **📍 Add pin** — tap the map, fill the form (category, description, seasonality, hours, peak hours, date windows).
- **✏️ Edit pin** — open a pin → *Edit pin*. Upload video/audio/images (≤ 25 MB) or record a voice note. Media shows on the live site after the deploy.
- **🏷️ Categories** — add/edit categories (emoji icon + color).
- **✨ New experience** — tap pins in order, annotate stops, save.

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

See [src/lib/types.ts](src/lib/types.ts). A pin's `availability` supports `months`, `days` (weekdays), `hours` (may cross midnight), `dateRanges`, and `peakHours` — all optional; omitted means unrestricted.

## Not in v1

- Real-time crowd/occupancy data (no official Google API; the "peak" glow is where it would plug in — e.g. via BestTime.app later).
- Instagram event ingestion (bot-blocked, against ToS).
- discoveratlanta.com scraping (hard 403 bot wall).
