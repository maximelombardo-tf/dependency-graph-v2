import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function getRedis(): Redis {
  return new Redis({
    url: process.env['UPSTASH_REDIS_REST_URL'] || process.env['KV_REST_API_URL'] || '',
    token: process.env['UPSTASH_REDIS_REST_TOKEN'] || process.env['KV_REST_API_TOKEN'] || '',
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';
  const parts = url.replace(/^\/api\/layouts\//, '').split('/');
  const teamId = parts[0];
  const epicKey = parts[1];

  if (!teamId || !epicKey) {
    return res.status(400).json({ error: 'Missing teamId or epicKey' });
  }

  const redis = getRedis();
  const redisKey = `layout:${teamId}:${epicKey}`;

  if (req.method === 'GET') {
    const data = await redis.get(redisKey);
    if (!data) return res.status(404).json(null);
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    await redis.set(redisKey, req.body);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
