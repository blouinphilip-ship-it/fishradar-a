# FishRadar AI

**Know where the fish are — before you leave the dock.**

A fishing intelligence platform that brings together an interactive globe, live tides, wind, waves and water temperatures, fishing reports from permitted sources, species run tracking and lure recommendations, with an AI assistant on top. The full spec is in [`docs/SPEC.md`](docs/SPEC.md). Build status is in [`PROGRESS.md`](PROGRESS.md).

## Quick start (Docker)

```bash
cp .env.example .env.local      # then set AUTH_SECRET (npx auth secret)
docker compose up --build
```

Open http://localhost:3000. If `ENABLE_DEV_LOGIN=true`, use **Sign in → Dev login** to sign in as a local test angler with admin rights.

## Quick start (without Docker)

You need Node 22, pnpm, PostgreSQL 16 with PostGIS 3 and pgvector, and Redis.

```bash
pnpm install
cp .env.example .env.local      # point DATABASE_URL at your Postgres
cp .env.local .env              # drizzle-kit reads .env
pnpm db:migrate
pnpm dev
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server on :3000 |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript strict check |
| `pnpm test` | Vitest unit and integration tests (integration tests skip if no DB) |
| `pnpm test:e2e` | Playwright end-to-end tests (desktop and phone) against a production build |
| `pnpm db:generate` | Create a migration after editing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Browse the database |

## Layout

```
src/
  app/                 Next.js App Router pages and API routes
    api/auth/          Auth.js handlers
    api/health/        DB and extension health check
  auth.ts              Auth.js config (Google, Apple, Resend magic link, dev login)
  components/
    layout/            Top bar, mode toggle, theme toggle, search, account menu
    home/              Globe-screen pieces (filter drawer, …)
    ui/                shadcn/ui-style primitives
  db/
    schema.ts          Full data model (Section 17 of the spec)
    index.ts           Drizzle client
  lib/                 env validation, nav helpers, utils
drizzle/               SQL migrations (checked in)
docker/db/             Postgres + PostGIS + pgvector image
tests/unit|integration|e2e
```

## API keys

All of them are listed in `.env.example`, with where to get each one and whether it's free. Phase 1 needs only `AUTH_SECRET`.
