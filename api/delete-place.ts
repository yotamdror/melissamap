import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jwtVerify } from 'jose';
import { google } from 'googleapis';

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

  const { name, neighborhood } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required' });
  }

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'RestaurantList!A2:G',
  });
  const rows = existing.data.values ?? [];
  // Same compound key (name + neighborhood) add-place.ts uses to find a row
  // to update - exact-name matching alone would misfire for two
  // different-neighborhood places sharing a name.
  const rowIndex = rows.findIndex(
    r => r[0] === name && (r[6] ?? '') === (neighborhood ?? ''),
  );
  if (rowIndex === -1) {
    return res.status(404).json({ error: 'Could not find the row to delete' });
  }

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetId = meta.data.sheets?.find(s => s.properties?.title === 'RestaurantList')?.properties?.sheetId;
  if (sheetId == null) {
    return res.status(500).json({ error: 'Could not find RestaurantList sheet' });
  }

  const sheetRowIndex = rowIndex + 1; // +1 for header row (0-indexed within the sheet grid)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: sheetRowIndex,
              endIndex: sheetRowIndex + 1,
            },
          },
        },
      ],
    },
  });

  return res.status(200).json({ ok: true });
}
