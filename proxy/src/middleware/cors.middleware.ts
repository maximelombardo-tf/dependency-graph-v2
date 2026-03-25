import cors from 'cors';
import { config } from '../config.js';

export const corsMiddleware = cors({
  origin: config.allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
