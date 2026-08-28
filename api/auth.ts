import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SignJWT } from 'jose';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body ?? {};
  const role = password === process.env.ADMIN_PASSWORD
    ? 'admin'
    : password === process.env.VIEWER_PASSWORD
      ? 'viewer'
      : null;
  if (!role) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret);

  const cookie = [
    `auth=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${30 * 24 * 60 * 60}`,
    'Path=/',
  ].join('; ');

  res.setHeader('Set-Cookie', cookie);
  return res.status(200).json({ ok: true, role });
}
