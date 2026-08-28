# MelissaMap project instructions

These rules extend `~/Projects/AGENTS.md` and apply to MelissaMap.

`MOBILE_PROJECT_PROMPT.md` is the ready-to-paste instruction for ChatGPT and
Claude mobile projects. Keep it aligned when durable project rules change.

## Sources of truth

- The Google Sheet is canonical for curated rows. `scripts/sync.ts` reads it,
  enriches rows through Google Places, and generates tracked
  `data/places.json`; do not hand-edit that JSON except for an explicitly
  documented emergency.
- `src/types.ts` owns the data contract, `src/` owns UI/filter behavior, and
  `api/auth.ts`, `api/verify.ts`, and `api/places.ts` own the authentication
  and data-access contract.
- `package.json` owns commands and `.env.example` owns the variable inventory.
- README is kept reconciled with the actual stack (Google Maps, real
  geolocation) as of 2026-08-28 - if it drifts again, prefer code.

## Verification

- Install reproducibly with `npm ci`; verify production output with `npm run
  build`. There is currently no automated test or lint script.
- `npm run dev` validates component structure/styling only - it has no `/api/*`
  routes at all, so auth silently fake-passes (Vite's SPA fallback returns 200
  for `/api/verify`) and place data fails hard (`/api/places` 404s as HTML,
  which breaks JSON parsing - blank screen). Test real behavior through
  `vercel dev` or a preview deploy.
- Mobile checks include password/cookie behavior, GPS permission and denial,
  touch targets, overlays/sidebar, map gestures, markers, info windows, and
  filters. Test Safari/iOS when practical.

## Data, privacy, sync, and deployment

- `data/places.json` lives outside `public/` and is served only through
  `api/places.ts`, which checks the same JWT cookie as `api/verify.ts` - it is
  not a directly fetchable static URL as of 2026-08-28. It is still present in
  earlier Git history from when it was a public static file; treat that
  history as exposed data if it ever needs scrubbing.
- `npm run sync` is networked, mutating, quota-bearing, and rewrites the generated
  JSON. Run it only when asked, with valid credentials, and inspect the diff.
- The weekly GitHub workflow can advance the branch by committing generated
  data. Fetch before pushing and expect sync races.
- Never put passwords, JWT secrets, service-account JSON, API keys, sheet rows,
  or private notes in docs, logs, issues, or mobile-chat handoffs. Frontend Google
  keys remain public and must be appropriately restricted.
- Verify actual Vercel project/domain and branch behavior rather than assuming it.

## Mobile handoff

- Record source/date, commit or preview URL, environment, device/browser, cookie
  state, `places.json.lastUpdated`, active filters, location-permission state,
  observed behavior, and expected behavior. Sanitize before following
  `~/Projects/CONTEXT_BRIDGE.md`.
