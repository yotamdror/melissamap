# Melissa Map

My wife has kept a list of NYC restaurants for over a decade — places to try, places she's been and liked enough to keep. It started as a Google Doc, then we moved it to a Google Sheet so the data could be relational: neighborhood, borough, category, whether she'd been. She could only filter by whatever categories existed, so I added cuisine as its own filter on top of that.

Keeping the map in sync with the sheet was still on me, manually. I'd promised to do it once a month, ten minutes tops — I mostly didn't, unless Melissa bugged me. This automates that part: the sheet stays canonical, the map updates itself.

**Live:** [melissamap.empirerecords.nyc](https://melissamap.empirerecords.nyc)

## What it does

- Centers on wherever you're standing, pins color-coded by category and visited status
- Filters by cuisine, neighborhood, price, open-now, notes — live-suggest search, not a form
- Admin can add, edit, delete a place right from the map, writing straight back to the sheet
- Weekly sync re-enriches everything automatically

## Data

Sheet's canonical. Weekly sync reads it, hits the Places API per row, writes what the app serves. Admin edits from the map update the sheet and that session immediately; everyone else sees it after the next sync. Since the sheet is the actual backend, this map is just one frontend on it — she's not locked into Google Maps, Yelp, or (god forbid) Foursquare to keep track of any of it.

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

## Stack

React + TypeScript / Vite, Google Maps JS API, Vercel serverless, Google Sheets + Places APIs, JWT cookie auth (admin/viewer), hosted on Vercel.

## Running locally

```bash
git clone https://github.com/yotamdror/melissamap.git
cd melissamap
npm install
cp .env.example .env
# fill in the values described in .env.example
```

`npm run dev` checks component structure and styling only — there are no `/api/*` routes, so auth fake-passes and place data 404s. Use `vercel dev` for the real thing: auth and the Sheets-backed API included.

## Next

- Natural-language search — "something cheap and Japanese near me"
- A shareable link to a single pin
- Per-person "been there," for real multi-user use
