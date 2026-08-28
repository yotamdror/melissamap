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

  const { name, isRestaurant, isBar, isSnacksDessert, neighborhood, notes, hasBeenTo } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!isRestaurant && !isBar && !isSnacksDessert) {
    return res.status(400).json({ error: 'At least one type is required' });
  }

  const city = 'New York City';
  const apiKey = process.env.GOOGLE_MAPS_API_KEY!;

  // 1. Append to the Sheet first - it's the durable source of truth. If this
  // fails, nothing else should happen.
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'RestaurantList!A:I',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        name,
        hasBeenTo ? 'y' : '',
        isRestaurant ? 'y' : '',
        isSnacksDessert ? 'y' : '',
        isBar ? 'y' : '',
        notes || '',
        neighborhood || '',
        '',
        city,
      ]],
    },
  });

  const base: Place = {
    id: rowToId(name),
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
