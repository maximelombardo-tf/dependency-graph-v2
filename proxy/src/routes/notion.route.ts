import { Router, Request, Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const router = Router();

// ── Read team-specific Notion token from local storage ──
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEAMS_FILE = join(__dirname, '..', '..', 'data', 'teams.json');

function getNotionToken(teamId: string | undefined): string {
  if (!teamId) return config.notionApiToken;
  try {
    if (!existsSync(TEAMS_FILE)) return config.notionApiToken;
    const teams = JSON.parse(readFileSync(TEAMS_FILE, 'utf-8'));
    const team = teams.find((t: { id: string }) => t.id === teamId);
    return team?.notionApiToken || config.notionApiToken;
  } catch {
    return config.notionApiToken;
  }
}

router.all('/{*path}', async (req: Request, res: Response) => {
  const teamId = req.headers['x-team-id'] as string | undefined;
  const notionToken = getNotionToken(teamId);

  const notionPath = req.originalUrl.replace(/^\/api\/notion/, '');
  const notionUrl = `https://api.notion.com/v1${notionPath}`;

  try {
    const response = await fetch(notionUrl, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': config.notionApiVersion,
        'Content-Type': 'application/json',
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Notion proxy error:', error);
    res.status(502).json({ error: 'Failed to proxy request to Notion API' });
  }
});

export default router;
