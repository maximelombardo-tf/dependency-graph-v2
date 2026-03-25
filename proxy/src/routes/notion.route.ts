import { Router, Request, Response } from 'express';
import { config } from '../config.js';

const router = Router();

router.all('/{*path}', async (req: Request, res: Response) => {
  const notionPath = req.originalUrl.replace(/^\/api\/notion/, '');
  const notionUrl = `https://api.notion.com/v1${notionPath}`;

  try {
    const response = await fetch(notionUrl, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${config.notionApiToken}`,
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
