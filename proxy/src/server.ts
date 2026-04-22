import express from 'express';
import { corsMiddleware } from './middleware/cors.middleware.js';
import notionRoute from './routes/notion.route.js';
import adminRoute from './routes/admin.route.js';
import layoutRoute from './routes/layout.route.js';
import { config } from './config.js';

const app = express();

app.use(corsMiddleware);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/admin', adminRoute);
app.use('/api/notion', notionRoute);
app.use('/api/layouts', layoutRoute);

app.listen(config.port, () => {
  console.log(`Proxy server running on http://localhost:${config.port}`);
  console.log(`Admin password: ${config.adminPassword}`);
});
