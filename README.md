# MelissaMap

A personalized, interactive map of NYC restaurants, bars, and cafes — built for discovering great spots nearby.

## What It Is

MelissaMap is a password-protected webapp that turns a curated Google Sheet into a living, searchable map of NYC food and drink spots. Standing at 18th and 7th Ave and hungry? Open MelissaMap, see what's nearby, filter by type or vibe, and go.

## Features

- **Live map** — overlaid on your current location (mobile GPS + desktop geolocation)
- **Filtered views** — toggle between Restaurants, Bars, and Snacks/Dessert
- **"Been there" vs. "Want to go"** — color-coded pins based on visit history
- **Search** — filter by neighborhood, borough, or free-text notes
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

## Tech Stack *(planned)*

- **Frontend** — React + TypeScript, Vite
- **Map** — Mapbox GL JS
- **Data** — Google Sheets API (read-only)
- **Auth** — simple shared password (JWT or session cookie)
- **AI search** *(v2)* — Anthropic Claude API for natural-language filtering
- **Hosting** — Vercel or Netlify (edge-optimized for mobile)

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
- [ ] Google Sheet → map data pipeline (service account, read-only)
- [ ] Map view with current-location overlay (Mapbox)
- [ ] Filter sidebar — type (restaurant/bar/snack), borough, visited vs. want-to-go
- [ ] Text search on name and notes
- [ ] Shared password gate (single password, JWT cookie)
- [ ] Mobile layout polish
- [ ] Share a spot (deeplink to pin)

### v2
- [ ] Google Places API enrichment — pull cuisine, price level, hours per row
- [ ] Filter by cuisine, price ($–$$$$), open now
- [ ] Claude-powered natural language search ("cheap ramen near me")
- [ ] Multi-user auth — viewer vs. editor roles
- [ ] In-app editing — add/edit spots without touching Google Sheets
