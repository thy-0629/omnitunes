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
- **pino** + pino-pretty (structured logging with request tracing)
- **SQLite + Drizzle** (data persistence)
- **@fastify/websocket** (real-time events)
- **Bearer token authentication** (single-user MVP)

Additional: helmet, cors, sensible, better-sqlite3, sha1 hashing, LRU+TTL caching.

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

### Health & Status
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness/readiness probe |

### Sources
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sources` | List registered sources |
| GET | `/api/sources/health` | Health check all sources |
| GET | `/api/sources/:id/health` | Health check single source |
| GET | `/api/sources/:id/search` | Test search on single source |

### Search & Playback
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search?q=&limit=&sources=` | Unified cross-source search |
| POST | `/api/play/resolve` | Resolve playable options |
| POST | `/api/play/start` | Start playback session |
| POST | `/api/play/:id/end` | End playback session |
| POST | `/api/play/:id/fallback` | Switch to fallback source |
| GET | `/api/local/stream/:id` | Stream local media (HTTP Range) |

### User Data
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/history` | Paginated play history |
| GET | `/api/history/:songWorkId` | History for specific song |
| GET/POST | `/api/queue` | List/add to play queue |
| DELETE | `/api/queue/:position` | Remove item at position |
| POST | `/api/queue/next` | Pop next & auto-play |
| POST | `/api/queue/clear` | Clear entire queue |
| GET/POST | `/api/collections` | List/add favorites |
| DELETE | `/api/collections/:songWorkId` | Remove favorite |
| PATCH | `/api/collections/:songWorkId` | Update preferred source |
| GET/POST | `/api/playlists` | List/create playlists |
| GET/PATCH/DELETE | `/api/playlists/:id` | Get/edit/delete playlist |
| POST | `/api/playlists/:id/items` | Add song to playlist |
| DELETE | `/api/playlists/:id/items/:itemId` | Remove from playlist |
| PATCH | `/api/playlists/:id/items/:itemId` | Reorder playlist item |

### WebSocket
| Method | Path | Description |
|--------|------|-------------|
| GET | `/ws` | WebSocket upgrade (3 channels) |
| GET | `/api/ws/status` | Connection count |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cache/status` | Cache stats & config |
| POST | `/api/cache/invalidate` | Invalidate single cache entry |
| POST | `/api/cache/clear` | Clear all caches |
| GET | `/api/lifecycle/status` | Cleanup task status |
| POST | `/api/lifecycle/run` | Trigger manual cleanup |

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

## Logging

The backend uses **pino** for structured JSON logging with request tracing.

### Configuration
- `LOG_LEVEL`: Controls verbosity (fatal/error/warn/info/debug/trace). Default: `info`.
- In development mode (`NODE_ENV=development`), logs are pretty-printed with `pino-pretty`.
- In production, logs are output as newline-delimited JSON.

### Request Tracing
Every request gets a unique `requestId` (UUID) that is:
1. Read from incoming `x-request-id` header if present, otherwise auto-generated
2. Echoed back in response headers
3. Included in all log entries for the request lifecycle
4. Included in error responses

### Log Levels
- **info**: Successful requests (2xx), startup/shutdown events
- **warn**: Client errors (4xx), non-fatal issues
- **error**: Server errors (5xx), unhandled exceptions
- **debug**: Detailed debugging information (enable with `LOG_LEVEL=debug`)

## Authentication

The backend uses **Bearer token authentication** for protected endpoints.

### Configuration
Set `AUTH_TOKEN` environment variable (minimum 8 characters). If not set or set to the default value `change-me-in-production`, authentication is **disabled** (development mode).

### Usage
```bash
# Authenticated request
curl -H "Authorization: Bearer your-secret-token" http://localhost:3000/api/queue

# Unauthenticated (public routes only)
curl http://localhost:3000/health
```

### Public Routes (no authentication required)
- `GET /health`
- `GET /api/sources`, `/api/sources/health`, `/api/sources/:id/health`
- `GET /api/search`
- `GET /api/history`, `/api/history/:songWorkId`
- `GET /api/queue`
- `GET /api/collections`
- `GET /api/playlists`, `/api/playlists/:id`
- `GET /api/cache/status`, `/api/lifecycle/status`
- `GET /ws` (WebSocket upgrade)

All other routes (POST, PATCH, DELETE) require authentication.

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

### Completed Phases (§1-§12)
1. ✅ Project scaffolding, config validation, health check, error handling
2. ✅ SQLite + Drizzle data layer (5-entity schema)
3. ✅ Source adapter layer (YouTube, OpenSource, Local adapters)
4. ✅ Unified search & content normalization
5. ✅ Playback orchestrator with auto-fallback
6. ✅ Queue / history / favorites / playlists
7. ✅ WebSocket real-time events (3 channels)
8. ✅ Local media scanning & ffmpeg integration
9. ✅ Health probes per source + third-party data lifecycle
10. ✅ LRU+TTL caching layer (search + playback options)
11. ✅ pino structured logging with request tracing (§13)
12. ✅ Bearer token authentication (§14)

### In Progress
- Unit test coverage expansion
- GitHub Actions CI pipeline

### Future Phases
- Rate limiting
- API documentation (OpenAPI/Swagger)
- User management (multi-user support)
- Advanced caching strategies
