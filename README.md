# Omnitune Backend

> Multi-source online music aggregation player — backend service.
> Search once, click once, play immediately. No full downloads, no DRM circumvention.

This repo currently contains the **scaffolding** of the backend: project structure,
configuration loading, health check, error handling, and graceful shutdown. Business
modules (source adapters, unified search, playback orchestrator, etc.) are added
in subsequent phases.

## Stack

- **Node.js 20** (ESM)
- **TypeScript 5**
- **Fastify 4** (HTTP server)
- **zod** (config + payload validation)
- **pino** + pino-pretty (logging)

Planned additions (later phases): SQLite + Drizzle, ffmpeg integration, WebSocket,
@fastify/websocket, Docker data volumes.

## Project layout

```
omnitune-backend/
├── src/
│   ├── config/         # env loading & validation
│   ├── plugins/        # fastify plugins (request-context, ...)
│   ├── routes/         # HTTP route modules (health, ...)
│   ├── modules/        # business modules (source adapters, search, ...)
│   ├── utils/          # cross-cutting helpers (error handler, ...)
│   ├── types/          # shared types
│   ├── app.ts          # Fastify instance builder
│   ├── server.ts       # process entry (listen + graceful shutdown)
│   └── smoke.ts        # quick self-test: GET /health
├── test/               # vitest tests
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env.example
```

## Local development

Requires **Node 20+** and **pnpm 9+**.

```bash
# 1. install deps
pnpm install

# 2. copy env template and edit if needed
cp .env.example .env

# 3. run in watch mode
pnpm dev
# → http://localhost:3000/health

# 4. smoke test
pnpm dlx tsx src/smoke.ts
# OK: {"status":"ok","uptime":...,"version":"0.1.0",...}
```

## Available scripts

| Command          | What it does                              |
|------------------|-------------------------------------------|
| `pnpm dev`       | Run with `tsx watch` (auto reload)        |
| `pnpm build`     | Type-check and compile to `dist/`          |
| `pnpm start`     | Run compiled output (production)          |
| `pnpm typecheck` | Run `tsc --noEmit` only                   |
| `pnpm lint`      | Run ESLint (placeholder, add rules later) |
| `pnpm format`    | Run Prettier on src/ and test/            |

## Endpoints

| Method | Path      | Description                       |
|--------|-----------|-----------------------------------|
| GET    | /health   | Liveness/readiness probe          |

More endpoints (search, play, playlists, history, ...) land in the next phases.

## Environment variables

See `.env.example`. All variables are validated with **zod** at startup; the process
exits non-zero if anything is missing or malformed.

| Name         | Required | Default                  | Notes                                   |
|--------------|----------|--------------------------|-----------------------------------------|
| NODE_ENV     |          | development              | development / test / production         |
| HOST         |          | 0.0.0.0                  | Bind address                            |
| PORT         |          | 3000                     | HTTP port                               |
| LOG_LEVEL    |          | info                     | fatal / error / warn / info / debug / trace |
| AUTH_TOKEN   |          | change-me-in-production  | MVP single-user bearer token (≥8 chars) |
| CORS_ORIGIN  |          | *                        | Comma-separated origins or `*`          |

## Docker

```bash
# build & run
docker compose up -d --build

# health
curl http://localhost:3000/health

# logs
docker compose logs -f omnitune-api
```

Data is persisted in the named volume `omnitune-data` (mounted at `/app/data`).
Set `AUTH_TOKEN` in a `.env` file next to `docker-compose.yml` before bringing it up.

## Roadmap (this repo)

This scaffolding covers **Phase 0 — Foundation**. The next phases will add:

1. Data layer (SQLite + Drizzle, five-entity schema)
2. Source adapter layer (`YouTubeAdapter`, `OpenSourceAdapter`, `LocalAdapter`)
3. Unified search & content normalization
4. Playback orchestrator with auto-fallback
5. Queue / history / favorites / playlists
6. WebSocket for real-time events
7. Local media scanning & ffmpeg integration
8. Health probes per source + third-party data lifecycle

See the product brief for the full scope.
