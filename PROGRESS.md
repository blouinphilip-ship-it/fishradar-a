# Progress

## Phase 1 — Foundation ✅ (2026-11-09)

**Works**
- Next.js 15 (App Router) with TypeScript strict mode and Tailwind v4. shadcn/ui setup (`components.json`) with Button, Badge and Input primitives.
- Theme tokens: **dark** (default), **light** and **outdoor** (high contrast). The theme toggle saves the choice and applies it before first paint, so there's no flash.
- Badge variants for the three information kinds (Verified / Seasonal / AI prediction), plus Demo and Danger.
- App shell: top bar with logo, Saltwater | Freshwater | Runs mode toggle (marks the active route), search box, Top Lures / Catches / AI Assistant links, and an account menu.
- Home screen shell: globe placeholder, left filter drawer (UI only), and a right spot panel that becomes a bottom sheet on phones.
- Every route from spec Section 3 exists and renders a "Coming in Phase N" page.
- Full Drizzle schema for spec Section 17 (31 tables, including Auth.js tables) with PostGIS points and gist indexes, pgvector embeddings (HNSW index), enums, and provenance and `is_demo` columns. Migration `drizzle/0000_init.sql` also creates the extensions.
- Auth.js v5 with a Drizzle adapter. Providers turn on only when their keys are set: Google, Apple, Resend magic link, and a dev-only test-angler login that can never be enabled in production. `/admin` requires the admin or moderator role.
- `/api/health` checks the DB connection and both extensions.
- Docker: `docker-compose.yml` (db, redis, migrate, web) and a db image (PostGIS + pgvector).
- CI (`.github/workflows/ci.yml`): lint → typecheck → migrate → unit/integration tests → build → Playwright.

**Verified locally**
- lint ✅, typecheck ✅, build ✅
- Vitest: 10/10 (nav mode detection, auth provider gating, PostGIS radius query and extension checks against a real DB)
- Playwright: 12/12 (desktop and phone: shell, mode toggle, every route returns 200, theme persists, no horizontal scroll on phone, health)
- Manually checked: dev login creates the user in the DB, shows the account menu and the Admin link, and `/admin` loads.

**Stubbed / not yet done**
- Docker images and the CI workflow were written but **not run here**: this sandbox has no Docker daemon. They were tested with a locally installed Postgres 16 + PostGIS 3.4 + pgvector and Redis instead.
- shadcn components were written by hand because the shadcn registry was unreachable from the build sandbox. `pnpm dlx shadcn add <component>` will work on a normal machine.
- The filter drawer has no effect yet. Search goes to a stub page.
- No ingestion worker yet (Phase 4). Redis runs but nothing uses it yet.

**Next — Phase 2:** Cesium globe (needs a free Cesium ion token), click-to-set-location, clustered spot markers, search, and the spot side panel. Seed Montauk, Cape Cod, the NH Seacoast, the Florida Keys, Lake Winnipesaukee and San Diego, all marked `is_demo`.
