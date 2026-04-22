import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAYOUTS_FILE = join(__dirname, '..', '..', 'data', 'layouts.json');

function readLayouts(): Record<string, unknown> {
  if (!existsSync(LAYOUTS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(LAYOUTS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeLayouts(layouts: Record<string, unknown>): void {
  const dir = dirname(LAYOUTS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(LAYOUTS_FILE, JSON.stringify(layouts, null, 2));
}

// GET /api/layouts/:teamId/:epicKey
router.get('/:teamId/:epicKey', (req: Request, res: Response) => {
  const { teamId, epicKey } = req.params;
  const layouts = readLayouts();
  const key = `${teamId}:${epicKey}`;
  const data = layouts[key];
  if (!data) {
    res.status(404).json(null);
    return;
  }
  res.json(data);
});

// PUT /api/layouts/:teamId/:epicKey
router.put('/:teamId/:epicKey', (req: Request, res: Response) => {
  const { teamId, epicKey } = req.params;
  const layouts = readLayouts();
  layouts[`${teamId}:${epicKey}`] = req.body;
  writeLayouts(layouts);
  res.json({ success: true });
});

export default router;
