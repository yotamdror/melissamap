/**
 * Reads the Google Sheet, enriches new rows via Places API,
 * and writes the result to public/data/places.json.
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
const OUTPUT_PATH = path.join(__dirname, '../public/data/places.json');

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

const CUISINE_TYPES = new Set([
  'italian_restaurant', 'chinese_restaurant', 'japanese_restaurant',
  'mexican_restaurant', 'indian_restaurant', 'french_restaurant',
  'american_restaurant', 'thai_restaurant', 'mediterranean_restaurant',
  'greek_restaurant', 'korean_restaurant', 'vietnamese_restaurant',
  'middle_eastern_restaurant', 'sushi_restaurant', 'pizza_restaurant',
  'ramen_restaurant', 'burger_restaurant', 'seafood_restaurant',
  'steakhouse', 'vegetarian_restaurant', 'vegan_restaurant',
  'bakery', 'cafe', 'bar', 'wine_bar', 'cocktail_bar',
  'dessert_shop', 'ice_cream_shop', 'deli', 'sandwich_shop',
  'brunch_restaurant', 'breakfast_restaurant', 'barbecue_restaurant',
]);

function extractCuisine(types: string[]): string | undefined {
  const match = types.find(t => CUISINE_TYPES.has(t));
  if (!match) return undefined;
  return match.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
    range: 'Sheet1!A2:I', // skip header row
  });

  return (response.data.values ?? []) as string[][];
}

async function enrichPlace(
  name: string,
  city: string,
  maps: MapsClient,
): Promise<Partial<Place>> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY!;

  // 1. Text search to get place_id + coordinates
  const searchRes = await maps.findPlaceFromText({
    params: {
      input: `${name}, ${city || 'New York City'}`,
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
  const periods: OpenPeriod[] = (detail.opening_hours?.periods ?? [])
    .filter(p => p.open && p.close)
    .map(p => ({
      day: p.open!.day,
      open: p.open!.time,
      close: p.close!.time,
    }));

  return {
    lat: candidate.geometry.location.lat,
    lng: candidate.geometry.location.lng,
    placeId: candidate.place_id,
    address: detail.formatted_address,
    cuisine: extractCuisine(detail.types ?? []),
    priceLevel: detail.price_level as 1 | 2 | 3 | 4 | undefined,
    openPeriods: periods.length ? periods : undefined,
    weekdayHours: detail.opening_hours?.weekday_text ?? undefined,
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

  const maps = new MapsClient();
  const places: Place[] = [];

  for (const row of rows) {
    const name = row[COL.NAME]?.trim();
    if (!name) continue;

    const id = rowToId(name);
    const city = row[COL.CITY]?.trim() || 'New York City';

    const base: Place = {
      id,
      name,
      hasBeenTo: row[COL.BEEN]?.trim().toLowerCase() === 'y',
      isRestaurant: row[COL.RESTAURANT]?.trim().toLowerCase() === 'y',
      isSnacksDessert: row[COL.SNACK]?.trim().toLowerCase() === 'y',
      isBar: row[COL.BAR]?.trim().toLowerCase() === 'y',
      notes: row[COL.NOTES]?.trim() || '',
      neighborhood: row[COL.NEIGHBORHOOD]?.trim() || '',
      borough: row[COL.BOROUGH]?.trim() || '',
      city,
    };

    const cached = existingById.get(id);
    if (cached?.lat != null) {
      // Preserve enrichment but refresh sheet data (notes, visited status, etc.)
      places.push({ ...cached, ...base, lat: cached.lat, lng: cached.lng });
      console.log(`  [cached] ${name}`);
    } else {
      console.log(`  [enriching] ${name}`);
      const enriched = await enrichPlace(name, city, maps);
      places.push({ ...base, ...enriched });
      // Small delay to avoid Places API rate limits
      await new Promise(r => setTimeout(r, 200));
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
