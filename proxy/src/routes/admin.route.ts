import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID, createHmac } from 'crypto';
import { config } from '../config.js';

const router = Router();

// ── Local file-based team storage ──
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEAMS_FILE = join(__dirname, '..', '..', 'data', 'teams.json');

interface StoredTeam {
  id: string;
  name: string;
  epicDatabaseId: string;
  usDatabaseId: string;
  propertiesName: Record<string, unknown>;
  epicFilter?: unknown[];
  notionApiToken?: string;
}

function readTeams(): StoredTeam[] {
  if (!existsSync(TEAMS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(TEAMS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeTeams(teams: StoredTeam[]): void {
  const dir = dirname(TEAMS_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(TEAMS_FILE, JSON.stringify(teams, null, 2));
}

function stripToken(team: StoredTeam): Omit<StoredTeam, 'notionApiToken'> {
  const { notionApiToken, ...pub } = team;
  return pub;
}

// ── Simple token auth (local dev only) ──
const SECRET = 'local-dev-secret';

function signToken(): string {
  const payload = Buffer.from(JSON.stringify({ admin: true, exp: Date.now() + 24 * 3600_000 })).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string): boolean {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig !== expected) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.admin === true && data.exp > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(req: Request): boolean {
  const token = req.headers['x-admin-token'] as string | undefined;
  if (!token) return false;
  return verifyToken(token);
}

// ── POST /api/admin/auth ──
router.post('/auth', (req: Request, res: Response) => {
  const { password } = req.body ?? {};
  if (!password || password !== config.adminPassword) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  const token = signToken();
  res.json({ token });
});

// ── GET /api/admin/teams ── (public)
router.get('/teams', (_req: Request, res: Response) => {
  const teams = readTeams();
  res.json(teams.map(stripToken));
});

// ── POST /api/admin/teams ── (create)
router.post('/teams', (req: Request, res: Response) => {
  if (!requireAdmin(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { notionApiToken, name, epicDatabaseId, usDatabaseId, propertiesName, epicFilter } = req.body ?? {};
  if (!notionApiToken || !name || !epicDatabaseId || !usDatabaseId || !propertiesName) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const team: StoredTeam = { id: randomUUID(), name, epicDatabaseId, usDatabaseId, propertiesName, epicFilter, notionApiToken };
  const teams = readTeams();
  teams.push(team);
  writeTeams(teams);

  res.status(201).json(stripToken(team));
});

// ── PUT /api/admin/teams ── (update)
router.put('/teams', (req: Request, res: Response) => {
  if (!requireAdmin(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { id, notionApiToken, name, epicDatabaseId, usDatabaseId, propertiesName, epicFilter } = req.body ?? {};
  if (!id || !name || !epicDatabaseId || !usDatabaseId || !propertiesName) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const teams = readTeams();
  const idx = teams.findIndex(t => t.id === id);
  if (idx === -1) { res.status(404).json({ error: 'Team not found' }); return; }

  teams[idx] = {
    ...teams[idx],
    name, epicDatabaseId, usDatabaseId, propertiesName, epicFilter,
    notionApiToken: notionApiToken || teams[idx].notionApiToken,
  };
  writeTeams(teams);

  res.json(stripToken(teams[idx]));
});

// ── DELETE /api/admin/teams ──
router.delete('/teams', (req: Request, res: Response) => {
  if (!requireAdmin(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const id = req.query['id'] as string | undefined;
  if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

  const teams = readTeams().filter(t => t.id !== id);
  writeTeams(teams);

  res.json({ success: true });
});

export default router;
