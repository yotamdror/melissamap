import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jwtVerify } from 'jose';
import { createHash } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';

const DATA_PATH = path.join(process.cwd(), 'data', 'places.json');

// Vercel deploys the generated dataset with the function. Reuse its compact
// representation across requests handled by the same instance.
let snapshot: { body: string; etag: string } | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.cookies?.auth;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (!snapshot) {
    const body = JSON.stringify(JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')));
    const digest = createHash('sha256').update(body).digest('hex');
    snapshot = { body, etag: `W/"${digest}"` };
  }

  res.setHeader('Cache-Control', 'private, no-cache');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('ETag', snapshot.etag);
  if (req.headers['if-none-match'] === snapshot.etag) return res.status(304).end();

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).send(snapshot.body);
}
