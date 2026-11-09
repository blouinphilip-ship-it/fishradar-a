# FishRadar AI

**Know where the fish are — before you leave the dock.**

A fishing intelligence platform: an interactive 3D globe of saltwater and freshwater spots, live tides / wind / waves / water temperature / river flow, fishing reports from permitted sources, a Run Tracker for migrations (striper run, albies, tuna, tarpon, bull reds, salmon, steelhead…), lure and bait rankings, species pages, community catches, alerts, and an AI fishing assistant.

The full product spec is in [`docs/SPEC.md`](docs/SPEC.md); what's built, what's stubbed and known gaps are in [`PROGRESS.md`](PROGRESS.md).

## Quick start (Docker)

```bash
cp .env.example .env.local      # set AUTH_SECRET (npx auth secret)
docker compose up --build
```

Open http://localhost:3000 — with `ENABLE_DEV_LOGIN=true`, **Sign in → Dev login** signs you in as a local admin "Test Angler".

## Quick start (local)

Needs Node 22, pnpm, PostgreSQL 16 + PostGIS 3 + pgvector, Redis.

```bash
pnpm install                    # also copies the MapLibre worker into public/
cp .env.example .env.local && cp .env.local .env
pnpm db:migrate
pnpm db:seed                    # spots, species, runs, lures, regs links + DEMO reports
pnpm dev                        # web app on :3000
pnpm worker                     # (optional) scheduled ingestion + alerts
```

Behind a corporate/agent HTTPS proxy, Node's `fetch` needs `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21) to reach NOAA/NWS/USGS/Open-Meteo.

## What's real vs. demo

- **Live, real data:** NOAA CO-OPS tides + water temperature, NOAA NDBC buoys, NWS alerts + hourly forecast, Open-Meteo weather + marine, USGS river data, moon/solunar. Nearest stations for each spot are resolved automatically by the seed script.
- **Demo data:** until you connect report sources, ~1,000 generated reports and ~40 catches make the Run Tracker, lure rankings and feeds come alive. **Every demo row is labeled "Demo data" in the UI.** Re-running `pnpm db:seed` refreshes them; delete them with `delete from reports where is_demo`.
- **Real reports** come from the Partner Portal (`/partner`), RSS feeds and Reddit (via the worker), each passed through the extraction pipeline.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Dev server / production build / serve |
| `pnpm worker` | BullMQ worker: scheduled source ingestion + alert checks every 15 min |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript strict |
| `pnpm test` | Vitest: scoring, parsers (real API fixtures), extraction, geo, DB integration |
| `pnpm test:e2e` | Playwright (desktop + phone) against a production build |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:studio` | Drizzle migrations, seed, browser |

## API keys

Listed in `.env.example` with where to get them and whether they're free. **None are required to run the app.** Without keys:
- AI features run in **offline mode** (rule-based answers/extraction from the same tools). Add `ANTHROPIC_API_KEY` for Claude.
- Videos show a YouTube search link. Add `YOUTUBE_API_KEY` to embed recent videos.
- Sign-in uses the dev login. Add Google / Apple / Resend keys for real accounts and alert emails.

## Layout

```
src/
  app/                 Pages (globe, spot, species-at-spot, runs, lures, species, catches, assistant, me, partner, admin…) + API routes
  app/actions.ts       Server actions (save spot, alerts, catches, comments, partner reports, admin)
  components/          UI: globe (MapLibre), charts (Recharts), fish/lure illustrations, badges…
  db/schema.ts         Data model (PostGIS + pgvector)    db/seed/   catalog + demo data
  lib/conditions/      NOAA / NDBC / NWS / Open-Meteo / USGS / astronomy adapters
  lib/scoring.ts       Fishing Score engine ("Why this score?")
  lib/ingest/          Report pipeline: classify → extract (Claude or rules) → normalize → store
  lib/ai/              Claude client, assistant (tool use), spot briefings
  worker/              BullMQ worker + RSS / Reddit / YouTube adapters
drizzle/               SQL migrations     tests/   unit, integration, e2e, fixtures
```
