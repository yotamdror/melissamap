import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jwtVerify } from 'jose';
import * as fs from 'fs';
import * as path from 'path';

const DATA_PATH = path.join(process.cwd(), 'data', 'places.json');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.cookies?.auth;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const data = fs.readFileSync(DATA_PATH, 'utf-8');
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).send(data);
}
