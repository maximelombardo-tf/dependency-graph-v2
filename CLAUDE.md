# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

Dependency graph visualizer for Notion-based project management at Bpifrance. Teams configure their Notion databases, and the app renders kanban boards and dependency graphs from Notion data.

## Commands

### Frontend (Angular 21) — `cd frontend`
- `npm start` — dev server on port 4200 (proxies `/api` to localhost:3000)
- `npm run build` — production build
- `npm test` — Vitest unit tests

### Proxy (Express) — `cd proxy`
- `npm run dev` — dev server with watch on port 3000
- `npm start` — production start

Both must run simultaneously for local development.

## Architecture

```
Browser (Angular @ :4200)
  → proxy.conf.json routes /api/* to Express @ :3000
    ├── /api/admin/*  → local file-based team CRUD (proxy/data/teams.json)
    └── /api/notion/* → forwards to Notion API with per-team token
```

**In production (Vercel):** Angular is static, `/api/*` are serverless functions (`frontend/api/`), teams stored in Upstash Redis.

### Two parallel API implementations
- **Local dev:** Express routes in `proxy/src/routes/` with JSON file storage
- **Production:** Vercel serverless functions in `frontend/api/` with Redis storage

Both implement identical endpoints and behavior. Changes to API logic must be made in both places.

### Authentication (two separate systems)
1. **User auth:** Google OAuth → JWT in localStorage → `Authorization` header → `authGuard`
2. **Admin auth:** password (`ADMIN_PASSWORD` env var, default "admin" locally) → HMAC token → `X-Admin-Token` header → `adminGuard`

### Key architectural patterns
- **Circular dependency avoidance:** `TeamConfigService` injects `HttpBackend` directly (not `HttpClient`) to bypass `TeamInterceptor` which depends on it.
- **Per-team Notion tokens:** Frontend sends `X-Team-Id` header; proxy looks up team-specific token from storage, falls back to `NOTION_API_TOKEN` env var.
- **Angular signals everywhere** — no NgRx. State lives in services (`signal`, `computed`, `effect`).
- **All components are standalone** (no NgModules).

## Key Services

| Service | Role |
|---------|------|
| `TeamConfigService` | Selected team/epic state, localStorage persistence, column↔status mapping |
| `NotionService` | Notion API queries with pagination and 429 retry (exponential backoff) |
| `DependencyService` | In-memory dependency graph, link-mode UI, SVG Bézier arrow computation |
| `AdminService` | Team CRUD + admin token management |
| `AuthService` | Google OAuth, session restore from stored JWT |

## Environment Variables

### Proxy (`proxy/.env`)
- `NOTION_API_TOKEN` — fallback Notion token when team has none
- `ADMIN_PASSWORD` — admin login password (default: "admin")
- `PORT` — proxy port (default: 3000)
- `ALLOWED_ORIGINS` — CORS origins (default: http://localhost:4200)

### Frontend (`frontend/src/environments/`)
- `bypassAuth: true` skips Google OAuth for local dev

## Deployment

Vercel deploys the frontend directory. `vercel.json` configures SPA rewrites and `Cross-Origin-Opener-Policy: unsafe-none` (required for Google Sign-In popup).
