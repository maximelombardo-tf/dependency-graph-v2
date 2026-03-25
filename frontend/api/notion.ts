import type { VercelRequest, VercelResponse } from '@vercel/node';

const NOTION_API_TOKEN = process.env['NOTION_API_TOKEN'] || '';
const NOTION_API_VERSION = process.env['NOTION_API_VERSION'] || '2022-06-28';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Strip /api/notion prefix to get the Notion API path
  const url = req.url || '';
  const notionPath = url.replace(/^\/api\/notion/, '').split('?')[0];
  const notionUrl = `https://api.notion.com/v1${notionPath}`;

  try {
    const response = await fetch(notionUrl, {
      method: req.method || 'GET',
      headers: {
        'Authorization': `Bearer ${NOTION_API_TOKEN}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: ['GET', 'HEAD'].includes(req.method || 'GET')
        ? undefined
        : JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Notion proxy error:', error);
    return res.status(502).json({ error: 'Failed to proxy request to Notion API' });
  }
}
