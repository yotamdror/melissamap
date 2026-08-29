# Melissa Map

My wife has kept a running list of New York restaurants for over a decade — places she wants to try, places she's been and liked enough to keep. It started as a Google Doc. We moved it to a Google Sheet so the data could be relational: neighborhood, borough, category, whether she'd actually been. The list stayed accurate. Turning it into something useful while standing on a corner, hungry, in a specific neighborhood — that part stayed manual.

That's what this is. The Sheet is still the source of truth. Melissa Map reads it, enriches every row with real hours, ratings, and location from Google Places, and puts the whole thing on a map she can filter and search from her phone.

**Live:** [melissamap.empirerecords.nyc](https://melissamap.empirerecords.nyc)

## Why curated, not just search

New York has more restaurants than anyone can evaluate, and most of what's near you on a generic map search isn't worth walking into. A decade of "been there, worth remembering" and "want to try" beats an unfiltered list — filtered by neighborhood, price, category, whether she's been, and whatever note she left herself. Adding a place is still just a row in the Sheet.

## What it does

- Opens centered on wherever you're standing, pins color-coded by category and visited status
- Filters by cuisine, neighborhood, price, open-now, and notes — a live-suggest search bar, not a form
- Lets an admin add, edit, or delete a place right from the map, writing straight back to the Sheet
- Re-enriches the full list weekly, so hours and ratings don't drift stale between edits

## How the data flows

The Google Sheet is canonical. A weekly sync reads it, calls Google Places for each row, and writes the enriched data the app actually serves. An admin edit made from the map updates the Sheet and that session's view immediately; everyone else sees it after the next sync.

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

## Under the hood

React + TypeScript on Vite. Google Maps JS API for the map. Vercel serverless functions for the backend. Google Sheets + Places APIs for data. A JWT session cookie for the two roles, admin and viewer. Hosted on Vercel.

## Running it locally

```bash
git clone https://github.com/yotamdror/melissamap.git
cd melissamap
npm install
cp .env.example .env
# fill in the values described in .env.example
```

`npm run dev` checks component structure and styling only — there are no `/api/*` routes, so auth fake-passes and place data 404s. Use `vercel dev` for the real thing: auth and the Sheets-backed API included.

## What's next

- Natural-language search — "something cheap and Japanese near me"
- A shareable link to a single pin
- Per-person "been there," for real multi-user use
