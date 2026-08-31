/**
 * Checks every enriched place's Google Places business status and marks
 * permanently-closed or no-longer-found places as closed in the Sheet
 * (canonical) rather than deleting them - sync.ts then excludes anything
 * marked closed from the generated places.json, hiding it from the map
 * while keeping the row (and the option to un-mark it) intact.
 *
 * Defaults to a dry run that only prints the candidate list. Pass --apply
 * to actually write the Sheet and update the local cache.
 *
 * Run manually: npm run prune-closed [-- --apply]
 * Runs automatically (with --apply): GitHub Actions on a quarterly schedule
 */

import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { Place, PlacesData } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../data/places.json');
const CLOSED_COL = 'J'; // Column after City (I) - see scripts/sync.ts COL comment.

const APPLY = process.argv.includes('--apply');

type BusinessStatus = 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | 'NOT_FOUND' | 'ERROR';

async function fetchBusinessStatus(placeId: string, apiKey: string): Promise<BusinessStatus> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'businessStatus',
    },
  });
  if (res.status === 404) return 'NOT_FOUND';
  if (!res.ok) {
    console.warn(`  Places lookup failed for ${placeId}: ${res.status}`);
    return 'ERROR';
  }
  const data = (await res.json()) as { businessStatus?: BusinessStatus };
  return data.businessStatus ?? 'OPERATIONAL';
}

async function markSheetRowsClosed(toClose: Place[]) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'RestaurantList!A2:I',
  });
  const rows = existing.data.values ?? [];

  // A place can be split across multiple sheet rows (one per type checkbox -
  // see scripts/sync.ts mergeRows), so every row sharing name+neighborhood
  // with a closed place needs the mark, not just the first match.
  const closeKeys = new Set(toClose.map(p => `${p.name} ${p.neighborhood ?? ''}`));
  const rowIndicesToMark = rows
    .map((r, i) => ({ i, key: `${r[0]} ${r[6] ?? ''}` }))
    .filter(({ key }) => closeKeys.has(key))
    .map(({ i }) => i);

  if (!rowIndicesToMark.length) return;

  const data = rowIndicesToMark.map(rowIndex => {
    const sheetRow = rowIndex + 2; // +1 for header, +1 for 0-index -> 1-index
    return {
      range: `RestaurantList!${CLOSED_COL}${sheetRow}`,
      values: [['y']],
    };
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
}

async function main() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not set');
  if (!process.env.GOOGLE_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set');
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');

  if (!fs.existsSync(OUTPUT_PATH)) {
    console.log('No places.json cache found, nothing to check.');
    return;
  }
  const cache: PlacesData = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));

  // Only places we've successfully matched to a Google Places ID can be
  // verified this way. Places that never resolved (bad search text, etc.)
  // are left alone rather than risk mis-flagging a real place on a false
  // negative - that failure mode is for a human to notice, not auto-close.
  const checkable = cache.places.filter((p): p is Place & { placeId: string } => !!p.placeId);
  console.log(`Checking ${checkable.length} of ${cache.places.length} places (with a resolved Place ID)…`);

  const tally: Record<BusinessStatus, number> = {
    OPERATIONAL: 0, CLOSED_TEMPORARILY: 0, CLOSED_PERMANENTLY: 0, NOT_FOUND: 0, ERROR: 0,
  };
  const toClose: (Place & { status: BusinessStatus })[] = [];
  for (const place of checkable) {
    const status = await fetchBusinessStatus(place.placeId, apiKey);
    tally[status]++;
    if (status === 'CLOSED_PERMANENTLY' || status === 'NOT_FOUND') {
      // A closed/missing result gets one confirmatory re-check before it's
      // trusted - a prior run flagged ~3x more places than a check an hour
      // earlier with nothing else changed, and this catches that kind of
      // inconsistency without having to explain its cause.
      await new Promise(r => setTimeout(r, 1000));
      const confirm = await fetchBusinessStatus(place.placeId, apiKey);
      if (confirm === status) {
        toClose.push({ ...place, status });
      } else {
        console.warn(`  [unconfirmed] ${place.name}: ${status} then ${confirm} on re-check - skipping`);
      }
    }
    // Small delay to avoid Places API rate limits.
    await new Promise(r => setTimeout(r, 250));
  }

  console.log(`Status tally: ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(', ')}`);

  if (!toClose.length) {
    console.log('No closed or missing places found.');
    return;
  }

  console.log(`\nFound ${toClose.length} place(s) to mark closed:\n`);
  for (const p of toClose) {
    console.log(`  - ${p.name}${p.neighborhood ? ` (${p.neighborhood})` : ''} - ${p.status}${p.address ? `\n      ${p.address}` : ''}`);
  }

  if (!APPLY) {
    console.log('\nDry run only - nothing written. Re-run with --apply to mark these closed in the Sheet.');
    return;
  }

  console.log('\nMarking closed in the Sheet…');
  await markSheetRowsClosed(toClose);

  const closedIds = new Set(toClose.map(p => p.id));
  const output: PlacesData = {
    lastUpdated: new Date().toISOString(),
    places: cache.places.filter(p => !closedIds.has(p.id)),
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Done. Marked ${toClose.length} place(s) closed and hid them, ${output.places.length} remain visible.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
