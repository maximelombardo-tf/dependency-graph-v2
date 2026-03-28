import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signAdminToken } from '../_lib/jwt.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body ?? {};
  const adminPassword = process.env['ADMIN_PASSWORD'];

  if (!adminPassword || !password || password !== adminPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = await signAdminToken();
  return res.status(200).json({ token });
}
