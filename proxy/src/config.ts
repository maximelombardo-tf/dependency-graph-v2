import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env['PORT'] || '3000', 10),
  notionApiToken: process.env['NOTION_API_TOKEN'] || '',
  notionApiVersion: process.env['NOTION_API_VERSION'] || '2022-06-28',
  allowedOrigins: (process.env['ALLOWED_ORIGINS'] || 'http://localhost:4200').split(','),
};
