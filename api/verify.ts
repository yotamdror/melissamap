import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jwtVerify } from 'jose';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.cookies?.auth;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    // A pre-existing 30-day cookie signed before roles existed verifies fine
    // (same secret) but has no role field - treat that as unauthenticated so
    // the client re-prompts for a password instead of silently stalling on
    // an undefined role.
    if (payload.role !== 'admin' && payload.role !== 'viewer') {
      return res.status(401).json({ error: 'Stale token, please log in again' });
    }
    return res.status(200).json({ ok: true, role: payload.role });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
