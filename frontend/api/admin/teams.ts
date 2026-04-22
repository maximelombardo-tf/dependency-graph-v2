import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { verifyAdminToken } from '../_lib/jwt.js';
import { encryptToken } from '../_lib/crypto.js';
import { randomUUID } from 'crypto';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
};

function getRedis(): Redis {
  return new Redis({
    url: process.env['UPSTASH_REDIS_REST_URL'] || process.env['KV_REST_API_URL'] || '',
    token: process.env['UPSTASH_REDIS_REST_TOKEN'] || process.env['KV_REST_API_TOKEN'] || '',
  });
}

async function requireAdmin(req: VercelRequest): Promise<boolean> {
  const token = req.headers['x-admin-token'] as string | undefined;
  if (!token) return false;
  return verifyAdminToken(token);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();

  const redis = getRedis();

  // GET /api/admin/teams — public: returns team configs without notionApiToken
  if (req.method === 'GET') {
    const ids: string[] = (await redis.get('teams:list')) ?? [];
    if (ids.length === 0) return res.status(200).json([]);

    const teams = await Promise.all(
      ids.map(id => redis.get<Record<string, unknown>>(`team:${id}`))
    );

    const publicTeams = teams
      .filter(Boolean)
      .map(team => {
        const { notionApiToken, ...publicTeam } = team as Record<string, unknown> & { notionApiToken?: string };
        void notionApiToken;
        return publicTeam;
      });

    return res.status(200).json(publicTeams);
  }

  // All write operations require admin token
  const isAdmin = await requireAdmin(req);
  if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });

  // POST /api/admin/teams — create team
  if (req.method === 'POST') {
    const { notionApiToken, name, epicDatabaseId, usDatabaseId, propertiesName, epicFilter, ticketFilter } = req.body ?? {};
    if (!notionApiToken || !name || !epicDatabaseId || !usDatabaseId || !propertiesName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = randomUUID();
    const team = { id, name, epicDatabaseId, usDatabaseId, propertiesName, epicFilter, ticketFilter, notionApiToken: encryptToken(notionApiToken) };

    await redis.set(`team:${id}`, team);
    const ids: string[] = (await redis.get('teams:list')) ?? [];
    await redis.set('teams:list', [...ids, id]);

    const { notionApiToken: _tok, ...publicTeam } = team;
    void _tok;
    return res.status(201).json(publicTeam);
  }

  // PUT /api/admin/teams — update team
  if (req.method === 'PUT') {
    const { id, notionApiToken, name, epicDatabaseId, usDatabaseId, propertiesName, epicFilter, ticketFilter } = req.body ?? {};
    if (!id || !name || !epicDatabaseId || !usDatabaseId || !propertiesName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await redis.get<Record<string, unknown>>(`team:${id}`);
    if (!existing) return res.status(404).json({ error: 'Team not found' });

    const team = {
      ...existing,
      name,
      epicDatabaseId,
      usDatabaseId,
      propertiesName,
      epicFilter,
      ticketFilter,
      notionApiToken: notionApiToken ? encryptToken(notionApiToken) : existing['notionApiToken'],
    };

    await redis.set(`team:${id}`, team);
    const { notionApiToken: _tok, ...publicTeam } = team as Record<string, unknown> & { notionApiToken?: string };
    void _tok;
    return res.status(200).json(publicTeam);
  }

  // DELETE /api/admin/teams?id=xxx — delete team
  if (req.method === 'DELETE') {
    const id = req.query['id'] as string | undefined;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    await redis.del(`team:${id}`);
    const ids: string[] = (await redis.get('teams:list')) ?? [];
    await redis.set('teams:list', ids.filter(i => i !== id));

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
