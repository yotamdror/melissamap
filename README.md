# Melissa Map

A password-protected, interactive map of NYC restaurants, bars, and snack spots — curated in a Google Sheet, enriched with live data from Google Places, and browsable on the go.

**Live:** [melissamap.empirerecords.nyc](https://melissamap.empirerecords.nyc)

## What it is

Standing somewhere in NYC and hungry? Open Melissa Map, see what's nearby, filter by category/price/vibe, and go. Under the hood, a Google Sheet is the source of truth for the curated list — add a row there (or through the app itself, if you're an admin) and it's enriched with location, hours, rating, and cuisine automatically.

## Features

- **Interactive map** — Google Maps with current-location centering, color-coded pins by category (restaurant/bar/snack) and visited status, plus a list view as an alternative
- **Fast filtering** — a slim, always-visible search bar with live suggestions (cuisine + neighborhood), and a collapsible sheet for category/price/status/open-now/has-notes filters
- **Two-tier auth** — viewers can browse; admins can add, edit, and delete places directly from the UI, writing straight back to the Google Sheet (no manual spreadsheet editing needed)
- **Immediate enrichment** — a new or edited place is geocoded and enriched via the Google Places API in the same request, so it shows up on the map right away instead of waiting for the next sync
- **Neighborhood autosuggest** — typing a neighborhood suggests existing ones first, so near-duplicate entries don't fragment the filter list
- **Weekly sync** — a scheduled GitHub Actions job re-enriches and refreshes the full dataset
- **Mobile-first** — designed and tested for touch, small viewports, and fast load times throughout

## Tech stack

- **Frontend** — React + TypeScript, Vite
- **Map** — Google Maps JavaScript API (`@vis.gl/react-google-maps`)
- **Backend** — Vercel serverless functions
- **Data** — Google Sheets API (read/write) + Google Places API (New) for enrichment
- **Auth** — JWT session cookie (`jose`), two roles (admin/viewer)
- **Hosting** — Vercel, on a custom domain

## Data model

The Google Sheet is canonical. `npm run sync` reads it, enriches each row via Places API, and writes the tracked `data/places.json` that the app serves from. Admin add/edit/delete actions write directly back to the sheet and update the current session's view immediately — everyone else sees the change after the next sync.

| Sheet column | Values |
|---|---|
| Name | free text |
| Have I been? | `y` or blank |
| Restaurant | `y` or blank |
| Snacks/Dessert | `y` or blank |
| Bar | `y` or blank |
| Notes | free text |
| Neighborhood | e.g. Chelsea, West Village |
| Borough | e.g. Manhattan, Brooklyn |
| City | e.g. New York City |

## Getting started

```bash
git clone https://github.com/yotamdror/melissamap.git
cd melissamap
npm install
cp .env.example .env
# fill in the values described in .env.example
```

`npm run dev` (Vite only) validates component structure and styling but has no `/api/*` routes — auth silently fake-passes and place data 404s. Use `vercel dev` to run the full app, including auth and the Sheets-backed API routes.

## Possible next steps

- Claude-powered natural-language search ("something cheap and Japanese near me")
- Shareable deep link to a single pin
- Per-person "been there" status, for real multi-user usage
