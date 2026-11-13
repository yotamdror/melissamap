import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jwtVerify } from 'jose';
import { google } from 'googleapis';
import { randomUUID } from 'node:crypto';
import type { Place } from '../src/types';
import { getPlaceSearchQuery } from '../src/placeSearchOverrides.js';

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
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  function fail(status: number, code: string, error: string, upstreamStatus?: number) {
    if (status >= 500) {
      // Google errors can contain credentials and Sheet rows. Log only safe
      // identifiers so a screenshot's reference can be traced in runtime logs.
      console.error('place_save_failed', { requestId, code, status, upstreamStatus });
    }
    return res.status(status).json({ error, code, requestId });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(405, 'METHOD_NOT_ALLOWED', 'Saving a place requires a POST request.');
  }

  const token = req.cookies?.auth;
  if (!token) return fail(401, 'AUTH_REQUIRED', 'Please sign in again before saving.');
  if (!process.env.JWT_SECRET) {
    return fail(500, 'AUTH_NOT_CONFIGURED', 'Sign-in is not configured on the server. Please report this error.');
  }
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (payload.role !== 'admin') return fail(403, 'ADMIN_REQUIRED', 'Sign in with the admin password to save places.');
  } catch {
    return fail(401, 'SESSION_INVALID', 'Your sign-in is no longer valid. Sign out and sign in again.');
  }

  const {
    id: existingId, originalName, originalNeighborhood,
    name, isRestaurant, isBar, isSnacksDessert, neighborhood, notes, hasBeenTo,
  } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    return fail(400, 'PLACE_NAME_REQUIRED', 'Enter a place name.');
  }
  if (![isRestaurant, isBar, isSnacksDessert].some(value => value === true)) {
    return fail(400, 'PLACE_TYPE_REQUIRED', 'Choose at least one place type.');
  }
  if ([existingId, originalName, originalNeighborhood, neighborhood, notes].some(
    value => value != null && typeof value !== 'string',
  ) || [isRestaurant, isBar, isSnacksDessert, hasBeenTo].some(
    value => value != null && typeof value !== 'boolean',
  )) {
    return fail(400, 'PLACE_FIELDS_INVALID', 'Some place details have an invalid format. Please reload and try again.');
  }

  const city = 'New York City';
  const apiKey = process.env.GOOGLE_MAPS_API_KEY!;

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!spreadsheetId || !credentialsJson) {
    return fail(500, 'SHEETS_NOT_CONFIGURED', 'Google Sheets is not configured on the server. Nothing was saved.');
  }
  let sheets: ReturnType<typeof google.sheets>;
  try {
    const credentials = JSON.parse(credentialsJson);
    if (!credentials || typeof credentials.client_email !== 'string' || typeof credentials.private_key !== 'string') {
      throw new Error('Invalid service account format');
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheets = google.sheets({ version: 'v4', auth });
  } catch {
    return fail(500, 'SHEETS_CREDENTIALS_INVALID', 'The server has invalid Google Sheets credentials. Nothing was saved.');
  }

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
  let writeAttempted = false;
  try {
    if (originalName) {
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId,
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
        return fail(404, 'PLACE_NOT_FOUND', 'The original place could not be found in the Sheet. Reload before editing it again.');
      }
      const sheetRow = rowIndex + 2; // +1 for header, +1 for 0-index -> 1-index
      writeAttempted = true;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `RestaurantList!A${sheetRow}:I${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [rowValues] },
      });
    } else {
      writeAttempted = true;
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'RestaurantList!A:I',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowValues] },
      });
    }
  } catch (err) {
    const upstream = err as { response?: { status?: unknown; data?: { error?: unknown } } } | null;
    const status = typeof upstream?.response?.status === 'number' ? upstream.response.status : undefined;
    const authError = upstream?.response?.data?.error;
    if (status === 401 || authError === 'invalid_grant' || authError === 'invalid_client') {
      return fail(502, 'SHEETS_AUTH_FAILED', 'The server could not sign in to Google Sheets. Nothing was saved.', status);
    }
    if (status === 403) {
      return fail(502, 'SHEETS_PERMISSION_DENIED', 'Google Sheets denied access. Check the server account has Editor access to the Sheet.', status);
    }
    if (status === 404) {
      return fail(502, 'SHEET_NOT_FOUND', 'The configured Google Sheet could not be found. Nothing was saved.', status);
    }
    if (status === 400) {
      return fail(502, 'SHEETS_REQUEST_REJECTED', 'Google Sheets rejected the request. Nothing was saved. Please report this error.', status);
    }
    if (status === 429) {
      return fail(503, 'SHEETS_RATE_LIMITED', 'Google Sheets is receiving too many requests. Try again later.', status);
    }
    if (writeAttempted) {
      return fail(502, 'SAVE_UNCONFIRMED', 'The save could not be confirmed. Check the Google Sheet before retrying to avoid adding a duplicate.', status);
    }
    return fail(503, 'SHEETS_UNAVAILABLE', 'Google Sheets could not be reached. Nothing was changed. Try again later.', status);
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
      body: JSON.stringify({ textQuery: getPlaceSearchQuery(base.id, name, locationPart) }),
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
