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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../data/places.json');

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
} as const;

// Specific cuisine/dish types - checked first, since these are what makes a
// place actually findable by "italian", "sushi", "bbq", etc.
const SPECIFIC_CUISINE_TYPES = new Set([
  'italian_restaurant', 'chinese_restaurant', 'japanese_restaurant',
  'mexican_restaurant', 'indian_restaurant', 'french_restaurant',
  'american_restaurant', 'thai_restaurant', 'mediterranean_restaurant',
  'greek_restaurant', 'korean_restaurant', 'vietnamese_restaurant',
  'middle_eastern_restaurant', 'sushi_restaurant', 'pizza_restaurant',
  'ramen_restaurant', 'burger_restaurant', 'seafood_restaurant',
  'steakhouse', 'vegetarian_restaurant', 'vegan_restaurant',
  'barbecue_restaurant', 'spanish_restaurant', 'turkish_restaurant',
  'lebanese_restaurant', 'brazilian_restaurant', 'caribbean_restaurant',
  'cuban_restaurant', 'ethiopian_restaurant', 'indonesian_restaurant',
]);

// Generic venue-format types - only used as a fallback when no specific
// cuisine type is present, so they don't bury the real cuisine.
const GENERIC_VENUE_TYPES = new Set([
  'bakery', 'cafe', 'bar', 'wine_bar', 'cocktail_bar',
  'dessert_shop', 'ice_cream_shop', 'deli', 'sandwich_shop',
  'brunch_restaurant', 'breakfast_restaurant',
]);

function humanize(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Returns the display cuisine (prefers specific over generic) and every
// matched tag (for search - "italian" should match even if the display
// badge ended up showing something else).
function extractCuisine(types: string[]): { cuisine?: string; cuisineTags: string[] } {
  const specific = types.filter(t => SPECIFIC_CUISINE_TYPES.has(t));
  const generic = types.filter(t => GENERIC_VENUE_TYPES.has(t));
  const cuisine = specific[0] ?? generic[0];
  return {
    cuisine: cuisine ? humanize(cuisine) : undefined,
    cuisineTags: [...specific, ...generic].map(humanize),
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
    range: 'RestaurantList!A2:I', // skip header row
  });

  return (response.data.values ?? []) as string[][];
}

async function fetchRichTypes(placeId: string, apiKey: string): Promise<string[]> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'types' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { types?: string[] };
  return data.types ?? [];
}

async function enrichPlace(
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
      input: `${name}, ${locationPart}`,
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
  // (New) has a much richer type taxonomy - use it for cuisine specifically.
  const richTypes = await fetchRichTypes(candidate.place_id, apiKey);
  const periods: OpenPeriod[] = (detail.opening_hours?.periods ?? [])
    .filter(p => p.open && p.close)
    .map(p => ({
      day: p.open!.day,
      open: p.open!.time,
      close: p.close!.time,
    }));

  const { cuisine, cuisineTags } = extractCuisine(
    richTypes.length ? richTypes : (detail.types ?? []),
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
        const enriched = await enrichPlace(merged.name, neighborhood, merged.city, maps);
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
