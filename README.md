# MelissaMap

A personalized, interactive map of NYC restaurants, bars, and cafes — built for discovering great spots nearby.

## What It Is

MelissaMap is a password-protected webapp that turns a curated Google Sheet into a living, searchable map of NYC food and drink spots. Standing at 18th and 7th Ave and hungry? Open MelissaMap, see what's nearby, filter by type or vibe, and go.

## Features

- **Live map** — centers on your current location via the browser Geolocation API (falls back to a fixed NYC center if permission is denied or unavailable)
- **Filtered views** — toggle between Restaurants, Bars, and Snacks/Dessert
- **"Been there" vs. "Want to go"** — color-coded pins based on visit history
- **Search** — filter by name, notes, neighborhood, or cuisine
- **Claude-powered search** *(planned)* — ask in natural language: "something cheap and Japanese near me"
- **Password protected** — private by default; shared with trusted friends
- **Mobile-first** — fast, tap-friendly, works great on iPhone

## Data Source

Backed by a Google Sheet with the following columns:

| Column | Values |
|---|---|
| Have I been? | `y` or blank |
| Restaurant | `y` or blank |
| Snacks/Dessert | `y` or blank |
| Bar | `y` or blank |
| Notes | free text |
| Neighborhood | e.g. Chelsea, West Village |
| Borough | e.g. Manhattan, Brooklyn |
| City | e.g. NYC |

The sheet is the source of truth — add a row, refresh the map.

## Tech Stack

- **Frontend** — React + TypeScript, Vite
- **Map** — Google Maps JavaScript API (`@vis.gl/react-google-maps`)
- **Data** — Google Sheets API (read-only) + Google Places API for enrichment
- **Auth** — shared password, JWT session cookie
- **AI search** *(planned, v2)* — Anthropic Claude API for natural-language filtering
- **Hosting** — Vercel

## Getting Started

```bash
# clone
git clone https://github.com/yotamedror/melissamap.git
cd melissamap

# install
npm install

# configure
cp .env.example .env
# fill in: GOOGLE_SHEET_ID, MAPS_API_KEY, APP_PASSWORD, (optional) ANTHROPIC_API_KEY

# dev
npm run dev
```

## Roadmap

### v1
- [x] Google Sheet → map data pipeline (service account, read-only)
- [x] Google Places API enrichment — geocode each row for lat/lng; also pull cuisine, price level, and hours while we're there
- [ ] Weekly cron job — GitHub Actions workflow + secrets are in place, not yet verified with a real run
- [x] "Last updated" date shown in map UI
- [x] Map view with current-location overlay (Google Maps, not Mapbox)
- [x] Filter sidebar — type (restaurant/bar/snack), price ($–$$$$), open now, borough, visited vs. want-to-go
- [x] Text search on name, notes, neighborhood, and cuisine
- [ ] Shared password gate — built (JWT cookie), but not yet verified end-to-end in a real deployment (`vite dev` alone can't run the auth API routes)
- [ ] Mobile layout polish — only checked in a desktop-browser phone-sized viewport so far, not a real device/Safari
- [ ] Share a spot (deeplink to pin)

### v2
- [ ] Claude-powered natural language search ("cheap ramen near me")
- [ ] Multi-user auth — viewer vs. editor roles
- [ ] In-app editing — add/edit spots without touching Google Sheets
