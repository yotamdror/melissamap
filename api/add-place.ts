import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jwtVerify } from 'jose';
import { google } from 'googleapis';
import type { Place } from '../src/types';

// Same denylist approach as scripts/sync.ts - see that file for why a
// denylist beats a hand-maintained cuisine allowlist.
const GENERIC_FILLER_TYPES = new Set([
  'establishment', 'point_of_interest', 'food', 'restaurant', 'store', 'food_store',
]);

function humanize(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function extractCuisine(types: string[], primaryType?: string) {
  const specific = types.filter(t => !GENERIC_FILLER_TYPES.has(t));
  const cuisine = primaryType && !GENERIC_FILLER_TYPES.has(primaryType) ? primaryType : specific[0];
  return {
    cuisine: cuisine ? humanize(cuisine) : undefined,
    cuisineTags: specific.map(humanize),
  };
}

function rowToId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.cookies?.auth;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const {
    id: existingId, originalName, originalNeighborhood,
    name, isRestaurant, isBar, isSnacksDessert, neighborhood, notes, hasBeenTo,
  } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!isRestaurant && !isBar && !isSnacksDessert) {
    return res.status(400).json({ error: 'At least one type is required' });
  }

  const city = 'New York City';
  const apiKey = process.env.GOOGLE_MAPS_API_KEY!;

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const rowValues = [
    name,
    hasBeenTo ? 'y' : '',
    isRestaurant ? 'y' : '',
    isSnacksDessert ? 'y' : '',
    isBar ? 'y' : '',
    notes || '',
    neighborhood || '',
    '',
    city,
  ];

  // Editing an existing place updates its row in place; adding a new one
  // appends. The Sheet write happens first and is the durable source of
  // truth - if it fails, nothing else should happen.
  if (originalName) {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'RestaurantList!A2:G',
    });
    const rows = existing.data.values ?? [];
    // Match on name + neighborhood, same compound key the id disambiguation
    // in scripts/sync.ts uses - exact-name matching alone would misfire for
    // the (rare) case of two different-neighborhood places sharing a name.
    const rowIndex = rows.findIndex(
      r => r[0] === originalName && (r[6] ?? '') === (originalNeighborhood ?? ''),
    );
    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Could not find the original row to update' });
    }
    const sheetRow = rowIndex + 2; // +1 for header, +1 for 0-index -> 1-index
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `RestaurantList!A${sheetRow}:I${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'RestaurantList!A:I',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
  }

  const base: Place = {
    id: existingId || rowToId(name),
    name,
    hasBeenTo: !!hasBeenTo,
    isRestaurant: !!isRestaurant,
    isSnacksDessert: !!isSnacksDessert,
    isBar: !!isBar,
    notes: notes || '',
    neighborhood: neighborhood || '',
    borough: '',
    city,
  };

  // 2. Enrich via Places API (New) so it's usable on the map right away in
  // this session. This does NOT persist to data/places.json (Vercel
  // functions have a read-only filesystem) - full sync (weekly, or run
  // manually) is what makes it show up for everyone else.
  try {
    const locationPart = neighborhood ? `${neighborhood}, ${city}` : city;
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.location,places.formattedAddress,places.types,places.primaryType,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({ textQuery: `${name}, ${locationPart}` }),
    });
    const searchData = await searchRes.json();
    const candidate = searchData.places?.[0];
    if (!candidate?.location) {
      return res.status(200).json(base);
    }

    const { cuisine, cuisineTags } = extractCuisine(candidate.types ?? [], candidate.primaryType);
    const place: Place = {
      ...base,
      lat: candidate.location.latitude,
      lng: candidate.location.longitude,
      placeId: candidate.id,
      address: candidate.formattedAddress,
      cuisine,
      cuisineTags,
      googleRating: candidate.rating,
      googleRatingCount: candidate.userRatingCount,
    };
    return res.status(200).json(place);
  } catch {
    // Sheet write already succeeded - enrichment failing shouldn't fail the
    // whole request, it just means no pin until the next sync.
    return res.status(200).json(base);
  }
}
