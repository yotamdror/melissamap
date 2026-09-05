/**
 * Reads the Google Sheet, enriches new rows via Places API,
 * and writes the result to data/places.json.
 *
 * Run manually: npm run sync
 * Runs automatically: GitHub Actions on a weekly schedule
 */

import { google } from 'googleapis';
import { Client as MapsClient, PlaceInputType } from '@googlemaps/google-maps-services-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { Place, PlacesData, OpenPeriod } from '../src/types';
import { getPlaceSearchQuery } from '../src/placeSearchOverrides';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../data/places.json');
const DEFAULT_MAX_ENRICHMENTS = 25;

function getMaxEnrichments(): number {
  const argument = process.argv.find(arg => arg.startsWith('--max-enrichments='));
  if (!argument) return DEFAULT_MAX_ENRICHMENTS;

  const value = Number(argument.split('=', 2)[1]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('--max-enrichments must be a non-negative integer');
  }
  return value;
}

// ── Sheet column indices (0-based) ──────────────────────────────────────────
// A=0  Name
// B=1  Have I been? (y or blank)
// C=2  Restaurant (y or blank)
// D=3  Snacks/Dessert (y or blank)
// E=4  Bar (y or blank)
// F=5  Notes
// G=6  Neighborhood
// H=7  Borough
// I=8  City
// J=9  Closed (y or blank) - set by scripts/prune-closed.ts, not hand-edited
const COL = {
  NAME: 0,
  BEEN: 1,
  RESTAURANT: 2,
  SNACK: 3,
  BAR: 4,
  NOTES: 5,
  NEIGHBORHOOD: 6,
  BOROUGH: 7,
  CITY: 8,
  CLOSED: 9,
} as const;

// Types that convey no specific/useful information about what a place
// actually is - everything else Google returns (cuisines, dish types, venue
// formats like "bakery"/"bar") is kept. A denylist beats a hand-maintained
// allowlist here: an allowlist silently drops anything we forgot to list
// (verified: it missed "chocolate_shop", "hamburger_restaurant" typo'd as
// "burger_restaurant"), while a denylist only needs to be right about the
// handful of types that are always uninformative.
const GENERIC_FILLER_TYPES = new Set([
  'establishment', 'point_of_interest', 'food', 'restaurant', 'store', 'food_store',
]);

function humanize(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Returns the display cuisine (prefers Google's own primaryType when it's
// specific) and every non-generic tag (for search - "italian" should match
// even if the display badge ended up showing something else).
function extractCuisine(
  types: string[],
  primaryType?: string,
): { cuisine?: string; cuisineTags: string[] } {
  const specific = types.filter(t => !GENERIC_FILLER_TYPES.has(t));
  const cuisine = primaryType && !GENERIC_FILLER_TYPES.has(primaryType)
    ? primaryType
    : specific[0];
  return {
    cuisine: cuisine ? humanize(cuisine) : undefined,
    cuisineTags: specific.map(humanize),
  };
}

function rowToId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function readSheet(): Promise<string[][]> {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');

  const credentials = JSON.parse(serviceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'RestaurantList!A2:J', // skip header row
  });

  return (response.data.values ?? []) as string[][];
}

interface RichDetails {
  types: string[];
  primaryType?: string;
  rating?: number;
  ratingCount?: number;
}

async function fetchRichDetails(placeId: string, apiKey: string): Promise<RichDetails> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'types,primaryType,rating,userRatingCount',
    },
  });
  if (!res.ok) return { types: [] };
  const data = (await res.json()) as {
    types?: string[];
    primaryType?: string;
    rating?: number;
    userRatingCount?: number;
  };
  return {
    types: data.types ?? [],
    primaryType: data.primaryType,
    rating: data.rating,
    ratingCount: data.userRatingCount,
  };
}

async function enrichPlace(
  id: string,
  name: string,
  neighborhood: string,
  city: string,
  maps: MapsClient,
): Promise<Partial<Place>> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY!;

  // Include the neighborhood so multi-location spots (chains, etc.) resolve to
  // the correct branch instead of all collapsing onto the same match.
  const locationPart = neighborhood
    ? `${neighborhood}, ${city || 'New York City'}`
    : city || 'New York City';

  // 1. Text search to get place_id + coordinates
  const searchRes = await maps.findPlaceFromText({
    params: {
      input: getPlaceSearchQuery(id, name, locationPart),
      inputtype: PlaceInputType.textQuery,
      fields: ['place_id', 'geometry', 'name'],
      key: apiKey,
    },
  });

  const candidate = searchRes.data.candidates?.[0];
  if (!candidate?.place_id || !candidate.geometry?.location) {
    console.warn(`  No Places result for: ${name}`);
    return {};
  }

  // 2. Place details for enrichment data
  const detailRes = await maps.placeDetails({
    params: {
      place_id: candidate.place_id,
      fields: ['price_level', 'types', 'opening_hours', 'formatted_address'],
      key: apiKey,
    },
  });

  const detail = detailRes.data.result;

  // The legacy Details `types` field rarely carries cuisine granularity (e.g. a
  // pizza place just comes back as ["restaurant", "food", ...]). Places API
  // (New) has a much richer type taxonomy, plus rating data the legacy call
  // doesn't return here - fetch both in one request.
  const rich = await fetchRichDetails(candidate.place_id, apiKey);
  const periods: OpenPeriod[] = (detail.opening_hours?.periods ?? [])
    .filter(p => p.open && p.close)
    .map(p => ({
      day: p.open!.day,
      open: p.open!.time,
      close: p.close!.time,
    }));

  const { cuisine, cuisineTags } = extractCuisine(
    rich.types.length ? rich.types : (detail.types ?? []),
    rich.primaryType,
  );

  return {
    lat: candidate.geometry.location.lat,
    lng: candidate.geometry.location.lng,
    placeId: candidate.place_id,
    address: detail.formatted_address,
    cuisine,
    cuisineTags,
    priceLevel: detail.price_level as 1 | 2 | 3 | 4 | undefined,
    openPeriods: periods.length ? periods : undefined,
    weekdayHours: detail.opening_hours?.weekday_text ?? undefined,
    googleRating: rich.rating,
    googleRatingCount: rich.ratingCount,
  };
}

interface RawRow {
  name: string;
  city: string;
  neighborhood: string;
  borough: string;
  notes: string;
  hasBeenTo: boolean;
  isRestaurant: boolean;
  isSnacksDessert: boolean;
  isBar: boolean;
  closed: boolean;
}

// Rows that share a name AND a neighborhood are the same physical place split
// across multiple sheet rows (one row per type checkbox) - merge their type
// flags. Rows that share a name but differ in neighborhood are distinct
// locations (e.g. chains) that happen to have the same name.
function mergeRows(id: string, rows: RawRow[]): Place {
  const first = rows[0];
  return {
    id,
    name: first.name,
    hasBeenTo: rows.some(r => r.hasBeenTo),
    isRestaurant: rows.some(r => r.isRestaurant),
    isSnacksDessert: rows.some(r => r.isSnacksDessert),
    isBar: rows.some(r => r.isBar),
    notes: [...new Set(rows.map(r => r.notes).filter(Boolean))].join('; '),
    neighborhood: first.neighborhood,
    borough: first.borough,
    city: first.city,
    closed: rows.some(r => r.closed),
  };
}

async function main() {
  console.log('Reading sheet…');
  const rows = await readSheet();
  console.log(`Found ${rows.length} rows`);

  // Load existing cache to avoid re-calling Places API for known places
  let existing: PlacesData = { lastUpdated: null, places: [] };
  if (fs.existsSync(OUTPUT_PATH)) {
    existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
  }
  const existingById = new Map(existing.places.map(p => [p.id, p]));

  const raw: RawRow[] = [];
  for (const row of rows) {
    const name = row[COL.NAME]?.trim();
    if (!name) continue;
    raw.push({
      name,
      city: row[COL.CITY]?.trim() || 'New York City',
      neighborhood: row[COL.NEIGHBORHOOD]?.trim() || '',
      borough: row[COL.BOROUGH]?.trim() || '',
      notes: row[COL.NOTES]?.trim() || '',
      hasBeenTo: row[COL.BEEN]?.trim().toLowerCase() === 'y',
      isRestaurant: row[COL.RESTAURANT]?.trim().toLowerCase() === 'y',
      isSnacksDessert: row[COL.SNACK]?.trim().toLowerCase() === 'y',
      isBar: row[COL.BAR]?.trim().toLowerCase() === 'y',
      // Marked closed by scripts/prune-closed.ts - kept in the generated
      // output (not dropped) so the admin-only "closed" filter can show it.
      closed: row[COL.CLOSED]?.trim().toLowerCase() === 'y',
    });
  }

  const byBaseId = new Map<string, RawRow[]>();
  for (const r of raw) {
    const baseId = rowToId(r.name);
    if (!byBaseId.has(baseId)) byBaseId.set(baseId, []);
    byBaseId.get(baseId)!.push(r);
  }

  const maps = new MapsClient();
  const places: Place[] = [];

  // Every uncached place currently triggers three Google Places requests:
  // Find Place (Legacy), Place Details (Legacy), and Place Details (New).
  // A full cache rebuild can therefore become expensive very quickly. Refuse
  // unexpectedly large batches unless the operator explicitly raises the cap.
  let enrichmentCount = 0;
  for (const [baseId, groupRows] of byBaseId) {
    const distinctNeighborhoods = new Set(groupRows.map(r => r.neighborhood));
    const multiLocation = distinctNeighborhoods.size > 1;
    for (const neighborhood of distinctNeighborhoods) {
      const id = multiLocation
        ? `${baseId}--${rowToId(neighborhood) || 'unknown'}`
        : baseId;
      if (existingById.get(id)?.lat == null) enrichmentCount++;
    }
  }

  const maxEnrichments = getMaxEnrichments();
  console.log(
    `Enrichment plan: ${enrichmentCount} uncached place(s), up to ${enrichmentCount * 3} Places API request(s)`,
  );
  if (enrichmentCount > maxEnrichments) {
    throw new Error(
      `Refusing to enrich ${enrichmentCount} places; safety cap is ${maxEnrichments}. ` +
      `Review the cache and billing estimate first, then explicitly run with ` +
      `--max-enrichments=${enrichmentCount} if this spend is intentional.`,
    );
  }

  for (const [baseId, groupRows] of byBaseId) {
    const distinctNeighborhoods = new Set(groupRows.map(r => r.neighborhood));
    const multiLocation = distinctNeighborhoods.size > 1;

    const byNeighborhood = new Map<string, RawRow[]>();
    for (const r of groupRows) {
      if (!byNeighborhood.has(r.neighborhood)) byNeighborhood.set(r.neighborhood, []);
      byNeighborhood.get(r.neighborhood)!.push(r);
    }

    for (const [neighborhood, sameLocationRows] of byNeighborhood) {
      const id = multiLocation
        ? `${baseId}--${rowToId(neighborhood) || 'unknown'}`
        : baseId;
      const merged = mergeRows(id, sameLocationRows);

      const cached = existingById.get(id);
      if (cached?.lat != null) {
        // Preserve enrichment but refresh sheet data (notes, visited status, etc.)
        places.push({ ...cached, ...merged, lat: cached.lat, lng: cached.lng });
        console.log(`  [cached] ${merged.name}`);
      } else {
        console.log(`  [enriching] ${merged.name}${neighborhood ? ` (${neighborhood})` : ''}`);
        const enriched = await enrichPlace(id, merged.name, neighborhood, merged.city, maps);
        places.push({ ...merged, ...enriched });
        // Small delay to avoid Places API rate limits
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  const output: PlacesData = {
    lastUpdated: new Date().toISOString(),
    places,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Done. Wrote ${places.length} places to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
