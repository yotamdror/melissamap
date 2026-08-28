import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jwtVerify } from 'jose';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.cookies?.auth;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return res.status(200).json({ ok: true, role: payload.role });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
